import { describe, expect, it } from 'vitest'
import { ApiKeyCardController, createCardStore } from '../src/client/controller.js'
import { resolveCredentialsPort } from '../src/client/credentials-port.js'
import { buildGuidance } from '../src/prompt.js'
import { en, zh } from '../src/client/locales.js'
import { CSS, cls } from '../src/client/styles.js'
import { parseBalance } from '../src/client/balance.js'

/**
 * A scripted credentials domain in the ≤0.1.1-rc.2 shape: object arguments, a
 * `result` envelope, views nested under `credentials`. Reached through the real
 * `resolveCredentialsPort`, so these tests cover the legacy adapter as well as
 * the controller; `fakeModernApi` below is the same store in the alpha shape.
 */
function fakeApi(initial: { configured?: boolean; source?: string; writable?: boolean } = {}) {
  const state = { configured: initial.configured ?? false, source: initial.source, writable: initial.writable ?? true }
  const calls: Array<{ method: string; payload: unknown }> = []
  let failNext: string | undefined
  let describeDelay: (() => void)[] = []
  const credentials = {
    async describe(payload: { refs: string[] }) {
        calls.push({ method: 'describe', payload })
        if (describeDelay.length > 0) await new Promise<void>((resolve) => describeDelay.push(resolve))
        return {
          rpcId: 'r' as never,
          result: {
            ok: true,
            value: {
              credentials: Object.fromEntries(payload.refs.map((ref: string) => [ref, {
                configured: state.configured,
                ...(state.source !== undefined ? { source: state.source } : {}),
                writable: state.writable,
              }])),
            },
          },
        }
      },
      async set(payload: { ref: string; value: string }) {
        calls.push({ method: 'set', payload })
        if (failNext !== undefined) {
          const message = failNext
          failNext = undefined
          return { rpcId: 'r' as never, result: { ok: false, error: { code: 'credential-rejected', message, details: {} } as never } }
        }
        state.configured = payload.value.length > 0
        state.source = 'file'
        return { rpcId: 'r' as never, result: { ok: true, value: {} } }
      },
      async unset(payload: { ref: string }) {
        calls.push({ method: 'unset', payload })
        state.configured = false
        state.source = undefined
        return { rpcId: 'r' as never, result: { ok: true, value: {} } }
      },
  }
  const port = () => resolveCredentialsPort({ connection: { api: { credentials } } })
  return {
    port,
    calls,
    state,
    failNextSet(message: string) { failNext = message },
    holdDescribe() {
      describeDelay = [() => undefined]
      return () => { for (const r of describeDelay.splice(1)) r() }
    },
  }
}

/**
 * The same store in the ≥0.1.2-alpha shape: positional arguments, a bare
 * `{ok, value}` envelope, views keyed directly by reference, and `set`/`unset`
 * returning void. This is what DSH Desktop 2.0.4 exposes as
 * `ctx.remote.credentials`, and reading it as the old shape is what produced
 * "Cannot read properties of undefined (reading 'credentials')".
 */
function fakeModernApi(initial: { configured?: boolean; source?: string; writable?: boolean } = {}) {
  const state = { configured: initial.configured ?? false, source: initial.source, writable: initial.writable ?? true }
  const calls: Array<{ method: string; payload: unknown }> = []
  const credentials = {
    async describe(refs: string[]) {
      calls.push({ method: 'describe', payload: refs })
      return {
        ok: true,
        value: Object.fromEntries(refs.map((ref) => [ref, {
          configured: state.configured,
          ...(state.source !== undefined ? { source: state.source } : {}),
          writable: state.writable,
        }])),
      }
    },
    async set(ref: string, value: string) {
      calls.push({ method: 'set', payload: { ref, value } })
      state.configured = value.length > 0
      state.source = 'file'
      // Alpha's set resolves void; a port that treats "no ok field" as failure
      // would report every successful save as an error.
    },
    async unset(ref: string) {
      calls.push({ method: 'unset', payload: { ref } })
      state.configured = false
      state.source = undefined
    },
  }
  return { port: () => resolveCredentialsPort({ remoteCredentials: credentials }), calls, state }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createCardStore', () => {
  it('notifies subscribers on set and supports unsubscribe', () => {
    const store = createCardStore({ n: 1 })
    let seen = 0
    const off = store.subscribe(() => { seen += 1 })
    store.set({ n: 2 })
    store.set(store.getSnapshot()) // identical snapshot: no notification
    expect(seen).toBe(1)
    off()
    store.set({ n: 3 })
    expect(seen).toBe(1)
    expect(store.getSnapshot()).toEqual({ n: 3 })
  })
})

