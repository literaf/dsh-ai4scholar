/**
 * The normalized paper record every search tool returns, its output schema,
 * and the pure model-facing / UI-facing projections. Normalizing here keeps
 * one programmatic shape across Semantic Scholar, PubMed, and Google Scholar
 * for Code Mode callers and one renderer for the model.
 * @module dsh-ai4scholar/paper
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { GenericCallView, GenericResultView, InferValue, JsonValue, ToolResult, WebSearchResultView, WebSource } from '@deepseek-ai/dsh-tools'

/** Which platform produced a record. */
export type PaperSource = 'semantic-scholar' | 'pubmed' | 'google-scholar' | 'arxiv' | 'biorxiv' | 'medrxiv'

/** Every platform value, for schema enums. */
export const PAPER_SOURCES = ['semantic-scholar', 'pubmed', 'google-scholar', 'arxiv', 'biorxiv', 'medrxiv'] as const

/** Human-readable platform label for headings and card titles. */
export const SOURCE_LABEL: Record<PaperSource, string> = {
  'semantic-scholar': 'Semantic Scholar',
  'pubmed': 'PubMed',
  'google-scholar': 'Google Scholar',
  'arxiv': 'arXiv',
  'biorxiv': 'bioRxiv',
  'medrxiv': 'medRxiv',
}

/** Credit accounting attached to billed results (absent on free platforms). */
export const CREDITS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  description: 'AI4Scholar credit accounting for this call, when the API reported it.',
  properties: {
    charged: { type: 'number', description: 'Credits this call cost.' },
    remaining: { type: 'number', description: 'Account balance after this call.' },
    sessionTotal: { type: 'number', description: 'Credits charged by this plugin during the current session (process-local tally).' },
  },
} as const

/** The {@link CREDITS_SCHEMA} value type. */
export type CreditsValue = InferValue<typeof CREDITS_SCHEMA>

/** One-line credit note for model-facing text, or `undefined` when nothing is known. */
export function formatCredits(credits: CreditsValue | undefined): string | undefined {
  if (credits === undefined) return undefined
  const parts: string[] = []
  if (credits.charged !== undefined) parts.push(`this call: ${credits.charged}`)
  if (credits.sessionTotal !== undefined) parts.push(`this session: ${credits.sessionTotal}`)
  if (credits.remaining !== undefined) parts.push(`remaining: ${credits.remaining.toLocaleString('en-US')}`)
  return parts.length > 0 ? `AI4Scholar credits — ${parts.join(' · ')}` : undefined
}

/** Output schema of one normalized paper. Every optional field is omitted when unknown, never `null`. */
export const PAPER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source: { type: 'string', required: true, enum: PAPER_SOURCES },
    id: { type: 'string', required: true, description: 'Platform-native identifier: Semantic Scholar paperId, PubMed PMID, arXiv id, bioRxiv/medRxiv DOI, or a Google Scholar result URL.' },
    title: { type: 'string', required: true },
    authors: { type: 'array', required: true, items: { type: 'string' } },
    year: { type: 'integer' },
    date: { type: 'string', description: 'Publication date as returned by the platform (ISO date when available).' },
    venue: { type: 'string', description: 'Journal or venue name.' },
    abstract: { type: 'string', description: 'Abstract, or the platform snippet when no abstract is available.' },
    citationCount: { type: 'integer' },
    doi: { type: 'string' },
    url: { type: 'string', required: true },
    pdfUrl: { type: 'string', description: 'Open-access PDF URL when the platform reports one.' },
    externalIds: {
      type: 'object',
      additionalProperties: true,
      description: 'Other identifiers keyed by scheme, e.g. DOI, ArXiv, PubMed, CorpusId.',
    },
    categories: { type: 'array', items: { type: 'string' }, description: 'Subject categories (arXiv) or the preprint category (bioRxiv/medRxiv).' },
    extra: {
      type: 'object',
      additionalProperties: true,
      description: 'Platform-specific fields that have no normalized slot, e.g. citation contexts and intents on citation-graph results.',
    },
  },
} as const

/** One normalized paper (the {@link PAPER_SCHEMA} value type). */
export type Paper = InferValue<typeof PAPER_SCHEMA>

