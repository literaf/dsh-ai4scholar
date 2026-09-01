/**
 * The API-key card's state and actions, framework-neutral so it is testable
 * without React. It talks to the Host only through the credentials domain of
 * the wire API — the same calls the Models page makes for provider keys — so
 * the key literal never rides a response: the card learns whether one is
 * configured, where it comes from, and whether it can be written from here.
 * @module dsh-ai4scholar/client/controller
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { BALANCE_ROUTE } from '../shared/balance-route.js'
import type { BalanceRouteResponse } from '../shared/balance-route.js'
import type { CredentialsPortSource, CredentialView } from './credentials-port.js'

/** What the card renders. */
export interface ApiKeyCardState {
  /** Credential reference the card edits (`AI4SCHOLAR_API_KEY`). */
  ref: string
  /** Whether the Host currently resolves a value for the reference. */
  configured: boolean
  /** Winning source layer when configured (`env`, `file`, `project-env`, `user-env`); provider vocabulary. */
  source?: string
  /** Whether `credentials.set`/`unset` can affect the reference; false when a read-only layer (the process environment) supplies it. */
  writable: boolean
  /** Whether the first `describe` answered yet. */
  loaded: boolean
  /** The staged key text; starts blank on every load and after every save. */
  draft: string
  /** A write is in flight. */
  busy: boolean
  /** Outcome of the last write, cleared by the next edit. */
  notice?: { kind: 'saved' | 'removed' | 'error'; message?: string }
  /** Outcome of the last key test against the balance route. */
  check?:
    | { status: 'checking' }
    | { status: 'ok'; totalAvailable: number; keyCreditsUsed?: number; membership?: string }
    | { status: 'error'; code: string; message: string }
}

/** A partial update; an explicit `undefined` deletes that optional member. */
type CardPatch = { [K in keyof ApiKeyCardState]?: ApiKeyCardState[K] | undefined }

/** Same-origin fetch of the Node half's balance route; injectable for tests. */
export type BalanceFetch = (signal?: AbortSignal) => Promise<BalanceRouteResponse>

/** Default balance fetcher: `GET /ai4scholar/balance` on the page origin. */
export const fetchBalanceRoute: BalanceFetch = async (signal) => {
  const res = await fetch(BALANCE_ROUTE, { method: 'GET', credentials: 'same-origin', cache: 'no-store', ...(signal !== undefined ? { signal } : {}) })
  if (!res.ok) return { ok: false, code: `HTTP_${res.status}`, error: res.status === 404 ? 'balance route not available (headless or an older plugin build)' : `HTTP ${res.status}` }
  return await res.json() as BalanceRouteResponse
}

/** Minimal snapshot store the slot renderer can bind as a selector hook. */
export interface CardStore<T> extends HostObservable<T> {
  set(next: T): void
}

/**
 * Create a plain snapshot store (getSnapshot/subscribe/set). Kept local so the
 * bundle depends on no store engine beyond the platform modules.
 * @param initial - the first snapshot.
 * @returns the store.
 */
export function createCardStore<T>(initial: T): CardStore<T> {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    set(next) {
      if (Object.is(next, snapshot)) return
      snapshot = next
      for (const fn of [...listeners]) fn()
    },
  }
}

/** Human-readable failure text for a wire error or thrown value. */
function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return String(error)
}

/** Bridges the credentials domain onto the card snapshot. */
export class ApiKeyCardController {
  /** The card snapshot the renderer binds. */
  readonly store: CardStore<ApiKeyCardState>
  private generation = 0
  private checkGeneration = 0

  /**
   * @param credentials - resolves the host's credentials face; called per
   *   operation rather than stored, because which face exists depends on the dsh
   *   build (see credentials-port.ts) and may settle after apply().
   * @param ref - credential reference the card edits.
   * @param fetchBalance - balance-route fetcher (defaults to same-origin `fetch`).
   */
  constructor(private readonly credentials: CredentialsPortSource, ref: string, private readonly fetchBalance: BalanceFetch = fetchBalanceRoute) {
    this.store = createCardStore<ApiKeyCardState>({
      ref,
      configured: false,
      writable: true,
      loaded: false,
      draft: '',
      busy: false,
    })
  }

  private get state(): ApiKeyCardState {
    return this.store.getSnapshot()
  }

  private patch(changes: CardPatch): void {
    const next = { ...this.state } as Record<string, unknown>
    for (const [key, value] of Object.entries(changes)) {
      // An explicit undefined removes the optional member (`exactOptionalPropertyTypes`).
      if (value === undefined) delete next[key]
      else next[key] = value
    }
    this.store.set(next as unknown as ApiKeyCardState)
  }