describe('resolveCredentialsPort', () => {
  it('drives the card identically from the alpha contract', async () => {
    // The regression: DSH Desktop 2.0.4 bundles 0.1.2-alpha.1, where
    // ConnectionHandle has no `api` and credentials live on ctx.remote. The card
    // read connection.api.credentials and threw on every save.
    const fake = fakeModernApi()
    const controller = new ApiKeyCardController(fake.port, 'AI4SCHOLAR_API_KEY')
    await controller.refresh()
    expect(controller.store.getSnapshot()).toMatchObject({ loaded: true, configured: false, writable: true })
    // Positional arguments, not { refs: [...] }.
    expect(fake.calls[0]).toEqual({ method: 'describe', payload: ['AI4SCHOLAR_API_KEY'] })

    controller.edit('sk-user-abc')
    await controller.save()
    expect(controller.store.getSnapshot()).toMatchObject({ draft: '', busy: false, configured: true, source: 'file', notice: { kind: 'saved' } })
    expect(fake.calls.filter((c) => c.method === 'set')).toEqual([{ method: 'set', payload: { ref: 'AI4SCHOLAR_API_KEY', value: 'sk-user-abc' } }])

    await controller.remove()
    expect(controller.store.getSnapshot()).toMatchObject({ configured: false, notice: { kind: 'removed' } })
  })

  it('prefers the alpha face when a host carries both', async () => {
    // A host mid-migration keeps the newer face; picking the legacy one would
    // work today and break on the build that finishes removing it.
    const reached: string[] = []
    const face = (name: string) => ({
      describe: async () => { reached.push(name); return { ok: true, value: {} } },
      set: async () => undefined,
      unset: async () => undefined,
    })
    const port = resolveCredentialsPort({
      connection: { api: { credentials: face('legacy') } },
      remoteCredentials: face('modern'),
    })
    await port.describe('AI4SCHOLAR_API_KEY')
    expect(reached).toEqual(['modern'])
  })

  it('reports a host with no credentials face instead of a raw TypeError', async () => {
    // What the desktop app actually presented: a bare
    // "Cannot read properties of undefined (reading 'credentials')". The card
    // now explains itself, and says so before anything is typed.
    expect(() => resolveCredentialsPort({ connection: {}, remoteCredentials: undefined })).toThrow(/no credentials API/)

    const controller = new ApiKeyCardController(() => resolveCredentialsPort({}), 'AI4SCHOLAR_API_KEY')
    await controller.refresh()
    const state = controller.store.getSnapshot()
    expect(state.loaded).toBe(true)
    expect(state.notice?.kind).toBe('error')
    expect(state.notice?.message).toMatch(/no credentials API/)
  })

  it('ignores a partial face rather than half-using it', () => {
    // A face missing a method is not a contract; falling back is safer than
    // discovering the gap on the user's first remove().
    expect(() => resolveCredentialsPort({ remoteCredentials: { describe: async () => ({ ok: true, value: {} }) } })).toThrow(/no credentials API/)
  })
})

