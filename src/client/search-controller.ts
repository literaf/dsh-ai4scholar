/**
 * The settings form: staged edits over the Host's configuration form for the
 * `ai4scholar` entry. From dsh 0.2.1 the Host serves the entry's `.volatile()`
 * fields through `ctx.configForms`; a save writes them into the profile's
 * `cordis.patch.yml`, and the Node half remounts with the new values. Older
 * hosts have no such service and the page says where the file is instead.
 * @module dsh-ai4scholar/client/search-controller
 */

import {
  ABSTRACT_LIMIT, CITE_STYLES, DEFAULT_RESULTS, DEFAULT_SOURCES, DRAW_MODELS, DRAW_SIZES,
  PLATFORM_CAP, READ_MAX, READ_MIN, UNIFIED_SOURCES,
} from '../shared/search-settings.js'
import type { CiteStyle, DrawModel, DrawSize, SearchSettings, UnifiedSource } from '../shared/search-settings.js'
import { createCardStore } from './controller.js'
import type { CardStore } from './controller.js'

export { ABSTRACT_LIMIT }

/** One field operation of the Host's configuration form. */
export type FormOp = { op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }

/** The slice of `ctx.configForms.get(entryId)` this page uses. */
export interface ConfigFormPort {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable'
    value: unknown
    user: unknown
    revision: number | undefined
    writable: boolean
  }
  subscribe(listener: () => void): () => void
  mutate(ops: FormOp[], expectedRevision?: number): Promise<boolean>
}

/** Resolves the form, or undefined while the host provides none (yet). */
export type ConfigFormSource = () => ConfigFormPort | undefined

/** Draft text and choices, as the controls render them. */
export interface SearchDraft {
  searchSources: UnifiedSource[]
  resultsPerSource: Record<UnifiedSource, string>
  abstractMaxChars: string
  showCredits: boolean
  showCommandCard: boolean
  readMaxChars: string
  citeStyle: CiteStyle
  citeExcludePreprints: boolean
  drawModel: DrawModel
  drawImageSize: DrawSize
}

/** Which drafts are not values their field accepts; any blocks the save. */
export interface SearchInvalid {
  searchSources: boolean
  resultsPerSource: Record<UnifiedSource, boolean>
  abstractMaxChars: boolean
  readMaxChars: boolean
}

/** What the settings groups render. */
export interface SearchSettingsState {
  /** Committed Host values, separate from unsaved drafts on a settings page. */
  committed: SearchSettings
  revision: number | undefined
  /** `unsupported`: this host has no configuration forms; `unavailable`: it does not serve this entry. */
  status: 'unsupported' | 'loading' | 'ready' | 'unavailable'
  writable: boolean
  draft: SearchDraft
  /** The draft differs from what the Host holds. */
  dirty: boolean
  invalid: SearchInvalid
  /** Whether the profile overrides any field (so a reset would change something). */
  overridden: boolean
  saving: boolean
  notice?: 'saved' | 'reset' | 'failed'
}

/** Top-level fields the page writes; `resultsPerSource` is written per platform. */
const FIELDS = ['searchSources', 'resultsPerSource', 'abstractMaxChars', 'showCredits', 'showCommandCard', 'readMaxChars', 'citeStyle', 'citeExcludePreprints', 'drawModel', 'drawImageSize'] as const
type Field = (typeof FIELDS)[number]

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T => (options as readonly unknown[]).includes(value) ? value as T : fallback
const int = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isInteger(v) ? v : fallback)

/** Narrow the served section, falling back to the shipped defaults field by field. */
export function readSettings(value: unknown): SearchSettings {
  const section = isRecord(value) ? value : {}
  const sources = Array.isArray(section.searchSources) ? UNIFIED_SOURCES.filter((s) => (section.searchSources as unknown[]).includes(s)) : []
  // A platform without its own count starts from the shared default, which is file-only.
  const shared = Math.max(1, int(section.defaultMaxResults, DEFAULT_RESULTS))
  const per = isRecord(section.resultsPerSource) ? section.resultsPerSource : {}
  return {
    searchSources: sources.length > 0 ? sources : [...DEFAULT_SOURCES],
    resultsPerSource: Object.fromEntries(UNIFIED_SOURCES.map((s) => [s, Math.min(int(per[s], shared), PLATFORM_CAP[s])])) as Record<UnifiedSource, number>,
    abstractMaxChars: int(section.abstractMaxChars, 600),
    showCredits: typeof section.showCredits === 'boolean' ? section.showCredits : true,
    showCommandCard: section.showCommandCard === true,
    readMaxChars: int(section.readMaxChars, 60_000),
    citeStyle: oneOf(CITE_STYLES, section.citeStyle, 'ieee'),
    citeExcludePreprints: section.citeExcludePreprints === true,
    drawModel: oneOf(DRAW_MODELS, section.drawModel, 'flash31'),
    drawImageSize: section.drawModel === 'bananalite' || section.drawModel === 'flash' ? '1K' : oneOf(DRAW_SIZES, section.drawImageSize, '2K'),
  }
}

