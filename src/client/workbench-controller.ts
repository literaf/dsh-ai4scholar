import { createCardStore } from './controller.js'
import { WORKBENCH_ROUTE, hasDateSort, hasYearFilter, isCategorySource } from '../shared/workbench.js'
import type {
  WorkbenchCatalog,
  WorkbenchRequest,
  WorkbenchResponse,
  WorkbenchResult,
  WorkbenchSource,
} from '../shared/workbench.js'

export interface SearchDraft {
  query: string
  limit: number
  yearFrom: string
  yearTo: string
  days: number
  sort: 'relevance' | 'date'
}
interface Page {
  request: WorkbenchRequest
  result: WorkbenchResult
}
export interface WorkbenchState {
  catalog?: WorkbenchCatalog
  source: WorkbenchSource
  draft: SearchDraft
  loading: boolean
  busy: boolean
  error?: string
  errorCode?: string
  pages: Page[]
  pageIndex: number
  selected: number
  history: Array<{ source: WorkbenchSource; query: string }>
}
type Fetcher = (
  body: WorkbenchRequest | undefined,
  signal: AbortSignal,
) => Promise<WorkbenchResponse<WorkbenchCatalog | WorkbenchResult>>
const fetchWorkbench: Fetcher = async (body, signal) => {
  const response = await fetch(new URL(WORKBENCH_ROUTE.replace(/^\//, ''), document.baseURI), {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error(`Workbench unavailable (HTTP ${response.status})`)
  return (await response.json()) as WorkbenchResponse<WorkbenchCatalog | WorkbenchResult>
}
const blank = (limit = 10): SearchDraft => ({ query: '', limit, yearFrom: '', yearTo: '', days: 30, sort: 'relevance' })

/** Session-local state survives closing the page; stale requests never replace newer results. */
export class WorkbenchController {
  readonly store = createCardStore<WorkbenchState>({
    source: 'semantic-scholar',
    draft: blank(),
    loading: true,
    busy: false,
    pages: [],
    pageIndex: 0,
    selected: 0,
    history: [],
  })
  private active: AbortController | undefined
  private catalogRequest: AbortController | undefined
  private sequence = 0
  private disposed = false
  private snapshots = new Map<WorkbenchSource, Pick<WorkbenchState, 'draft' | 'pages' | 'pageIndex' | 'selected'>>()
  constructor(private readonly fetcher: Fetcher = fetchWorkbench) {}
  private patch(patch: Partial<WorkbenchState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }
  private clearError(): void {
    const { error: _error, errorCode: _code, ...state } = this.store.getSnapshot()
    this.store.set(state)
  }
  async attach(): Promise<void> {
    if (this.disposed || this.catalogRequest) return
    const controller = new AbortController()
    this.catalogRequest = controller
    this.patch({ loading: true })
    try {
      const response = await this.fetcher(undefined, controller.signal)
      if (this.disposed || controller.signal.aborted) return
      if (!response.ok) throw new Error(response.error)
      const catalog = response.value as WorkbenchCatalog
      const state = this.store.getSnapshot()
      if (state.errorCode === 'UNAVAILABLE') this.clearError()
      const firstLoad = !state.catalog
      const source = firstLoad
        ? catalog.defaultSource ?? state.source
        : catalog.sources.some((s) => s.id === state.source)
          ? state.source
          : catalog.defaultSource ?? state.source
      const entry = catalog.sources.find((s) => s.id === source)
      const oldEntry = state.catalog?.sources.find((s) => s.id === state.source)
      // Follow a changed default until the user explicitly picks a different
      // count for this query. Existing result pages keep their submitted limit.
      const limit =
        state.draft.limit === oldEntry?.defaultLimit ? entry?.defaultLimit ?? state.draft.limit : state.draft.limit
      for (const [id, saved] of this.snapshots) {
        const before = state.catalog?.sources.find((s) => s.id === id)
        const after = catalog.sources.find((s) => s.id === id)
        if (!after) {
          this.snapshots.delete(id)
          continue
        }
        const nextLimit = saved.draft.limit === before?.defaultLimit ? after.defaultLimit : saved.draft.limit
        saved.draft = { ...saved.draft, limit: Math.min(nextLimit, after.maxLimit) }
      }
      const changedSource = source !== state.source
      this.patch({
        catalog,
        source,
        loading: false,
        draft:
          firstLoad || changedSource
            ? blank(entry?.defaultLimit)
            : { ...state.draft, limit: Math.min(limit, entry?.maxLimit ?? 100) },
        ...(changedSource ? { pages: [], pageIndex: 0, selected: 0 } : {}),
      })
    } catch (error) {
      if (!this.disposed && !controller.signal.aborted)
        this.patch({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'UNAVAILABLE',
        })
    } finally {
      if (this.catalogRequest === controller) this.catalogRequest = undefined
    }
  }
  edit(patch: Partial<SearchDraft>): void {
    this.patch({ draft: { ...this.store.getSnapshot().draft, ...patch } })
  }
  choose(source: WorkbenchSource): void {
    const state = this.store.getSnapshot()
    if (source === state.source || !state.catalog?.sources.some((s) => s.id === source)) return
    this.cancel()
    this.snapshots.set(state.source, {
      draft: state.draft,
      pages: state.pages,
      pageIndex: state.pageIndex,
      selected: state.selected,
    })
    this.clearError()
    const saved = this.snapshots.get(source)
    this.patch({
      source,
      ...(saved ?? {
        draft: {
          ...blank(state.catalog.sources.find((s) => s.id === source)?.defaultLimit),
          query: isCategorySource(source) ? '' : state.draft.query,
        },
        pages: [],
        pageIndex: 0,
        selected: 0,
      }),
    })
  }
  select(selected: number): void {
    this.patch({ selected })
  }
  previous(): void {
    const state = this.store.getSnapshot()
    if (!state.busy && state.pageIndex > 0) this.patch({ pageIndex: state.pageIndex - 1, selected: 0 })
  }
  async next(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.busy) return
    if (state.pageIndex < state.pages.length - 1) {
      this.patch({ pageIndex: state.pageIndex + 1, selected: 0 })
      return
    }
    const page = state.pages[state.pageIndex]
    if (page?.result.next) await this.run({ ...page.request, ...page.result.next }, false)
  }
  async search(): Promise<void> {
    const state = this.store.getSnapshot()
    // Returning from Settings refreshes the defaults. Never bill a request
    // using the previous configuration while that refresh is in flight.
    if (this.disposed || state.loading) return
    const d = state.draft
    const request: WorkbenchRequest = { source: state.source, query: d.query.trim(), limit: d.limit }
    if (!request.query) return
    if (hasYearFilter(state.source)) {
      if (d.yearFrom.trim()) request.yearFrom = Number(d.yearFrom)
      if (d.yearTo.trim()) request.yearTo = Number(d.yearTo)
    }
    if (isCategorySource(state.source)) request.days = d.days
    if (hasDateSort(state.source)) request.sort = d.sort
    await this.run(request, true)
  }
  private async run(request: WorkbenchRequest, fresh: boolean): Promise<void> {
    this.cancel()
    const sequence = ++this.sequence
    const controller = new AbortController()
    this.active = controller
    this.clearError()
    this.patch({ busy: true })
    try {
      const response = await this.fetcher(request, controller.signal)
      if (this.disposed || sequence !== this.sequence || controller.signal.aborted) return
      if (!response.ok) {
        this.patch({ error: response.error, errorCode: response.code })
        return
      }
      const result = response.value as WorkbenchResult
      const state = this.store.getSnapshot()
      const pages = fresh ? [{ request, result }] : [...state.pages, { request, result }]
      // Bound retained results; previous pages are reused without another paid search.
      if (pages.length > 20) pages.shift()
      const history = [
        { source: request.source, query: request.query },
        ...state.history.filter((h) => h.source !== request.source || h.query !== request.query),
      ].slice(0, 12)
      this.patch({ pages, pageIndex: pages.length - 1, selected: 0, history })
    } catch (error) {
      if (!this.disposed && sequence === this.sequence && !controller.signal.aborted)
        this.patch({ error: error instanceof Error ? error.message : String(error), errorCode: 'REQUEST_FAILED' })
    } finally {
      if (!this.disposed && sequence === this.sequence) {
        this.active = undefined
        this.patch({ busy: false })
      }
    }
  }
  cancel(): void {
    this.sequence++
    this.active?.abort()
    this.active = undefined
    this.patch({ busy: false })
  }
  dispose(): void {
    this.disposed = true
    this.cancel()
    this.catalogRequest?.abort()
    this.snapshots.clear()
  }
}