describe('ApiKeyCardController', () => {
  it('starts unloaded, then reflects the described state', async () => {
    const fake = fakeApi({ configured: true, source: 'file' })
    const controller = new ApiKeyCardController(fake.port, 'AI4SCHOLAR_API_KEY')
    expect(controller.store.getSnapshot()).toMatchObject({ ref: 'AI4SCHOLAR_API_KEY', loaded: false, configured: false, writable: true, draft: '', busy: false })
    await controller.refresh()
    expect(controller.store.getSnapshot()).toMatchObject({ loaded: true, configured: true, source: 'file', writable: true })
    expect(fake.calls[0]).toEqual({ method: 'describe', payload: { refs: ['AI4SCHOLAR_API_KEY'] } })
  })

  it('saves a trimmed draft, clears it, and re-reads', async () => {
    const fake = fakeApi()
    const controller = new ApiKeyCardController(fake.port, 'AI4SCHOLAR_API_KEY')
    await controller.refresh()
    expect(controller.canSave()).toBe(false)
    controller.edit('  sk-user-abc  ')
    expect(controller.canSave()).toBe(true)
    let notified = 0
    controller.store.subscribe(() => { notified += 1 })
    await controller.save()
    expect(fake.calls.filter((c) => c.method === 'set')).toEqual([{ method: 'set', payload: { ref: 'AI4SCHOLAR_API_KEY', value: 'sk-user-abc' } }])
    const state = controller.store.getSnapshot()
    expect(state).toMatchObject({ draft: '', busy: false, configured: true, source: 'file', notice: { kind: 'saved' } })
    expect(notified).toBeGreaterThan(0)
    // Editing again clears the notice.
    controller.edit('x')
    expect(controller.store.getSnapshot().notice).toBeUndefined()
  })

  it('surfaces a rejected write without losing the draft', async () => {
    const fake = fakeApi()
    const controller = new ApiKeyCardController(fake.port, 'AI4SCHOLAR_API_KEY')
    controller.edit('sk-user-abc')
    fake.failNextSet('shadowed by the environment')
    await controller.save()
    expect(controller.store.getSnapshot()).toMatchObject({ draft: 'sk-user-abc', busy: false, notice: { kind: 'error', message: 'shadowed by the environment' } })
  })

  it('removes a stored key and refuses when read-only', async () => {
    const fake = fakeApi({ configured: true, source: 'file' })
    const controller = new ApiKeyCardController(fake.port, 'AI4SCHOLAR_API_KEY')
    await controller.refresh()
    expect(controller.canRemove()).toBe(true)
    await controller.remove()
    expect(fake.calls.some((c) => c.method === 'unset')).toBe(true)
    expect(controller.store.getSnapshot()).toMatchObject({ configured: false, notice: { kind: 'removed' } })

    const env = fakeApi({ configured: true, source: 'env', writable: false })
    const readOnly = new ApiKeyCardController(env.port, 'AI4SCHOLAR_API_KEY')
    await readOnly.refresh()
    readOnly.edit('sk-new')
    expect(readOnly.canSave()).toBe(false)
    expect(readOnly.canRemove()).toBe(false)
    await readOnly.save()
    await readOnly.remove()
    expect(env.calls.map((c) => c.method)).toEqual(['describe'])
  })

  it('re-reads on a forwarded credentials/updated for its own ref only', async () => {
    const fake = fakeApi()
    const controller = new ApiKeyCardController(fake.port, 'AI4SCHOLAR_API_KEY')
    controller.onCredentialUpdated('DEEPSEEK_API_KEY')
    await flush()
    expect(fake.calls).toHaveLength(0)
    fake.state.configured = true
    fake.state.source = 'env'
    controller.onCredentialUpdated('AI4SCHOLAR_API_KEY')
    await flush()
    expect(controller.store.getSnapshot()).toMatchObject({ configured: true, source: 'env' })
  })

  it('drops out-of-order describe answers', async () => {
    const fake = fakeApi()
    const controller = new ApiKeyCardController(fake.port, 'AI4SCHOLAR_API_KEY')
    const release = fake.holdDescribe()
    const first = controller.refresh() // held
    fake.state.configured = true
    // Second refresh answers immediately (hold only delays calls made while held... release both in order)
    const second = controller.refresh()
    release()
    await Promise.all([first, second])
    expect(controller.store.getSnapshot().configured).toBe(true)
  })
})

describe('ApiKeyCardController.testKey', () => {
  it('reports a working key with the balance, auto-tests after save, and clears on remove', async () => {
    const fake = fakeApi()
    let answer: Record<string, unknown> = { ok: true, totalAvailable: 89419, permanent: 89419, memberMonthlyRemaining: 0, keyCreditsUsed: 7472 }
    let fetches = 0
    const controller = new ApiKeyCardController(fake.port, 'AI4SCHOLAR_API_KEY', async () => { fetches += 1; return answer as never })
    await controller.testKey()
    expect(controller.store.getSnapshot().check).toEqual({ status: 'ok', totalAvailable: 89419, keyCreditsUsed: 7472 })
    controller.edit('sk-user-new')
    await controller.save()
    expect(fetches).toBe(2) // save triggers one automatic test
    answer = { ok: false, code: 'INVALID_API_KEY', error: 'API Key 无效' }
    await controller.testKey()
    expect(controller.store.getSnapshot().check).toEqual({ status: 'error', code: 'INVALID_API_KEY', message: 'API Key 无效' })
    await controller.remove()
    expect(controller.store.getSnapshot().check).toBeUndefined()
    const throwing = new ApiKeyCardController(fake.port, 'AI4SCHOLAR_API_KEY', async () => { throw new Error('offline') })
    await throwing.testKey()
    expect(throwing.store.getSnapshot().check).toMatchObject({ status: 'error', code: 'REQUEST_FAILED', message: 'offline' })
  })
})

describe('parseBalance', () => {
  it('maps the labeled lines and keeps unknown lines', () => {
    const view = parseBalance('Credits available: 89,419\nPermanent: 89,419\nMember monthly remaining: 0\nAPI key spent in total: 7,472\nSession spent: 0\nSomething new: 1\nAPI key: configured (…33b7)\n')
    expect(view).toEqual({ available: '89,419', permanent: '89,419', memberMonthly: '0', keySpent: '7,472', sessionSpent: '0', keyStatus: 'configured (…33b7)', other: ['Something new: 1'] })
    expect(parseBalance('not a report').available).toBeUndefined()
  })
})

describe('client copy and styles', () => {
  it('ships identical key sets in both locales', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('emits a rule for every class name it uses', () => {
    for (const name of Object.values(cls)) expect(CSS).toContain(`.${name}`)
  })

  it('guidance still lists the search tools (sanity)', () => {
    expect(buildGuidance({ semanticScholar: true, pubmed: false, googleScholar: false, arxiv: false, biorxiv: false, doi: false, fullText: false, autoCite: false, sciDraw: false, credits: false, unified: false })).toContain('search_semantic')
  })
})
