/**
 * `search_papers`: one query across several platforms, merged and
 * de-duplicated (DOI, arXiv id, PMID, then normalized title), papers found
 * on more than one platform first. Free platforms cost nothing; billed ones
 * report their credits summed.
 * @module dsh-ai4scholar/tools/unified
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InferValue } from '@deepseek-ai/dsh-tools'
import {
  CREDITS_SCHEMA,
  PAPER_SCHEMA,
  SOURCE_LABEL,
  compact,
  formatCredits,
  formatPaper,
  paperListMeta,
  presentPaperListResult,
} from '../paper.js'
import type { CreditsValue, Paper, PaperSearchValue, PaperSource } from '../paper.js'
import { boundResults, requireQuery } from '../runtime.js'
import type { Runtime } from '../runtime.js'
import { runSemanticSearch } from './semantic-scholar.js'
import { runPubmedSearch } from './pubmed.js'
import { runScholarSearch } from './google-scholar.js'
import { runArxivSearch } from './arxiv.js'

/** Platforms the unified search can fan out to, in merge priority order (richest metadata first). */
export const UNIFIED_SOURCES = ['semantic-scholar', 'pubmed', 'arxiv', 'google-scholar'] as const
export type UnifiedSource = (typeof UNIFIED_SOURCES)[number]
const DEFAULT_SOURCES: readonly UnifiedSource[] = ['semantic-scholar', 'pubmed']

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', required: true },
    sources: { type: 'array', required: true, items: { type: 'string' }, description: 'Platforms queried, in the order they were merged.' },
    total: { type: 'integer', required: true, description: 'Unique papers after de-duplication.' },
    papers: { type: 'array', required: true, items: PAPER_SCHEMA, description: 'Merged records; extra.foundIn lists every platform that returned the paper.' },
    perSource: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          source: { type: 'string', required: true },
          count: { type: 'integer', required: true, description: 'Records this platform returned before merging.' },
          total: { type: 'integer', description: 'Total matches the platform reported, when known.' },
          error: { type: 'string', description: 'Set when this platform failed; the others still count.' },
        },
      },
    },
    truncated: { type: 'boolean', required: true, description: 'True when at least one platform had more results than requested.' },
    warning: { type: 'string' },
    credits: CREDITS_SCHEMA,
  },
} as const
type UnifiedValue = InferValue<typeof OUTPUT_SCHEMA>

/**
 * Normalized title for near-duplicate matching.
 *
 * NFKC runs first because the same title arrives composed from one platform
 * and decomposed from another — "é" as one code point, or as "e" followed by
 * U+0301 — and full-width from a third. Without it those are three different
 * keys and one paper is listed three times.
 *
 * Then keep letters and digits of any script. The previous rule kept only
 * `[a-z0-9]` plus the CJK Unified Ideographs block, which erased a Russian or
 * Greek title down to the empty string (no title key at all, so those papers
 * could only ever dedup by DOI) and quietly dropped every accent out of a
 * French or German one.
 *
 * Sliced by code point rather than UTF-16 unit so an astral character is never
 * cut in half.
 */
export function titleKey(title: string): string {
  const folded = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  return Array.from(folded).slice(0, 120).join('')
}

/**
 * Title keys shorter than this are not used: "introduction" and "deep
 * learning" are real titles that different papers share, and a wrong merge
 * hides a paper, which is worse than showing a duplicate. Counted in code
 * points, so a CJK title is measured in characters — which does mean a short
 * Chinese title dedups by identifier only. That is the conservative side of
 * the same trade.
 */
const MIN_TITLE_KEY = 12