const draftOf = (s: SearchSettings): SearchDraft => ({
  searchSources: [...s.searchSources],
  resultsPerSource: Object.fromEntries(UNIFIED_SOURCES.map((p) => [p, String(s.resultsPerSource[p])])) as Record<UnifiedSource, string>,
  abstractMaxChars: String(s.abstractMaxChars),
  showCredits: s.showCredits,
  showCommandCard: s.showCommandCard,
  readMaxChars: String(s.readMaxChars),
  citeStyle: s.citeStyle,
  citeExcludePreprints: s.citeExcludePreprints,
  drawModel: s.drawModel,
  drawImageSize: s.drawImageSize,
})

/** Parse a whole number in `[min, max]`; undefined when the text is not one. */
function parseCount(text: string, min: number, max: number): number | undefined {
  if (!/^\d+$/.test(text.trim())) return undefined
  const n = Number(text.trim())
  return n >= min && n <= max ? n : undefined
}

const sameSources = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((s) => b.includes(s))

/** The draft as stored values, or undefined for a field whose text is invalid. */
function parsed(draft: SearchDraft) {
  return {
    resultsPerSource: Object.fromEntries(UNIFIED_SOURCES.map((s) => [s, parseCount(draft.resultsPerSource[s], 1, PLATFORM_CAP[s])])) as Record<UnifiedSource, number | undefined>,
    abstractMaxChars: parseCount(draft.abstractMaxChars, 0, ABSTRACT_LIMIT),
    readMaxChars: parseCount(draft.readMaxChars, READ_MIN, READ_MAX),
  }
}

/** Bridges the Host's configuration form onto the settings groups. */
export class SearchSettingsController {
  readonly store: CardStore<SearchSettingsState>
  private form: ConfigFormPort | undefined
  private unsubscribe: (() => void) | undefined
  /** Fields the user edited since the last seed; the rest follow the Host. */
  private readonly touched = new Set<Field | `resultsPerSource.${UnifiedSource}`>()

  /** @param source - resolves `ctx.configForms.get('ai4scholar')`; re-asked on every `attach()`. */
  constructor(private readonly source: ConfigFormSource) {
    this.store = createCardStore<SearchSettingsState>(this.project(undefined, draftOf(readSettings(undefined)), false))
  }

  private get state(): SearchSettingsState {
    return this.store.getSnapshot()
  }

  /** Bind the form if the host now provides one; called when a page opens. */
  attach(): void {
    if (this.form !== undefined) return
    const form = this.source()
    if (form === undefined) return
    this.form = form
    this.unsubscribe = form.subscribe(() => { this.sync() })
    this.sync()
  }

