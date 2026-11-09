/** Authenticated, owner-only bridge to the plugin's existing search tools. */
import type { Context } from '@deepseek-ai/cordis'
import type { Runtime } from './runtime.js'
import { compact, isRecord, str } from './paper.js'
import { PLATFORM_CAP } from './shared/search-settings.js'
import type { UnifiedSource } from './shared/search-settings.js'
import {
  hasDateSort,
  hasYearFilter,
  isCategorySource,
  isPreprint,
  SEARCH_TOOLS,
  WORKBENCH_ROUTE,
  WORKBENCH_SOURCES,
} from './shared/workbench.js'
import type {
  WorkbenchCatalog,
  WorkbenchItem,
  WorkbenchRequest,
  WorkbenchResult,
  WorkbenchSource,
} from './shared/workbench.js'

interface SearchTool {
  execute(args: Record<string, unknown>, context: { signal: AbortSignal; agent: object }): Promise<unknown>
}
interface Connection {
  fetch?: {
    register(route: {
      path: string
      methods: readonly string[]
      requestBody: 'buffered'
      fetch(request: Request): Promise<Response>
    }): () => Promise<void>
  }
}
const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
const url = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  try {
    const u = new URL(value)
    return ['https:', 'http:'].includes(u.protocol) ? u.href : undefined
  } catch {
    return undefined
  }
}

class InputError extends Error {}
function integer(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new InputError(`Invalid ${name}`)
  return value
}

/** Accept a small, explicit search schema, never an arbitrary tool name or arguments. */
export function parseWorkbenchRequest(value: unknown): WorkbenchRequest {
  if (!isRecord(value) || !WORKBENCH_SOURCES.includes(value.source as WorkbenchSource))
    throw new InputError('Unknown search source')
  const source = value.source as WorkbenchSource
  if (typeof value.query !== 'string' || !value.query.trim() || value.query.length > 2000)
    throw new InputError('Enter a search query (up to 2000 characters)')
  const limit = integer(value.limit, 'limit', 1, 100) ?? 10
  const yearFrom = integer(value.yearFrom, 'yearFrom', 1000, 9999)
  const yearTo = integer(value.yearTo, 'yearTo', 1000, 9999)
  if ((yearFrom !== undefined || yearTo !== undefined) && !hasYearFilter(source))
    throw new InputError('This source does not support year filters')
  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo)
    throw new InputError('Start year must not follow end year')
  const days = integer(value.days, 'days', 1, 3650)
  if (days !== undefined && !isCategorySource(source))
    throw new InputError('This source does not support a look-back window')
  if (value.sort !== undefined && !['relevance', 'date'].includes(value.sort as string))
    throw new InputError('Invalid sort')
  if (value.sort === 'date' && !hasDateSort(source)) throw new InputError('This source does not support date sorting')
  const offset = integer(value.offset, 'offset', 0, 1_000_000)
  const page = integer(value.page, 'page', 1, 10_000)
  if (page !== undefined && source !== 'google-patents')
    throw new InputError('This source does not support page numbers')
  if (offset !== undefined && ['google-patents', 'snippets', 'biorxiv', 'medrxiv'].includes(source))
    throw new InputError('This source does not support offsets')
  return compact({
    source,
    query: value.query.trim(),
    limit,
    yearFrom,
    yearTo,
    days,
    sort: value.sort as WorkbenchRequest['sort'],
    offset,
    page,
  })
}

function toolArgs(request: WorkbenchRequest): Record<string, unknown> {
  const { source, yearFrom, yearTo } = request
  const args: Record<string, unknown> = { query: request.query, max_results: request.limit }
  if (request.offset !== undefined) args.offset = request.offset
  if (source === 'semantic-scholar' && (yearFrom || yearTo))
    args.year = yearFrom === yearTo ? String(yearFrom) : `${yearFrom ?? ''}-${yearTo ?? ''}`
  if (source === 'pubmed') {
    if (yearFrom) args.min_date = String(yearFrom)
    if (yearTo) args.max_date = String(yearTo)
    if (request.sort) args.sort = request.sort
  }
  if (source === 'google-scholar' || source === 'chinese') {
    if (yearFrom) args.year_from = yearFrom
    if (yearTo) args.year_to = yearTo
    if (source === 'google-scholar' && request.sort === 'date') args.sort_by_date = true
    if (source === 'chinese' && request.sort === 'date') args.sort = 'year'
  }
  if (source === 'arxiv' && request.sort === 'date') args.sort_by = 'submittedDate'
  if (source === 'google-patents') {
    if (request.page !== undefined) args.page = request.page
    if (request.sort === 'date') args.sort = 'new'
  }
  if (isCategorySource(source) && request.days !== undefined) args.days = request.days
  return args
}