/** Every identity key of one paper: DOI, arXiv id, PMID, and the normalized title. */
export function identityKeys(paper: Paper): string[] {
  const keys: string[] = []
  const doi = paper.doi ?? (typeof paper.externalIds?.DOI === 'string' ? paper.externalIds.DOI : undefined)
  if (doi !== undefined) keys.push(`doi:${doi.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`)
  const arxiv = paper.source === 'arxiv' ? paper.id : typeof paper.externalIds?.ArXiv === 'string' ? paper.externalIds.ArXiv : undefined
  if (arxiv !== undefined) keys.push(`arxiv:${arxiv.toLowerCase().replace(/v\d+$/, '')}`)
  const pmid = paper.source === 'pubmed' ? paper.id : typeof paper.externalIds?.PubMed === 'string' ? paper.externalIds.PubMed : undefined
  if (pmid !== undefined) keys.push(`pmid:${pmid}`)
  const t = titleKey(paper.title)
  if (Array.from(t).length >= MIN_TITLE_KEY) keys.push(`title:${t}`)
  return keys
}

/** Merge a later record into an earlier one: fill gaps, keep the higher citation count, union ids and sources. */
function mergeInto(base: Paper, other: Paper): Paper {
  const foundIn = new Set<string>([
    ...(Array.isArray(base.extra?.foundIn) ? (base.extra.foundIn as unknown[]).filter((x): x is string => typeof x === 'string') : [base.source]),
    other.source,
  ])
  const externalIds = { ...(other.externalIds ?? {}), ...(base.externalIds ?? {}) }
  const merged: Paper = compact({
    ...base,
    year: base.year ?? other.year,
    date: base.date ?? other.date,
    venue: base.venue ?? other.venue,
    abstract: base.abstract !== undefined && base.abstract.length >= (other.abstract?.length ?? 0) ? base.abstract : other.abstract ?? base.abstract,
    citationCount: base.citationCount !== undefined || other.citationCount !== undefined ? Math.max(base.citationCount ?? 0, other.citationCount ?? 0) : undefined,
    doi: base.doi ?? other.doi,
    pdfUrl: base.pdfUrl ?? other.pdfUrl,
    externalIds: Object.keys(externalIds).length > 0 ? externalIds : undefined,
    categories: base.categories ?? other.categories,
    extra: compact({ ...(other.extra ?? {}), ...(base.extra ?? {}), foundIn: [...foundIn] }),
  })
  return merged
}

/**
 * Merge platform result lists into one de-duplicated, ranked list.
 * @param lists - per-platform results in merge priority order.
 * @returns unique papers: multi-platform hits first, then by citations, then by year.
 */
export function mergePaperLists(lists: readonly (readonly Paper[])[]): Paper[] {
  const merged: Paper[] = []
  const bestRank: number[] = []
  const index = new Map<string, number>()
  for (const list of lists) {
    list.forEach((paper, rank) => {
      const keys = identityKeys(paper)
      const hit = keys.map((k) => index.get(k)).find((i): i is number => i !== undefined)
      if (hit !== undefined) {
        merged[hit] = mergeInto(merged[hit]!, paper)
        bestRank[hit] = Math.min(bestRank[hit]!, rank)
        for (const k of keys) index.set(k, hit)
      } else {
        const stamped: Paper = compact({ ...paper, extra: compact({ ...(paper.extra ?? {}), foundIn: [paper.source] }) })
        merged.push(stamped)
        bestRank.push(rank)
        for (const k of keys) index.set(k, merged.length - 1)
      }
    })
  }
  const foundCount = (p: Paper): number => (Array.isArray(p.extra?.foundIn) ? (p.extra.foundIn as unknown[]).length : 1)
  // Multi-platform hits first; then each platform's own relevance rank (best rank across
  // platforms), so results interleave instead of one platform's list dominating; then citations.
  return merged
    .map((paper, i) => ({ paper, rank: bestRank[i]! }))
    .sort((a, b) =>
      foundCount(b.paper) - foundCount(a.paper)
      || a.rank - b.rank
      || (b.paper.citationCount ?? -1) - (a.paper.citationCount ?? -1)
      || (b.paper.year ?? 0) - (a.paper.year ?? 0))
    .map((entry) => entry.paper)
}

