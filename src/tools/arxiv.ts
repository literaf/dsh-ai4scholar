/**
 * arXiv tools over the public arXiv API (no key, no credits) plus PDF reading.
 * @module dsh-ai4scholar/tools/arxiv
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  PAPER_SEARCH_OUTPUT_SCHEMA,
  compact,
  paperSearchMeta,
  presentPaperSearchCall,
  presentPaperSearchResult,
  renderPaperSearch,
} from '../paper.js'
import type { Paper, PaperSearchValue } from '../paper.js'
import { READ_OUTPUT_SCHEMA, extractPdfText, fetchPdf, presentReadCall, renderRead, sliceText } from '../pdf.js'
import { boundResults, requireQuery } from '../runtime.js'
import type { Runtime } from '../runtime.js'

const SOURCE = 'arxiv' as const
const ARXIV_API = 'https://export.arxiv.org/api/query'
const ARXIV_PAGE_CAP = 100

const SORT_BY = { relevance: 'relevance', lastUpdatedDate: 'lastUpdatedDate', submittedDate: 'submittedDate' } as const

/** Decode the XML entities arXiv Atom feeds use. */
function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')
}

/** Normalize an arXiv id from an `<id>` URL: strip the abs prefix and version. */
export function arxivIdFromUrl(idUrl: string): string {
  return idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '')
}

/** Accept `2106.12345`, `2106.12345v2`, `hep-th/9901001`, or a full arXiv URL; return the bare id. */
export function normalizeArxivId(input: string): string {
  const trimmed = input.trim()
    .replace(/^arxiv:/i, '')
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//, '')
    .replace(/\.pdf$/, '')
  if (!/^([a-z-]+(\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(v\d+)?$/.test(trimmed)) {
    throw new Error(`"${input}" is not an arXiv identifier (expected e.g. 2106.12345 or hep-th/9901001)`)
  }
  return trimmed
}

/**
 * Parse an arXiv Atom feed into normalized papers.
 * @param xml - the feed body.
 * @returns papers in feed order plus the reported total.
 */
export function parseArxivFeed(xml: string): { papers: Paper[]; total: number } {
  const papers: Paper[] = []
  const totalMatch = /<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/.exec(xml)
  const total = totalMatch !== null ? Number.parseInt(totalMatch[1]!, 10) : 0
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g
  let m: RegExpExecArray | null
  while ((m = entryRe.exec(xml)) !== null) {
    const e = m[1]!
    const tag = (t: string): string => {
      const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(e)
      return r !== null ? decodeXml(r[1]!.trim()) : ''
    }
    const title = tag('title').replace(/\s+/g, ' ')
    const idUrl = tag('id')
    const id = arxivIdFromUrl(idUrl)
    if (title.length === 0 || id.length === 0) continue
    const abstract = tag('summary').replace(/\s+/g, ' ')
    const published = tag('published')
    const authors: string[] = []
    const authRe = /<author>\s*<name>([^<]+)<\/name>/g
    let am: RegExpExecArray | null
    while ((am = authRe.exec(e)) !== null) authors.push(decodeXml(am[1]!.trim()))
    const categories: string[] = []
    const catRe = /<category[^>]+term="([^"]+)"/g
    let cm: RegExpExecArray | null
    while ((cm = catRe.exec(e)) !== null) categories.push(cm[1]!)
    const doiMatch = /<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/.exec(e)
    const journalRef = /<arxiv:journal_ref[^>]*>([^<]+)<\/arxiv:journal_ref>/.exec(e)
    const year = /^(\d{4})/.exec(published)?.[1]
    papers.push(compact({
      source: SOURCE,
      id,
      title,
      authors,
      year: year !== undefined ? Number.parseInt(year, 10) : undefined,
      date: published.length > 0 ? published.slice(0, 10) : undefined,
      venue: journalRef !== null ? decodeXml(journalRef[1]!.trim()) : undefined,
      abstract: abstract.length > 0 ? abstract : undefined,
      doi: doiMatch !== null ? doiMatch[1]!.trim() : undefined,
      url: `https://arxiv.org/abs/${id}`,
      pdfUrl: `https://arxiv.org/pdf/${id}`,
      externalIds: compact({ ArXiv: id, DOI: doiMatch !== null ? doiMatch[1]!.trim() : undefined }),
      categories: categories.length > 0 ? categories : undefined,
    }))
  }
  return { papers, total }
}

/** Parameters of one arXiv search. */
export interface ArxivSearchParams {
  query: string
  /** Already bounded page size. */
  limit: number
  offset?: number | undefined
  sortBy?: keyof typeof SORT_BY | undefined
  /** `YYYY-MM-DD` lower bound on submission date. */
  dateFrom?: string | undefined
}

/**
 * Run one arXiv search (shared by `search_arxiv` and `search_papers`). Free; no key.
 * @param runtime - plugin runtime (client only).
 * @param params - query, paging, sort, and date bound.
 * @param signal - cancellation.
 * @returns the normalized page.
 */
