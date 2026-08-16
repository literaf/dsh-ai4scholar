/**
 * Semantic Scholar tools over the ai4scholar.net Graph API proxy
 * (`/graph/v1/...` and `/recommendations/v1/...`, request/response compatible
 * with api.semanticscholar.org). Every call is billed in AI4Scholar credits;
 * results carry the reported charge and balance.
 * @module dsh-ai4scholar/tools/semantic-scholar
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { InferValue, JsonValue } from '@deepseek-ai/dsh-tools'
import {
  CREDITS_SCHEMA,
  PAPER_SCHEMA,
  PAPER_SEARCH_OUTPUT_SCHEMA,
  clip,
  compact,
  creditsMeta,
  formatAuthors,
  formatCredits,
  formatPaper,
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
import { READ_OUTPUT_SCHEMA, extractPdfText, fetchPdf, presentReadCall, renderRead, sliceText, withCredits } from '../pdf.js'
import { boundResults, requireIds, requireQuery } from '../runtime.js'
import type { Runtime } from '../runtime.js'

const SOURCE = 'semantic-scholar' as const

/** Fields requested for paper records. */
const PAPER_FIELDS = 'paperId,title,abstract,year,publicationDate,venue,journal,citationCount,authors,url,externalIds,openAccessPdf'
/** Fields for citation/reference edges: the edge facts plus the linked paper. */
const EDGE_FIELDS = 'contexts,intents,isInfluential,paperId,title,abstract,year,publicationDate,venue,citationCount,authors,url,externalIds,openAccessPdf'
/** Fields requested for author records. */
const AUTHOR_FIELDS = 'authorId,name,affiliations,homepage,paperCount,citationCount,hIndex,externalIds,url'

/** Semantic Scholar's own per-request cap for `/paper/search`. */
const S2_SEARCH_PAGE_CAP = 100
/** Per-request caps of the graph endpoints. */
const S2_EDGE_CAP = 1000
const S2_RECOMMENDATION_CAP = 500
const S2_PAPER_BATCH_CAP = 500
const S2_AUTHOR_BATCH_CAP = 1000

/** Year filter syntax accepted by the Graph API: `2019`, `2016-2020`, `2010-`, `-2015`. */
const YEAR_FILTER = /^(\d{4}(-(\d{4})?)?|-\d{4})$/

function authorNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((a) => (isRecord(a) ? [str(a, 'name')] : [])).filter((n): n is string => n !== undefined)
    : []
}

function externalIdsOf(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const ids = Object.fromEntries(Object.entries(value).flatMap(([k, v]) =>
    typeof v === 'string' || typeof v === 'number' ? [[k, String(v)]] : []))
  return Object.keys(ids).length > 0 ? ids : undefined
}

/**
 * Normalize one Graph API paper record.
 * @param record - untyped `data[]` element or `/paper/{id}` body.
 * @param extra - platform-specific extras to attach (citation contexts).
 * @returns the normalized paper, or `undefined` for a record without a title or id.
 */
export function normalizeS2Paper(record: unknown, extra?: Record<string, JsonValue | undefined>): Paper | undefined {
  if (!isRecord(record)) return undefined
  const title = str(record, 'title')
  const paperId = str(record, 'paperId')
  if (title === undefined || paperId === undefined) return undefined
  const externalIds = externalIdsOf(record.externalIds)
  const journal = isRecord(record.journal) ? str(record.journal, 'name') : undefined
  const openAccess = isRecord(record.openAccessPdf) ? str(record.openAccessPdf, 'url') : undefined
  const cleanExtra = extra !== undefined ? compact(extra) : undefined
  return compact({
    source: SOURCE,
    id: paperId,
    title,
    authors: authorNames(record.authors),
    year: int(record, 'year'),
    date: str(record, 'publicationDate'),
    venue: str(record, 'venue') ?? journal,
    abstract: str(record, 'abstract'),
    citationCount: int(record, 'citationCount'),
    doi: externalIds?.DOI,
    url: str(record, 'url') ?? `https://www.semanticscholar.org/paper/${paperId}`,
    pdfUrl: openAccess,
    externalIds,
    extra: cleanExtra !== undefined && Object.keys(cleanExtra).length > 0 ? cleanExtra : undefined,
  })
}

/** Normalize one citation/reference edge (`{ contexts, intents, isInfluential, citingPaper | citedPaper }`). */
function normalizeEdge(record: unknown, side: 'citingPaper' | 'citedPaper'): Paper | undefined {
  if (!isRecord(record)) return undefined
  const contexts = Array.isArray(record.contexts) ? record.contexts.filter((c): c is string => typeof c === 'string') : []
  const intents = Array.isArray(record.intents) ? record.intents.filter((c): c is string => typeof c === 'string') : []
  return normalizeS2Paper(record[side], {
    contexts: contexts.length > 0 ? contexts : undefined,
    intents: intents.length > 0 ? intents : undefined,
    isInfluential: typeof record.isInfluential === 'boolean' ? record.isInfluential : undefined,
  })
}

/** Output schema of one author record. */
export const AUTHOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    authorId: { type: 'string', required: true, description: 'Semantic Scholar author id.' },
    name: { type: 'string', required: true },
    affiliations: { type: 'array', required: true, items: { type: 'string' } },
    homepage: { type: 'string' },
    paperCount: { type: 'integer' },
    citationCount: { type: 'integer' },
    hIndex: { type: 'integer' },
    url: { type: 'string' },
    externalIds: { type: 'object', additionalProperties: true, description: 'Other identifiers keyed by scheme, e.g. ORCID, DBLP.' },
  },
} as const

/** One normalized author. */
export type Author = InferValue<typeof AUTHOR_SCHEMA>

/**
 * Normalize one Graph API author record.
 * @param record - untyped record.
 * @returns the author, or `undefined` without id or name.
 */
