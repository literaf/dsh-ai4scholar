/** One user-facing entry per research activity; arguments are always natural language. */
export interface ResearchCommand {
  name: string
  title: string
  example: string
  tools: readonly string[]
  /** At least one primary operation must exist; lookup helpers alone are insufficient. */
  requiresAny?: readonly string[]
  /** Limit research calls to this activity, including its identifier-resolution helpers. */
  restrictTools?: boolean
  source?: string
  guidance: string
}

const PAPER_LOOKUP_TOOLS = ['search_semantic_paper_match', 'get_semantic_paper_detail', 'get_pubmed_paper_detail'] as const
const READ_TOOLS = ['read_semantic_paper', 'read_arxiv_paper', 'read_biorxiv_paper', 'read_medrxiv_paper', 'read_by_doi'] as const
const PDF_TOOLS = ['download_semantic', 'download_arxiv', 'download_biorxiv', 'download_medrxiv', 'download_by_doi'] as const
const CITATION_TOOLS = ['get_semantic_citations', 'get_pubmed_citations', 'search_google_scholar'] as const
const RELATED_TOOLS = ['get_semantic_recommendations_for_paper', 'get_semantic_recommendations', 'get_pubmed_related'] as const
const RESOLVE_PAPER = 'Resolve the selected paper from current conversation results or supplied title/DOI/platform ID. Reuse known identifiers before making lookup calls. Keep platform IDs distinct; never guess or reuse one platform ID on another. For a Semantic Scholar snippet, use its paperId with the CorpusId: prefix (or prefix its corpusId); never send the bare numeric corpusId to a graph endpoint. Ask for clarification if the paper is ambiguous. Label the actual source and explain any source change. '

