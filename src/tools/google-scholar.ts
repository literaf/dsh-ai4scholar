/**
 * Google Scholar search over the ai4scholar.net proxy (`/google-scholar/v1/search`).
 * The proxy returns one page of up to ten results and bills one credit; the
 * tool returns one page per call and hands back `nextOffset` so the caller can
 * page on when it wants more.
 * @module dsh-ai4scholar/tools/google-scholar
 */

import type { Context } from '@deepseek-ai/cordis'
import { researchMeta } from '../research-meta.js'
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
import { boundResults, limitsFor, requireQuery } from '../runtime.js'
import type { Runtime } from '../runtime.js'

const SOURCE = 'google-scholar' as const

/** Opaque platform identifiers must never pass through lossy number conversion. */
export function scholarId(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  return undefined
}

function clusterFromLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try { return new URL(value, 'https://scholar.google.com').searchParams.get('cluster') || undefined } catch { return undefined }
}

/** Keep requests in the proxy's one-credit tier (1–10 results). */
export const GS_PAGE_SIZE = 10

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
  const nativeId = scholarId(record.id)
  const inline = isRecord(record.inlineLinks) ? record.inlineLinks : {}
  const cites = scholarId(inline.citedByCitesId)
  const cluster = clusterFromLink(inline.versionsLink)
  return compact({
    source: SOURCE,
    id: nativeId ?? url,
    title,
    authors,
    year,
    venue: venue !== undefined && venue.length > 0 ? venue : undefined,
    abstract: str(record, 'snippet'),
    citationCount: int(record, 'citedBy'),
    doi: str(record, 'doi'),
    url,
    pdfUrl: str(record, 'pdfUrl'),
    externalIds: compact({ GoogleScholar: nativeId, GoogleScholarCites: cites, GoogleScholarCluster: cluster }),
    extra: compact({
      publicationInfo,
      citedByLink: str(inline, 'citedByLink'), versionsLink: str(inline, 'versionsLink'),
      relatedLink: str(inline, 'relatedLink'), versionsCount: str(inline, 'versionsCount'),
    }),
  })
}

/** Parameters of one Google Scholar search. */
export interface ScholarSearchParams {
  query: string
  /** Already bounded number of results wanted (at most one page, GS_PAGE_SIZE). */
  wanted: number
  /** Results to skip; must align with the requested page size. */
  offset?: number | undefined
  yearFrom?: number | undefined
  yearTo?: number | undefined
  language?: string | undefined
  reviewOnly?: boolean | undefined
  sortByDate?: boolean | undefined
  cites?: string | undefined
  cluster?: string | undefined
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
  if (params.yearFrom !== undefined && params.yearTo !== undefined && params.yearFrom > params.yearTo) {
    throw new Error('year_from must not be later than year_to')
  }
  const wanted = boundResults(params.wanted, { defaultMaxResults: GS_PAGE_SIZE, maxResultsCap: GS_PAGE_SIZE })
  const offset = params.offset ?? 0
  // The proxy computes its start as (page - 1) * results. Never round an
  // incompatible cursor down: that would silently repeat papers and charges.
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % wanted !== 0) {
    throw new Error(`offset must be a non-negative multiple of max_results (${wanted}); keep the same max_results when following nextOffset`)
  }
  const page = offset / wanted + 1
  const apiKey = await runtime.requireApiKey()
  signal?.throwIfAborted()
  const body: Record<string, unknown> = { query, page, results: wanted }
  if (params.yearFrom !== undefined) body.yearFrom = params.yearFrom
  if (params.yearTo !== undefined) body.yearTo = params.yearTo
  for (const name of ['language', 'reviewOnly', 'sortByDate', 'cites', 'cluster'] as const) {
    if (params[name] !== undefined) body[name] = params[name]
  }
  const res = await runtime.client.post<{ results?: unknown[]; resultsCount?: number }>('/google-scholar/v1/search', body, { apiKey, signal })
  // This response also covers outages and upstream limits. Do not present it
  // as proof that no papers exist or that the last page has been reached.
  if (!res.ok && res.status === 503 && res.code === 'UPSTREAM_UNAVAILABLE') {
    return {
      source: SOURCE, query, total: 0, papers: [], truncated: false,
      warning: 'Google Scholar returned no results: the upstream may be temporarily unavailable or this page may be empty. No credits were charged; retry later or refine the query.',
    }
  }
  if (!res.ok) throw new Error(`Google Scholar search failed: ${res.error}`)
  const records = (res.data.results ?? []).slice(0, wanted)
  const papers = records.map(normalizeScholarResult).filter((p): p is Paper => p !== undefined)
  const pageCount = typeof res.data.resultsCount === 'number' ? res.data.resultsCount : records.length
  // Google Scholar reports no total; a full page means more may follow.
  const more = pageCount >= wanted && records.length > 0
  return compact({
    source: SOURCE,
    query,
    total: papers.length,
    papers,
    truncated: more,
    nextOffset: more ? offset + wanted : undefined,
    credits: runtime.creditsOf(res, agent),
  })
}

