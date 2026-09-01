/**
 * One credentials face over two incompatible dsh contracts.
 *
 * Why this exists: dsh moved the credentials domain in 0.1.2-alpha, and the two
 * shapes overlap in nothing but the data they carry.
 *
 *   ≤0.1.1-rc.2 (npm `latest`, and the hosted web app)
 *     ctx.get('connection').api.credentials
 *     describe({ refs: [ref] }) -> { result: { ok, value: { credentials: {…} } } }
 *     set({ ref, value })   unset({ ref })      event: credentials/updated
 *
 *   ≥0.1.2-alpha (what DSH Desktop 2.0.4 bundles — alpha.1)
 *     ctx.get('remote.credentials')
 *     describe([ref]) -> { ok, value: { [ref]: view } }
 *     set(ref, value)       unset(ref)          event: credentials/reference-updated
 *
 * `ConnectionHandle.api` is simply gone in alpha, so the card built against rc.6
 * read `undefined.credentials` on the desktop app and reported
 * "保存失败: Cannot read properties of undefined (reading 'credentials')".
 * The view payload is identical on both (configured / source? / writable), so
 * only the call shape and the envelope need bridging.
 *
 * The alpha face is passed in already resolved, and this module never dots into
 * `ctx.remote` to find it. `remote` is a cordis Service registering its
 * sub-domains as flat store entries under dotted names, and reading `.credentials`
 * off it goes through the traceable proxy, which rewrites the access into
 * `Reflect.get(ctx, 'remote.credentials')` — a *guarded* context read. Without
 * that exact name in `inject` the guard throws
 * "cannot get property "remote.credentials" without inject", which is what the
 * desktop app reported after the first fix. `ctx.get(name)` reads the same flat
 * store with no inject requirement, returning undefined instead of throwing when
 * the name is absent, so the caller resolves it that way.
 *
 * Resolved per call, never captured at apply() time, for two reasons:
 *   - which face exists is a property of the host, not of our plugin, and on the
 *     desktop app the answer is not the one the types promise;
 *   - the alternative — declaring `remote.credentials` in `inject` — would make
 *     cordis withhold apply() entirely on stable dsh, where that service does
 *     not exist (cordis 4.0.x has no optional inject: every declared name is
 *     required and checked). The card would vanish with no message at all, which
 *     is a worse failure than the one being fixed.
 * @module dsh-ai4scholar/client/credentials-port
 */

/** What both contracts report about a reference; identical payload on each. */
export interface CredentialView {
  /** Whether the Host currently resolves a value. */
  configured: boolean
  /** Winning source layer when configured; absent while unconfigured. */
  source?: string
  /** Whether a write from here can affect the reference. */
  writable: boolean
}

/** The three calls the card makes, with the version differences already absorbed. */
export interface CredentialsPort {
  /**
   * @param ref - the reference to describe.
   * @returns its view, or undefined when the Host knows nothing about it.
   */
  describe(ref: string): Promise<CredentialView | undefined>
  /**
   * @param ref - the reference to write.
   * @param value - the secret literal.
   */
  set(ref: string, value: string): Promise<void>
  /** @param ref - the reference to clear. */
  unset(ref: string): Promise<void>
}

/**
 * Where a port comes from. The controller holds this, not a port, so a host that
 * finishes wiring after apply() still works and a missing face is reported at
 * the moment of the click rather than at boot.
 */
export type CredentialsPortSource = () => CredentialsPort

/** The two places a credentials face has lived, both optional at runtime. */
export interface CredentialsFaces {
  /** `ctx.get('connection')` — carries `.api.credentials` up to 0.1.1-rc.2. */
  connection?: unknown
  /**
   * `ctx.get('remote.credentials')` from 0.1.2-alpha — the service itself, already
   * resolved. Deliberately not `ctx.remote`: see the module note on why dotting
   * into that proxy throws on the very host this face exists to support.
   */
  remoteCredentials?: unknown
}

/** Narrow an unknown to something with a readable property, without `any`. */
const at = (host: unknown, key: string): unknown =>
  typeof host === 'object' && host !== null ? (host as Record<string, unknown>)[key] : undefined