/** Sum charges across platform calls; keep the lowest reported balance and the highest session tally. */
function sumCredits(parts: readonly (CreditsValue | undefined)[]): CreditsValue | undefined {
  let charged: number | undefined
  let remaining: number | undefined
  let sessionTotal: number | undefined
  for (const c of parts) {
    if (c === undefined) continue
    if (c.charged !== undefined) charged = (charged ?? 0) + c.charged
    if (c.remaining !== undefined) remaining = remaining === undefined ? c.remaining : Math.min(remaining, c.remaining)
    if (c.sessionTotal !== undefined) sessionTotal = sessionTotal === undefined ? c.sessionTotal : Math.max(sessionTotal, c.sessionTotal)
  }
  if (charged === undefined && remaining === undefined && sessionTotal === undefined) return undefined
  return compact({ charged, remaining, sessionTotal })
}

function formatUnified(value: UnifiedValue, abstractMaxChars: number): string {
  const parts: string[] = []
  const labels = value.sources.map((s) => SOURCE_LABEL[s as PaperSource] ?? s)
  const per = value.perSource.map((p) => `${SOURCE_LABEL[p.source as PaperSource] ?? p.source} ${p.error !== undefined ? 'failed' : `${p.count}${p.total !== undefined && p.total > p.count ? ` of ${p.total}` : ''}`}`).join(', ')
  if (value.papers.length === 0) {
    parts.push(`No papers found for "${value.query}" across ${labels.join(', ')} (${per}).`)
  } else {
    parts.push(`Papers for "${value.query}" across ${labels.join(', ')} — ${value.total} unique after de-duplication (${per}):`)
    parts.push(value.papers.map((paper, i) => {
      const found = Array.isArray(paper.extra?.foundIn) ? (paper.extra.foundIn as unknown[]).filter((x): x is string => typeof x === 'string') : []
      const line = formatPaper(paper, i + 1, { abstractMaxChars })
      return found.length > 1 ? line.replace('\n', ` (found on ${found.map((f) => SOURCE_LABEL[f as PaperSource] ?? f).join(' + ')})\n`) : line
    }).join('\n\n'))
    if (value.truncated) parts.push('At least one platform had more matches than requested; raise max_results_per_source or use the platform tools (search_semantic / search_pubmed / …) with offset to page.')
    parts.push('Cite papers by title with their DOI or platform link.')
  }
  if (value.warning !== undefined) parts.push(`Note: ${value.warning}`)
  const credits = formatCredits(value.credits)
  if (credits !== undefined) parts.push(credits)
  return parts.join('\n\n')
}

/**
 * Register `search_papers`.
 * @param ctx - context whose `tools` registry receives the effect-scoped registration.
 * @param runtime - plugin instance runtime.
 * @param enabled - which platforms this composition mounted; the tool offers only those.
 */
