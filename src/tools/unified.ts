/**
 * `search_papers`: Semantic Scholar by default; callers can select other
 * platforms explicitly. Multiple sources are merged and de-duplicated
 * (DOI, arXiv id, PMID, then normalized title), papers found on more than
 * one platform first. Free platforms cost nothing; billed ones report
 * their credits summed.
 * @module dsh-ai4scholar/tools/unified
 */

import type { Context } from '@deepseek-ai/cordis'
import { researchMeta } from '../research-meta.js'
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
import { boundResults, limitsFor, requireQuery } from '../runtime.js'
import type { Runtime } from '../runtime.js'
import { runSemanticSearch } from './semantic-scholar.js'
import { runPubmedSearch } from './pubmed.js'
import { runScholarSearch } from './google-scholar.js'
import { runArxivSearch } from './arxiv.js'
import { runChineseSearch } from './chinese.js'

import { DEFAULT_SOURCES, PLATFORM_CAP, UNIFIED_SOURCES } from '../shared/search-settings.js'
import type { UnifiedSource } from '../shared/search-settings.js'

export { DEFAULT_SOURCES, UNIFIED_SOURCES }
export type { UnifiedSource }

/**
 * The platforms a call without `sources` queries: the configured ones that are
 * mounted, else the first mounted platform.
 * @param configured - `searchSources` from the config.
 * @param enabled - which platforms this composition mounted.
 * @returns the default platforms in merge order; empty when none is mounted.
 */
export function defaultSourcesFor(configured: readonly UnifiedSource[], enabled: Record<UnifiedSource, boolean>): UnifiedSource[] {
  const offered = UNIFIED_SOURCES.filter((s) => enabled[s])
  const picked = offered.filter((s) => configured.includes(s))
  return picked.length > 0 ? picked : offered.slice(0, 1)
}

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
          query: { type: 'string', description: 'Source-specific query when it differs from the main query.' },
          pageSize: { type: 'integer', description: 'Results requested from this platform in this call; pass it as max_results when continuing.' },
          nextOffset: { type: 'integer', description: 'Continue with this source’s standalone search tool at this offset, with max_results set to pageSize and the query and filters unchanged.' },
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
 * Chinese title needs a shared identifier or the same year and first author.
 */
const MIN_TITLE_KEY = 12

function doiKey(paper: Paper): string | undefined {
  const doi = paper.doi ?? (typeof paper.externalIds?.DOI === 'string' ? paper.externalIds.DOI : undefined)
  return doi?.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '') || undefined
}

