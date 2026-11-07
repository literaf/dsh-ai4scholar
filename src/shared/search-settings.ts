/**
 * The preferences the settings page edits, shared by the Node half (the
 * Config schema and the tools) and the browser half (the form), so both name
 * the same fields, platforms, and limits.
 */

/** Platforms `search_papers` can fan out to, in merge priority order (richest metadata first). */
export const UNIFIED_SOURCES = ['semantic-scholar', 'pubmed', 'arxiv', 'google-scholar', 'chinese'] as const
export type UnifiedSource = (typeof UNIFIED_SOURCES)[number]

/** Platforms queried when neither the model nor the user picked any. */
export const DEFAULT_SOURCES: readonly UnifiedSource[] = ['semantic-scholar']

/** Loader entry id the bundle patch inserts; the Host serves the form under it. */
export const ENTRY_ID = 'ai4scholar'

/**
 * Most results one search may ask a platform for in a single billed request.
 * Semantic Scholar, PubMed, arXiv, and Chinese literature return up to 100 in one request;
 * Google Scholar returns one page of 10 and is billed per page, so one call
 * is capped at 10 (the model pages with offset for more).
 */
export const PLATFORM_CAP: Record<UnifiedSource, number> = {
  'semantic-scholar': 100,
  'pubmed': 100,
  'arxiv': 100,
  'google-scholar': 10,
  'chinese': 100,
}

/** Default results per platform, when neither the user nor the model sets one. */
export const DEFAULT_RESULTS = 10

/** Full-text slice bounds, in characters. */
export const READ_MIN = 2_000
export const READ_MAX = 200_000

/** Largest abstract length the page accepts, in characters. */
export const ABSTRACT_LIMIT = 5_000

/** Reference formats auto_cite can produce. */
export const CITE_STYLES = ['ieee', 'apa', 'vancouver', 'nature', 'numbered'] as const
export type CiteStyle = (typeof CITE_STYLES)[number]

/** sci_draw models, fastest first. */
export const DRAW_MODELS = ['flash', 'flash31', 'pro', 'gptimage'] as const
export type DrawModel = (typeof DRAW_MODELS)[number]

/** sci_draw output resolutions. */
export const DRAW_SIZES = ['1K', '2K', '4K'] as const
export type DrawSize = (typeof DRAW_SIZES)[number]

/** Per-platform default counts; an absent platform falls back to `defaultMaxResults`. */
export type ResultsPerSource = Partial<Record<UnifiedSource, number>>

/** The fields the settings page edits, as the Host serves them. */
export interface SearchSettings {
  searchSources: UnifiedSource[]
  resultsPerSource: Record<UnifiedSource, number>
  abstractMaxChars: number
  showCredits: boolean
  readMaxChars: number
  citeStyle: CiteStyle
  citeExcludePreprints: boolean
  drawModel: DrawModel
  drawImageSize: DrawSize
}
