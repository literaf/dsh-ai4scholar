/**
 * PubMed tools over the ai4scholar.net PubMed API (`/pubmed/v1/...`). Billed
 * in AI4Scholar credits; results carry the reported charge and balance.
 * @module dsh-ai4scholar/tools/pubmed
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  PAPER_SEARCH_OUTPUT_SCHEMA,
  compact,
  creditsMeta,
  decodeEntities,
  int,
  isRecord,
  paperSearchMeta,
  presentGenericWithCredits,
  presentPaperSearchCall,
  presentPaperSearchResult,
  renderPaperDetail,
  renderPaperSearch,
  str,
} from '../paper.js'
import type { CreditsValue, Paper, PaperSearchValue } from '../paper.js'
import { withCredits } from '../pdf.js'
import { boundResults, requireIds, requireQuery } from '../runtime.js'
import type { Runtime } from '../runtime.js'
import { PAPER_DETAIL_SCHEMA } from './semantic-scholar.js'

const SOURCE = 'pubmed' as const

/** PubMed date filter syntax: `YYYY`, `YYYY/MM`, or `YYYY/MM/DD`. */
const PUBMED_DATE = /^\d{4}(\/\d{2}(\/\d{2})?)?$/
const PUBMED_BATCH_CAP = 200

/**
 * Normalize one PubMed record from the ai4scholar API.
 * @param record - untyped `papers[]` element or `/paper/{pmid}` body.
 * @returns the normalized paper, or `undefined` for a record without a title or PMID.
 */
export function normalizePubmedPaper(record: unknown): Paper | undefined {
  if (!isRecord(record)) return undefined
  const pmid = str(record, 'pmid')
  const rawTitle = str(record, 'title')
  if (pmid === undefined || rawTitle === undefined) return undefined
  const title = decodeEntities(rawTitle)
  const authors = Array.isArray(record.authors)
    ? record.authors.flatMap((a) => {
      if (typeof a === 'string') return a.trim().length > 0 ? [a.trim()] : []
      if (!isRecord(a)) return []
      const name = str(a, 'name') ?? [str(a, 'foreName'), str(a, 'lastName')].filter((x): x is string => x !== undefined).join(' ')
      return name.length > 0 ? [name] : []
    })
    : []
  const journal = isRecord(record.journal) ? record.journal : undefined
  const rawVenue = journal !== undefined ? str(journal, 'title') ?? str(journal, 'name') : str(record, 'journal')
  const venue = rawVenue !== undefined ? decodeEntities(rawVenue) : undefined
  const rawAbstract = str(record, 'abstract')
  const date = str(record, 'pubDate') ?? (journal !== undefined ? str(journal, 'pubDate') : undefined)
  const yearMatch = date !== undefined ? /\d{4}/.exec(date) : null
  const year = int(record, 'year') ?? (yearMatch !== null ? Number.parseInt(yearMatch[0], 10) : undefined)
  const doi = str(record, 'doi')
  const pmcid = str(record, 'pmcid') ?? str(record, 'pmc')
  const mesh = Array.isArray(record.meshTerms) ? record.meshTerms.filter((m): m is string => typeof m === 'string') : []
  const keywords = Array.isArray(record.keywords) ? record.keywords.filter((k): k is string => typeof k === 'string') : []
  return compact({
    source: SOURCE,
    id: pmid,
    title,
    authors,
    year,
    date,
    venue,
    abstract: rawAbstract !== undefined ? decodeEntities(rawAbstract) : undefined,
    citationCount: int(record, 'citationCount'),
    doi,
    url: str(record, 'url') ?? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    pdfUrl: str(record, 'pdfUrl'),
    externalIds: compact({ PubMed: pmid, DOI: doi, PMC: pmcid }),
    categories: mesh.length > 0 ? mesh.slice(0, 12) : undefined,
    extra: keywords.length > 0 ? { keywords } : undefined,
  })
}

/** Unwrap the list field the PubMed API uses (`papers`, `data`, or a bare array). */
function paperRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (isRecord(data)) {
    if (Array.isArray(data.papers)) return data.papers
    if (Array.isArray(data.data)) return data.data
  }
  return []
}

/** Parameters of one PubMed search. */
export interface PubmedSearchParams {
  query: string
  /** Already bounded page size. */
  limit: number
  offset?: number | undefined
  sort?: 'relevance' | 'date' | undefined
  /** `YYYY`, `YYYY/MM`, or `YYYY/MM/DD`. */
  minDate?: string | undefined
  maxDate?: string | undefined
}