/** Output schema shared by every paper-list search tool. */
export const PAPER_SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source: { type: 'string', required: true, enum: PAPER_SOURCES },
    query: { type: 'string', required: true },
    total: { type: 'integer', required: true, description: 'Total matches reported by the platform, or the returned count when unknown.' },
    papers: { type: 'array', required: true, items: PAPER_SCHEMA },
    truncated: { type: 'boolean', required: true, description: 'True when more results exist beyond the returned page.' },
    nextOffset: { type: 'integer', description: 'Offset to request the next page, when the platform paginates by offset.' },
    warning: { type: 'string', description: 'Set when the platform answered partially, e.g. a later page failed; the returned papers are still valid.' },
    nextToken: { type: 'string', description: 'Continuation token for the next page, when the platform paginates by token (Semantic Scholar bulk search).' },
    credits: CREDITS_SCHEMA,
  },
} as const

/** The paper-list search tools' canonical value. */
export type PaperSearchValue = InferValue<typeof PAPER_SEARCH_OUTPUT_SCHEMA>

/** Rendering knobs owned by the plugin config. */
export interface RenderOptions {
  /** Cap on abstract characters per paper in model-facing text; `0` omits abstracts. */
  abstractMaxChars: number
}

/** Remove `undefined` members so a value satisfies its schema and `exactOptionalPropertyTypes`. */
export function compact<T extends Record<string, unknown>>(record: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) out[key] = value
  }
  return out as { [K in keyof T]: Exclude<T[K], undefined> }
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', beta: 'β', alpha: 'α', gamma: 'γ', delta: 'δ', micro: 'µ', deg: '°', plusmn: '±', times: '×' }