/** Keep source-specific detail while sharing one accessible master/detail UI. */
export function workbenchResult(request: WorkbenchRequest, raw: unknown): WorkbenchResult {
  if (!isRecord(raw)) throw new Error('Search returned an invalid response')
  const source = request.source
  let items: WorkbenchItem[] = []
  if (source === 'snippets') {
    items = (Array.isArray(raw.snippets) ? raw.snippets : []).filter(isRecord).flatMap((s, i) => {
      if (!isRecord(s.paper) || !str(s.paper, 'title')) return []
      return [
        compact({
          id: `${str(s.paper, 'paperId') ?? 'snippet'}:${i}`,
          source,
          kind: 'snippet' as const,
          title: str(s.paper, 'title')!,
          authors: strings(s.paper.authors),
          url: url(s.paper.url),
          abstract: str(s, 'text'),
          section: str(s, 'section'),
        }),
      ]
    })
  } else if (source === 'google-patents') {
    items = (Array.isArray(raw.patents) ? raw.patents : []).filter(isRecord).flatMap((p, i) => {
      if (!str(p, 'title')) return []
      const fields = [
        'publicationNumber',
        'inventor',
        'assignee',
        'filingDate',
        'priorityDate',
        'publicationDate',
        'grantDate',
      ]
      return [
        compact({
          id: str(p, 'patentId') ?? str(p, 'publicationNumber') ?? `patent:${i}`,
          source,
          kind: 'patent' as const,
          title: str(p, 'title')!,
          authors: str(p, 'inventor') ? [str(p, 'inventor')!] : [],
          venue: str(p, 'assignee'),
          abstract: str(p, 'snippet'),
          url: url(p.url),
          pdfUrl: url(p.pdfUrl),
          facts: fields.flatMap((label) => (str(p, label) ? [{ label, value: str(p, label)! }] : [])),
        }),
      ]
    })
  } else {
    items = (Array.isArray(raw.papers) ? raw.papers : []).filter(isRecord).flatMap((p, i) => {
      if (!str(p, 'title')) return []
      return [
        compact({
          id: str(p, 'id') ?? `paper:${i}`,
          source,
          kind: 'paper' as const,
          title: str(p, 'title')!,
          authors: strings(p.authors),
          year: number(p.year),
          venue: str(p, 'venue'),
          citationCount: number(p.citationCount),
          doi: str(p, 'doi'),
          url: url(p.url),
          pdfUrl: url(p.pdfUrl),
          abstract: str(p, 'abstract'),
        }),
      ]
    })
  }
  const offset = number(raw.nextOffset)
  const page = number(raw.nextPage)
  const next =
    offset !== undefined && offset > (request.offset ?? 0)
      ? { offset }
      : page !== undefined && page > (request.page ?? 1)
        ? { page }
        : undefined
  const credits = isRecord(raw.credits)
    ? compact({ charged: number(raw.credits.charged), remaining: number(raw.credits.remaining) })
    : undefined
  return compact({
    source,
    query: request.query,
    items,
    total: number(raw.total),
    next,
    warning: str(raw, 'warning'),
    credits,
  })
}

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function applyWorkbenchRoute(ctx: Context, runtime: Runtime, defaultSources: readonly UnifiedSource[]): void {
  ctx.inject(['connection'], (child) => {
    const connection = child.get('connection') as Connection | undefined
    if (!connection?.fetch?.register) return
    const agent = {} // Separate manual-search credit tally from conversation agents.
    const catalog = (): WorkbenchCatalog => {
      const sources = WORKBENCH_SOURCES.filter((id) => !!ctx.tools.get(SEARCH_TOOLS[id])).map((id) => {
        const maxLimit = Math.min(
          runtime.limits.maxResultsCap,
          id in PLATFORM_CAP ? PLATFORM_CAP[id as UnifiedSource] : 100,
        )
        const defaultLimit = Math.min(
          runtime.resultsPerSource[id as UnifiedSource] ?? runtime.limits.defaultMaxResults,
          maxLimit,
        )
        return { id, defaultLimit, maxLimit, needsKey: !isPreprint(id) }
      })
      return { sources, defaultSource: defaultSources.find((s) => sources.some((x) => x.id === s)) ?? sources[0]?.id }
    }
    // The host registry checks session authentication, same origin and owner
    // access, and owns the route's lifetime. No public webserver fallback.
    connection.fetch.register({
      path: WORKBENCH_ROUTE,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      async fetch(request) {
        if (request.method === 'GET') return answer({ ok: true, value: catalog() })
        if (request.method !== 'POST')
          return answer({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'GET or POST required' }, 405)
        let input: WorkbenchRequest
        try {
          const text = await request.text()
          if (text.length > 16_384) throw new InputError('Search request is too large')
          input = parseWorkbenchRequest(JSON.parse(text) as unknown)
          const entry = catalog().sources.find((s) => s.id === input.source)
          if (!entry)
            return answer({ ok: false, code: 'SOURCE_DISABLED', error: 'This search source is disabled' }, 400)
          if (input.limit > entry.maxLimit)
            throw new InputError(`This source supports up to ${entry.maxLimit} results per request`)
        } catch (error) {
          return answer(
            {
              ok: false,
              code: 'INVALID_INPUT',
              error: error instanceof InputError ? error.message : 'Invalid search request',
            },
            400,
          )
        }
        try {
          const tool = ctx.tools.get(SEARCH_TOOLS[input.source]) as unknown as SearchTool
          const signal = AbortSignal.any([request.signal, AbortSignal.timeout(runtime.timeouts.tool)])
          const result = await tool.execute(toolArgs(input), { signal, agent })
          return answer({ ok: true, value: workbenchResult(input, result) })
        } catch (error) {
          // API errors are already sanitized by Ai4ScholarClient. Never expose
          // credentials here or accept a client-provided API key/base URL.
          return answer(
            {
              ok: false,
              code: request.signal.aborted ? 'ABORTED' : 'SEARCH_FAILED',
              error: error instanceof Error ? error.message : 'Search failed',
            },
            502,
          )
        }
      },
    })
  })
}