export function normalizeS2Author(record: unknown): Author | undefined {
  if (!isRecord(record)) return undefined
  const authorId = str(record, 'authorId')
  const name = str(record, 'name')
  if (authorId === undefined || name === undefined) return undefined
  const affiliations = Array.isArray(record.affiliations) ? record.affiliations.filter((a): a is string => typeof a === 'string' && a.length > 0) : []
  return compact({
    authorId,
    name,
    affiliations,
    homepage: str(record, 'homepage'),
    paperCount: int(record, 'paperCount'),
    citationCount: int(record, 'citationCount'),
    hIndex: int(record, 'hIndex'),
    url: str(record, 'url') ?? `https://www.semanticscholar.org/author/${authorId}`,
    externalIds: externalIdsOf(record.externalIds),
  })
}

/** Output schema of author-list tools. */
const AUTHOR_LIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', required: true, description: 'The name searched, or the paper/author ids the list belongs to.' },
    total: { type: 'integer', required: true },
    authors: { type: 'array', required: true, items: AUTHOR_SCHEMA },
    truncated: { type: 'boolean', required: true },
    nextOffset: { type: 'integer' },
    credits: CREDITS_SCHEMA,
  },
} as const
type AuthorListValue = InferValue<typeof AUTHOR_LIST_SCHEMA>

function formatAuthor(author: Author, index: number): string {
  const facts: string[] = []
  if (author.affiliations.length > 0) facts.push(author.affiliations.slice(0, 3).join('; '))
  if (author.hIndex !== undefined) facts.push(`h-index ${author.hIndex}`)
  if (author.paperCount !== undefined) facts.push(`${author.paperCount} papers`)
  if (author.citationCount !== undefined) facts.push(`${author.citationCount} citations`)
  const link = author.url !== undefined ? `[${author.name}](${author.url})` : author.name
  const ids = [`author id: ${author.authorId}`]
  const orcid = author.externalIds?.ORCID
  if (typeof orcid === 'string') ids.push(`ORCID: ${orcid}`)
  if (author.homepage !== undefined) ids.push(`homepage: ${author.homepage}`)
  return `${index}. **${link}**${facts.length > 0 ? `\n   ${facts.join(' · ')}` : ''}\n   ${ids.join(' · ')}`
}

function renderAuthorList(value: AuthorListValue, heading: string): ContentBlock[] {
  const parts: string[] = []
  if (value.authors.length === 0) parts.push(`${heading}: no authors found.`)
  else {
    parts.push(`${heading} (showing ${value.authors.length}${value.total > value.authors.length ? ` of ${value.total}` : ''}):`)
    parts.push(value.authors.map((a, i) => formatAuthor(a, i + 1)).join('\n\n'))
    if (value.truncated) parts.push(value.nextOffset !== undefined ? `More available; call again with offset=${value.nextOffset}.` : 'More available; raise max_results.')
  }
  const credits = formatCredits(value.credits)
  if (credits !== undefined) parts.push(credits)
  return [{ type: 'text', text: parts.join('\n\n') }]
}

/** Output schema of `search_semantic_snippets`. */
const SNIPPET_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', required: true },
    snippets: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          section: { type: 'string', description: 'Section heading the snippet was taken from, when known.' },
          kind: { type: 'string', description: 'Snippet kind reported by the platform (title, abstract, body).' },
          score: { type: 'number' },
          paper: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              corpusId: { type: 'string' },
              title: { type: 'string', required: true },
              authors: { type: 'array', required: true, items: { type: 'string' } },
              url: { type: 'string' },
            },
          },
        },
      },
    },
    credits: CREDITS_SCHEMA,
  },
} as const

type SnippetValue = InferValue<typeof SNIPPET_OUTPUT_SCHEMA>
type Snippet = SnippetValue['snippets'][number]

function normalizeSnippet(record: unknown): Snippet | undefined {
  if (!isRecord(record) || !isRecord(record.snippet) || !isRecord(record.paper)) return undefined
  const text = str(record.snippet, 'text')
  const title = str(record.paper, 'title')
  if (text === undefined || title === undefined) return undefined
  const corpusId = str(record.paper, 'corpusId')
  const score = typeof record.score === 'number' && Number.isFinite(record.score) ? record.score : undefined
  return compact({
    text,
    section: str(record.snippet, 'section'),
    kind: str(record.snippet, 'snippetKind'),
    score,
    paper: compact({
      corpusId,
      title,
      authors: authorNames(record.paper.authors),
      url: corpusId !== undefined ? `https://www.semanticscholar.org/p/${corpusId}` : undefined,
    }),
  })
}

function formatSnippets(value: SnippetValue, abstractMaxChars: number): string {
  const parts: string[] = []
  if (value.snippets.length === 0) parts.push(`No full-text snippets found for "${value.query}".`)
  else {
    const items = value.snippets.map((s, i) => {
      const heading = s.paper.url !== undefined ? `[${s.paper.title}](${s.paper.url})` : s.paper.title
      const where = [s.kind, s.section].filter((x): x is string => x !== undefined).join(' / ')
      const meta = [formatAuthors(s.paper.authors), where.length > 0 ? where : undefined, s.score !== undefined ? `score ${s.score.toFixed(3)}` : undefined]
        .filter((x): x is string => x !== undefined).join(' · ')
      const body = clip(s.text, Math.max(abstractMaxChars, 200))
      return `${i + 1}. **${heading}**\n   ${meta}\n   > ${body}`
    })
    parts.push(`Semantic Scholar full-text snippets for "${value.query}":\n\n${items.join('\n\n')}`)
  }
  const credits = formatCredits(value.credits)
  if (credits !== undefined) parts.push(credits)
  return parts.join('\n\n')
}

