/** Chinese literature search, shared by the standalone and unified tools. */

import type { Context } from '@deepseek-ai/cordis'
import { researchMeta } from '../research-meta.js'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  PAPER_SEARCH_OUTPUT_SCHEMA, compact, int, isRecord, paperSearchMeta,
  presentPaperSearchCall, presentPaperSearchResult, renderPaperSearch, str,
} from '../paper.js'
import type { Paper, PaperSearchValue } from '../paper.js'
import { boundResults, limitsFor, requireQuery } from '../runtime.js'
import type { Runtime } from '../runtime.js'
import { PLATFORM_CAP } from '../shared/search-settings.js'

const SOURCE = 'chinese' as const
const RESOURCES = ['all', 'journal', 'thesis', 'conference'] as const
const SORTS = ['relevance', 'year', 'citations'] as const
const MAX_OFFSET = 5_000

/** Keep the public result vocabulary independent of the upstream provider. */
export function normalizeChinesePaper(record: unknown): Paper | undefined {
  if (!isRecord(record)) return undefined
  const id = str(record, 'id')
  const title = str(record, 'title')
  if (id === undefined || title === undefined) return undefined
  const strings = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
  const rawDoi = str(record, 'doi')?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim()
  const doi = rawDoi !== undefined && /^10\.\d{4,9}\/\S+$/i.test(rawDoi) ? rawDoi : undefined
  let url = ''
  try {
    const candidate = new URL(str(record, 'url') ?? '')
    if (['https:', 'http:'].includes(candidate.protocol) && !candidate.username && !candidate.password) url = candidate.href
  } catch { /* Some records have neither a DOI nor a public article URL. */ }
  if (!url && doi !== undefined) url = `https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}`
  const keywords = strings(record.keywords)
  return compact({
    source: SOURCE, id, title,
    authors: strings(record.authors),
    year: int(record, 'year'),
    venue: str(record, 'venue'),
    abstract: str(record, 'abstract'),
    citationCount: int(record, 'citationCount'),
    doi, url,
    externalIds: compact({ ChineseLiterature: id, DOI: doi }),
    extra: compact({
      resource: str(record, 'resource'),
      keywords: keywords.length > 0 ? keywords : undefined,
      publicationInfo: str(record, 'publicationInfo'),
      contentKind: str(record, 'content_kind'),
      contentTruncated: typeof record.content_truncated === 'boolean' ? record.content_truncated : undefined,
    }),
  })
}

interface ChineseSearchParams {
  query: string
  limit: number
  offset?: number | undefined
  resource?: (typeof RESOURCES)[number] | undefined
  sort?: (typeof SORTS)[number] | undefined
  yearFrom?: number | undefined
  yearTo?: number | undefined
}

