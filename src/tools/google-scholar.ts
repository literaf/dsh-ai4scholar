/**
 * Google Scholar search over the ai4scholar.net proxy (`/google-scholar/v1/search`).
 * The proxy returns ten results per page; the tool paginates until it has
 * `max_results` or the platform runs dry.
 * @module dsh-ai4scholar/tools/google-scholar
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  PAPER_SEARCH_OUTPUT_SCHEMA,
  compact,
  int,
  isRecord,
  paperSearchMeta,
  presentPaperSearchCall,
  presentPaperSearchResult,
  renderPaperSearch,
  str,
} from '../paper.js'
import type { Paper, PaperSearchValue } from '../paper.js'
import { boundResults, requireQuery } from '../runtime.js'
import type { Runtime } from '../runtime.js'

const SOURCE = 'google-scholar' as const

/** Google Scholar page size, fixed by the platform. */
const GS_PAGE_SIZE = 10

/**
 * Normalize one Google Scholar result from the ai4scholar proxy.
 * @param record - untyped `results[]` element.
 * @returns the normalized paper, or `undefined` for a record without a title.
 */
export function normalizeScholarResult(record: unknown): Paper | undefined {
  if (!isRecord(record)) return undefined
  const title = str(record, 'title')
  if (title === undefined) return undefined
  const link = str(record, 'link') ?? str(record, 'url')
  const publicationInfo = str(record, 'publicationInfo')
  // publicationInfo reads like "A Vaswani, N Shazeer, N Parmar - Advances in neural…, 2017 - proceedings.neurips.cc"
  const authorSegment = publicationInfo?.split(' - ')[0]
  const venueSegment = publicationInfo?.split(' - ')[1]
  const authors = authorSegment !== undefined && !/^https?:/.test(authorSegment)
    ? authorSegment.split(',').map((a) => a.replace(/…$/, '').trim()).filter((a) => a.length > 0)
    : []
  const venue = venueSegment !== undefined
    ? venueSegment.replace(/,\s*\d{4}\s*$/, '').trim()
    : undefined
  const year = int(record, 'year')
  const url = link ?? `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`
  return compact({
    source: SOURCE,
    id: url,
    title,
    authors,
    year,
    venue: venue !== undefined && venue.length > 0 ? venue : undefined,
    abstract: str(record, 'snippet'),
    citationCount: int(record, 'citedBy'),
    doi: str(record, 'doi'),
    url,
    pdfUrl: str(record, 'pdfUrl'),
  })
}

/** Parameters of one Google Scholar search. */
export interface ScholarSearchParams {
  query: string
  /** Already bounded number of results wanted (fetched in pages of 10). */
  wanted: number
  yearFrom?: number | undefined
  yearTo?: number | undefined
}

/**
 * Run one Google Scholar search (shared by `search_google_scholar` and `search_papers`).
 * @param runtime - plugin runtime.
 * @param params - query, wanted count, and year range.
 * @param signal - cancellation.
 * @param agent - executing agent for the credit tally.
 * @returns the normalized result set.
 */
export async function runScholarSearch(runtime: Runtime, params: ScholarSearchParams, signal: AbortSignal | undefined, agent: object | undefined): Promise<PaperSearchValue> {
  const query = requireQuery(params.query)
  const wanted = params.wanted
  if (params.yearFrom !== undefined && params.yearTo !== undefined && params.yearFrom > params.yearTo) {
    throw new Error('year_from must not be later than year_to')
  }
  const apiKey = await runtime.requireApiKey()
  const papers: Paper[] = []
  let page = 1
  let exhausted = false
  let firstError: string | undefined
  let credits: ReturnType<Runtime['creditsOf']>
  while (papers.length < wanted && !exhausted) {
    signal?.throwIfAborted()
    const body: Record<string, unknown> = { query, page }
    if (params.yearFrom !== undefined) body.yearFrom = params.yearFrom
    if (params.yearTo !== undefined) body.yearTo = params.yearTo
    const res = await runtime.client.post<{ results?: unknown[]; resultsCount?: number }>('/google-scholar/v1/search', body, { apiKey, signal })
    if (!res.ok) {
      // A later page failing keeps the pages already fetched; the first page failing is the failure.
      if (papers.length === 0) throw new Error(`Google Scholar search failed: ${res.error}`)
      firstError = res.error
      break
    }
    const pageCredits = runtime.creditsOf(res, agent)
    if (pageCredits !== undefined) {
      // Each page is one billed call: sum the charges, keep the latest balance.
      credits = compact({
        charged: (credits?.charged ?? 0) + (pageCredits.charged ?? 0),
        remaining: pageCredits.remaining ?? credits?.remaining,
        sessionTotal: pageCredits.sessionTotal ?? credits?.sessionTotal,
      })
    }
    const batch = (res.data.results ?? []).map(normalizeScholarResult).filter((p): p is Paper => p !== undefined)
    papers.push(...batch)
    const pageCount = typeof res.data.resultsCount === 'number' ? res.data.resultsCount : batch.length
    if (batch.length === 0 || pageCount < GS_PAGE_SIZE) exhausted = true
    page += 1
  }
  const kept = papers.slice(0, wanted)
  // Google Scholar reports no total; more may exist whenever the last page was full.
  const truncated = !exhausted || papers.length > kept.length
  return compact({
    source: SOURCE,
    query,
    total: kept.length,
    papers: kept,
    truncated,
    // A later page failing is a degraded success: keep the fetched pages and say why it stopped.
    warning: firstError !== undefined ? `Pagination stopped early: ${firstError}` : undefined,
    credits,
  })
}

/**
 * Register the Google Scholar search tool.
 * @param ctx - context whose `tools` registry receives the effect-scoped registration.
 * @param runtime - plugin instance runtime.
 */
export function applyGoogleScholarTools(ctx: Context, runtime: Runtime): void {
  const { client, limits, render, timeouts } = runtime

  ctx.tools.register(defineTool({
    name: 'search_google_scholar',
    description: 'Search Google Scholar (broad coverage across publishers, theses, and books). Returns title, authors, venue, year, cited-by count, snippet, and PDF link when available. Supports a year range. Slower than the other search tools; each 10 results is one page fetch.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search query.' },
      max_results: { type: 'integer', description: `Number of results to return (default ${limits.defaultMaxResults}, max ${limits.maxResultsCap}); fetched in pages of ${GS_PAGE_SIZE}.` },
      year_from: { type: 'integer', description: 'Earliest publication year, e.g. 2020.' },
      year_to: { type: 'integer', description: 'Latest publication year, e.g. 2025.' },
    },
    output: {
      schema: PAPER_SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderPaperSearch(value, render),
      presentationMeta: (_args, value) => paperSearchMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentPaperSearchCall(SOURCE, args.query),
    presentResult: (args, result) => presentPaperSearchResult(SOURCE, args.query, result),
    async execute(args, exec) {
      return runScholarSearch(runtime, {
        query: args.query,
        wanted: boundResults(args.max_results, limits),
        yearFrom: args.year_from,
        yearTo: args.year_to,
      }, exec.signal, exec.agent)
    },
  }))
}