/** Output schema of `search_semantic_paper_match`. */
const MATCH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', required: true },
    found: { type: 'boolean', required: true },
    matchScore: { type: 'number' },
    paper: PAPER_SCHEMA,
    credits: CREDITS_SCHEMA,
  },
} as const

/** Output schema of single-paper detail tools. */
export const PAPER_DETAIL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    paper: { ...PAPER_SCHEMA, required: true },
    credits: CREDITS_SCHEMA,
  },
} as const

/** Output schema of `download_semantic`. */
const DOWNLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    title: { type: 'string' },
    url: { type: 'string' },
    available: { type: 'boolean', required: true, description: 'Whether Semantic Scholar lists an open-access PDF.' },
    pdfUrl: { type: 'string' },
    credits: CREDITS_SCHEMA,
  },
} as const

/** Wrap a paper list from a graph endpoint into the shared search value. */
function listValue(query: string, papers: Paper[], total: number, offset: number, credits: CreditsValue | undefined, next?: number): PaperSearchValue {
  const truncated = next !== undefined || offset + papers.length < total
  return compact({
    source: SOURCE,
    query,
    total,
    papers,
    truncated,
    nextOffset: truncated ? (next ?? offset + papers.length) : undefined,
    credits,
  })
}

/** Parameters of one Semantic Scholar paper search. */
export interface SemanticSearchParams {
  query: string
  /** Already bounded page size. */
  limit: number
  offset?: number | undefined
  /** Graph API year filter: `2019`, `2016-2020`, `2010-`, `-2015`. */
  year?: string | undefined
}

/**
 * Run one Semantic Scholar paper search (shared by `search_semantic` and `search_papers`).
 * @param runtime - plugin runtime.
 * @param params - query and paging.
 * @param signal - cancellation.
 * @param agent - executing agent for the credit tally.
 * @returns the normalized page.
 */
export async function runSemanticSearch(runtime: Runtime, params: SemanticSearchParams, signal: AbortSignal | undefined, agent: object | undefined): Promise<PaperSearchValue> {
  const query = requireQuery(params.query)
  const offset = params.offset !== undefined && params.offset > 0 ? Math.trunc(params.offset) : 0
  const year = params.year?.trim()
  if (year !== undefined && year.length > 0 && !YEAR_FILTER.test(year)) {
    throw new Error('year must look like "2019", "2016-2020", "2010-", or "-2015"')
  }
  const apiKey = await runtime.requireApiKey()
  const res = await runtime.client.get<{ data?: unknown[]; total?: number; next?: number }>('/graph/v1/paper/search', {
    apiKey,
    signal,
    query: { query, limit: params.limit, offset, fields: PAPER_FIELDS, year: year !== undefined && year.length > 0 ? year : undefined },
  })
  if (!res.ok) throw new Error(`Semantic Scholar search failed: ${res.error}`)
  const papers = (res.data.data ?? []).map((p) => normalizeS2Paper(p)).filter((p): p is Paper => p !== undefined)
  const total = typeof res.data.total === 'number' ? res.data.total : offset + papers.length
  const next = typeof res.data.next === 'number' ? res.data.next : undefined
  return listValue(query, papers, total, offset, runtime.creditsOf(res, agent), next)
}

/**
 * Register the Semantic Scholar tools.
 * @param ctx - context whose `tools` registry receives the effect-scoped registrations.
 * @param runtime - plugin instance runtime.
 * @param fullText - whether to register the PDF-reading tool.
 */