/**
 * Run one PubMed search (shared by `search_pubmed` and `search_papers`).
 * @param runtime - plugin runtime.
 * @param params - query, paging, sort, and date range.
 * @param signal - cancellation.
 * @param agent - executing agent for the credit tally.
 * @returns the normalized page.
 */
export async function runPubmedSearch(runtime: Runtime, params: PubmedSearchParams, signal: AbortSignal | undefined, agent: object | undefined): Promise<PaperSearchValue> {
  const query = requireQuery(params.query)
  const offset = params.offset !== undefined && params.offset > 0 ? Math.trunc(params.offset) : 0
  for (const [name, value] of [['min_date', params.minDate], ['max_date', params.maxDate]] as const) {
    if (value !== undefined && value.trim().length > 0 && !PUBMED_DATE.test(value.trim())) {
      throw new Error(`${name} must be YYYY, YYYY/MM, or YYYY/MM/DD`)
    }
  }
  const apiKey = await runtime.requireApiKey()
  const body: Record<string, unknown> = { query, limit: params.limit, offset, sort: params.sort ?? 'relevance' }
  if (params.minDate !== undefined && params.minDate.trim().length > 0) body.minDate = params.minDate.trim()
  if (params.maxDate !== undefined && params.maxDate.trim().length > 0) body.maxDate = params.maxDate.trim()
  const res = await runtime.client.post<{ papers?: unknown[]; total?: number }>('/pubmed/v1/paper/search', body, { apiKey, signal })
  if (!res.ok) throw new Error(`PubMed search failed: ${res.error}`)
  const papers = paperRows(res.data).map(normalizePubmedPaper).filter((p): p is Paper => p !== undefined)
  const total = typeof res.data.total === 'number' ? res.data.total : offset + papers.length
  const truncated = offset + papers.length < total
  return compact({ source: SOURCE, query, total, papers, truncated, nextOffset: truncated ? offset + papers.length : undefined, credits: runtime.creditsOf(res, agent) })
}

/**
 * Register the PubMed tools.
 * @param ctx - context whose `tools` registry receives the effect-scoped registrations.
 * @param runtime - plugin instance runtime.
 */
