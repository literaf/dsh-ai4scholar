import type { ConfigFormPort, FormOp } from '../src/client/search-controller.js'

const DEFAULTS = {
  searchSources: ['semantic-scholar'], resultsPerSource: {}, defaultMaxResults: 10, abstractMaxChars: 600, showCredits: true,
  readMaxChars: 60_000, citeStyle: 'ieee', citeExcludePreprints: false, drawModel: 'flash31', drawImageSize: '2K',
}

/** Apply path ops to a plain object, the way the Host's settings service does. */
function applyOps(target: Record<string, unknown>, ops: FormOp[]): Record<string, unknown> {
  const next = structuredClone(target)
  for (const op of ops) {
    let node = next
    for (const key of op.path.slice(0, -1)) {
      if (typeof node[key] !== 'object' || node[key] === null) node[key] = {}
      node = node[key] as Record<string, unknown>
    }
    const leaf = op.path.at(-1)!
    if (op.op === 'set') node[leaf] = op.value
    else delete node[leaf]
  }
  return next
}

/** A Host configuration form for the `ai4scholar` entry, held in memory. */
export function fakeForm(initial: Record<string, unknown> = {}, options: { writable?: boolean; refuse?: boolean } = {}) {
  let user: Record<string, unknown> = structuredClone(initial)
  let revision = 0
  const listeners = new Set<() => void>()
  const writes: Array<{ ops: FormOp[]; revision: number | undefined }> = []
  let snapshot: ReturnType<ConfigFormPort['getSnapshot']>
  const rebuild = () => {
    const value = { ...DEFAULTS, ...user, resultsPerSource: { ...(user.resultsPerSource as object | undefined) } }
    snapshot = { status: 'ready', value, user: structuredClone(user), revision, writable: options.writable ?? true }
    for (const fn of [...listeners]) fn()
  }
  rebuild()
  const form: ConfigFormPort = {
    getSnapshot: () => snapshot,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    async mutate(ops, expected) {
      writes.push({ ops, revision: expected })
      if (options.refuse === true || expected !== revision) return false
      user = applyOps(user, ops)
      revision += 1
      rebuild()
      return true
    },
  }
  return { form, writes, user: () => user }
}