/** The stable face's calls, as they are shaped once `callable` has vouched for them. */
interface LegacyFace {
  describe(arg: { refs: string[] }): Promise<unknown>
  set(arg: { ref: string; value: string }): Promise<unknown>
  unset(arg: { ref: string }): Promise<unknown>
}

/** The alpha face's calls, likewise. */
interface ModernFace {
  describe(refs: string[]): Promise<unknown>
  set(ref: string, value: string): Promise<unknown>
  unset(ref: string): Promise<unknown>
}

/** Whether every named member of a candidate face is callable. */
const callable = (face: unknown, methods: readonly string[]): boolean =>
  methods.every((m) => typeof at(face, m) === 'function')

/** The credential methods both contracts expose, under either calling convention. */
const METHODS = ['describe', 'set', 'unset'] as const

/**
 * Error message for the case no host should produce: neither face present.
 * Names both the surface and its version, because the answer differs per build
 * of the same app and the version is what a bug report needs.
 */
class NoCredentialsFace extends Error {
  constructor() {
    super('this dsh build exposes no credentials API (neither connection.api.credentials nor the remote.credentials service) — the plugin cannot store the key here')
    this.name = 'NoCredentialsFace'
  }
}

/**
 * Read `{ok, value}` off either envelope depth.
 *
 * Stable nests the result one level down (`response.result`) and alpha does not,
 * so the depth is probed rather than assumed: a future build that changes only
 * the nesting keeps working.
 * @param response - whatever the call returned.
 * @returns the unwrapped outcome.
 */
function unwrap(response: unknown): { ok: boolean; value: unknown; error: unknown } {
  const envelope = at(response, 'result') ?? response
  const ok = at(envelope, 'ok')
  return {
    // A void result (alpha's set/unset) is success: nothing to report is not failure.
    ok: ok === undefined ? true : ok === true,
    value: at(envelope, 'value'),
    error: at(envelope, 'error'),
  }
}

/**
 * Throw when a call reported failure, preserving the Host's own message.
 * @param response - whatever the call returned.
 * @param what - the operation, for the fallback message.
 * @returns the unwrapped value on success.
 */
function orThrow(response: unknown, what: string): unknown {
  const { ok, value, error } = unwrap(response)
  if (ok) return value
  if (error instanceof Error) throw error
  const message = at(error, 'message')
  throw new Error(typeof message === 'string' ? message : `credentials ${what} failed`)
}

/**
 * The stable face: object arguments, `result` envelope, views under a
 * `credentials` key.
 * @param credentials - `connection.api.credentials`.
 * @returns a port speaking the ≤0.1.1-rc.2 contract.
 */
function legacyPort(credentials: LegacyFace): CredentialsPort {
  return {
    async describe(ref) {
      const value = orThrow(await credentials.describe({ refs: [ref] }), 'describe')
      return at(at(value, 'credentials'), ref) as CredentialView | undefined
    },
    async set(ref, value) { orThrow(await credentials.set({ ref, value }), 'set') },
    async unset(ref) { orThrow(await credentials.unset({ ref }), 'unset') },
  }
}

/**
 * The alpha face: positional arguments, bare envelope, views keyed by reference.
 * @param credentials - `ctx.remote.credentials`.
 * @returns a port speaking the ≥0.1.2-alpha contract.
 */
function modernPort(credentials: ModernFace): CredentialsPort {
  return {
    async describe(ref) {
      const value = orThrow(await credentials.describe([ref]), 'describe')
      return at(value, ref) as CredentialView | undefined
    },
    async set(ref, value) { orThrow(await credentials.set(ref, value), 'set') },
    async unset(ref) { orThrow(await credentials.unset(ref), 'unset') },
  }
}

/**
 * Pick the face this host actually has.
 *
 * The alpha face is preferred: a host carrying both is mid-migration, and the
 * newer face is the one it will keep.
 * @param faces - the two candidate faces, as resolved from the client context.
 * @returns a port for whichever contract is present.
 * @throws NoCredentialsFace when neither is.
 */
export function resolveCredentialsPort(faces: CredentialsFaces): CredentialsPort {
  const modern = faces.remoteCredentials
  if (callable(modern, METHODS)) return modernPort(modern as ModernFace)

  const legacy = at(at(faces.connection, 'api'), 'credentials')
  if (callable(legacy, METHODS)) return legacyPort(legacy as LegacyFace)

  throw new NoCredentialsFace()
}
