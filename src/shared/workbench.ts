/** Browser/host contract for searches explicitly started in the workbench. */
export const WORKBENCH_ROUTE = '/api/ai4scholar/workbench'
export const WORKBENCH_ID = 'ai4scholar.workbench'
export const WORKBENCH_SOURCES = [
  'semantic-scholar',
  'snippets',
  'google-scholar',
  'pubmed',
  'google-patents',
  'chinese',
  'arxiv',
  'biorxiv',
  'medrxiv',
] as const
export type WorkbenchSource = (typeof WORKBENCH_SOURCES)[number]
export const SEARCH_TOOLS: Record<WorkbenchSource, string> = {
  'semantic-scholar': 'search_semantic',
  snippets: 'search_semantic_snippets',
  'google-scholar': 'search_google_scholar',
  pubmed: 'search_pubmed',
  'google-patents': 'search_google_patents',
  chinese: 'search_chinese',
  arxiv: 'search_arxiv',
  biorxiv: 'search_biorxiv',
  medrxiv: 'search_medrxiv',
}
export const isPreprint = (source: WorkbenchSource): boolean => ['arxiv', 'biorxiv', 'medrxiv'].includes(source)
export const isCategorySource = (source: WorkbenchSource): boolean => source === 'biorxiv' || source === 'medrxiv'
export const hasYearFilter = (source: WorkbenchSource): boolean =>
  ['semantic-scholar', 'google-scholar', 'pubmed', 'chinese'].includes(source)
export const hasDateSort = (source: WorkbenchSource): boolean =>
  ['google-scholar', 'pubmed', 'chinese', 'arxiv', 'google-patents'].includes(source)

export interface WorkbenchRequest {
  source: WorkbenchSource
  query: string
  limit: number
  yearFrom?: number
  yearTo?: number
  days?: number
  sort?: 'relevance' | 'date'
  offset?: number
  page?: number
}
export interface WorkbenchCatalog {
  sources: Array<{ id: WorkbenchSource; defaultLimit: number; maxLimit: number; needsKey: boolean }>
  defaultSource: WorkbenchSource | undefined
}
export interface WorkbenchItem {
  id: string
  source: WorkbenchSource
  kind: 'paper' | 'snippet' | 'patent'
  title: string
  authors: string[]
  year?: number
  venue?: string
  citationCount?: number
  doi?: string
  url?: string
  pdfUrl?: string
  abstract?: string
  section?: string
  facts?: Array<{ label: string; value: string }>
}
export interface WorkbenchResult {
  source: WorkbenchSource
  query: string
  items: WorkbenchItem[]
  total?: number
  next?: { offset?: number; page?: number }
  warning?: string
  credits?: { charged?: number; remaining?: number }
}
export type WorkbenchResponse<T> = { ok: true; value: T } | { ok: false; code: string; error: string }