/** Every identity key of one paper: DOI, arXiv id, PMID, and the normalized title. */
export function identityKeys(paper: Paper): string[] {
  const keys: string[] = []
  const doi = doiKey(paper)
  if (doi !== undefined) keys.push(`doi:${doi}`)
  const arxiv = paper.source === 'arxiv' ? paper.id : typeof paper.externalIds?.ArXiv === 'string' ? paper.externalIds.ArXiv : undefined
  if (arxiv !== undefined) keys.push(`arxiv:${arxiv.toLowerCase().replace(/v\d+$/, '')}`)
  const pmid = paper.source === 'pubmed' ? paper.id : typeof paper.externalIds?.PubMed === 'string' ? paper.externalIds.PubMed : undefined
  if (pmid !== undefined) keys.push(`pmid:${pmid}`)
  const chineseId = paper.source === 'chinese' ? paper.id : paper.externalIds?.ChineseLiterature
  if (typeof chineseId === 'string' && chineseId.trim()) keys.push(`chinese:${chineseId.trim()}`)
  const t = titleKey(paper.title)
  if (Array.from(t).length >= MIN_TITLE_KEY) keys.push(`title:${t}`)
  // Short Chinese titles need corroboration rather than matching by title alone.
  else if (/\p{Script=Han}/u.test(t) && Array.from(t).length >= 4 && paper.year !== undefined && paper.authors[0]) {
    const author = titleKey(paper.authors[0])
    if (author) keys.push(`title-author:${t}:${paper.year}:${author}`)
  }
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
    url: base.url || other.url,
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
  const index = new Map<string, Set<number>>()
  const remember = (keys: readonly string[], position: number): void => {
    for (const key of keys) {
      if (!index.has(key)) index.set(key, new Set())
      index.get(key)!.add(position)
    }
  }
  for (const list of lists) {
    list.forEach((paper, rank) => {
      const keys = identityKeys(paper)
      let hit: number | undefined
      for (const key of keys) {
        const candidates = [...(index.get(key) ?? [])].filter((position) => {
          if (!key.startsWith('title')) return true
          const a = doiKey(merged[position]!), b = doiKey(paper)
          return a === undefined || b === undefined || a === b
        })
        // Identical titles with distinct DOIs remain separate. A title-only
        // record cannot safely choose between several such publications.
        if (candidates.length === 1) { hit = candidates[0]; break }
      }
      if (hit !== undefined) {
        merged[hit] = mergeInto(merged[hit]!, paper)
        bestRank[hit] = Math.min(bestRank[hit]!, rank)
        remember(keys, hit)
      } else {
        const stamped: Paper = compact({ ...paper, extra: compact({ ...(paper.extra ?? {}), foundIn: [paper.source] }) })
        merged.push(stamped)
        bestRank.push(rank)
        remember(keys, merged.length - 1)
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
    if (value.truncated) {
      const tools: Record<string, string> = { 'semantic-scholar': 'search_semantic', pubmed: 'search_pubmed', arxiv: 'search_arxiv', 'google-scholar': 'search_google_scholar', chinese: 'search_chinese' }
      const next = value.perSource.filter((p) => p.nextOffset !== undefined).map((p) =>
        `${tools[p.source] ?? p.source}(query=${JSON.stringify(p.query ?? value.query)}, offset=${p.nextOffset}${p.pageSize !== undefined ? `, max_results=${p.pageSize}` : ''})`)
      parts.push(next.length > 0
        ? `More results: continue with ${next.join('; ')}. Use exactly these max_results values (each platform keeps its own page size) and the same year filters; each billed request adds to the cost.`
        : 'At least one platform has more matches; refine the query or increase the requested count within its single-call limit.')
    }
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
 * @param configured - `searchSources`: the platforms a call without `sources` queries.
 */
export function applyUnifiedSearchTool(ctx: Context, runtime: Runtime, enabled: Record<UnifiedSource, boolean>, configured: readonly UnifiedSource[] = DEFAULT_SOURCES): void {
  const { limits, render, timeouts } = runtime
  const offered = UNIFIED_SOURCES.filter((s) => enabled[s])
  if (offered.length === 0) return
  const fallbackDefaults = defaultSourcesFor(configured, enabled)
  const several = fallbackDefaults.length > 1
  const capFor = (s: UnifiedSource): number => Math.min(limits.maxResultsCap, PLATFORM_CAP[s])
  const countFor = (s: UnifiedSource): number => Math.min(limitsFor(limits, runtime.resultsPerSource, s).defaultMaxResults, capFor(s))
  const pubmedHint = enabled.pubmed ? ' For biomedical, clinical, or health topics, select sources ["pubmed"] when appropriate.' : ''
  const chineseHint = enabled.chinese ? ' For Chinese-language literature, select sources ["chinese"]. When combining it with international sources, use chinese_query for Chinese keywords while query serves the other sources.' : ''
  // A user who picked several default platforms asked for them together; the
  // description must not tell the model to stay on one.
  const lead = several
    ? `Search academic papers; by default it queries ${fallbackDefaults.map((s) => SOURCE_LABEL[s]).join(' + ')} together, as the user configured, and merges the results.${pubmedHint} Pass sources only to change the platforms for one call.`
    : `Search academic papers on one platform by default to limit credit use.${pubmedHint} Select multiple sources only for an explicit cross-platform request or when a single source is insufficient.`

  ctx.tools.register(defineTool({
    name: 'search_papers',
    description: `${lead}${chineseHint} Multiple sources are merged by DOI / arXiv id / PMID / document id / normalized title, with multi-platform hits ranked first. Short Chinese titles also need the same year and first author; differently translated titles without shared identifiers may remain separate. Charges add up across billed API requests. Do not repeat the same query on already searched platforms via their individual tools, as that repeats the charge. Available platforms: ${offered.map((s) => SOURCE_LABEL[s]).join(', ')} (default ${fallbackDefaults.map((s) => SOURCE_LABEL[s]).join(' + ')}${several ? '' : ' only'}; arXiv is free, the others cost credits, Google Scholar is slowest and bills per page).`,
    parameters: {
      query: { type: 'string', required: true, description: 'Topic or keywords; sent as-is to each selected platform unless chinese_query overrides the Chinese source.' },
      chinese_query: { type: 'string', description: 'Optional Chinese keywords for sources ["chinese"], useful when query is English. If omitted, that source also uses query. Use up to 300 characters and 20 concepts; spaces mean all concepts must match.' },
      sources: { type: 'array', items: { type: 'string', enum: offered }, description: `Platforms to query (default ${JSON.stringify(fallbackDefaults)}).${several ? '' : ' Prefer one source; select multiple only when broader coverage is requested or needed.'} Each billed source adds to the cost.` },
      max_results_per_source: { type: 'integer', description: `One count applied to every selected platform. Omit it unless the user names a number of results: each platform then uses the user's configured page size (${offered.map((s) => `${SOURCE_LABEL[s]} ${countFor(s)}`).join(', ')}). A request for N pages means N calls at these page sizes, not a count of 10. Each platform caps it at its own maximum (${offered.map((s) => `${SOURCE_LABEL[s]} ${capFor(s)}`).join(', ')}).` },
      year_from: { type: 'integer', description: 'Earliest publication year.' },
      year_to: { type: 'integer', description: 'Latest publication year.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatUnified(value, render.abstractMaxChars) }],
      presentationMeta: (_args, value) => researchMeta(value, runtime.enabledTools, paperListMeta(value.papers, value.truncated, value.credits)),
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
      // An explicit count applies to every platform; otherwise each uses its own default.
      const per = (s: UnifiedSource): number => boundResults(args.max_results_per_source, limitsFor(limits, runtime.resultsPerSource, s), PLATFORM_CAP[s])
      if (args.year_from !== undefined && args.year_to !== undefined && args.year_from > args.year_to) throw new Error('year_from must not be later than year_to')
      const s2Year = args.year_from !== undefined || args.year_to !== undefined ? `${args.year_from ?? ''}-${args.year_to ?? ''}` : undefined
      const runners: Record<UnifiedSource, () => Promise<PaperSearchValue>> = {
        'semantic-scholar': () => runSemanticSearch(runtime, { query, limit: per('semantic-scholar'), year: s2Year }, exec.signal, exec.agent),
        'pubmed': () => runPubmedSearch(runtime, { query, limit: per('pubmed'), minDate: args.year_from !== undefined ? String(args.year_from) : undefined, maxDate: args.year_to !== undefined ? String(args.year_to) : undefined }, exec.signal, exec.agent),
        'arxiv': async () => {
          const page = await runArxivSearch(runtime, { query, limit: per('arxiv'), dateFrom: args.year_from !== undefined ? `${args.year_from}-01-01` : undefined }, exec.signal)
          // arXiv has no upper date bound in the query syntax; apply it client-side.
          return args.year_to !== undefined ? { ...page, papers: page.papers.filter((p) => p.year === undefined || p.year <= args.year_to!) } : page
        },
        'google-scholar': () => runScholarSearch(runtime, { query, wanted: per('google-scholar'), yearFrom: args.year_from, yearTo: args.year_to }, exec.signal, exec.agent),
        'chinese': () => runChineseSearch(runtime, { query: args.chinese_query ?? query, limit: per('chinese'), yearFrom: args.year_from, yearTo: args.year_to }, exec.signal, exec.agent),
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
          perSource.push(compact({
            source, count: outcome.value.papers.length,
            total: outcome.value.total > outcome.value.papers.length ? outcome.value.total : undefined,
            query: outcome.value.query !== query ? outcome.value.query : undefined,
            pageSize: per(source),
            nextOffset: outcome.value.nextOffset,
          }))
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