export function applyUnifiedSearchTool(ctx: Context, runtime: Runtime, enabled: Record<UnifiedSource, boolean>): void {
  const { limits, render, timeouts } = runtime
  const offered = UNIFIED_SOURCES.filter((s) => enabled[s])
  if (offered.length === 0) return
  const defaults = DEFAULT_SOURCES.filter((s) => enabled[s])
  const fallbackDefaults = defaults.length > 0 ? defaults : [offered[0]!]

  ctx.tools.register(defineTool({
    name: 'search_papers',
    description: `Search several platforms in one call and merge the results: duplicates are collapsed by DOI / arXiv id / PMID / title, papers found on more than one platform rank first, then by citation count. For a plain topic search this call REPLACES the per-platform search tools — do not also run the same query through them, that repeats the charge; add extra platforms via sources instead. Available platforms: ${offered.map((s) => SOURCE_LABEL[s]).join(', ')} (default ${fallbackDefaults.map((s) => SOURCE_LABEL[s]).join(' + ')}; arXiv is free, the others cost credits, Google Scholar is slowest).`,
    parameters: {
      query: { type: 'string', required: true, description: 'Topic or keywords; sent to every selected platform as-is.' },
      sources: { type: 'array', items: { type: 'string', enum: offered }, description: `Platforms to query (default ${JSON.stringify(fallbackDefaults)}).` },
      max_results_per_source: { type: 'integer', description: `Results requested from each platform (default ${limits.defaultMaxResults}, max ${limits.maxResultsCap}).` },
      year_from: { type: 'integer', description: 'Earliest publication year.' },
      year_to: { type: 'integer', description: 'Latest publication year.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatUnified(value, render.abstractMaxChars) }],
      presentationMeta: (_args, value) => paperListMeta(value.papers, value.truncated, value.credits),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `Papers: ${args.query}`, kind: 'search', rawInput: args.query }),
    presentResult: (args, result) => presentPaperListResult(`Papers: ${args.query}`, result),
    async execute(args, exec) {
      const query = requireQuery(args.query)
      const chosen = (args.sources !== undefined && args.sources.length > 0 ? args.sources : fallbackDefaults) as UnifiedSource[]
      const sources = UNIFIED_SOURCES.filter((s) => chosen.includes(s) && enabled[s])
      if (sources.length === 0) throw new Error(`sources must name at least one of: ${offered.join(', ')}`)
      const per = boundResults(args.max_results_per_source, limits)
      if (args.year_from !== undefined && args.year_to !== undefined && args.year_from > args.year_to) throw new Error('year_from must not be later than year_to')
      const s2Year = args.year_from !== undefined || args.year_to !== undefined ? `${args.year_from ?? ''}-${args.year_to ?? ''}` : undefined
      const runners: Record<UnifiedSource, () => Promise<PaperSearchValue>> = {
        'semantic-scholar': () => runSemanticSearch(runtime, { query, limit: Math.min(per, 100), year: s2Year }, exec.signal, exec.agent),
        'pubmed': () => runPubmedSearch(runtime, { query, limit: per, minDate: args.year_from !== undefined ? String(args.year_from) : undefined, maxDate: args.year_to !== undefined ? String(args.year_to) : undefined }, exec.signal, exec.agent),
        'arxiv': async () => {
          const page = await runArxivSearch(runtime, { query, limit: per, dateFrom: args.year_from !== undefined ? `${args.year_from}-01-01` : undefined }, exec.signal)
          // arXiv has no upper date bound in the query syntax; apply it client-side.
          return args.year_to !== undefined ? { ...page, papers: page.papers.filter((p) => p.year === undefined || p.year <= args.year_to!) } : page
        },
        'google-scholar': () => runScholarSearch(runtime, { query, wanted: per, yearFrom: args.year_from, yearTo: args.year_to }, exec.signal, exec.agent),
      }
      const settled = await Promise.allSettled(sources.map((s) => runners[s]()))
      const lists: Paper[][] = []
      const perSource: UnifiedValue['perSource'] = []
      const failures: string[] = []
      const creditParts: (CreditsValue | undefined)[] = []
      let truncated = false
      settled.forEach((outcome, i) => {
        const source = sources[i]!
        if (outcome.status === 'fulfilled') {
          lists.push(outcome.value.papers)
          perSource.push(compact({ source, count: outcome.value.papers.length, total: outcome.value.total > outcome.value.papers.length ? outcome.value.total : undefined }))
          truncated = truncated || outcome.value.truncated
          creditParts.push(outcome.value.credits)
          if (outcome.value.warning !== undefined) failures.push(`${SOURCE_LABEL[source]}: ${outcome.value.warning}`)
        } else {
          const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
          perSource.push({ source, count: 0, error: message })
          failures.push(`${SOURCE_LABEL[source]}: ${message}`)
        }
      })
      if (lists.length === 0) throw new Error(`every platform failed — ${failures.join('; ')}`)
      const papers = mergePaperLists(lists)
      return compact({
        query,
        sources: [...sources],
        total: papers.length,
        papers,
        perSource,
        truncated,
        warning: failures.length > 0 ? failures.join('; ') : undefined,
        credits: sumCredits(creditParts),
      })
    },
  }))
}