export const RESEARCH_COMMANDS: readonly ResearchCommand[] = [
  { name: 'ai4s-search', title: '统一论文检索', example: '同时用 Google Scholar 和 Semantic Scholar 查固态电池，合并去重', tools: ['search_papers'], guidance: 'Use search_papers. Omit sources and max_results to inherit settings unless the user specifies them. Preserve source labels and deduplicate. Explicit multi-source requests select only those sources.' },
  { name: 'ai4s-google', title: 'Google Scholar 论文', example: '固态电池，2022 年以来的 10 篇', source: 'google-scholar', tools: ['search_google_scholar', 'get_google_scholar_citation'], guidance: 'Google Scholar is the selected source, not general web search. Use its year range, review_only, date sorting, cites or cluster options as requested. Preserve string IDs. Cite export requires externalIds.GoogleScholar.' },
  { name: 'ai4s-semantic', title: 'Semantic Scholar 论文', example: '找电池退化研究；需要时按引用量排序或查全文片段', source: 'semantic-scholar', tools: ['search_semantic', 'search_semantic_bulk', 'search_semantic_snippets'], guidance: 'Use Semantic Scholar. Choose ordinary relevance search, bulk sortable search for large sets, or full-text snippets. Continue bulk pages with the exact nextToken, original query and filters, within 15 minutes.' },
  { name: 'ai4s-snippets', title: '全文片段搜索', example: '查找固态电池界面阻抗的实验描述，返回 5 段', source: 'semantic-scholar', tools: ['search_semantic_snippets'], guidance: 'Use search_semantic_snippets to locate matching passages in Semantic Scholar indexed titles, abstracts and body text. Return passages with their source paper and available section/kind. These are excerpts, not complete papers. Preserve the returned paperId including its CorpusId: prefix for later graph queries; do not label a bare corpusId as a paperId. Do not replace this with ordinary paper search or full-paper reading; report empty results honestly.' },
  { name: 'ai4s-pubmed', title: 'PubMed 生物医学论文', example: '近五年 CAR-T 治疗的临床研究，10 篇', source: 'pubmed', tools: ['search_pubmed'], guidance: 'Use PubMed. Translate the requested biomedical criteria into a PubMed query and supported filters.' },
  { name: 'ai4s-arxiv', title: 'arXiv 预印本', example: '最近的扩散模型论文，10 篇', source: 'arxiv', tools: ['search_arxiv'], guidance: 'Use arXiv, including its supported query and sort options. Label results as preprints.' },
  { name: 'ai4s-chinese', title: '中文文献', example: '近三年的固态电池综述和学位论文', source: 'chinese', tools: ['search_chinese'], guidance: 'Use Chinese keywords and supported document-type, year and sort filters. These results are metadata and abstracts, not full-text downloads.' },
  { name: 'ai4s-biorxiv', title: 'bioRxiv 预印本', example: '最近 7 天的神经科学预印本', source: 'biorxiv', tools: ['search_biorxiv'], guidance: 'Browse bioRxiv by category and date window. This API is not a keyword search engine. Map a clear topic to a supported category; ask for category/time if unclear. Do not claim exhaustive keyword matches.' },
  { name: 'ai4s-medrxiv', title: 'medRxiv 预印本', example: '最近 7 天的流行病学预印本', source: 'medrxiv', tools: ['search_medrxiv'], guidance: 'Browse medRxiv by category and date window, not free-text keyword search. Ask for category/time when unclear. Label results as preprints.' },
  { name: 'ai4s-patents', title: 'Google Patents 专利', example: '宁德时代近五年在中国申请的固态电池专利', source: 'google-patents', tools: ['search_google_patents'], guidance: 'Search patents separately from academic papers. Interpret assignee, inventor, country, status and date bounds. Distinguish filing, publication, priority and grant dates. Show publication numbers, parties and returned detail/PDF links.' },
  { name: 'ai4s-author', title: '作者与学者', example: '用 Semantic Scholar 查 Geoffrey Hinton，先确认作者身份，再看资料和代表论文', tools: ['search_semantic_authors', 'get_semantic_author_detail', 'get_semantic_author_papers', 'get_semantic_author_batch', 'get_semantic_paper_authors', 'search_google_scholar_profiles', 'get_google_scholar_author'], guidance: 'Default to Semantic Scholar; use Google Scholar when requested. Search candidates first and disambiguate by affiliation rather than guessing. Keep platform IDs and metrics separate. Google author articles are a partial list and have no h-index. Batch/compare authors only when identities are resolved.' },
  { name: 'ai4s-paper', title: '论文详情与追踪', example: '读刚才第三篇论文，重点解释研究方法', tools: ['search_semantic_paper_match', 'get_semantic_paper_detail', 'get_semantic_paper_batch', 'get_pubmed_paper_detail', 'get_pubmed_paper_batch', 'get_semantic_citations', 'get_semantic_references', 'get_pubmed_citations', 'get_semantic_recommendations', 'get_semantic_recommendations_for_paper', 'get_pubmed_related', 'get_semantic_paper_authors', 'read_semantic_paper', 'read_arxiv_paper', 'read_biorxiv_paper', 'read_medrxiv_paper', 'read_by_doi', 'download_semantic', 'download_arxiv', 'download_biorxiv', 'download_medrxiv', 'download_by_doi', 'search_google_scholar', 'get_google_scholar_citation'], guidance: 'Resolve the referenced paper from current conversation results, title, DOI or platform ID. If ambiguous, clarify. Support detail/title match/batch, full text, PDF links, incoming citations, outgoing references, related papers and authors. Google cites/cluster and formatted references need returned Google IDs; do not invent them. download_* returns a link, not a file saved locally. Report any source switch needed for an operation.' },
  { name: 'ai4s-references', title: '参考文献 · 它引用了谁', example: '查刚才第一篇论文引用的参考文献，返回 10 篇', tools: ['get_semantic_references', ...PAPER_LOOKUP_TOOLS], requiresAny: ['get_semantic_references'], restrictTools: true, guidance: RESOLVE_PAPER + 'Use get_semantic_references for OUTGOING references: papers cited by the selected paper. This operation uses the Semantic Scholar citation graph. Do not substitute incoming citations, recommendations, citation formatting, or prose citation insertion. Preserve pagination and available citation contexts/intents.' },
  { name: 'ai4s-citations', title: '被引论文 · 谁引用了它', example: '查哪些论文引用了刚才第一篇，返回 10 篇', tools: [...CITATION_TOOLS, ...PAPER_LOOKUP_TOOLS], requiresAny: CITATION_TOOLS, restrictTools: true, guidance: RESOLVE_PAPER + 'Find INCOMING citations: papers that cite the selected paper. Prefer its original source: get_semantic_citations, get_pubmed_citations, or search_google_scholar with the returned GoogleScholarCites identifier. A Google result ID is not its cites identifier; use a title search to obtain the latter if missing. Never substitute the paper reference list. Preserve pagination and supported filters.' },
  { name: 'ai4s-related', title: '相似与推荐论文', example: '找与刚才第一篇相关的 5 篇论文', tools: [...RELATED_TOOLS, ...PAPER_LOOKUP_TOOLS], requiresAny: RELATED_TOOLS, restrictTools: true, guidance: RESOLVE_PAPER + 'Use Semantic Scholar single-paper recommendations or PubMed related papers for one seed. Use get_semantic_recommendations for explicit multiple positive/negative seeds after resolving their identities. Present related/recommended papers as recommendations, not as a citation relationship or an exhaustive topic search.' },
  { name: 'ai4s-read', title: '读取论文全文', example: '读刚才第三篇的全文，重点解释研究方法', tools: [...READ_TOOLS, ...PAPER_LOOKUP_TOOLS, 'search_google_scholar'], requiresAny: READ_TOOLS, restrictTools: true, guidance: RESOLVE_PAPER + 'Use the supported read_* tool for the paper source or DOI. Respect requested offset/max_chars and report any returned slice/truncation; read further slices only as needed. Distinguish extracted full text from abstracts and snippets. If full text is unavailable, explain the failure instead of presenting an abstract as full text.' },
  { name: 'ai4s-pdf', title: '获取 PDF 链接', example: '获取刚才第三篇论文的 PDF 链接', tools: [...PDF_TOOLS, ...PAPER_LOOKUP_TOOLS, 'search_google_scholar'], requiresAny: PDF_TOOLS, restrictTools: true, guidance: RESOLVE_PAPER + 'Reuse a valid PDF URL already returned in the conversation; otherwise use the appropriate download_* tool to resolve a PDF link. These tools return URLs, not local files. Do not claim a file was saved or downloaded to disk without a separate successful file operation. Explain when no accessible PDF is available.' },
  { name: 'ai4s-export', title: '引用格式与 BibTeX', example: '获取刚才第一篇的 APA 引用格式和 BibTeX 链接', source: 'google-scholar', tools: ['get_google_scholar_citation', 'search_google_scholar'], requiresAny: ['get_google_scholar_citation'], guidance: RESOLVE_PAPER + 'Use get_google_scholar_citation for an existing paper reference and export links. It requires externalIds.GoogleScholar from Google Scholar search, NOT a DOI, URL, cites/cluster ID, or author-page citationId. Reuse the known native result ID; otherwise search the exact title/DOI, verify the match, then export. Return only supplied citation styles and export links; never fabricate BibTeX or claim a file was saved. This is not auto_cite, which inserts references into prose.' },
  { name: 'ai4s-cite', title: '为文字补充引用', example: '为这段文字补充真实参考文献，采用 APA 格式：……', tools: ['auto_cite'], guidance: 'Use auto_cite on the user-provided prose, respecting requested style and preprint preference; omit unspecified options to inherit settings. If no prose was supplied, ask for it without making a paid call. Citation formatting for a known paper belongs to ai4s-export.' },
  { name: 'ai4s-draw', title: '科研绘图', example: '画一张固态电池结构示意图，突出离子传输路径', tools: ['sci_draw'], guidance: 'Use sci_draw. Select smart/generate/edit/style/compose/iterate/critic/svg/vectorize from the request. Preserve attached images. Ask for a missing required image instead of generating an unrelated substitute. Omit unspecified model/size to inherit settings; show returned media.' },
]

