import { afterEach, describe, expect, it } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { ARXIV_FEED } from './fixtures-extended.js'
import { PUBMED_SEARCH_RESPONSE, S2_SEARCH_RESPONSE } from './fixtures.js'
import { mount, runContext, stubFetch, textOf } from './helpers.js'
import type { StubbedFetch } from './helpers.js'
import { identityKeys, mergePaperLists, titleKey } from '../src/tools/unified.js'
import type { Paper } from '../src/paper.js'

let stub: StubbedFetch | undefined
afterEach(() => {
  stub?.restore()
  stub = undefined
})

const agent = {}
const ctxWithAgent = () => ({ ...runContext(), agent } as unknown as ReturnType<typeof runContext>)
const paper = (over: Partial<Paper> & Pick<Paper, 'source' | 'id' | 'title'>): Paper => ({ authors: [], url: `https://x/${over.id}`, ...over })

describe('merge logic', () => {
  it('derives identity keys from DOI, arXiv id, PMID, and title', () => {
    expect(titleKey('Attention Is All You Need!')).toBe('attentionisallyouneed')
    const keys = identityKeys(paper({ source: 'semantic-scholar', id: 's2', title: 'Attention Is All You Need', doi: '10.48550/arXiv.1706.03762', externalIds: { ArXiv: '1706.03762v7', PubMed: '123' } }))
    expect(keys).toEqual(['doi:10.48550/arxiv.1706.03762', 'arxiv:1706.03762', 'pmid:123', 'title:attentionisallyouneed'])
    expect(identityKeys(paper({ source: 'arxiv', id: '1706.03762', title: 'Short' }))).toEqual(['arxiv:1706.03762'])
    expect(identityKeys(paper({ source: 'pubmed', id: '99', title: 'Some reasonably long title here' }))).toEqual(['pmid:99', 'title:somereasonablylongtitlehere'])
  })

  it('normalizes titles across scripts and Unicode forms', () => {
    // The same paper arrives composed from one platform and decomposed from
    // another. Before NFKC these produced 'rseaux…' and 'reseaux…' — two keys,
    // one paper listed twice.
    const composed = 'R\u00e9seaux de neurones convolutifs profonds'
    const decomposed = 'Re\u0301seaux de neurones convolutifs profonds'
    expect(composed).not.toBe(decomposed)
    expect(titleKey(composed)).toBe(titleKey(decomposed))
    expect(titleKey(composed)).toBe('réseauxdeneuronesconvolutifsprofonds')

    // Full-width forms fold to their half-width equivalents.
    expect(titleKey('ＡＩ在科研中的应用')).toBe(titleKey('AI在科研中的应用'))

    // Non-Latin scripts survive. The old rule left these empty, which dropped
    // the title key entirely and left DOI as the only way to dedup them.
    expect(titleKey('Нейронные сети глубокого обучения')).toBe('нейронныесетиглубокогообучения')
    expect(titleKey('Μελέτη των νευρωνικών δικτύων')).toBe('μελέτητωννευρωνικώνδικτύων')
    expect(identityKeys(paper({ source: 'google-scholar', id: 'g1', title: 'Нейронные сети глубокого обучения' })))
      .toEqual(['title:нейронныесетиглубокогообучения'])

    // Accents are kept rather than stripped, so two different words stay two
    // different keys.
    expect(titleKey('Über die Grössenordnung der Moleküle')).toBe('überdiegrössenordnungdermoleküle')

    // Short titles still dedup by identifier only, counted in code points.
    expect(identityKeys(paper({ source: 'arxiv', id: '2401.00001', title: '深度学习综述' })))
      .toEqual(['arxiv:2401.00001'])
  })

  it('collapses duplicates across lists, unions ids/sources, keeps the best fields, and ranks multi-hits first', () => {
    const s2 = [
      paper({ source: 'semantic-scholar', id: 'a', title: 'Attention Is All You Need', doi: '10.1/x', citationCount: 100, year: 2017 }),
      paper({ source: 'semantic-scholar', id: 'b', title: 'Only on S2, cited a lot', citationCount: 5000, year: 2010 }),
    ]
    const pubmed = [
      paper({ source: 'pubmed', id: '1', title: 'ATTENTION is all you need.', abstract: 'A longer abstract from PubMed.', citationCount: 120, externalIds: { PubMed: '1', DOI: '10.1/x' } }),
      paper({ source: 'pubmed', id: '2', title: 'PubMed only paper about something', year: 2024 }),
    ]
    const arxiv = [
      paper({ source: 'arxiv', id: '1706.03762', title: 'Attention Is All You Need', pdfUrl: 'https://arxiv.org/pdf/1706.03762', categories: ['cs.CL'] }),
    ]
    const merged = mergePaperLists([s2, pubmed, arxiv])
    // 'a' is on three platforms; 'b' (S2 #2) and '2' (PubMed #2) tie on rank, so citations decide.
    expect(merged.map((p) => p.id)).toEqual(['a', 'b', '2'])
    expect(merged[0]).toMatchObject({
      source: 'semantic-scholar',
      id: 'a',
      citationCount: 120,
      abstract: 'A longer abstract from PubMed.',
      pdfUrl: 'https://arxiv.org/pdf/1706.03762',
      categories: ['cs.CL'],
      externalIds: { PubMed: '1', DOI: '10.1/x' },
      extra: { foundIn: ['semantic-scholar', 'pubmed', 'arxiv'] },
    })
    expect(merged[1]!.extra).toEqual({ foundIn: ['semantic-scholar'] })
    expect(merged[2]!.extra).toEqual({ foundIn: ['pubmed'] })
  })
})

