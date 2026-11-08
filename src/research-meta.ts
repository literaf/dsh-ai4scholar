import { isRecord, str } from './paper.js'
import type { JsonValue } from './paper.js'
import { PAPER_ACTION_COMMANDS } from './shared/commands.js'

interface Action { label: string; prompt?: string; url?: string }
interface Item { title: string; source: string; identity: string; summary: string; url?: string; actions: Action[] }
const labels: Record<string, string> = { 'semantic-scholar': 'Semantic Scholar', 'google-scholar': 'Google Scholar', pubmed: 'PubMed', arxiv: 'arXiv', biorxiv: 'bioRxiv', medrxiv: 'medRxiv', chinese: '中文文献', 'google-patents': 'Google Patents' }
const rows = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(isRecord) : []
const joined = (v: unknown): string => Array.isArray(v) ? v.filter((x) => typeof x === 'string').join('、') : typeof v === 'string' ? v : ''
const httpUrl = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) ? u.href : undefined } catch { return undefined }
}

/** Persist only the compact facts/actions needed to replay a result card. */
export function researchMeta(value: unknown, enabled: ReadonlySet<string>, base: JsonValue): JsonValue {
  if (!isRecord(value)) return base
  const items: Item[] = []
  const compareAuthors: string[] = []
  for (const p of [...rows(value.papers), ...(isRecord(value.paper) ? [value.paper] : [])]) {
    const title = str(p, 'title'); const source = str(p, 'source'); const id = str(p, 'id')
    if (!title || !source || !id) continue
    const sourceLabel = labels[source] ?? source
    const doi = str(p, 'doi')
    const ids = isRecord(p.externalIds) ? p.externalIds : {}
    const ref = `《${title}》（${sourceLabel}，ID：${id}${doi ? `，DOI：${doi}` : ''}）`
    const actions: Action[] = []
    const add = (label: string, tool: string | undefined, request: string): void => { if (tool && enabled.has(tool)) actions.push({ label, prompt: `/${PAPER_ACTION_COMMANDS[label] ?? 'ai4s-paper'} ${request}` }) }
    const detail = source === 'semantic-scholar' ? 'get_semantic_paper_detail' : source === 'pubmed' ? 'get_pubmed_paper_detail' : undefined
    add('details', detail, `查看${ref}的详情`)
    const reader = ({ 'semantic-scholar': 'read_semantic_paper', arxiv: 'read_arxiv_paper', biorxiv: 'read_biorxiv_paper', medrxiv: 'read_medrxiv_paper' } as Record<string, string>)[source]
    add('read', reader && enabled.has(reader) ? reader : doi ? 'read_by_doi' : undefined, `读${ref}的全文，解释研究方法和主要结论`)
    const pdf = httpUrl(p.pdfUrl)
    if (pdf) actions.push({ label: 'pdf', url: pdf })
    else {
      const downloader = ({ 'semantic-scholar': 'download_semantic', arxiv: 'download_arxiv', biorxiv: 'download_biorxiv', medrxiv: 'download_medrxiv' } as Record<string, string>)[source]
      add('pdf', downloader && enabled.has(downloader) ? downloader : doi ? 'download_by_doi' : undefined, `获取${ref}的 PDF 链接`)
    }
    if (source === 'semantic-scholar') {
      add('citations', 'get_semantic_citations', `查哪些论文引用了${ref}`)
      add('references', 'get_semantic_references', `查${ref}引用的参考文献`)
      add('related', 'get_semantic_recommendations_for_paper', `找与${ref}相似的论文`)
      add('authors', 'get_semantic_paper_authors', `查看${ref}的作者资料`)
    } else if (source === 'pubmed') {
      add('citations', 'get_pubmed_citations', `查哪些论文引用了${ref}`)
      add('related', 'get_pubmed_related', `找与${ref}相关的论文`)
    } else if (source === 'google-scholar') {
      if (typeof ids.GoogleScholarCites === 'string') add('citations', 'search_google_scholar', `在 Google Scholar 中查哪些论文引用了${ref}，被引查询标识为 ${ids.GoogleScholarCites}`)
      if (typeof ids.GoogleScholar === 'string') add('citation', 'get_google_scholar_citation', `获取${ref}的引用格式，Google Scholar 原始论文 ID 为 ${ids.GoogleScholar}`)
      if (typeof ids.GoogleScholarCluster === 'string') add('versions', 'search_google_scholar', `查${ref}的全部版本，Google Scholar 版本标识为 ${ids.GoogleScholarCluster}`)
    }
    items.push({ title, source: sourceLabel, identity: id, summary: [joined(p.authors), str(p, 'year'), str(p, 'venue'), typeof p.citationCount === 'number' ? `${p.citationCount} citations` : ''].filter(Boolean).join(' · '), ...(httpUrl(p.url) ? { url: httpUrl(p.url)! } : {}), actions })
  }
  for (const p of [...rows(value.authors), ...(isRecord(value.author) ? [value.author] : [])]) {
    const title = str(p, 'name'); const id = str(p, 'id') ?? str(p, 'authorId'); const source = str(p, 'source') ?? 'semantic-scholar'
    if (!title) continue
    const sourceLabel = labels[source] ?? source
    const google = source === 'google-scholar'
    const detailTool = google ? 'get_google_scholar_author' : 'get_semantic_author_detail'
    const papersTool = google ? 'get_google_scholar_author' : 'get_semantic_author_papers'
    const actions: Action[] = []
    if (id && enabled.has(detailTool)) actions.push({ label: 'profile', prompt: `/ai4s-author 查看 ${title} 的 ${sourceLabel} 学者资料，作者 ID：${id}` })
    if (id && enabled.has(papersTool)) actions.push({ label: 'papers', prompt: `/ai4s-author 查看 ${title} 在 ${sourceLabel} 上的论文，作者 ID：${id}` })
    if (id && enabled.has(detailTool)) compareAuthors.push(`${title}（${sourceLabel}，作者 ID：${id}）`)
    items.push({ title, source: sourceLabel, identity: id ?? '', summary: [joined(p.affiliations), typeof p.citationCount === 'number' ? `${p.citationCount} citations` : '', typeof p.paperCount === 'number' ? `${p.paperCount} papers` : '', typeof p.hIndex === 'number' ? `h-index ${p.hIndex}` : '', joined(p.interests)].filter(Boolean).join(' · '), ...(httpUrl(p.url) ? { url: httpUrl(p.url)! } : {}), actions })
  }
  for (const p of rows(value.patents)) {
    const title = str(p, 'title'); if (!title) continue
    const url = httpUrl(p.url); const pdf = httpUrl(p.pdfUrl)
    items.push({ title, source: 'Google Patents', identity: str(p, 'publicationNumber') ?? str(p, 'patentId') ?? '', summary: [str(p, 'inventor'), str(p, 'assignee'), p.filingDate ? `申请 ${p.filingDate}` : '', p.publicationDate ? `公开 ${p.publicationDate}` : '', p.grantDate ? `授权 ${p.grantDate}` : ''].filter(Boolean).join(' · '), ...(url ? { url } : {}), actions: [...(url ? [{ label: 'details', url }] : []), ...(pdf ? [{ label: 'pdf', url: pdf }] : [])] })
  }
  if (!items.length) return base
  return { ...(isRecord(base) ? base as Record<string, JsonValue> : {}), ai4s: { version: 1, items: items as unknown as JsonValue,
    ...(compareAuthors.length > 1 ? { compare: `/ai4s-author 比较以下作者的研究方向和引用指标，分别标明数据来源：${compareAuthors.join('；')}` } : {}),
  } }
}