export async function runArxivSearch(runtime: Runtime, params: ArxivSearchParams, signal: AbortSignal | undefined): Promise<PaperSearchValue> {
  const query = requireQuery(params.query)
  const offset = params.offset !== undefined && params.offset > 0 ? Math.trunc(params.offset) : 0
  let searchQuery = query
  if (params.dateFrom !== undefined && params.dateFrom.trim().length > 0) {
    const d = params.dateFrom.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('date_from must be YYYY-MM-DD')
    searchQuery = `(${query}) AND submittedDate:[${d.replace(/-/g, '')}0000 TO 99991231]`
  }
  const urlParams = new URLSearchParams({
    search_query: searchQuery,
    start: String(offset),
    max_results: String(params.limit),
    sortBy: SORT_BY[params.sortBy ?? 'relevance'],
    sortOrder: 'descending',
  })
  const res = await runtime.client.fetchText(`${ARXIV_API}?${urlParams.toString()}`, { signal })
  if (!res.ok) throw new Error(`arXiv search failed: ${res.error}`)
  const { papers, total } = parseArxivFeed(res.data)
  const reported = Math.max(total, offset + papers.length)
  const truncated = offset + papers.length < reported
  return compact({
    source: SOURCE,
    query,
    total: reported,
    papers,
    truncated,
    nextOffset: truncated ? offset + papers.length : undefined,
  })
}

/**
 * Register the arXiv tools.
 * @param ctx - context whose `tools` registry receives the effect-scoped registrations.
 * @param runtime - plugin instance runtime.
 * @param fullText - whether to register the PDF-reading tool.
 */
export function applyArxivTools(ctx: Context, runtime: Runtime, fullText: boolean): void {
  const { client, limits, render, timeouts } = runtime

  ctx.tools.register(defineTool({
    name: 'search_arxiv',
    description: 'Search arXiv preprints (physics, mathematics, computer science, quantitative biology, statistics, and more). Free; no API key needed. Returns title, authors, abstract, arXiv id, categories, and PDF link. Supports the arXiv query syntax (e.g. ti:"graph neural network" AND cat:cs.LG) and date filtering.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search query; plain keywords or arXiv field syntax (ti:, au:, abs:, cat:).' },
      max_results: { type: 'integer', description: `Number of results (default ${limits.defaultMaxResults}, max ${Math.min(limits.maxResultsCap, ARXIV_PAGE_CAP)}).` },
      offset: { type: 'integer', description: 'Pagination offset (default 0). Use the returned nextOffset to fetch the next page.' },
      sort_by: { type: 'string', enum: ['relevance', 'lastUpdatedDate', 'submittedDate'], description: 'Sort order (default relevance).' },
      date_from: { type: 'string', description: 'Only papers submitted on or after this date, YYYY-MM-DD.' },
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
      return runArxivSearch(runtime, {
        query: args.query,
        limit: boundResults(args.max_results, limits, ARXIV_PAGE_CAP),
        offset: args.offset,
        sortBy: args.sort_by,
        dateFrom: args.date_from,
      }, exec.signal)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'download_arxiv',
    description: 'Get the abstract page and direct PDF URL for an arXiv paper by id. Free.',
    parameters: {
      paper_id: { type: 'string', required: true, description: 'arXiv identifier, e.g. "2106.12345" or "hep-th/9901001".' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          url: { type: 'string', required: true },
          pdfUrl: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `arXiv:${value.id}\nAbstract page: ${value.url}\nPDF: ${value.pdfUrl}` }],
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    async execute(args) {
      const id = normalizeArxivId(args.paper_id)
      return { id, url: `https://arxiv.org/abs/${id}`, pdfUrl: `https://arxiv.org/pdf/${id}` }
    },
  }))

  if (!fullText) return
  ctx.tools.register(defineTool({
    name: 'read_arxiv_paper',
    description: `Download an arXiv paper's PDF and return its extracted full text. Free. Long papers are returned in slices: use offset/max_chars to continue (default slice ${runtime.read.maxChars} characters).`,
    parameters: {
      paper_id: { type: 'string', required: true, description: 'arXiv identifier, e.g. "2106.12345".' },
      offset: { type: 'integer', description: 'Character offset to start from (default 0).' },
      max_chars: { type: 'integer', description: `Characters to return (default ${runtime.read.maxChars}).` },
    },
    output: {
      schema: READ_OUTPUT_SCHEMA,
      render: (_args, value) => renderRead(value),
    },
    timeoutMs: timeouts.pdf + timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentReadCall('arXiv', args.paper_id),
    async execute(args, exec) {
      const id = normalizeArxivId(args.paper_id)
      const pdfUrl = `https://arxiv.org/pdf/${id}`
      const pdf = await fetchPdf(client, pdfUrl, { signal: exec.signal, timeoutMs: timeouts.pdf })
      if (!pdf.ok) throw new Error(`arXiv PDF download failed: ${pdf.error}`)
      const { text, pages } = await extractPdfText(pdf.data)
      if (text.trim().length === 0) throw new Error('the PDF downloaded but no readable text could be extracted (scanned or image-only PDF)')
      return { id, pdfUrl: pdf.finalUrl, pages, ...sliceText(text, args.offset, args.max_chars ?? runtime.read.maxChars) }
    },
  }))
}