  /**
   * Re-read the reference's configured state. Out-of-order answers are
   * dropped: only the latest request may publish.
   */
  async refresh(): Promise<void> {
    const generation = ++this.generation
    const { ref } = this.state
    let view: CredentialView | undefined
    try {
      view = await this.credentials().describe(ref)
    } catch (error) {
      if (generation !== this.generation) return
      // A host with no credentials face at all is permanent, not a blip, and the
      // badge alone ("未配置") sent the user hunting through a working key. Say it
      // here so the card explains itself before anything is typed. Every other
      // failure keeps the old behaviour: hold the last known state and re-sync on
      // the next refresh or write.
      if (error instanceof Error && error.name === 'NoCredentialsFace') {
        this.patch({ loaded: true, notice: { kind: 'error', message: error.message } })
        return
      }
      this.patch({ loaded: true })
      return
    }
    if (generation !== this.generation) return
    this.patch({
      loaded: true,
      configured: view?.configured ?? false,
      source: view?.source,
      // An unknown reference is treated as writable: the Host is what refuses, not the card.
      writable: view?.writable ?? true,
    })
  }

  /**
   * React to a forwarded credential-change event (`credentials/updated` on
   * stable dsh, `credentials/reference-updated` from 0.1.2-alpha; index.ts
   * subscribes to both).
   * @param ref - the reference the Host reports as changed.
   */
  onCredentialUpdated(ref: string): void {
    if (ref === this.state.ref) void this.refresh()
  }

  /**
   * Test the stored key by reading the balance through the Node half's route
   * (the key never reaches the browser). Out-of-order answers are dropped.
   */
  async testKey(): Promise<void> {
    const generation = ++this.checkGeneration
    this.patch({ check: { status: 'checking' } })
    let answer: BalanceRouteResponse
    try {
      answer = await this.fetchBalance()
    } catch (error) {
      answer = { ok: false, code: 'REQUEST_FAILED', error: describeError(error) }
    }
    if (generation !== this.checkGeneration) return
    if (answer.ok) {
      const membership = answer.membership !== undefined ? `${answer.membership.plan} (${answer.membership.status})` : undefined
      const check: NonNullable<ApiKeyCardState['check']> = { status: 'ok', totalAvailable: answer.totalAvailable }
      if (answer.keyCreditsUsed !== undefined) (check as { keyCreditsUsed?: number }).keyCreditsUsed = answer.keyCreditsUsed
      if (membership !== undefined) (check as { membership?: string }).membership = membership
      this.patch({ check })
    } else {
      this.patch({ check: { status: 'error', code: answer.code, message: answer.error } })
    }
  }

  /**
   * Stage key text.
   * @param text - the input value.
   */
  edit(text: string): void {
    this.patch({ draft: text, notice: undefined })
  }

  /** Whether `save()` would write: a non-blank draft, writable, and idle. */
  canSave(): boolean {
    const { draft, writable, busy } = this.state
    return draft.trim().length > 0 && writable && !busy
  }

  /** Whether `remove()` would write: configured through a writable layer and idle. */
  canRemove(): boolean {
    const { configured, writable, busy } = this.state
    return configured && writable && !busy
  }

  /** Write the staged key through the credentials domain, then re-read. */
  async save(): Promise<void> {
    if (!this.canSave()) return
    const value = this.state.draft.trim()
    this.patch({ busy: true, notice: undefined })
    try {
      // The port raises the Host's own refusal, so one catch covers both a
      // rejected write and a transport failure.
      await this.credentials().set(this.state.ref, value)
      this.patch({ busy: false, draft: '', notice: { kind: 'saved' } })
    } catch (error) {
      this.patch({ busy: false, notice: { kind: 'error', message: describeError(error) } })
      return
    }
    await this.refresh()
    // A saved key is worth one immediate round-trip: the user learns right away whether it works.
    await this.testKey()
  }

  /** Remove the stored key through the credentials domain, then re-read. */
  async remove(): Promise<void> {
    if (!this.canRemove()) return
    this.patch({ busy: true, notice: undefined })
    try {
      await this.credentials().unset(this.state.ref)
      this.patch({ busy: false, draft: '', notice: { kind: 'removed' }, check: undefined })
    } catch (error) {
      this.patch({ busy: false, notice: { kind: 'error', message: describeError(error) } })
      return
    }
    await this.refresh()
  }
}