/** Specific follow-up routes; older saved cards may still use /ai4s-paper. */
export const PAPER_ACTION_COMMANDS: Readonly<Record<string, string>> = {
  read: 'ai4s-read', pdf: 'ai4s-pdf', references: 'ai4s-references',
  citations: 'ai4s-citations', related: 'ai4s-related', citation: 'ai4s-export',
}

export const RESEARCH_TOOL_NAMES = new Set(RESEARCH_COMMANDS.flatMap((c) => [...c.tools]))
/** Leave media/full-text/generation tools to their host-owned presentation. */
export const RESULT_CARD_TOOLS = [...RESEARCH_TOOL_NAMES].filter((name) => !/^(read_|download_)/.test(name)
  && !['auto_cite', 'sci_draw', 'search_semantic_snippets', 'get_google_scholar_citation'].includes(name))

export function commandHelp(command: ResearchCommand): string {
  return `${command.title}\n用自然语言描述需求即可。\n例如：/${command.name} ${command.example}`
}

export function commandIndex(commands: readonly ResearchCommand[]): string {
  return ['用斜杠选能力，后面接自然语言：', ...commands.map((c) => `/${c.name}  ${c.title}`), '例如：/ai4s-google 固态电池，2022 年以来的 10 篇',
    '论文结果可继续追问：查看详情、读全文、获取 PDF、谁引用了它、它引用了谁、相似论文、查看作者。',
    '作者结果可继续追问：查看资料、论文列表、比较作者。'].join('\n')
}
