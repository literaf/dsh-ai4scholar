/**
 * Per-plugin-instance runtime handed to every tool module: the configured API
 * client, rendering and paging limits, per-call credential resolution, and
 * the session credit ledger.
 * @module dsh-ai4scholar/runtime
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { ApiOk, Ai4ScholarClient, CreditsInfo } from './api-client.js'
import type { CreditsValue, RenderOptions } from './paper.js'

/** Result-count limits shared by the search tools. */
export interface SearchLimits {
  /** Results returned when the model omits `max_results`. */
  defaultMaxResults: number
  /** Upper bound the model may request per call. */
  maxResultsCap: number
}

/** Timeouts for the slow tool families. */
export interface Timeouts {
  /** Cooperative per-call budget attached to ordinary tools as `timeoutMs`. */
  tool: number
  /** Per-download timeout for PDF fetches. */
  pdf: number
  /** Timeout for generation and streaming endpoints (auto_cite, sci_draw). */
  generation: number
}

/** Full-text tool limits. */
export interface ReadLimits {
  /** Characters returned per read call when the model omits `max_chars`. */
  maxChars: number
}

/**
 * Process-local tally of credits charged per agent (session). Keyed by the
 * agent object identity, so a resumed session starts a fresh tally.
 */
export class CreditLedger {
  private readonly totals = new WeakMap<object, number>()

  /**
   * Add one call's charge to its agent's tally.
   * @param agent - the executing agent (`exec.agent`); `undefined` skips the tally.
   * @param charged - credits the API reported for the call.
   * @returns the agent's running total, or `undefined` without an agent.
   */
  record(agent: object | undefined, charged: number): number | undefined {
    if (agent === undefined) return undefined
    const total = (this.totals.get(agent) ?? 0) + charged
    this.totals.set(agent, total)
    return total
  }

  /**
   * Read one agent's running total.
   * @param agent - the agent object.
   * @returns the total charged so far, or `0`.
   */
  total(agent: object | undefined): number {
    return agent === undefined ? 0 : (this.totals.get(agent) ?? 0)
  }
}

/** Everything a tool module needs from the plugin instance. */
export interface Runtime {
  /** Configured ai4scholar.net client. */
  client: Ai4ScholarClient
  /** Model-facing rendering knobs. */
  render: RenderOptions
  /** Result-count limits. */
  limits: SearchLimits
  /** Full-text limits. */
  read: ReadLimits
  /** Timeouts. */
  timeouts: Timeouts
  /** Whether results carry credit accounting. */
  showCredits: boolean
  /** Session credit tally. */
  ledger: CreditLedger
  /**
   * Resolve the API key for one call. Reads the credentials service when the
   * composition provides one, else the process environment. Resolved per call
   * so a key stored or rotated while the process runs applies to the next call.
   * @returns the key, or `undefined` when nothing is configured.
   */
  apiKey(): Promise<string | undefined>
  /**
   * Resolve the API key or throw a model-readable error naming the reference
   * and where to store it.
   * @returns the non-empty key.
   */
  requireApiKey(): Promise<string>
  /**
   * Fold one billed response's credit headers into the canonical value shape,
   * recording the charge on the agent's tally.
   * @param response - the successful API response.
   * @param agent - the executing agent (`exec.agent`).
   * @returns the credits object, or `undefined` when disabled or unreported.
   */
  creditsOf(response: Pick<ApiOk<unknown>, 'credits'>, agent: object | undefined): CreditsValue | undefined
}

/** Bound the model's requested count to `[1, cap]`, defaulting when omitted. */
export function boundResults(requested: number | undefined, limits: SearchLimits, cap = limits.maxResultsCap): number {
  const upper = Math.min(limits.maxResultsCap, cap)
  if (requested === undefined) return Math.min(limits.defaultMaxResults, upper)
  if (!Number.isFinite(requested) || requested < 1) return 1
  return Math.min(Math.trunc(requested), upper)
}

/** Reject blank or whitespace-only strings the schema DSL cannot express. */
export function requireQuery(query: string, name = 'query'): string {
  const trimmed = query.trim()
  if (trimmed.length === 0) throw new Error(`${name} must be a non-empty string`)
  return trimmed
}

/** Reject an empty id list and normalize whitespace. */
export function requireIds(ids: readonly string[], name: string, max: number): string[] {
  const cleaned = ids.map((id) => id.trim()).filter((id) => id.length > 0)
  if (cleaned.length === 0) throw new Error(`${name} must contain at least one identifier`)
  if (cleaned.length > max) throw new Error(`${name} accepts at most ${max} identifiers per call`)
  return cleaned
}

/**
 * Build the credential resolvers for one plugin instance.
 * @param ctx - plugin context; `credentials` is read lazily so the plugin
 *   also runs in compositions without the seam.
 * @param apiKeyEnv - credential reference (a POSIX identifier) named by config.
 * @returns the two resolver methods of {@link Runtime}.
 */
export function makeCredentialResolvers(ctx: Context, apiKeyEnv: string): Pick<Runtime, 'apiKey' | 'requireApiKey'> {
  const ref: CredentialRef = credentialRef(apiKeyEnv)
  const apiKey = async (): Promise<string | undefined> => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      return hit?.value
    }
    const ambient = process.env[ref]
    return ambient !== undefined && ambient.length > 0 ? ambient : undefined
  }
  const requireApiKey = async (): Promise<string> => {
    const key = await apiKey()
    if (key === undefined) {
      throw new Error(
        `AI4Scholar API key is not configured. Open Settings → Plugins → AI4Scholar in the dsh web UI, `
        + `or store it as ${ref} in $DSH_HOME/.credentials.yaml (or export ${ref} in the environment that launches dsh). `
        + `Get a key at https://ai4scholar.net?src=dsh`,
      )
    }
    return key
  }
  return { apiKey, requireApiKey }
}

/**
 * Build the credits folder for one plugin instance.
 * @param ledger - the session tally.
 * @param enabled - the `showCredits` config.
 * @returns the {@link Runtime.creditsOf} method.
 */
export function makeCreditsFolder(ledger: CreditLedger, enabled: boolean): Runtime['creditsOf'] {
  return (response, agent) => {
    if (!enabled) return undefined
    const info: CreditsInfo | undefined = response.credits
    if (info === undefined) return undefined
    const sessionTotal = info.charged !== undefined ? ledger.record(agent, info.charged) : undefined
    const out: { charged?: number; remaining?: number; sessionTotal?: number } = {}
    if (info.charged !== undefined) out.charged = info.charged
    if (info.remaining !== undefined) out.remaining = info.remaining
    if (sessionTotal !== undefined) out.sessionTotal = sessionTotal
    return out
  }
}
