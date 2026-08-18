/**
 * The system-prompt guidance registered beside the tools. Kept short: it names
 * the tool families, when to reach for each, and how to cite.
 * @module dsh-ai4scholar/prompt
 */

/** Which tool families the composition enabled. */
export interface EnabledFamilies {
  semanticScholar: boolean
  pubmed: boolean
  googleScholar: boolean
  arxiv: boolean
  biorxiv: boolean
  doi: boolean
  fullText: boolean
  autoCite: boolean
  sciDraw: boolean
  credits: boolean
  unified: boolean
}

/**
 * Build the guidance text for the enabled families.
 * @param enabled - the families whose tools were registered.
 * @returns the section text, or `undefined` when nothing is enabled.
 */
export function buildGuidance(enabled: EnabledFamilies): string | undefined {
  const lines: string[] = []
  const anySearch = enabled.semanticScholar || enabled.pubmed || enabled.googleScholar || enabled.arxiv
  if (enabled.unified && anySearch) {
    // Name only the billed search tools that are actually mounted: this line
    // must never tell the model about a tool the composition disabled.
    const billed = [
      enabled.semanticScholar ? 'search_semantic' : undefined,
      enabled.pubmed ? 'search_pubmed' : undefined,
      enabled.googleScholar ? 'search_google_scholar' : undefined,
    ].filter((name) => name !== undefined)
    const repeat = billed.length > 0
      ? ` It already covers the platform tools, and re-running the same query through ${billed.join(' / ')} bills those credits a second time for the same papers.`
      : ''
    lines.push(`- search_papers: one call queries several platforms (default Semantic Scholar + PubMed) and merges duplicates, ranking papers found on more than one platform first. For a plain topic search make this the ONLY search call.${repeat} Want more platforms in the sweep? Add them via sources in the same call. Reach for a platform search tool only for what search_papers lacks: its filters, sorting, paging, or a follow-up query.`)
  }
  // Full-text tools exist only under a family that ships PDFs.
  const fullText = enabled.fullText && (enabled.semanticScholar || enabled.arxiv || enabled.biorxiv || enabled.doi)
  if (enabled.semanticScholar) {
    lines.push('- Semantic Scholar (all fields; costs credits): search_semantic is the default paper search; search_semantic_bulk for large sets; search_semantic_paper_match resolves a known title; search_semantic_snippets finds passages inside full texts; get_semantic_paper_detail / get_semantic_paper_batch fetch metadata and abstracts; get_semantic_citations / get_semantic_references walk the citation graph; search_semantic_authors / get_semantic_author_detail / get_semantic_author_papers / get_semantic_paper_authors / get_semantic_author_batch cover authors; get_semantic_recommendations(_for_paper) suggest similar papers.' + (fullText ? ' download_semantic / read_semantic_paper fetch open-access PDFs.' : ''))
  }
  if (enabled.pubmed) {
    lines.push('- PubMed (biomedical, clinical; costs credits): search_pubmed, get_pubmed_paper_detail, get_pubmed_paper_batch, get_pubmed_citations, get_pubmed_related. Prefer it for medicine, biology, and health questions.')
  }
  if (enabled.googleScholar) {
    lines.push('- search_google_scholar (broadest coverage, cited-by counts; costs credits, slower): use when other tools miss or Google Scholar counts are wanted.')
  }
  if (enabled.arxiv) {
    lines.push('- arXiv (free): search_arxiv for preprints in physics, math, CS, stats, q-bio; download_arxiv gives the PDF link' + (fullText ? '; read_arxiv_paper returns the full text.' : '.'))
  }
  if (enabled.biorxiv) {
    lines.push('- bioRxiv / medRxiv (free): search_biorxiv / search_medrxiv list recent preprints by category and date window (not free-text search)' + (fullText ? '; read_biorxiv_paper / read_medrxiv_paper return full text.' : '.'))
  }
  if (enabled.doi) {
    lines.push('- download_by_doi' + (fullText ? ' / read_by_doi' : '') + ' (free) resolve any DOI to a PDF; paywalled publishers only work on a network with institutional access.')
  }
  if (fullText) {
    lines.push('- Full-text tools return the text in slices (offset/max_chars); read further slices only when the question needs them.')
  }
  if (enabled.autoCite) {
    lines.push('- auto_cite (costs credits, 20–90 s): when the user pastes academic text and asks for citations/references, call it directly and return the annotated text plus reference list.')
  }
  if (enabled.sciDraw) {
    lines.push('- sci_draw (costs credits, 30–90 s): scientific figures — generate, edit, style, compose, critique, SVG, vectorize. Tell the user it takes about a minute before calling; then show the returned image URL as a Markdown image.')
  }
  if (enabled.credits) {
    lines.push('- get_ai4scholar_credits (free) reports the credit balance and what this session has spent; results of billed tools already show credits charged/remaining.')
  }
  const anyBilled = enabled.semanticScholar || enabled.pubmed || enabled.googleScholar || enabled.autoCite || enabled.sciDraw
  if (anyBilled) {
    lines.push('- After a turn in which billed AI4Scholar tools ran, end your reply with one short line stating the credits those calls cost and the remaining balance (both appear at the end of each billed tool result), in the user\'s language.')
  }
  if (lines.length === 0) return undefined
  return [
    'AI4Scholar literature tools are available:',
    ...lines,
    'For literature questions, call the tools instead of guessing; combine platforms when coverage matters. Present findings in Markdown and cite each paper by title with its DOI or link. Never fabricate papers, authors, identifiers, or figures that a tool did not return.',
  ].join('\n')
}