/** Decode the HTML entities some platform payloads (PubMed) leave in titles and abstracts. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

/** Read a string field from an untyped platform record; blank strings count as absent. */
export function str(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

/** Read an integer field from an untyped platform record. */
export function int(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number.parseInt(value, 10)
  return undefined
}

/** Narrow an unknown JSON value to a plain object record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Truncate at a word boundary and mark the cut. */
export function clip(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (maxChars <= 0) return ''
  if (normalized.length <= maxChars) return normalized
  const cut = normalized.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** `A, B, C et al.` style author line. */
export function formatAuthors(authors: readonly string[], max = 3): string {
  if (authors.length === 0) return 'Unknown authors'
  if (authors.length <= max) return authors.join(', ')
  return `${authors.slice(0, max).join(', ')} et al.`
}

/** One paper as a markdown list entry: title link, byline, identifiers, and a clipped abstract. */
export function formatPaper(paper: Paper, index: number, options: RenderOptions): string {
  const lines: string[] = []
  const heading = paper.url.length > 0 ? `[${paper.title}](${paper.url})` : paper.title
  lines.push(`${index}. **${heading}**`)
  const byline: string[] = [formatAuthors(paper.authors)]
  if (paper.year !== undefined) byline.push(String(paper.year))
  if (paper.venue !== undefined) byline.push(paper.venue)
  if (paper.citationCount !== undefined) byline.push(`${paper.citationCount} citations`)
  lines.push(`   ${byline.join(' · ')}`)
  const ids: string[] = []
  ids.push(`${idLabel(paper.source)}: ${paper.id}`)
  if (paper.doi !== undefined && paper.doi !== paper.id) ids.push(`DOI: ${paper.doi}`)
  const arxiv = paper.externalIds?.ArXiv
  if (typeof arxiv === 'string' && paper.source !== 'pubmed' && paper.source !== 'arxiv') ids.push(`arXiv: ${arxiv}`)
  const pmid = paper.externalIds?.PubMed
  if (typeof pmid === 'string' && paper.source !== 'pubmed') ids.push(`PMID: ${pmid}`)
  if (paper.pdfUrl !== undefined) ids.push(`PDF: ${paper.pdfUrl}`)
  lines.push(`   ${ids.join(' · ')}`)
  if (paper.categories !== undefined && paper.categories.length > 0) lines.push(`   Categories: ${paper.categories.slice(0, 6).join(', ')}`)
  const contexts = paper.extra?.contexts
  if (Array.isArray(contexts) && contexts.length > 0 && options.abstractMaxChars > 0) {
    const first = contexts.find((c): c is string => typeof c === 'string')
    if (first !== undefined) lines.push(`   Citing context: "${clip(first, Math.min(options.abstractMaxChars, 300))}"`)
  }
  if (paper.abstract !== undefined && options.abstractMaxChars > 0) {
    lines.push(`   ${clip(paper.abstract, options.abstractMaxChars)}`)
  }
  return lines.join('\n')
}

function idLabel(source: PaperSource): string {
  switch (source) {
    case 'semantic-scholar': return 'S2 id'
    case 'pubmed': return 'PMID'
    case 'google-scholar': return 'link'
    case 'arxiv': return 'arXiv'
    case 'biorxiv':
    case 'medrxiv': return 'DOI'
  }
}

/**
 * Model-facing text for a paper-list result: a heading with counts, the
 * numbered list, and a pagination note when more results exist.
 */
export function formatPaperSearch(value: PaperSearchValue, options: RenderOptions): string {
  const label = SOURCE_LABEL[value.source]
  if (value.papers.length === 0) {
    const credits = formatCredits(value.credits)
    return `No ${label} results for "${value.query}".${credits !== undefined ? `\n\n${credits}` : ''}`
  }
  const parts: string[] = []
  const totalNote = value.total > value.papers.length ? ` of ${value.total}` : ''
  parts.push(`${label} results for "${value.query}" (showing ${value.papers.length}${totalNote}):`)
  parts.push(value.papers.map((paper, i) => formatPaper(paper, i + 1, options)).join('\n\n'))
  if (value.warning !== undefined) parts.push(`Note: ${value.warning}`)
  if (value.truncated) {
    parts.push(value.nextOffset !== undefined
      ? `More results are available; call again with offset=${value.nextOffset} to continue.`
      : value.nextToken !== undefined
        ? 'More results are available; call again with the returned nextToken to continue.'
        : 'More results are available; narrow the query or raise max_results to see them.')
  }
  parts.push('Cite papers by title with their DOI or platform link.')
  const credits = formatCredits(value.credits)
  if (credits !== undefined) parts.push(credits)
  return parts.join('\n\n')
}

/** Model-facing content blocks for a paper-list result. */
export function renderPaperSearch(value: PaperSearchValue, options: RenderOptions): ContentBlock[] {
  return [{ type: 'text', text: formatPaperSearch(value, options) }]
}

/** Model-facing content for a single-paper result (details, full abstract). */
export function renderPaperDetail(paper: Paper, credits?: CreditsValue): ContentBlock[] {
  const lines: string[] = []
  lines.push(`**${paper.title}**`)
  lines.push(formatAuthors(paper.authors, 12))
  const facts: string[] = []
  if (paper.year !== undefined) facts.push(`Year: ${paper.year}`)
  if (paper.date !== undefined) facts.push(`Date: ${paper.date}`)
  if (paper.venue !== undefined) facts.push(`Venue: ${paper.venue}`)
  if (paper.citationCount !== undefined) facts.push(`Citations: ${paper.citationCount}`)
  facts.push(`${idLabel(paper.source)}: ${paper.id}`)
  if (paper.doi !== undefined) facts.push(`DOI: ${paper.doi}`)
  if (paper.externalIds !== undefined) {
    for (const [scheme, id] of Object.entries(paper.externalIds)) {
      if (scheme === 'DOI' || typeof id !== 'string') continue
      facts.push(`${scheme}: ${id}`)
    }
  }
  facts.push(`URL: ${paper.url}`)
  if (paper.pdfUrl !== undefined) facts.push(`PDF: ${paper.pdfUrl}`)
  if (paper.categories !== undefined && paper.categories.length > 0) facts.push(`Categories: ${paper.categories.join(', ')}`)
  lines.push(facts.join('\n'))
  lines.push(paper.abstract !== undefined ? `Abstract: ${paper.abstract}` : 'Abstract: not available.')
  const creditsLine = formatCredits(credits)
  if (creditsLine !== undefined) lines.push(creditsLine)
  return [{ type: 'text', text: lines.join('\n\n') }]
}

/** Pending-call card: a search card titled with the platform and query. */
export function presentPaperSearchCall(source: PaperSource, query: string): GenericCallView {
  return { card: 'generic', title: `${SOURCE_LABEL[source]}: ${query}`, kind: 'search', rawInput: query }
}

/** Project a paper into the `web` card's source shape (as plain JSON for the persisted meta). */
export function paperToSource(paper: Paper): Record<string, string> {
  const snippetParts: string[] = [formatAuthors(paper.authors)]
  if (paper.venue !== undefined) snippetParts.push(paper.venue)
  if (paper.citationCount !== undefined) snippetParts.push(`${paper.citationCount} citations`)
  const publishedAt = paper.date ?? (paper.year !== undefined ? String(paper.year) : undefined)
  return compact({
    url: paper.url,
    title: paper.title,
    snippet: snippetParts.join(' · '),
    publishedAt,
  })
}

/** Replayable presentation meta for a paper-list result: the structured sources, the truncation flag, and the credits. */
export function paperSearchMeta(value: PaperSearchValue): JsonValue {
  return paperListMeta(value.papers, value.truncated, value.credits)
}

/** Replayable presentation meta for any paper list (shared by platform searches and the unified search). */
export function paperListMeta(papers: readonly Paper[], truncated: boolean, credits: CreditsValue | undefined): JsonValue {
  return { sources: papers.map(paperToSource), truncated, ...creditsMeta({ credits }) }
}

/** The `credits` member of a presentation meta object (empty when the value carries none). */
export function creditsMeta(value: { credits?: CreditsValue | undefined }): { credits?: JsonValue } {
  if (value.credits === undefined) return {}
  const c = value.credits
  const out: Record<string, number> = {}
  if (c.charged !== undefined) out.charged = c.charged
  if (c.remaining !== undefined) out.remaining = c.remaining
  if (c.sessionTotal !== undefined) out.sessionTotal = c.sessionTotal
  return { credits: out }
}

/**
 * Card-title suffix from persisted meta, e.g. ` · 10 credits · 89,409 left`.
 * Empty when the meta carries no credits (free platforms, older logs).
 */
export function creditsTitleSuffix(meta: unknown): string {
  if (!isRecord(meta) || !isRecord(meta.credits)) return ''
  const { charged, remaining } = meta.credits
  const parts: string[] = []
  if (typeof charged === 'number') parts.push(`${charged} credit${charged === 1 ? '' : 's'}`)
  if (typeof remaining === 'number') parts.push(`${remaining.toLocaleString('en-US')} left`)
  return parts.length > 0 ? ` · ${parts.join(' · ')}` : ''
}

/**
 * Completed generic card whose title carries the credit suffix; `undefined`
 * (framework generic card) on failure so the error stays visible unchanged.
 */
export function presentGenericWithCredits(title: string, result: ToolResult): GenericResultView | undefined {
  if (result.isError) return undefined
  return { card: 'generic', title: `${title}${creditsTitleSuffix(result.meta)}` }
}

/** Narrow one persisted source; returns a fresh {@link WebSource} or `undefined` when malformed. */
function toWebSource(value: unknown): WebSource | undefined {
  if (!isRecord(value)) return undefined
  const { url, title, snippet, publishedAt } = value
  if (typeof url !== 'string') return undefined
  if (title !== undefined && typeof title !== 'string') return undefined
  if (snippet !== undefined && typeof snippet !== 'string') return undefined
  if (publishedAt !== undefined && typeof publishedAt !== 'string') return undefined
  return compact({ url, title, snippet, publishedAt })
}

/**
 * Completed-call card: the `web` search card carrying the structured sources
 * from `result.meta`. Returns `undefined` (generic card) on failure or when the
 * meta is malformed, e.g. a log written by a different plugin version.
 */
export function presentPaperSearchResult(source: PaperSource, query: string, result: ToolResult): WebSearchResultView | undefined {
  return presentPaperListResult(`${SOURCE_LABEL[source]}: ${query}`, result)
}

/**
 * Completed-call `web` search card for any paper list, titled by the caller.
 * @param title - card title without the credit suffix.
 * @param result - the final tool result whose meta carries the sources.
 * @returns the card, or `undefined` (generic card) on failure or malformed meta.
 */
export function presentPaperListResult(title: string, result: ToolResult): WebSearchResultView | undefined {
  if (result.isError || !isRecord(result.meta)) return undefined
  const { sources: rawSources, truncated } = result.meta
  if (!Array.isArray(rawSources) || typeof truncated !== 'boolean') return undefined
  const sources: WebSource[] = []
  for (const raw of rawSources) {
    const source = toWebSource(raw)
    if (source === undefined) return undefined
    sources.push(source)
  }
  return { card: 'web', kind: 'search', title: `${title}${creditsTitleSuffix(result.meta)}`, sources, truncated }
}