export function applyPubmedTools(ctx: Context, runtime: Runtime): void {
  const { client, limits, render, timeouts } = runtime

  const listValue = (query: string, papers: Paper[], total: number, offset: number, credits: CreditsValue | undefined): PaperSearchValue => {
    const truncated = offset + papers.length < total
    return compact({ source: SOURCE, query, total, papers, truncated, nextOffset: truncated ? offset + papers.length : undefined, credits })
  }

  ctx.tools.register(defineTool({
    name: 'search_pubmed',
    description: 'Search biomedical and life-science literature on PubMed. Returns title, authors, journal, publication date, PMID, DOI, MeSH terms, and abstract. Supports a date range and relevance/date sorting.',
    parameters: {
      query: { type: 'string', required: true, description: 'PubMed query; field tags such as [Title/Abstract] and boolean operators are supported.' },
      max_results: { type: 'integer', description: `Number of results to return (default ${limits.defaultMaxResults}, max ${limits.maxResultsCap}).` },
      offset: { type: 'integer', description: 'Pagination offset (default 0). Use the returned nextOffset to fetch the next page.' },
      sort: { type: 'string', enum: ['relevance', 'date'], description: 'Sort order (default relevance).' },
      min_date: { type: 'string', description: 'Earliest publication date, YYYY, YYYY/MM, or YYYY/MM/DD.' },
      max_date: { type: 'string', description: 'Latest publication date, YYYY, YYYY/MM, or YYYY/MM/DD.' },
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
      return runPubmedSearch(runtime, {
        query: args.query,
        limit: boundResults(args.max_results, limits),
        offset: args.offset,
        sort: args.sort,
        minDate: args.min_date,
        maxDate: args.max_date,
      }, exec.signal, exec.agent)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'get_pubmed_paper_detail',
    description: 'Get metadata and the full abstract of one PubMed paper by PMID.',
    parameters: {
      pmid: { type: 'string', required: true, description: 'PubMed identifier, e.g. "39575807".' },
    },
    output: {
      schema: PAPER_DETAIL_SCHEMA,
      render: (_args, value) => renderPaperDetail(value.paper, value.credits),
      presentationMeta: (_args, value) => creditsMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `PubMed paper: ${args.pmid}`, kind: 'read', rawInput: args.pmid }),
    presentResult: (args, result) => presentGenericWithCredits(`PubMed paper: ${args.pmid}`, result),
    async execute(args, exec) {
      const pmid = requireQuery(args.pmid, 'pmid')
      if (!/^\d+$/.test(pmid)) throw new Error('pmid must be a numeric PubMed identifier')
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<unknown>(`/pubmed/v1/paper/${encodeURIComponent(pmid)}`, { apiKey, signal: exec.signal })
      if (!res.ok) throw new Error(`PubMed paper lookup failed: ${res.error}`)
      const body = isRecord(res.data) && isRecord(res.data.paper) ? res.data.paper : res.data
      const paper = normalizePubmedPaper(body)
      if (paper === undefined) throw new Error(`PubMed returned no paper for PMID ${pmid}`)
      return withCredits({ paper }, runtime.creditsOf(res, exec.agent))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'get_pubmed_paper_batch',
    description: `Get metadata for many PubMed papers in one call by PMID (up to ${Math.min(PUBMED_BATCH_CAP, limits.maxResultsCap * 4)} ids).`,
    parameters: {
      pmids: { type: 'array', required: true, items: { type: 'string' }, description: 'PubMed identifiers, e.g. ["39575807", "30102808"].' },
    },
    output: {
      schema: PAPER_SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderPaperSearch(value, render),
      presentationMeta: (_args, value) => paperSearchMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentPaperSearchCall(SOURCE, `${args.pmids.length} PMIDs (batch)`),
    presentResult: (args, result) => presentPaperSearchResult(SOURCE, `${args.pmids.length} PMIDs (batch)`, result),
    async execute(args, exec) {
      const pmids = requireIds(args.pmids, 'pmids', Math.min(PUBMED_BATCH_CAP, limits.maxResultsCap * 4))
      for (const pmid of pmids) if (!/^\d+$/.test(pmid)) throw new Error(`"${pmid}" is not a numeric PMID`)
      const apiKey = await runtime.requireApiKey()
      const res = await client.post<unknown>('/pubmed/v1/paper/batch', { pmids }, { apiKey, signal: exec.signal })
      if (!res.ok) throw new Error(`PubMed batch lookup failed: ${res.error}`)
      const papers = paperRows(res.data).map(normalizePubmedPaper).filter((p): p is Paper => p !== undefined)
      const found = new Set(papers.map((p) => p.id))
      const missing = pmids.filter((id) => !found.has(id))
      return compact({
        source: SOURCE,
        query: `${pmids.length} PMIDs (batch)`,
        total: papers.length,
        papers,
        truncated: false,
        warning: missing.length > 0 ? `${missing.length} PMID(s) not found: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ', …' : ''}` : undefined,
        credits: runtime.creditsOf(res, exec.agent),
      })
    },
  }))

  for (const [name, endpoint, what] of [
    ['get_pubmed_citations', 'citations', 'PubMed papers that cite the given paper'],
    ['get_pubmed_related', 'related', 'PubMed papers related to the given paper (PubMed similar-articles ranking)'],
  ] as const) {
    ctx.tools.register(defineTool({
      name,
      description: `Get ${what}, by PMID.`,
      parameters: {
        pmid: { type: 'string', required: true, description: 'PubMed identifier.' },
        max_results: { type: 'integer', description: `Number of results (default ${limits.defaultMaxResults}, max ${limits.maxResultsCap}).` },
      },
      output: {
        schema: PAPER_SEARCH_OUTPUT_SCHEMA,
        render: (_args, value) => renderPaperSearch(value, render),
        presentationMeta: (_args, value) => paperSearchMeta(value),
      },
      timeoutMs: timeouts.tool,
      isConcurrencySafe: () => true,
      presentCall: (args) => presentPaperSearchCall(SOURCE, `${endpoint} of PMID ${args.pmid}`),
      presentResult: (args, result) => presentPaperSearchResult(SOURCE, `${endpoint} of PMID ${args.pmid}`, result),
      async execute(args, exec) {
        const pmid = requireQuery(args.pmid, 'pmid')
        if (!/^\d+$/.test(pmid)) throw new Error('pmid must be a numeric PubMed identifier')
        const limit = boundResults(args.max_results, limits)
        const apiKey = await runtime.requireApiKey()
        const res = await client.get<unknown>(`/pubmed/v1/paper/${encodeURIComponent(pmid)}/${endpoint}`, { apiKey, signal: exec.signal, query: { limit } })
        if (!res.ok) throw new Error(`PubMed ${endpoint} lookup failed: ${res.error}`)
        const papers = paperRows(res.data).map(normalizePubmedPaper).filter((p): p is Paper => p !== undefined)
        const total = isRecord(res.data) && typeof res.data.total === 'number' ? res.data.total : papers.length
        return listValue(`${endpoint} of PMID ${pmid}`, papers, Math.max(total, papers.length), 0, runtime.creditsOf(res, exec.agent))
      },
    }))
  }
}