/**
 * Register the Google Scholar search tool.
 * @param ctx - context whose `tools` registry receives the effect-scoped registration.
 * @param runtime - plugin instance runtime.
 */
export function applyGoogleScholarTools(ctx: Context, runtime: Runtime): void {
  const { limits, render, timeouts } = runtime
  // One Google Scholar call is one page of up to GS_PAGE_SIZE, billed one credit;
  // the per-platform default is clamped to that page, and the model pages with offset.
  const defaultPerCall = Math.min(limitsFor(limits, runtime.resultsPerSource, 'google-scholar').defaultMaxResults, GS_PAGE_SIZE)

  ctx.tools.register(defineTool({
    name: 'search_google_scholar',
    description: `Search Google Scholar (broad coverage across publishers, theses, and books). Returns title, authors, venue, year, cited-by count, snippet, and PDF link when available. Supports a year range. Slower than the other search tools. One call returns up to ${GS_PAGE_SIZE} results and costs one credit; for more, call again with the returned offset.`,
    parameters: {
      query: { type: 'string', required: true, description: 'Search query.' },
      max_results: { type: 'integer', description: `Number of results to return (default ${defaultPerCall}, max ${GS_PAGE_SIZE} per call — one billed page). To read beyond ${GS_PAGE_SIZE}, call again with offset.` },
      offset: { type: 'integer', description: 'Results to skip (default 0). Use the returned nextOffset and keep the same max_results while paging; offset must be a multiple of that count. Each request costs one credit.' },
      year_from: { type: 'integer', description: 'Earliest publication year, e.g. 2020.' },
      year_to: { type: 'integer', description: 'Latest publication year, e.g. 2025.' },
      language: { type: 'string', description: 'Result language, e.g. en or zh-CN.' },
      review_only: { type: 'boolean', description: 'Only review articles.' },
      sort_by_date: { type: 'boolean', description: 'Sort by publication date.' },
      cites: { type: 'string', description: 'Find papers citing this exact GoogleScholarCites identifier from a previous result; keep it a string.' },
      cluster: { type: 'string', description: 'Find all versions using the exact GoogleScholarCluster identifier from a previous result; keep it a string.' },
    },
    output: {
      schema: PAPER_SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderPaperSearch(value, render),
      presentationMeta: (_args, value) => researchMeta(value, runtime.enabledTools, paperSearchMeta(value)),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentPaperSearchCall(SOURCE, args.query),
    presentResult: (args, result) => presentPaperSearchResult(SOURCE, args.query, result),
    async execute(args, exec) {
      return runScholarSearch(runtime, {
        query: args.query,
        wanted: boundResults(args.max_results, { defaultMaxResults: defaultPerCall, maxResultsCap: GS_PAGE_SIZE }, GS_PAGE_SIZE),
        offset: args.offset,
        yearFrom: args.year_from,
        yearTo: args.year_to,
        language: args.language, reviewOnly: args.review_only, sortByDate: args.sort_by_date,
        cites: args.cites, cluster: args.cluster,
      }, exec.signal, exec.agent)
    },
  }))
}