export function applySemanticScholarTools(ctx: Context, runtime: Runtime, fullText: boolean): void {
  const { client, limits, render, timeouts } = runtime
  const graphSearchCap = Math.min(limits.maxResultsCap, S2_SEARCH_PAGE_CAP)
  const listCap = Math.min(limits.maxResultsCap, S2_EDGE_CAP)
  // ── search ──────────────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'search_semantic',
    description: 'Search academic papers on Semantic Scholar (200M+ papers, all fields). Returns title, authors, year, venue, citation count, identifiers, and abstract. Supports year filtering and offset pagination.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search query, e.g. "graph neural networks drug discovery".' },
      max_results: { type: 'integer', description: `Number of results to return (default ${limits.defaultMaxResults}, max ${graphSearchCap}).` },
      offset: { type: 'integer', description: 'Pagination offset (default 0). Use the returned nextOffset to fetch the next page.' },
      year: { type: 'string', description: 'Year filter: "2019", "2016-2020", "2010-" (from 2010), or "-2015" (up to 2015).' },
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
      return runSemanticSearch(runtime, {
        query: args.query,
        limit: boundResults(args.max_results, limits, S2_SEARCH_PAGE_CAP),
        offset: args.offset,
        year: args.year,
      }, exec.signal, exec.agent)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'search_semantic_bulk',
    description: 'Bulk paper search on Semantic Scholar for large result sets: pages of up to 1000 matches with a continuation token, sortable by citation count, date, or paper id. Only the first max_results papers of the page are returned to keep context small; pass the returned nextToken to continue. Use search_semantic for ordinary relevance-ranked queries.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search query; supports the bulk query syntax (boolean operators, quotes, prefix*).' },
      max_results: { type: 'integer', description: `Papers to return from this page (default ${limits.defaultMaxResults}, max ${limits.maxResultsCap}).` },
      token: { type: 'string', description: 'Continuation token from a previous bulk search.' },
      year: { type: 'string', description: 'Year filter: "2019", "2016-2020", "2010-", or "-2015".' },
      sort: { type: 'string', description: 'Sort, e.g. "citationCount:desc", "publicationDate:asc", "paperId".' },
    },
    output: {
      schema: PAPER_SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderPaperSearch(value, render),
      presentationMeta: (_args, value) => paperSearchMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentPaperSearchCall(SOURCE, `${args.query} (bulk)`),
    presentResult: (args, result) => presentPaperSearchResult(SOURCE, `${args.query} (bulk)`, result),
    async execute(args, exec) {
      const query = requireQuery(args.query)
      const keep = boundResults(args.max_results, limits)
      const year = args.year?.trim()
      if (year !== undefined && year.length > 0 && !YEAR_FILTER.test(year)) throw new Error('year must look like "2019", "2016-2020", "2010-", or "-2015"')
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<{ data?: unknown[]; total?: number; token?: string }>('/graph/v1/paper/search/bulk', {
        apiKey,
        signal: exec.signal,
        query: compact({ query, fields: PAPER_FIELDS, year: year !== undefined && year.length > 0 ? year : undefined, token: args.token?.trim() || undefined, sort: args.sort?.trim() || undefined }),
      })
      if (!res.ok) throw new Error(`Semantic Scholar bulk search failed: ${res.error}`)
      const page = (res.data.data ?? []).map((p) => normalizeS2Paper(p)).filter((p): p is Paper => p !== undefined)
      const papers = page.slice(0, keep)
      const total = typeof res.data.total === 'number' ? res.data.total : page.length
      const nextToken = typeof res.data.token === 'string' && res.data.token.length > 0 ? res.data.token : undefined
      return compact({
        source: SOURCE,
        query,
        total,
        papers,
        truncated: nextToken !== undefined || page.length > papers.length,
        nextToken,
        warning: page.length > papers.length ? `This bulk page held ${page.length} papers; only the first ${papers.length} are shown (raise max_results up to ${limits.maxResultsCap}, or continue with nextToken).` : undefined,
        credits: runtime.creditsOf(res, exec.agent),
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'search_semantic_snippets',
    description: 'Search inside paper full texts on Semantic Scholar. Returns ~500-word excerpts (from titles, abstracts, and body text) that match the query, each with its source paper. Use it to find where a concept is discussed, not to list papers.',
    parameters: {
      query: { type: 'string', required: true, description: 'Phrase or question to locate in full texts.' },
      max_results: { type: 'integer', description: `Number of snippets (default ${limits.defaultMaxResults}, max ${limits.maxResultsCap}).` },
    },
    output: {
      schema: SNIPPET_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatSnippets(value, render.abstractMaxChars) }],
      presentationMeta: (_args, value) => creditsMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `Semantic Scholar snippets: ${args.query}`, kind: 'search', rawInput: args.query }),
    presentResult: (args, result) => presentGenericWithCredits(`Semantic Scholar snippets: ${args.query}`, result),
    async execute(args, exec) {
      const query = requireQuery(args.query)
      const limit = boundResults(args.max_results, limits)
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<{ data?: unknown[] }>('/graph/v1/snippet/search', { apiKey, signal: exec.signal, query: { query, limit } })
      if (!res.ok) throw new Error(`Semantic Scholar snippet search failed: ${res.error}`)
      const snippets = (res.data.data ?? []).map(normalizeSnippet).filter((s): s is Snippet => s !== undefined)
      return withCredits({ query, snippets }, runtime.creditsOf(res, exec.agent))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'search_semantic_paper_match',
    description: 'Find one paper on Semantic Scholar by its title (closest title match). Use it to resolve a known title to its identifiers, DOI, and metadata.',
    parameters: {
      query: { type: 'string', required: true, description: 'The paper title, e.g. "Attention Is All You Need".' },
    },
    output: {
      schema: MATCH_OUTPUT_SCHEMA,
      presentationMeta: (_args, value) => creditsMeta(value),
      render: (_args, value) => {
        const credits = formatCredits(value.credits)
        const head = value.found && value.paper !== undefined
          ? `Best match${value.matchScore !== undefined ? ` (score ${value.matchScore.toFixed(2)})` : ''}:\n\n${renderPaperDetail(value.paper).map((b) => (b.type === 'text' ? b.text : '')).join('')}`
          : `No Semantic Scholar paper matches the title "${value.query}".`
        return [{ type: 'text', text: credits !== undefined ? `${head}\n\n${credits}` : head }]
      },
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `Semantic Scholar title match: ${args.query}`, kind: 'search', rawInput: args.query }),
    presentResult: (args, result) => presentGenericWithCredits(`Semantic Scholar title match: ${args.query}`, result),
    async execute(args, exec) {
      const query = requireQuery(args.query)
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<{ data?: unknown[] }>('/graph/v1/paper/search/match', { apiKey, signal: exec.signal, query: { query, fields: PAPER_FIELDS } })
      // The Graph API answers 404 when nothing matches; that is a result, not a failure.
      if (!res.ok && res.status === 404) return { query, found: false }
      if (!res.ok) throw new Error(`Semantic Scholar title match failed: ${res.error}`)
      const first = res.data.data?.[0]
      const paper = normalizeS2Paper(first)
      const credits = runtime.creditsOf(res, exec.agent)
      if (paper === undefined) return withCredits({ query, found: false }, credits)
      const matchScore = isRecord(first) && typeof first.matchScore === 'number' ? first.matchScore : undefined
      return compact({ query, found: true, matchScore, paper, credits })
    },
  }))

  // ── paper detail, citations, references, authors ────────────────────────

  ctx.tools.register(defineTool({
    name: 'get_semantic_paper_detail',
    description: 'Get metadata and the full abstract of one Semantic Scholar paper by identifier. Accepts a Semantic Scholar paperId, or a prefixed id: DOI:<doi>, ARXIV:<id>, PMID:<id>, CorpusId:<id>, URL:<url>.',
    parameters: {
      paper_id: { type: 'string', required: true, description: 'Paper identifier, e.g. "649def34f8be52c8b66281af98ae884c09aef38b", "DOI:10.1038/nature14539", "ARXIV:1706.03762", "PMID:19872477".' },
    },
    output: {
      schema: PAPER_DETAIL_SCHEMA,
      render: (_args, value) => renderPaperDetail(value.paper, value.credits),
      presentationMeta: (_args, value) => creditsMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `Semantic Scholar paper: ${args.paper_id}`, kind: 'read', rawInput: args.paper_id }),
    presentResult: (args, result) => presentGenericWithCredits(`Semantic Scholar paper: ${args.paper_id}`, result),
    async execute(args, exec) {
      const paperId = requireQuery(args.paper_id, 'paper_id')
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<unknown>(`/graph/v1/paper/${encodeURIComponent(paperId)}`, { apiKey, signal: exec.signal, query: { fields: PAPER_FIELDS } })
      if (!res.ok) throw new Error(`Semantic Scholar paper lookup failed: ${res.error}`)
      const paper = normalizeS2Paper(res.data)
      if (paper === undefined) throw new Error(`Semantic Scholar returned no paper for "${paperId}"`)
      return withCredits({ paper }, runtime.creditsOf(res, exec.agent))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'get_semantic_paper_batch',
    description: `Get metadata for many Semantic Scholar papers in one call (up to ${Math.min(S2_PAPER_BATCH_CAP, limits.maxResultsCap * 4)} ids). Accepts paperIds or prefixed ids (DOI:, ARXIV:, PMID:, CorpusId:). Ids the platform cannot resolve are listed in the warning.`,
    parameters: {
      paper_ids: { type: 'array', required: true, items: { type: 'string' }, description: 'Paper identifiers.' },
    },
    output: {
      schema: PAPER_SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderPaperSearch(value, render),
      presentationMeta: (_args, value) => paperSearchMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentPaperSearchCall(SOURCE, `${args.paper_ids.length} papers (batch)`),
    presentResult: (args, result) => presentPaperSearchResult(SOURCE, `${args.paper_ids.length} papers (batch)`, result),
    async execute(args, exec) {
      const ids = requireIds(args.paper_ids, 'paper_ids', Math.min(S2_PAPER_BATCH_CAP, limits.maxResultsCap * 4))
      const apiKey = await runtime.requireApiKey()
      const res = await client.post<unknown[]>('/graph/v1/paper/batch', { ids }, { apiKey, signal: exec.signal, query: { fields: PAPER_FIELDS } })
      if (!res.ok) throw new Error(`Semantic Scholar batch lookup failed: ${res.error}`)
      const rows = Array.isArray(res.data) ? res.data : []
      const papers: Paper[] = []
      const missing: string[] = []
      rows.forEach((row, i) => {
        const paper = normalizeS2Paper(row)
        if (paper !== undefined) papers.push(paper)
        else missing.push(ids[i] ?? `#${i}`)
      })
      return compact({
        source: SOURCE,
        query: `${ids.length} ids (batch)`,
        total: papers.length,
        papers,
        truncated: false,
        warning: missing.length > 0 ? `${missing.length} id(s) not found: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ', …' : ''}` : undefined,
        credits: runtime.creditsOf(res, exec.agent),
      })
    },
  }))

  for (const [name, side, endpoint, what] of [
    ['get_semantic_citations', 'citingPaper', 'citations', 'papers that cite the given paper'],
    ['get_semantic_references', 'citedPaper', 'references', 'papers the given paper cites (its reference list)'],
  ] as const) {
    ctx.tools.register(defineTool({
      name,
      description: `Get ${what} from the Semantic Scholar citation graph, with citation contexts and intents when available. Supports offset pagination.`,
      parameters: {
        paper_id: { type: 'string', required: true, description: 'Paper identifier (paperId, DOI:, ARXIV:, PMID:, CorpusId:).' },
        max_results: { type: 'integer', description: `Number of results (default ${limits.defaultMaxResults}, max ${listCap}).` },
        offset: { type: 'integer', description: 'Pagination offset (default 0).' },
      },
      output: {
        schema: PAPER_SEARCH_OUTPUT_SCHEMA,
        render: (_args, value) => renderPaperSearch(value, render),
        presentationMeta: (_args, value) => paperSearchMeta(value),
      },
      timeoutMs: timeouts.tool,
      isConcurrencySafe: () => true,
      presentCall: (args) => presentPaperSearchCall(SOURCE, `${endpoint} of ${args.paper_id}`),
      presentResult: (args, result) => presentPaperSearchResult(SOURCE, `${endpoint} of ${args.paper_id}`, result),
      async execute(args, exec) {
        const paperId = requireQuery(args.paper_id, 'paper_id')
        const limit = boundResults(args.max_results, limits, S2_EDGE_CAP)
        const offset = args.offset !== undefined && args.offset > 0 ? Math.trunc(args.offset) : 0
        const apiKey = await runtime.requireApiKey()
        const res = await client.get<{ data?: unknown[]; next?: number }>(`/graph/v1/paper/${encodeURIComponent(paperId)}/${endpoint}`, {
          apiKey, signal: exec.signal, query: { limit, offset, fields: EDGE_FIELDS },
        })
        if (!res.ok) throw new Error(`Semantic Scholar ${endpoint} lookup failed: ${res.error}`)
        const papers = (res.data.data ?? []).map((row) => normalizeEdge(row, side)).filter((p): p is Paper => p !== undefined)
        // The graph endpoints report no total: `next` only says another page exists.
        const next = typeof res.data.next === 'number' ? res.data.next : undefined
        return listValue(`${endpoint} of ${paperId}`, papers, offset + papers.length, offset, runtime.creditsOf(res, exec.agent), next)
      },
    }))
  }

  ctx.tools.register(defineTool({
    name: 'get_semantic_paper_authors',
    description: 'List the authors of a Semantic Scholar paper with their profiles (affiliations, h-index, paper and citation counts, author ids).',
    parameters: {
      paper_id: { type: 'string', required: true, description: 'Paper identifier (paperId, DOI:, ARXIV:, PMID:, CorpusId:).' },
      max_results: { type: 'integer', description: `Number of authors (default ${limits.defaultMaxResults}, max ${listCap}).` },
      offset: { type: 'integer', description: 'Pagination offset (default 0).' },
    },
    output: {
      schema: AUTHOR_LIST_SCHEMA,
      render: (_args, value) => renderAuthorList(value, `Authors of ${value.query}`),
      presentationMeta: (_args, value) => creditsMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `Authors of ${args.paper_id}`, kind: 'read', rawInput: args.paper_id }),
    presentResult: (args, result) => presentGenericWithCredits(`Authors of ${args.paper_id}`, result),
    async execute(args, exec) {
      const paperId = requireQuery(args.paper_id, 'paper_id')
      const limit = boundResults(args.max_results, limits, S2_EDGE_CAP)
      const offset = args.offset !== undefined && args.offset > 0 ? Math.trunc(args.offset) : 0
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<{ data?: unknown[]; next?: number }>(`/graph/v1/paper/${encodeURIComponent(paperId)}/authors`, {
        apiKey, signal: exec.signal, query: { limit, offset, fields: AUTHOR_FIELDS },
      })
      if (!res.ok) throw new Error(`Semantic Scholar paper authors lookup failed: ${res.error}`)
      const authors = (res.data.data ?? []).map(normalizeS2Author).filter((a): a is Author => a !== undefined)
      const next = typeof res.data.next === 'number' ? res.data.next : undefined
      const truncated = next !== undefined
      return compact({ query: paperId, total: offset + authors.length, authors, truncated, nextOffset: truncated ? next : undefined, credits: runtime.creditsOf(res, exec.agent) })
    },
  }))

  // ── authors ─────────────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'search_semantic_authors',
    description: 'Search Semantic Scholar authors by name. Returns author ids with affiliations, h-index, paper and citation counts. Follow up with get_semantic_author_detail or get_semantic_author_papers.',
    parameters: {
      query: { type: 'string', required: true, description: 'Author name, e.g. "Yann LeCun".' },
      max_results: { type: 'integer', description: `Number of authors (default ${limits.defaultMaxResults}, max ${listCap}).` },
      offset: { type: 'integer', description: 'Pagination offset (default 0).' },
    },
    output: {
      schema: AUTHOR_LIST_SCHEMA,
      render: (_args, value) => renderAuthorList(value, `Semantic Scholar authors matching "${value.query}"`),
      presentationMeta: (_args, value) => creditsMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `Semantic Scholar authors: ${args.query}`, kind: 'search', rawInput: args.query }),
    presentResult: (args, result) => presentGenericWithCredits(`Semantic Scholar authors: ${args.query}`, result),
    async execute(args, exec) {
      const query = requireQuery(args.query)
      const limit = boundResults(args.max_results, limits, S2_EDGE_CAP)
      const offset = args.offset !== undefined && args.offset > 0 ? Math.trunc(args.offset) : 0
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<{ data?: unknown[]; total?: number; next?: number }>('/graph/v1/author/search', {
        apiKey, signal: exec.signal, query: { query, limit, offset, fields: AUTHOR_FIELDS },
      })
      if (!res.ok) throw new Error(`Semantic Scholar author search failed: ${res.error}`)
      const authors = (res.data.data ?? []).map(normalizeS2Author).filter((a): a is Author => a !== undefined)
      const total = typeof res.data.total === 'number' ? res.data.total : offset + authors.length
      const next = typeof res.data.next === 'number' ? res.data.next : undefined
      const truncated = next !== undefined || offset + authors.length < total
      return compact({ query, total, authors, truncated, nextOffset: truncated ? (next ?? offset + authors.length) : undefined, credits: runtime.creditsOf(res, exec.agent) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'get_semantic_author_detail',
    description: 'Get one Semantic Scholar author profile by author id: name, affiliations, homepage, h-index, paper and citation counts, external ids.',
    parameters: {
      author_id: { type: 'string', required: true, description: 'Semantic Scholar author id, e.g. "1741101".' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { author: AUTHOR_SCHEMA, credits: CREDITS_SCHEMA } },
      presentationMeta: (_args, value) => creditsMeta(value),
      render: (_args, value) => {
        const parts: string[] = []
        if (value.author !== undefined) parts.push(formatAuthor(value.author, 1).replace(/^1\. /, ''))
        const credits = formatCredits(value.credits)
        if (credits !== undefined) parts.push(credits)
        return [{ type: 'text', text: parts.join('\n\n') }]
      },
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `Semantic Scholar author ${args.author_id}`, kind: 'read', rawInput: args.author_id }),
    presentResult: (args, result) => presentGenericWithCredits(`Semantic Scholar author ${args.author_id}`, result),
    async execute(args, exec) {
      const authorId = requireQuery(args.author_id, 'author_id')
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<unknown>(`/graph/v1/author/${encodeURIComponent(authorId)}`, { apiKey, signal: exec.signal, query: { fields: AUTHOR_FIELDS } })
      if (!res.ok) throw new Error(`Semantic Scholar author lookup failed: ${res.error}`)
      const author = normalizeS2Author(res.data)
      if (author === undefined) throw new Error(`Semantic Scholar returned no author for "${authorId}"`)
      return withCredits({ author }, runtime.creditsOf(res, exec.agent))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'get_semantic_author_batch',
    description: `Get many Semantic Scholar author profiles in one call (up to ${Math.min(S2_AUTHOR_BATCH_CAP, limits.maxResultsCap * 4)} author ids).`,
    parameters: {
      author_ids: { type: 'array', required: true, items: { type: 'string' }, description: 'Semantic Scholar author ids.' },
    },
    output: {
      schema: AUTHOR_LIST_SCHEMA,
      render: (_args, value) => renderAuthorList(value, value.query),
      presentationMeta: (_args, value) => creditsMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `Semantic Scholar authors: ${args.author_ids.length} ids (batch)`, kind: 'read' }),
    presentResult: (args, result) => presentGenericWithCredits(`Semantic Scholar authors: ${args.author_ids.length} ids (batch)`, result),
    async execute(args, exec) {
      const ids = requireIds(args.author_ids, 'author_ids', Math.min(S2_AUTHOR_BATCH_CAP, limits.maxResultsCap * 4))
      const apiKey = await runtime.requireApiKey()
      const res = await client.post<unknown[]>('/graph/v1/author/batch', { ids }, { apiKey, signal: exec.signal, query: { fields: AUTHOR_FIELDS } })
      if (!res.ok) throw new Error(`Semantic Scholar author batch lookup failed: ${res.error}`)
      const authors = (Array.isArray(res.data) ? res.data : []).map(normalizeS2Author).filter((a): a is Author => a !== undefined)
      return compact({ query: `${ids.length} author ids (batch)`, total: authors.length, authors, truncated: false, credits: runtime.creditsOf(res, exec.agent) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'get_semantic_author_papers',
    description: "List a Semantic Scholar author's papers by author id, newest first, with citation counts. Supports offset pagination.",
    parameters: {
      author_id: { type: 'string', required: true, description: 'Semantic Scholar author id, e.g. "1741101".' },
      max_results: { type: 'integer', description: `Number of papers (default ${limits.defaultMaxResults}, max ${listCap}).` },
      offset: { type: 'integer', description: 'Pagination offset (default 0).' },
    },
    output: {
      schema: PAPER_SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderPaperSearch(value, render),
      presentationMeta: (_args, value) => paperSearchMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentPaperSearchCall(SOURCE, `papers of author ${args.author_id}`),
    presentResult: (args, result) => presentPaperSearchResult(SOURCE, `papers of author ${args.author_id}`, result),
    async execute(args, exec) {
      const authorId = requireQuery(args.author_id, 'author_id')
      const limit = boundResults(args.max_results, limits, S2_EDGE_CAP)
      const offset = args.offset !== undefined && args.offset > 0 ? Math.trunc(args.offset) : 0
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<{ data?: unknown[]; next?: number }>(`/graph/v1/author/${encodeURIComponent(authorId)}/papers`, {
        apiKey, signal: exec.signal, query: { limit, offset, fields: PAPER_FIELDS },
      })
      if (!res.ok) throw new Error(`Semantic Scholar author papers lookup failed: ${res.error}`)
      const papers = (res.data.data ?? []).map((p) => normalizeS2Paper(p)).filter((p): p is Paper => p !== undefined)
      const next = typeof res.data.next === 'number' ? res.data.next : undefined
      return listValue(`papers of author ${authorId}`, papers, offset + papers.length, offset, runtime.creditsOf(res, exec.agent), next)
    },
  }))

  // ── recommendations ─────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'get_semantic_recommendations',
    description: 'Recommend papers similar to a set of positive example papers (and unlike optional negative examples) using the Semantic Scholar recommendation model. Good for expanding a reading list from a few seed papers.',
    parameters: {
      positive_paper_ids: { type: 'array', required: true, items: { type: 'string' }, description: 'Seed papers to be similar to (paperId or prefixed ids).' },
      negative_paper_ids: { type: 'array', items: { type: 'string' }, description: 'Papers to steer away from.' },
      max_results: { type: 'integer', description: `Number of recommendations (default ${limits.defaultMaxResults}, max ${Math.min(limits.maxResultsCap, S2_RECOMMENDATION_CAP)}).` },
    },
    output: {
      schema: PAPER_SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderPaperSearch(value, render),
      presentationMeta: (_args, value) => paperSearchMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentPaperSearchCall(SOURCE, `recommendations from ${args.positive_paper_ids.length} seed paper(s)`),
    presentResult: (args, result) => presentPaperSearchResult(SOURCE, `recommendations from ${args.positive_paper_ids.length} seed paper(s)`, result),
    async execute(args, exec) {
      const positive = requireIds(args.positive_paper_ids, 'positive_paper_ids', S2_RECOMMENDATION_CAP)
      const negative = args.negative_paper_ids !== undefined ? args.negative_paper_ids.map((id) => id.trim()).filter((id) => id.length > 0) : []
      const limit = boundResults(args.max_results, limits, S2_RECOMMENDATION_CAP)
      const apiKey = await runtime.requireApiKey()
      const res = await client.post<{ recommendedPapers?: unknown[] }>('/recommendations/v1/papers/', { positivePaperIds: positive, negativePaperIds: negative }, {
        apiKey, signal: exec.signal, query: { limit, fields: PAPER_FIELDS },
      })
      if (!res.ok) throw new Error(`Semantic Scholar recommendations failed: ${res.error}`)
      const papers = (res.data.recommendedPapers ?? []).map((p) => normalizeS2Paper(p)).filter((p): p is Paper => p !== undefined)
      return listValue(`recommendations from ${positive.length} seed paper(s)`, papers, papers.length, 0, runtime.creditsOf(res, exec.agent))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'get_semantic_recommendations_for_paper',
    description: 'Recommend papers similar to one paper (Semantic Scholar recommendation model). "recent" pool favors recent papers; "all-cs" covers all computer-science papers.',
    parameters: {
      paper_id: { type: 'string', required: true, description: 'Seed paper identifier (paperId or prefixed id).' },
      max_results: { type: 'integer', description: `Number of recommendations (default ${limits.defaultMaxResults}, max ${Math.min(limits.maxResultsCap, S2_RECOMMENDATION_CAP)}).` },
      pool: { type: 'string', enum: ['recent', 'all-cs'], description: 'Candidate pool (default recent).' },
    },
    output: {
      schema: PAPER_SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderPaperSearch(value, render),
      presentationMeta: (_args, value) => paperSearchMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentPaperSearchCall(SOURCE, `papers similar to ${args.paper_id}`),
    presentResult: (args, result) => presentPaperSearchResult(SOURCE, `papers similar to ${args.paper_id}`, result),
    async execute(args, exec) {
      const paperId = requireQuery(args.paper_id, 'paper_id')
      const limit = boundResults(args.max_results, limits, S2_RECOMMENDATION_CAP)
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<{ recommendedPapers?: unknown[] }>(`/recommendations/v1/papers/forpaper/${encodeURIComponent(paperId)}`, {
        apiKey, signal: exec.signal, query: { limit, fields: PAPER_FIELDS, from: args.pool ?? 'recent' },
      })
      if (!res.ok) throw new Error(`Semantic Scholar recommendations failed: ${res.error}`)
      const papers = (res.data.recommendedPapers ?? []).map((p) => normalizeS2Paper(p)).filter((p): p is Paper => p !== undefined)
      return listValue(`papers similar to ${paperId}`, papers, papers.length, 0, runtime.creditsOf(res, exec.agent))
    },
  }))

  // ── PDF ─────────────────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'download_semantic',
    description: "Look up a paper's open-access PDF URL on Semantic Scholar by identifier. Returns available=false when the platform lists no open-access copy (then try download_by_doi or the arXiv id).",
    parameters: {
      paper_id: { type: 'string', required: true, description: 'Paper identifier (paperId, DOI:, ARXIV:, PMID:, CorpusId:).' },
    },
    output: {
      schema: DOWNLOAD_SCHEMA,
      presentationMeta: (_args, value) => creditsMeta(value),
      render: (_args, value) => {
        const lines = [
          value.title !== undefined ? `${value.title} (${value.id})` : value.id,
          value.available && value.pdfUrl !== undefined ? `Open-access PDF: ${value.pdfUrl}` : 'No open-access PDF listed on Semantic Scholar.',
        ]
        if (value.url !== undefined) lines.push(`Paper page: ${value.url}`)
        const credits = formatCredits(value.credits)
        if (credits !== undefined) lines.push('', credits)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `Open-access PDF of ${args.paper_id}`, kind: 'fetch', rawInput: args.paper_id }),
    presentResult: (args, result) => presentGenericWithCredits(`Open-access PDF of ${args.paper_id}`, result),
    async execute(args, exec) {
      const paperId = requireQuery(args.paper_id, 'paper_id')
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<unknown>(`/graph/v1/paper/${encodeURIComponent(paperId)}`, { apiKey, signal: exec.signal, query: { fields: 'paperId,title,openAccessPdf,externalIds,url' } })
      if (!res.ok) throw new Error(`Semantic Scholar paper lookup failed: ${res.error}`)
      const paper = normalizeS2Paper(res.data)
      if (paper === undefined) throw new Error(`Semantic Scholar returned no paper for "${paperId}"`)
      return compact({ id: paper.id, title: paper.title, url: paper.url, available: paper.pdfUrl !== undefined, pdfUrl: paper.pdfUrl, credits: runtime.creditsOf(res, exec.agent) })
    },
  }))

  if (!fullText) return
  ctx.tools.register(defineTool({
    name: 'read_semantic_paper',
    description: "Download a paper's open-access PDF (as listed by Semantic Scholar) and return its extracted full text in slices. Fails when no open-access copy exists (then try read_arxiv_paper or read_by_doi).",
    parameters: {
      paper_id: { type: 'string', required: true, description: 'Paper identifier (paperId, DOI:, ARXIV:, PMID:, CorpusId:).' },
      offset: { type: 'integer', description: 'Character offset to start from (default 0).' },
      max_chars: { type: 'integer', description: `Characters to return (default ${runtime.read.maxChars}).` },
    },
    output: {
      schema: READ_OUTPUT_SCHEMA,
      render: (_args, value) => renderRead(value),
      presentationMeta: (_args, value) => creditsMeta(value),
    },
    timeoutMs: timeouts.pdf + timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentReadCall('Semantic Scholar paper', args.paper_id),
    presentResult: (args, result) => presentGenericWithCredits(`Read Semantic Scholar paper: ${args.paper_id}`, result),
    async execute(args, exec) {
      const paperId = requireQuery(args.paper_id, 'paper_id')
      const apiKey = await runtime.requireApiKey()
      const res = await client.get<unknown>(`/graph/v1/paper/${encodeURIComponent(paperId)}`, { apiKey, signal: exec.signal, query: { fields: 'paperId,title,openAccessPdf,externalIds' } })
      if (!res.ok) throw new Error(`Semantic Scholar paper lookup failed: ${res.error}`)
      const paper = normalizeS2Paper(res.data)
      if (paper === undefined) throw new Error(`Semantic Scholar returned no paper for "${paperId}"`)
      if (paper.pdfUrl === undefined) throw new Error(`no open-access PDF is listed for "${paperId}"; try read_arxiv_paper (if it has an arXiv id) or read_by_doi`)
      const pdf = await fetchPdf(client, paper.pdfUrl, { signal: exec.signal, timeoutMs: timeouts.pdf })
      if (!pdf.ok) throw new Error(`PDF download failed: ${pdf.error}`)
      const { text, pages } = await extractPdfText(pdf.data)
      if (text.trim().length === 0) throw new Error('the PDF downloaded but no readable text could be extracted')
      return withCredits({ id: paper.id, title: paper.title, pdfUrl: pdf.finalUrl, pages, ...sliceText(text, args.offset, args.max_chars ?? runtime.read.maxChars) }, runtime.creditsOf(res, exec.agent))
    },
  }))
}

// `formatPaper` is re-exported for tests of the citation-context rendering.
export { formatPaper }