/** One API request, up to 100 records; use its explicit cursor for continuation. */
export async function runChineseSearch(runtime: Runtime, params: ChineseSearchParams, signal: AbortSignal | undefined, agent: object | undefined): Promise<PaperSearchValue> {
  const query = requireQuery(params.query)
  if (query.length > 300) throw new Error('Chinese literature query must be at most 300 characters')
  const concepts = [...query.matchAll(/"([^"\n]+)"|([^\s"]+)/g)]
  if (concepts.length === 0 || concepts.length > 20) throw new Error('Use 1–20 Chinese keywords or quoted phrases')
  const offset = params.offset ?? 0
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_OFFSET) throw new Error(`offset must be an integer from 0 to ${MAX_OFFSET}`)
  for (const [name, value] of [['year_from', params.yearFrom], ['year_to', params.yearTo]] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1000 || value > 9999)) throw new Error(`${name} must be a four-digit year`)
  }
  if (params.yearFrom !== undefined && params.yearTo !== undefined && params.yearFrom > params.yearTo) throw new Error('year_from must not be later than year_to')
  const limit = boundResults(params.limit, limitsFor(runtime.limits, runtime.resultsPerSource, SOURCE), PLATFORM_CAP[SOURCE])
  const apiKey = await runtime.requireApiKey()
  signal?.throwIfAborted()
  const response = await runtime.client.post<{ papers: unknown[]; total: number; nextOffset: number | null }>(
    '/api/proxy/wanfang/search',
    compact({ query, limit, offset, resource: params.resource ?? 'all', sort: params.sort ?? 'relevance', yearFrom: params.yearFrom, yearTo: params.yearTo }),
    { apiKey, signal },
  )
  if (!response.ok) throw new Error(`Chinese literature search failed: ${response.error}`)
  const data = response.data
  if (!isRecord(data) || !Array.isArray(data.papers) || !Number.isSafeInteger(data.total) || data.total < 0) {
    throw new Error('Chinese literature search returned an invalid response')
  }
  const rawNext = data.nextOffset
  if (rawNext !== null && (!Number.isSafeInteger(rawNext) || rawNext <= offset || rawNext > MAX_OFFSET)) {
    throw new Error('Chinese literature search returned an invalid continuation offset')
  }
  const records = data.papers.slice(0, limit)
  const papers = records.map(normalizeChinesePaper).filter((paper): paper is Paper => paper !== undefined)
  const nextOffset = rawNext ?? undefined
  const truncated = nextOffset !== undefined || offset + records.length < data.total
  return compact({
    source: SOURCE, query, total: data.total, papers, truncated, nextOffset,
    warning: truncated && nextOffset === undefined
      ? 'More matches exist, but the API returned no continuation offset. Refine the keywords or year range instead of paging further.'
      : undefined,
    credits: runtime.creditsOf(response, agent),
  })
}

/** Register the public, provider-neutral Chinese literature tool. */
export function applyChineseTools(ctx: Context, runtime: Runtime): void {
  const limits = limitsFor(runtime.limits, runtime.resultsPerSource, SOURCE)
  const cap = Math.min(limits.maxResultsCap, PLATFORM_CAP[SOURCE])
  ctx.tools.register(defineTool({
    name: 'search_chinese',
    description: 'Search Chinese-language journal articles, theses and conference papers on AI4Scholar. Use Chinese keywords; returns bibliographic metadata and available abstracts, not full text. Filter by publication year or document type, sort by relevance/year/citations, and page with nextOffset. Each successful request costs credits, regardless of the result count.',
    parameters: {
      query: { type: 'string', required: true, description: 'Chinese keywords, 1–300 characters and at most 20 concepts. Space-separated concepts must all match; double quotes preserve a phrase. No Boolean or raw query syntax.' },
      max_results: { type: 'integer', description: `Results per request (default ${Math.min(limits.defaultMaxResults, cap)}, max ${cap}).` },
      offset: { type: 'integer', description: `Pagination offset, 0–${MAX_OFFSET} (default 0). Use nextOffset and keep the other conditions unchanged; stop when no cursor is returned.` },
      resource: { type: 'string', enum: RESOURCES, description: 'Document type: all (default), journal, thesis, or conference.' },
      sort: { type: 'string', enum: SORTS, description: 'Sort by relevance (default), newest year, or highest citation count.' },
      year_from: { type: 'integer', description: 'First publication year, inclusive (four digits).' },
      year_to: { type: 'integer', description: 'Last publication year, inclusive (four digits).' },
    },
    output: {
      schema: PAPER_SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderPaperSearch(value, runtime.render),
      presentationMeta: (_args, value) => researchMeta(value, runtime.enabledTools, paperSearchMeta(value)),
    },
    timeoutMs: runtime.timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentPaperSearchCall(SOURCE, args.query),
    presentResult: (args, result) => presentPaperSearchResult(SOURCE, args.query, result),
    async execute(args, exec) {
      return runChineseSearch(runtime, {
        query: args.query, limit: boundResults(args.max_results, limits, cap), offset: args.offset,
        resource: args.resource, sort: args.sort, yearFrom: args.year_from, yearTo: args.year_to,
      }, exec.signal, exec.agent)
    },
  }))
}
