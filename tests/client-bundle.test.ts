// @vitest-environment jsdom
/**
 * Loads the BUILT browser bundle (`lib/client.js`) exactly the way the dsh web
 * shell does — as a classic script that hands a CommonJS factory to
 * `window.__ModuleLoader__.load` — resolves its platform requires to the real
 * React, mounts it on a fake client context, and drives the rendered card
 * through open → type → save with a scripted credentials API. Requires
 * `pnpm build` first (package.json `pretest`).
 */
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

// jsdom rewrites import.meta.url to the page origin, so anchor on the project root instead.
// React's act() checks this flag; without it every act() call logs a warning.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const BUNDLE = resolve(process.cwd(), 'lib/client.js')
const require = createRequire(resolve(process.cwd(), 'package.json'))

interface LoadedBundle {
  id: string
  exports: {
    inject: string[]
    apply(ctx: unknown): void
    API_KEY_REF: string
  }
  required: string[]
}

/** Execute the bundle like the module host: capture the factory, then materialize it with a platform `require`. */
function loadBundle(): LoadedBundle {
  const code = readFileSync(BUNDLE, 'utf8')
  let captured: { id: string; factory: (req: (id: string) => unknown) => unknown } | undefined
  const win = { __ModuleLoader__: { load(entry: typeof captured) { captured = entry } } }
  // The bundle is a classic script referencing the global `window`.
  new Function('window', code)(win)
  if (captured === undefined) throw new Error('bundle did not register a factory')
  const required: string[] = []
  const platformRequire = (id: string): unknown => {
    required.push(id)
    if (id === 'react') return require('react')
    if (id === 'react/jsx-runtime') return require('react/jsx-runtime')
    throw new Error(`module table cannot answer require(${id})`)
  }
  const exports = captured.factory(platformRequire) as LoadedBundle['exports']
  return { id: captured.id, exports, required }
}

/** What the fake context recorded. */
interface FakeClientContext {
  ctx: unknown
  effects: Array<() => void>
  registrations: Array<{ options: Record<string, unknown>; component: (props: Record<string, unknown>) => unknown }>
  locales: Record<string, Record<string, Record<string, string>>>
  remoteHandlers: Record<string, (arg: string) => void>
  api: { calls: Array<{ method: string; payload: unknown }>; state: { configured: boolean; source?: string | undefined; writable: boolean } }
  dispose(): void
}