describe('search_papers', () => {
  it('fans out to the default platforms, merges, sums credits, and renders', async () => {
    stub = stubFetch((url) => {
      if (url.pathname.startsWith('/graph/')) return { json: S2_SEARCH_RESPONSE, headers: { 'X-Credits-Charged': '10', 'X-Credits-Remaining': '990' } }
      if (url.pathname.startsWith('/pubmed/')) return { json: PUBMED_SEARCH_RESPONSE, headers: { 'X-Credits-Charged': '10', 'X-Credits-Remaining': '980' } }
      return { status: 404, text: 'unexpected' }
    })
    const fake = mount()
    const tool = fake.tools.get('search_papers')!
    const value = await tool.execute({ query: 'transformers', max_results_per_source: 2, year_from: 2016, year_to: 2024 }, ctxWithAgent()) as Record<string, unknown>
    expect(validateJsonSchemaValue(tool.output.schema as ObjectJsonSchema, value, '')).toEqual([])
    const paths = stub.calls.map((c) => c.url.pathname).sort()
    expect(paths).toEqual(['/graph/v1/paper/search', '/pubmed/v1/paper/search'])
    expect(stub.calls.find((c) => c.url.pathname.startsWith('/graph'))!.url.searchParams.get('year')).toBe('2016-2024')
    expect(stub.calls.find((c) => c.url.pathname.startsWith('/pubmed'))!.body).toMatchObject({ minDate: '2016', maxDate: '2024', limit: 2 })
    expect(value).toMatchObject({ query: 'transformers', sources: ['semantic-scholar', 'pubmed'], total: 4, truncated: true, credits: { charged: 20, remaining: 980, sessionTotal: 20 } })
    expect(value.perSource).toEqual([{ source: 'semantic-scholar', count: 2, total: 1234 }, { source: 'pubmed', count: 2, total: 42 }])
    const text = textOf(tool.output.render({ query: 'transformers' }, value as never))
    expect(text).toContain('Papers for "transformers" across Semantic Scholar, PubMed — 4 unique after de-duplication (Semantic Scholar 2 of 1234, PubMed 2 of 42):')
    expect(text).toContain('AI4Scholar credits — this call: 20 · this session: 20 · remaining: 980')
    // Card: web sources + credits in the title.
    const meta = tool.output.presentationMeta!({ query: 'transformers' }, value as never)
    expect(tool.presentResult!({ query: 'transformers' }, { content: [], isError: false, meta })).toMatchObject({ card: 'web', title: 'Papers: transformers · 20 credits · 980 left', truncated: true })
  })

  it('keeps going when one platform fails, and fails only when all do', async () => {
    stub = stubFetch((url) => {
      if (url.pathname.startsWith('/graph/')) return { status: 500, text: 'boom' }
      if (url.pathname.startsWith('/pubmed/')) return { json: PUBMED_SEARCH_RESPONSE }
      if (url.hostname === 'export.arxiv.org') return { text: ARXIV_FEED, contentType: 'application/atom+xml' }
      return { status: 404, text: 'unexpected' }
    })
    const tool = mount({ maxRetries: 1 }).tools.get('search_papers')!
    const value = await tool.execute({ query: 'x', sources: ['semantic-scholar', 'pubmed', 'arxiv'] }, ctxWithAgent()) as Record<string, unknown>
    expect(value.perSource).toEqual([
      { source: 'semantic-scholar', count: 0, error: expect.stringContaining('HTTP 500') },
      { source: 'pubmed', count: 2, total: 42 },
      { source: 'arxiv', count: 2, total: 1234 },
    ])
    expect(value.warning).toMatch(/Semantic Scholar: Semantic Scholar search failed: HTTP 500/)
    expect((value.papers as unknown[]).length).toBe(4)
    expect(textOf(tool.output.render({ query: 'x' }, value as never))).toContain('Semantic Scholar failed, PubMed 2 of 42, arXiv 2 of 1234')
    stub.restore()
    stub = stubFetch(() => ({ status: 500, text: 'boom' }))
    await expect(tool.execute({ query: 'x' }, ctxWithAgent())).rejects.toThrow(/every platform failed/)
    await expect(tool.execute({ query: 'x', year_from: 2025, year_to: 2020 }, ctxWithAgent())).rejects.toThrow(/year_from/)
  })

  it('interleaves single-platform hits by each platform\'s own rank', () => {
    const s2 = [paper({ source: 'semantic-scholar', id: 's1', title: 'S2 first result about topic', citationCount: 5 }), paper({ source: 'semantic-scholar', id: 's2', title: 'S2 second result about topic', citationCount: 9000 })]
    const pm = [paper({ source: 'pubmed', id: 'p1', title: 'PubMed first result about topic' }), paper({ source: 'pubmed', id: 'p2', title: 'PubMed second result about topic' })]
    expect(mergePaperLists([s2, pm]).map((p) => p.id)).toEqual(['s1', 'p1', 's2', 'p2'])
  })

  it('accepts open-ended year ranges for Semantic Scholar', async () => {
    stub = stubFetch((url) => (url.pathname.startsWith('/graph/') ? { json: { total: 0, data: [] } } : { json: { total: 0, papers: [] } }))
    const tool = mount().tools.get('search_papers')!
    await tool.execute({ query: 'x', year_from: 2022 }, ctxWithAgent())
    expect(stub.calls.find((c) => c.url.pathname.startsWith('/graph'))!.url.searchParams.get('year')).toBe('2022-')
    await tool.execute({ query: 'x', year_to: 2015 }, ctxWithAgent())
    expect(stub.calls.filter((c) => c.url.pathname.startsWith('/graph')).at(-1)!.url.searchParams.get('year')).toBe('-2015')
  })

  it('offers only the enabled platforms and disappears when none is', () => {
    const only = mount({ semanticScholar: false, googleScholar: false, arxiv: false })
    const tool = only.tools.get('search_papers')!
    expect(tool.description).toContain('Available platforms: PubMed (default PubMed')
    expect(mount({ semanticScholar: false, pubmed: false, googleScholar: false, arxiv: false }).tools.has('search_papers')).toBe(false)
    expect(mount({ unifiedSearch: false }).tools.has('search_papers')).toBe(false)
  })
})