  /** Stop observing the form (plugin unload). */
  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.form = undefined
  }

  /** Re-derive the state from the Host's snapshot, keeping the user's untouched fields in step. */
  private sync(): void {
    const stored = draftOf(readSettings(this.form?.getSnapshot().value))
    const draft = { ...this.state.draft } as Record<string, unknown>
    for (const field of FIELDS) {
      if (this.touched.has(field)) continue
      if (field === 'resultsPerSource') {
        draft[field] = Object.fromEntries(UNIFIED_SOURCES.map((source) => [
          source,
          this.touched.has(`resultsPerSource.${source}`) ? this.state.draft.resultsPerSource[source] : stored.resultsPerSource[source],
        ]))
      } else draft[field] = stored[field]
    }
    this.publish(draft as unknown as SearchDraft)
  }

  /**
   * Publish a new state. The notice persists until a call names it, so the
   * Host's own refresh after a save does not wipe "saved" off the page; pass
   * `notice: undefined` to clear it.
   */
  private publish(draft: SearchDraft, extra: { saving?: boolean; notice?: SearchSettingsState['notice'] | undefined } = {}): void {
    const notice = 'notice' in extra ? extra.notice : this.state.notice
    this.store.set(this.project(this.form, draft, extra.saving ?? this.state.saving, notice))
  }

  private project(form: ConfigFormPort | undefined, draft: SearchDraft, saving: boolean, notice?: SearchSettingsState['notice']): SearchSettingsState {
    const snapshot = form?.getSnapshot()
    const stored = readSettings(snapshot?.value)
    const p = parsed(draft)
    const invalid: SearchInvalid = {
      searchSources: draft.searchSources.length === 0,
      resultsPerSource: Object.fromEntries(UNIFIED_SOURCES.map((s) => [s, p.resultsPerSource[s] === undefined])) as Record<UnifiedSource, boolean>,
      abstractMaxChars: p.abstractMaxChars === undefined,
      readMaxChars: p.readMaxChars === undefined,
    }
    const dirty = this.ops(draft, stored).length > 0
      || UNIFIED_SOURCES.some((s) => draft.resultsPerSource[s].trim() !== String(stored.resultsPerSource[s]))
      || draft.abstractMaxChars.trim() !== String(stored.abstractMaxChars)
      || draft.readMaxChars.trim() !== String(stored.readMaxChars)
    const user = isRecord(snapshot?.user) ? snapshot.user : {}
    const state: SearchSettingsState = {
      committed: stored,
      revision: snapshot?.revision,
      status: snapshot === undefined ? 'unsupported' : snapshot.status,
      writable: snapshot?.writable ?? false,
      draft,
      dirty,
      invalid,
      overridden: FIELDS.some((f) => Object.hasOwn(user, f)),
      saving,
    }
    if (notice !== undefined) state.notice = notice
    return state
  }

  /** The writes a save would make: only fields whose valid draft differs from the Host. */
  private ops(draft: SearchDraft, stored: SearchSettings): FormOp[] {
    const p = parsed(draft)
    const ops: FormOp[] = []
    if (!sameSources(draft.searchSources, stored.searchSources) && draft.searchSources.length > 0) ops.push({ op: 'set', path: ['searchSources'], value: [...draft.searchSources] })
    for (const s of UNIFIED_SOURCES) {
      const n = p.resultsPerSource[s]
      if (n !== undefined && n !== stored.resultsPerSource[s]) ops.push({ op: 'set', path: ['resultsPerSource', s], value: n })
    }
    if (p.abstractMaxChars !== undefined && p.abstractMaxChars !== stored.abstractMaxChars) ops.push({ op: 'set', path: ['abstractMaxChars'], value: p.abstractMaxChars })
    if (p.readMaxChars !== undefined && p.readMaxChars !== stored.readMaxChars) ops.push({ op: 'set', path: ['readMaxChars'], value: p.readMaxChars })
    for (const field of ['showCredits', 'showCommandCard', 'citeStyle', 'citeExcludePreprints', 'drawModel', 'drawImageSize'] as const) {
      if (draft[field] !== stored[field]) ops.push({ op: 'set', path: [field], value: draft[field] })
    }
    return ops
  }

  /** Toggle one platform in the default set. */
  toggleSource(source: UnifiedSource): void {
    const current = this.state.draft.searchSources
    const next = current.includes(source) ? current.filter((s) => s !== source) : UNIFIED_SOURCES.filter((s) => s === source || current.includes(s))
    this.edit('searchSources', next)
  }

  /** Stage one platform's result count. */
  editCount(source: UnifiedSource, text: string): void {
    this.touched.add(`resultsPerSource.${source}`)
    this.publish({ ...this.state.draft, resultsPerSource: { ...this.state.draft.resultsPerSource, [source]: text } }, { notice: undefined })
  }

  /** Stage one field's draft. */
  edit<K extends keyof SearchDraft>(field: K, value: SearchDraft[K]): void {
    this.touched.add(field)
    this.publish({ ...this.state.draft, [field]: value }, { notice: undefined })
  }

  /** Whether `save()` would write. */
  canSave(): boolean {
    const s = this.state
    const anyInvalid = s.invalid.searchSources || s.invalid.abstractMaxChars || s.invalid.readMaxChars || Object.values(s.invalid.resultsPerSource).some(Boolean)
    return s.status === 'ready' && s.writable && s.dirty && !s.saving && !anyInvalid
  }

  /** Write the changed fields in one revision-fenced mutation. */
  async save(): Promise<void> {
    if (!this.canSave() || this.form === undefined) return
    await this.write(this.ops(this.state.draft, readSettings(this.form.getSnapshot().value)), 'saved')
  }

  /** Remove every override, so the shipped defaults apply again. */
  async reset(): Promise<void> {
    const s = this.state
    if (this.form === undefined || s.status !== 'ready' || !s.writable || s.saving || !s.overridden) return
    const user = isRecord(this.form.getSnapshot().user) ? this.form.getSnapshot().user as Record<string, unknown> : {}
    await this.write(FIELDS.filter((f) => Object.hasOwn(user, f)).map((field) => ({ op: 'unset', path: [field] })), 'reset')
  }

  /** Drop every staged edit. */
  discard(): void {
    this.touched.clear()
    this.publish(draftOf(readSettings(this.form?.getSnapshot().value)), { notice: undefined })
  }

  private async write(ops: FormOp[], success: 'saved' | 'reset'): Promise<void> {
    const form = this.form!
    this.publish(this.state.draft, { saving: true, notice: undefined })
    let ok = false
    try {
      ok = ops.length === 0 ? true : await form.mutate(ops, form.getSnapshot().revision)
    } catch {
      ok = false
    }
    // A refused save keeps the drafts so the user can correct them; an accepted
    // one re-seeds from what the Host now holds.
    if (ok) this.touched.clear()
    const draft = ok ? draftOf(readSettings(form.getSnapshot().value)) : this.state.draft
    this.publish(draft, { saving: false, notice: ok ? success : 'failed' })
  }
}