function fakeClientContext(initial: { configured?: boolean; source?: string; writable?: boolean; host?: 'stable' | 'desktop' } = {}): FakeClientContext {
  const effects: Array<() => void> = []
  const registrations: FakeClientContext['registrations'] = []
  const locales: FakeClientContext['locales'] = {}
  const remoteHandlers: FakeClientContext['remoteHandlers'] = {}
  const state: FakeClientContext['api']['state'] = { configured: initial.configured ?? false, source: initial.source, writable: initial.writable ?? true }
  const calls: FakeClientContext['api']['calls'] = []
  const ok = <T,>(value: T) => ({ rpcId: 'r', result: { ok: true, value } })
  /**
   * Which dsh this emulation is: `stable` (≤0.1.1-rc.2, the hosted web app) puts
   * credentials on `connection.api`; `desktop` is 0.1.2-alpha as DSH Desktop
   * 2.0.4 ships it — no `connection.api` at all, credentials on `ctx.remote`,
   * positional arguments, a bare envelope, and void writes.
   */
  const host = initial.host ?? 'stable'
  /** The view both contracts report; identical payload, different envelope. */
  const view = (ref: string) => [ref, { configured: state.configured, ...(state.source !== undefined ? { source: state.source } : {}), writable: state.writable }] as const
  const api = {
    credentials: {
      async describe(payload: { refs: string[] }) {
        calls.push({ method: 'describe', payload })
        return ok({ credentials: Object.fromEntries(payload.refs.map(view)) })
      },
      async set(payload: { ref: string; value: string }) {
        calls.push({ method: 'set', payload })
        state.configured = true
        state.source = 'file'
        return ok({})
      },
      async unset(payload: { ref: string }) {
        calls.push({ method: 'unset', payload })
        state.configured = false
        delete state.source
        return ok({})
      },
    },
  }
  const remoteCredentials = {
    async describe(refs: string[]) {
      calls.push({ method: 'describe', payload: refs })
      return { ok: true, value: Object.fromEntries(refs.map(view)) }
    },
    async set(ref: string, value: string) {
      calls.push({ method: 'set', payload: { ref, value } })
      state.configured = true
      state.source = 'file'
    },
    async unset(ref: string) {
      calls.push({ method: 'unset', payload: { ref } })
      state.configured = false
      delete state.source
    },
  }
  const declared = new Set(['settings.plugin.item', 'conversation.chat.commandview'])
  const ctx = {
    effect(fn: () => (() => void) | void, _label?: string) {
      const dispose = fn()
      if (typeof dispose === 'function') effects.push(dispose)
      return () => undefined
    },
    get(name: string) {
      // On the desktop build the handle is still provided — it simply has no
      // `api`. That is the shape that produced "Cannot read properties of
      // undefined (reading 'credentials')", so it is emulated exactly.
      if (name === 'connection') return host === 'desktop' ? { isLoopback: true, rpc: {} } : { api }
      // The alpha credentials domain is a *flat store entry* under a dotted
      // name, reachable only through `ctx.get()`. Serving it here rather than as
      // a property of `remote` is what the real host does; see the throwing
      // proxy below for the other half of that shape.
      if (name === 'remote.credentials' && host === 'desktop') return remoteCredentials
      return undefined
    },
    locale: {
      register(ns: string, dicts: Record<string, Record<string, string>>) {
        locales[ns] = dicts
        return () => { delete locales[ns] }
      },
      bind(ns: string) {
        return (key: string, params?: Record<string, unknown>) => {
          const template = locales[ns]?.en?.[key] ?? key
          return params ? template.replace(/\{(\w+)\}/g, (m, name) => name in params ? String(params[name]) : m) : template
        }
      },
    },
    // `remote` is a cordis Service on a real host, so its traceable proxy
    // rewrites `.credentials` into a guarded `Reflect.get(ctx,
    // "remote.credentials")` and throws without that name injected. A plain
    // object with a nested `credentials` would let the bundle pass here while
    // every save failed on the desktop app — that is how the guard bug shipped —
    // so the guard is emulated instead of the nesting.
    remote: new Proxy({
      $on(event: string, handler: (arg: string) => void) {
        remoteHandlers[event] = handler
        return () => { delete remoteHandlers[event] }
      },
    } as Record<string, unknown>, {
      get(target, prop, receiver) {
        if (prop === 'credentials') throw new Error('cannot get property "remote.credentials" without inject')
        return Reflect.get(target, prop, receiver)
      },
    }),
    slots: {
      inject(name: string, callback: () => (() => void) | Iterable<() => void>) {
        if (!declared.has(name)) throw new Error(`slot ${name} not declared`)
        const out = callback()
        if (typeof out === 'function') effects.push(out)
        else for (const d of out) effects.push(d)
        return () => undefined
      },
      register(options: Record<string, unknown>, component: FakeClientContext['registrations'][number]['component']) {
        registrations.push({ options, component })
        return () => { registrations.splice(registrations.indexOf(registrations.find((r) => r.component === component)!), 1) }
      },
    },
  }
  return {
    ctx, effects, registrations, locales, remoteHandlers,
    api: { calls, state },
    dispose() { for (const d of effects.splice(0).reverse()) d() },
  }
}

/** Bind the registered entry's inject face into component props like the slot renderer does. */
function propsFor(entry: FakeClientContext['registrations'][number], t: (k: string, p?: Record<string, unknown>) => string) {
  const face = (entry.options.inject as () => Record<string, unknown>)()
  const hooks = face.hooks as Record<string, { getSnapshot(): unknown; subscribe(fn: () => void): () => void }>
  const props: Record<string, unknown> = { t }
  for (const [key, value] of Object.entries(face)) if (key !== 'hooks') props[key] = value
  for (const [name, source] of Object.entries(hooks)) {
    const hookName = `use${name.charAt(0).toUpperCase()}${name.slice(1)}`
    props[hookName] = (selector: (s: unknown) => unknown) => {
      // A real selector hook subscribes; for the test, subscribe through React's useSyncExternalStore.
      const { useSyncExternalStore } = require('react') as typeof import('react')
      return useSyncExternalStore(source.subscribe, () => selector(source.getSnapshot()))
    }
  }
  return props
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

let root: Root | undefined
let container: HTMLElement | undefined
afterEach(() => {
  if (root !== undefined) act(() => { root!.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

describe.skipIf(!existsSync(BUNDLE))('built client bundle in a module-host emulation', () => {
  it('registers a CommonJS factory under the package id and requires only platform modules', () => {
    const bundle = loadBundle()
    expect(bundle.id).toBe('dsh-ai4scholar')
    expect(bundle.required.sort()).toEqual(['react', 'react/jsx-runtime'])
    expect(bundle.exports.inject).toEqual(['slots', 'connection', 'locale', 'remote'])
    expect(bundle.exports.API_KEY_REF).toBe('AI4SCHOLAR_API_KEY')
  })

  it('mounts: dictionaries, stylesheet, both credential hooks, and one settings.plugin.item card', async () => {
    const bundle = loadBundle()
    const fake = fakeClientContext()
    bundle.exports.apply(fake.ctx)
    expect(Object.keys(fake.locales)).toEqual(['ai4scholar'])
    expect(fake.locales.ai4scholar?.zh?.title).toBe('AI4Scholar')
    expect(document.head.querySelector('style[data-plugin="dsh-ai4scholar"]')).not.toBeNull()
    // Both event names: dsh renamed this to `credentials/reference-updated` in
    // 0.1.2-alpha, and only one of the two is forwarded on any given host.
    // Subscribing to a name a host never emits is inert.
    expect(Object.keys(fake.remoteHandlers)).toEqual(['credentials/updated', 'credentials/reference-updated'])
    expect(fake.registrations.map((r) => r.options.name).sort()).toEqual(['conversation.chat.commandview', 'settings.plugin.item'])
    expect(fake.registrations.find((r) => r.options.name === 'settings.plugin.item')!.options).toMatchObject({ id: 'ai4scholar', key: 'ai4scholar', order: 100, locale: 'ai4scholar' })
    // Both identity fields, deliberately: dsh ≤rc.6 declares the slot as a
    // list (register throws without `id`), rc.7 declares it keyed by the
    // settings namespace (throws without `key`, which is how #user-report
    // "failed to apply loader entry … requires options.key" happened).
    await flush()
    expect(fake.api.calls[0]).toEqual({ method: 'describe', payload: { refs: ['AI4SCHOLAR_API_KEY'] } })

    // Unloading withdraws everything (effects), including the style tag.
    fake.dispose()
    expect(document.head.querySelector('style[data-plugin="dsh-ai4scholar"]')).toBeNull()
    expect(fake.registrations).toHaveLength(0)
    expect(Object.keys(fake.locales)).toEqual([])
  })

  it('renders the card, opens it, saves a typed key through the credentials domain, and reflects the new state', async () => {
    // The saved key is auto-tested through the Node half's balance route (same-origin fetch).
    const originalFetch = globalThis.fetch
    const balanceCalls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      balanceCalls.push(url)
      return new Response(JSON.stringify({ ok: true, totalAvailable: 89419, permanent: 89419, memberMonthlyRemaining: 0, keyCreditsUsed: 7472 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    const bundle = loadBundle()
    const fake = fakeClientContext()
    bundle.exports.apply(fake.ctx)
    await flush()
    const entry = fake.registrations.find((r) => r.options.name === 'settings.plugin.item')!
    const t = (fake.ctx as { locale: { bind(ns: string): (k: string, p?: Record<string, unknown>) => string } }).locale.bind('ai4scholar')

    container = document.createElement('ul')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root!.render(createElement(entry.component as never, propsFor(entry, t) as never)) })

    const header = container.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(header).not.toBeNull()
    expect(container.textContent).toContain('AI4Scholar')
    expect(container.textContent).toContain('Not configured')
    expect(container.querySelector('input')).toBeNull() // collapsed

    await act(async () => { header.click() })
    await flush()
    const input = container.querySelector('input#plugin-config-ai4scholar-key') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.type).toBe('password')
    const buttons = [...container.querySelectorAll('button')].filter((b) => b !== header)
    const save = buttons.find((b) => b.textContent === 'Save')!
    const remove = buttons.find((b) => b.textContent === 'Remove')!
    expect(save.disabled).toBe(true)
    expect(remove.disabled).toBe(true)

    // Type a key (React reads the input value through its tracked setter).
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(input, 'sk-user-test-123')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(save.disabled).toBe(false)
    await act(async () => { save.click() })
    await flush()
    await flush()
    expect(fake.api.calls.filter((c) => c.method === 'set')).toEqual([{ method: 'set', payload: { ref: 'AI4SCHOLAR_API_KEY', value: 'sk-user-test-123' } }])
    expect(container.textContent).toContain('Key saved.')
    expect(container.textContent).toContain('Configured via credentials file')
    expect((container.querySelector('input#plugin-config-ai4scholar-key') as HTMLInputElement).value).toBe('')
    expect(remove.disabled).toBe(false)
    // Auto-test after save: the balance route was called and its answer is shown with a refresh link.
    await flush()
    expect(balanceCalls).toEqual(['/ai4scholar/balance'])
    expect(container.textContent).toContain('✓ Key works · 89,419 credits available · 7,472 spent by this key')
    const refresh = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Refresh')!
    await act(async () => { refresh.click() })
    await flush()
    expect(balanceCalls).toHaveLength(2)
    globalThis.fetch = originalFetch

    // A key change on another surface reaches the card through the forwarded event.
    fake.api.state.configured = false
    delete fake.api.state.source
    await act(async () => { fake.remoteHandlers['credentials/updated']!('AI4SCHOLAR_API_KEY') })
    await flush()
    expect(container.textContent).toContain('Not configured')
  })

  it('saves a key on a desktop-shaped host, where connection.api does not exist', async () => {
    // The reported failure, reproduced through the built bundle: on DSH Desktop
    // 2.0.4 (dsh 0.1.2-alpha.1) the connection handle has no `api`, so the card
    // read `undefined.credentials` and every Save showed
    // "保存失败: Cannot read properties of undefined (reading 'credentials')".
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, totalAvailable: 100, permanent: 100, memberMonthlyRemaining: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
    const bundle = loadBundle()
    const fake = fakeClientContext({ host: 'desktop' })
    bundle.exports.apply(fake.ctx)
    await flush()

    // Positional refs, not { refs: [...] } — the alpha calling convention.
    expect(fake.api.calls[0]).toEqual({ method: 'describe', payload: ['AI4SCHOLAR_API_KEY'] })

    const entry = fake.registrations.find((r) => r.options.name === 'settings.plugin.item')!
    const t = (fake.ctx as { locale: { bind(ns: string): (k: string, p?: Record<string, unknown>) => string } }).locale.bind('ai4scholar')
    container = document.createElement('ul')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root!.render(createElement(entry.component as never, propsFor(entry, t) as never)) })

    const header = container.querySelector('button[aria-expanded]') as HTMLButtonElement
    await act(async () => { header.click() })
    await flush()
    const input = container.querySelector('input#plugin-config-ai4scholar-key') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(input, 'sk-desktop-test')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!
    await act(async () => { save.click() })
    await flush()
    await flush()

    expect(fake.api.calls.filter((c) => c.method === 'set')).toEqual([{ method: 'set', payload: { ref: 'AI4SCHOLAR_API_KEY', value: 'sk-desktop-test' } }])
    expect(container.textContent).toContain('Key saved.')
    expect(container.textContent).toContain('Configured via credentials file')
    expect(container.textContent).not.toContain('undefined')

    // The renamed event is the one this host forwards.
    fake.api.state.configured = false
    delete fake.api.state.source
    await act(async () => { fake.remoteHandlers['credentials/reference-updated']!('AI4SCHOLAR_API_KEY') })
    await flush()
    expect(container.textContent).toContain('Not configured')
    globalThis.fetch = originalFetch
  })

  it('registers a keyed /ai4scholar command card and renders balance, error, and pending states', async () => {
    const bundle = loadBundle()
    const fake = fakeClientContext()
    // The fake slot table must know the commandview declaration too.
    ;(fake as unknown as { declare(name: string): void }).declare?.('conversation.chat.commandview')
    bundle.exports.apply(fake.ctx)
    const entry = fake.registrations.find((r) => r.options.name === 'conversation.chat.commandview')!
    expect(entry).toBeDefined()
    expect(entry.options).toMatchObject({ key: 'ai4scholar', locale: 'ai4scholar' })
    const t = (fake.ctx as { locale: { bind(ns: string): (k: string) => string } }).locale.bind('ai4scholar')
    const face = (entry.options.inject as () => Record<string, unknown>)()
    const render = async (outcome: unknown) => {
      if (root !== undefined) await act(async () => { root!.unmount() })
      container?.remove()
      container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
      const node = { kind: 'command', seq: 1, time: 0, commandId: 'c', name: 'ai4scholar', args: '', outcome }
      await act(async () => { root!.render(createElement(entry.component as never, { t, node, ...face } as never)) })
      return container.textContent ?? ''
    }
    expect(await render(null)).toContain('Checking…')
    expect(await render({ kind: 'error', text: 'AI4Scholar API key is not configured.' })).toContain('AI4Scholar API key is not configured.')
    const text = await render({ kind: 'success', text: 'Credits available: 89,419\nPermanent: 89,419\nMember monthly remaining: 0\nAPI key spent in total: 7,472\nSession spent: 0\nAPI key: configured (…33b7)' })
    expect(text).toContain('89,419')
    expect(text).toContain('credits available')
    expect(text).toContain('Spent this session')
    expect(text).toContain('Configured (…33b7)')
    expect(container!.querySelector('a[href="https://ai4scholar.net?src=dsh"]')).not.toBeNull()
    expect(container!.querySelector('pre')).toBeNull()
    const other = await render({ kind: 'success', text: 'plain text from an older plugin' })
    expect(container!.querySelector('pre')?.textContent).toBe('plain text from an older plugin')
    expect(other).toContain('AI4Scholar')
  })

  it('renders read-only when the environment supplies the key', async () => {
    const bundle = loadBundle()
    const fake = fakeClientContext({ configured: true, source: 'env', writable: false })
    bundle.exports.apply(fake.ctx)
    await flush()
    const entry = fake.registrations.find((r) => r.options.name === 'settings.plugin.item')!
    const t = (fake.ctx as { locale: { bind(ns: string): (k: string) => string } }).locale.bind('ai4scholar')
    container = document.createElement('ul')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root!.render(createElement(entry.component as never, propsFor(entry, t) as never)) })
    expect(container.textContent).toContain('Configured via environment')
    await act(async () => { (container!.querySelector('button[aria-expanded]') as HTMLButtonElement).click() })
    await flush()
    expect(container.textContent).toContain('comes from the launching environment')
    expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(true)
  })
})
