import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { GS_PAGE_1, GS_PAGE_2, PUBMED_SEARCH_RESPONSE, S2_SEARCH_RESPONSE } from './fixtures.js'
import { mount, runContext, stubFetch, textOf } from './helpers.js'
import type { StubbedFetch } from './helpers.js'
import { Config, VERSION } from '../src/index.js'

const manifest = createRequire(import.meta.url)('../package.json') as { version: string }

let stub: StubbedFetch | undefined
afterEach(() => {
  stub?.restore()
  stub = undefined
})

/** Assert a canonical value against the tool's own declared output schema, as the registry would. */
function assertOutput(schema: unknown, value: unknown): void {
  const violations = validateJsonSchemaValue(schema as ObjectJsonSchema, value, '')
  expect(violations).toEqual([])
}

/** The complete roster with default config (OpenClaw parity: 36 tools + the balance tool). */
export const ALL_TOOLS = [
  'auto_cite',
  'download_arxiv', 'download_biorxiv', 'download_by_doi', 'download_medrxiv', 'download_semantic',
  'get_ai4scholar_credits',
  'get_pubmed_citations', 'get_pubmed_paper_batch', 'get_pubmed_paper_detail', 'get_pubmed_related',
  'get_semantic_author_batch', 'get_semantic_author_detail', 'get_semantic_author_papers', 'get_semantic_citations',
  'get_semantic_paper_authors', 'get_semantic_paper_batch', 'get_semantic_paper_detail',
  'get_semantic_recommendations', 'get_semantic_recommendations_for_paper', 'get_semantic_references',
  'read_arxiv_paper', 'read_biorxiv_paper', 'read_by_doi', 'read_medrxiv_paper', 'read_semantic_paper',
  'sci_draw',
  'search_arxiv', 'search_biorxiv', 'search_google_scholar', 'search_medrxiv', 'search_papers', 'search_pubmed',
  'search_semantic', 'search_semantic_authors', 'search_semantic_bulk', 'search_semantic_paper_match', 'search_semantic_snippets',
].sort()

describe('plugin mount', () => {
  it('registers all 38 tools, the /ai4scholar command, and the guidance section with defaults', () => {
    const fake = mount()
    expect([...fake.tools.keys()].sort()).toEqual(ALL_TOOLS)
    expect(ALL_TOOLS).toHaveLength(38)
    expect([...fake.commands.keys()]).toEqual(['ai4scholar'])
    expect(fake.sections).toHaveLength(1)
    expect(fake.sections[0]?.name).toBe('tool:ai4scholar')
    expect(fake.sections[0]?.order).toBe(150)
    const text = fake.sections[0]?.text
    expect(typeof text === 'string' && text.includes('search_pubmed') && text.includes('search_google_scholar')).toBe(true)
  })

  it('honors family toggles and the guidance switch', () => {
    const fake = mount({ pubmed: false, googleScholar: false, arxiv: false, biorxiv: false, doi: false, autoCite: false, sciDraw: false, creditsTool: false, command: false, fullText: false, promptGuidance: false, unifiedSearch: false })
    expect([...fake.tools.keys()].sort()).toEqual([
      'download_semantic',
      'get_semantic_author_batch', 'get_semantic_author_detail', 'get_semantic_author_papers', 'get_semantic_citations',
      'get_semantic_paper_authors', 'get_semantic_paper_batch', 'get_semantic_paper_detail',
      'get_semantic_recommendations', 'get_semantic_recommendations_for_paper', 'get_semantic_references',
      'search_semantic', 'search_semantic_authors', 'search_semantic_bulk', 'search_semantic_paper_match', 'search_semantic_snippets',
    ])
    expect(fake.commands.size).toBe(0)
    expect(fake.sections).toHaveLength(0)
  })

  it('registers no guidance when every family is off', () => {
    const fake = mount({ semanticScholar: false, pubmed: false, googleScholar: false, arxiv: false, biorxiv: false, doi: false, autoCite: false, sciDraw: false, creditsTool: false, command: false })
    expect(fake.tools.size).toBe(0) // search_papers registers nothing when no platform is enabled
    expect(fake.sections).toHaveLength(0)
  })

  it('still mounts when the commands service is absent', () => {
    const fake = mount({}, { apiKey: 'k', commands: false })
    expect(fake.tools.size).toBe(38)
    expect(fake.commands.size).toBe(0)
  })

  it('applies schema defaults and rejects invalid config loud', () => {
    const config = new Config({})
    expect(config.baseUrl).toBe('https://ai4scholar.net')
    expect(config.apiKeyEnv).toBe('AI4SCHOLAR_API_KEY')
    expect(config.defaultMaxResults).toBe(10)
    expect(() => mount({ defaultMaxResults: 0 })).toThrow(/defaultMaxResults/)
    expect(() => mount({ defaultMaxResults: 60, maxResultsCap: 50 })).toThrow(/must not exceed/)
    expect(() => mount({ baseUrl: 'not a url' })).toThrow(/baseUrl/)
    expect(() => mount({ apiKeyEnv: 'has-dash' })).toThrow(/credential ref/)
    expect(() => mount({ toolTimeoutMs: -1 })).toThrow(/toolTimeoutMs/)
  })

  it('attaches the configured cooperative timeouts to every tool', () => {
    const fake = mount({ toolTimeoutMs: 42_000, pdfTimeoutMs: 1_000, generationTimeoutMs: 5_000 })
    for (const [name, tool] of fake.tools) {
      if (name.startsWith('read_')) expect(tool.timeoutMs).toBeGreaterThan(42_000)
      else if (name === 'download_by_doi') expect(tool.timeoutMs).toBe(3_000)
      else if (name === 'auto_cite' || name === 'sci_draw') expect(tool.timeoutMs).toBe(47_000)
      else expect(tool.timeoutMs).toBe(42_000)
    }
  })
})

describe('search_semantic', () => {
  it('sends the query with auth and normalizes the Graph API response', async () => {
    stub = stubFetch(() => ({ json: S2_SEARCH_RESPONSE }))
    const fake = mount({}, { apiKey: 'sk-test' })
    const tool = fake.tools.get('search_semantic')!
    const value = await tool.execute({ query: 'attention transformers', max_results: 2, year: '2016-2020' }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)

    const call = stub.calls[0]!
    expect(call.url.origin + call.url.pathname).toBe('https://ai4scholar.net/graph/v1/paper/search')
    expect(call.url.searchParams.get('query')).toBe('attention transformers')
    expect(call.url.searchParams.get('limit')).toBe('2')
    expect(call.url.searchParams.get('year')).toBe('2016-2020')
    expect(call.url.searchParams.get('fields')).toContain('externalIds')
    expect(call.headers.authorization).toBe('Bearer sk-test')
    expect(VERSION).toBe(manifest.version)
    expect(call.headers['user-agent']).toBe(`dsh-ai4scholar/${manifest.version}`)

    expect(value.source).toBe('semantic-scholar')
    expect(value.total).toBe(1234)
    expect(value.truncated).toBe(true)
    expect(value.nextOffset).toBe(2)
    const papers = value.papers as Array<Record<string, unknown>>
    expect(papers).toHaveLength(2)
    expect(papers[0]).toMatchObject({
      id: '204e3073870fae3d05bcbc2f6a8e263d9b72e776',
      title: 'Attention is All you Need',
      year: 2017,
      date: '2017-06-12',
      venue: 'Neural Information Processing Systems',
      citationCount: 150000,
      pdfUrl: 'https://arxiv.org/pdf/1706.03762',
      externalIds: { ArXiv: '1706.03762', CorpusId: '13756489', DBLP: 'conf/nips/VaswaniSPUJGKP17' },
    })
    expect(papers[0]!.authors).toEqual(['Ashish Vaswani', 'Noam M. Shazeer', 'Niki Parmar', 'Jakob Uszkoreit'])
    expect('doi' in papers[0]!).toBe(false)
    // null / empty platform fields are omitted, journal name backfills the venue.
    expect(papers[1]).toMatchObject({ doi: '10.18653/v1/N19-1423', venue: 'North American Chapter of the Association for Computational Linguistics' })
    expect('abstract' in papers[1]!).toBe(false)
    expect('date' in papers[1]!).toBe(false)
    expect('pdfUrl' in papers[1]!).toBe(false)

    const text = textOf(tool.output.render({ query: 'attention transformers' }, value as never))
    expect(text).toContain('Semantic Scholar results for "attention transformers" (showing 2 of 1234)')
    expect(text).toContain('1. **[Attention is All you Need](https://www.semanticscholar.org/paper/204e3073870fae3d05bcbc2f6a8e263d9b72e776)**')
    expect(text).toContain('Ashish Vaswani, Noam M. Shazeer, Niki Parmar et al. · 2017 · Neural Information Processing Systems · 150000 citations')
    expect(text).toContain('arXiv: 1706.03762')
    expect(text).toContain('offset=2')
    // The abstract is clipped to the configured budget.
    const abstractLine = text.split('\n').find((l) => l.includes('The dominant sequence transduction'))!
    expect(abstractLine.length).toBeLessThanOrEqual(600 + 8)
    expect(abstractLine.endsWith('…')).toBe(true)

    // Presentation: pending search card, completed web card with structured sources.
    expect(tool.presentCall?.({ query: 'attention transformers' })).toEqual({
      card: 'generic', title: 'Semantic Scholar: attention transformers', kind: 'search', rawInput: 'attention transformers',
    })
    const meta = tool.output.presentationMeta!({ query: 'attention transformers' }, value as never)
    const view = tool.presentResult?.({ query: 'attention transformers' }, { content: [], isError: false, meta })
    expect(view).toMatchObject({ card: 'web', kind: 'search', truncated: true })
    const sources = (view as unknown as { sources: Array<Record<string, string>> }).sources
    expect(sources).toHaveLength(2)
    expect(sources[0]).toEqual({
      url: 'https://www.semanticscholar.org/paper/204e3073870fae3d05bcbc2f6a8e263d9b72e776',
      title: 'Attention is All you Need',
      snippet: 'Ashish Vaswani, Noam M. Shazeer, Niki Parmar et al. · Neural Information Processing Systems · 150000 citations',
      publishedAt: '2017-06-12',
    })
    // Malformed / error results fall back to the generic card.
    expect(tool.presentResult?.({ query: 'q' }, { content: [], isError: true, meta })).toBeUndefined()
    expect(tool.presentResult?.({ query: 'q' }, { content: [], isError: false, meta: { sources: [{ url: 1 }], truncated: false } })).toBeUndefined()
  })

  it('bounds max_results to the cap and defaults it', async () => {
    stub = stubFetch(() => ({ json: { total: 0, data: [] } }))
    const fake = mount({ defaultMaxResults: 7, maxResultsCap: 20 })
    const tool = fake.tools.get('search_semantic')!
    await tool.execute({ query: 'x' }, runContext())
    await tool.execute({ query: 'x', max_results: 999 }, runContext())
    expect(stub.calls.map((c) => c.url.searchParams.get('limit'))).toEqual(['7', '20'])
    const empty = await tool.execute({ query: 'x' }, runContext()) as { papers: unknown[]; truncated: boolean }
    expect(empty.papers).toEqual([])
    expect(empty.truncated).toBe(false)
    expect(textOf(tool.output.render({ query: 'x' }, empty as never))).toBe('No Semantic Scholar results for "x".')
  })

  it('rejects blank queries and malformed year filters before any request', async () => {
    stub = stubFetch(() => ({ json: {} }))
    const tool = mount().tools.get('search_semantic')!
    await expect(tool.execute({ query: '   ' }, runContext())).rejects.toThrow(/non-empty/)
    await expect(tool.execute({ query: 'x', year: '20xx' }, runContext())).rejects.toThrow(/year must look like/)
    await expect(tool.execute({ query: 'x', max_results: 'ten' }, runContext())).rejects.toThrow()
    expect(stub.calls).toHaveLength(0)
  })

  it('fails with a model-readable message when the API key is missing', async () => {
    stub = stubFetch(() => ({ json: {} }))
    const tool = mount({}, { apiKey: undefined }).tools.get('search_semantic')!
    await expect(tool.execute({ query: 'x' }, runContext())).rejects.toThrow(/AI4SCHOLAR_API_KEY/)
    expect(stub.calls).toHaveLength(0)
  })

  it('falls back to the process environment when the credentials seam is absent', async () => {
    stub = stubFetch(() => ({ json: { total: 0, data: [] } }))
    const previous = process.env.DSH_AI4S_TEST_KEY
    process.env.DSH_AI4S_TEST_KEY = 'env-key'
    try {
      const tool = mount({ apiKeyEnv: 'DSH_AI4S_TEST_KEY' }, { credentialsSeam: false }).tools.get('search_semantic')!
      await tool.execute({ query: 'x' }, runContext())
      expect(stub.calls[0]?.headers.authorization).toBe('Bearer env-key')
    } finally {
      if (previous === undefined) delete process.env.DSH_AI4S_TEST_KEY
      else process.env.DSH_AI4S_TEST_KEY = previous
    }
  })

  it('surfaces HTTP failures with the server explanation and an auth hint', async () => {
    stub = stubFetch(() => ({ status: 401, json: { error: 'invalid api key' } }))
    const tool = mount({ maxRetries: 1 }).tools.get('search_semantic')!
    await expect(tool.execute({ query: 'x' }, runContext())).rejects.toThrow(/HTTP 401 \(check the AI4Scholar API key\): invalid api key/)
  })

  it('retries 429 with backoff and gives up after maxRetries', async () => {
    stub = stubFetch(() => ({ status: 429, text: 'slow down' }))
    const tool = mount({ maxRetries: 3, retryBackoffMs: 1 }).tools.get('search_semantic')!
    await expect(tool.execute({ query: 'x' }, runContext())).rejects.toThrow(/HTTP 429: slow down \(after 3 attempts\)/)
    expect(stub.calls).toHaveLength(3)
  })

  it('stops immediately when the caller aborts', async () => {
    stub = stubFetch(() => ({ status: 429, text: 'slow down' }))
    const tool = mount({ maxRetries: 5, retryBackoffMs: 10_000 }).tools.get('search_semantic')!
    const controller = new AbortController()
    const pending = tool.execute({ query: 'x' }, runContext(controller.signal))
    await new Promise((r) => setTimeout(r, 5))
    controller.abort()
    await expect(pending).rejects.toThrow()
    expect(stub.calls).toHaveLength(1)
  })
})

describe('semantic scholar follow-up tools', () => {
  it('search_semantic_paper_match returns found=false on 404 and the paper otherwise', async () => {
    let status = 404
    stub = stubFetch(() => (status === 404 ? { status: 404, json: { error: 'Title match not found' } } : { json: { data: [{ ...S2_SEARCH_RESPONSE.data[0], matchScore: 173.5 }] } }))
    const tool = mount({ maxRetries: 1 }).tools.get('search_semantic_paper_match')!
    const miss = await tool.execute({ query: 'nothing' }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, miss)
    expect(miss).toEqual({ query: 'nothing', found: false })
    expect(textOf(tool.output.render({ query: 'nothing' }, miss as never))).toContain('No Semantic Scholar paper matches')
    status = 200
    const hit = await tool.execute({ query: 'Attention is all you need' }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, hit)
    expect(hit).toMatchObject({ found: true, matchScore: 173.5, paper: { title: 'Attention is All you Need' } })
    const text = textOf(tool.output.render({ query: 'Attention is all you need' }, hit as never))
    expect(text).toContain('Best match (score 173.50)')
    expect(text).toContain('Abstract: The dominant')
  })

  it('get_semantic_paper_detail encodes prefixed ids and renders the full abstract', async () => {
    stub = stubFetch(() => ({ json: S2_SEARCH_RESPONSE.data[0] }))
    const tool = mount().tools.get('get_semantic_paper_detail')!
    const value = await tool.execute({ paper_id: 'DOI:10.1000/a b' }, runContext()) as { paper: Record<string, unknown> }
    assertOutput(tool.output.schema, value)
    expect(stub.calls[0]?.url.pathname).toBe('/graph/v1/paper/DOI%3A10.1000%2Fa%20b')
    expect(value.paper.title).toBe('Attention is All you Need')
    const text = textOf(tool.output.render({ paper_id: 'x' }, value as never))
    expect(text).toContain('**Attention is All you Need**')
    expect(text).toContain('ArXiv: 1706.03762')
    expect(text).not.toContain('…')
  })

  it('search_semantic_snippets normalizes snippet records', async () => {
    stub = stubFetch(() => ({
      json: {
        data: [
          {
            snippet: { text: 'We propose a new simple network architecture, the Transformer.', snippetKind: 'body', section: 'Introduction' },
            score: 0.9123,
            paper: { corpusId: '13756489', title: 'Attention is All you Need', authors: [{ name: 'Ashish Vaswani' }], openAccessInfo: { status: 'GREEN' } },
          },
          { snippet: {}, paper: {} },
        ],
      },
    }))
    const tool = mount().tools.get('search_semantic_snippets')!
    const value = await tool.execute({ query: 'transformer architecture', max_results: 5 }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    expect(stub.calls[0]?.url.pathname).toBe('/graph/v1/snippet/search')
    expect(stub.calls[0]?.url.searchParams.get('limit')).toBe('5')
    expect(value.snippets).toEqual([{
      text: 'We propose a new simple network architecture, the Transformer.',
      kind: 'body',
      section: 'Introduction',
      score: 0.9123,
      paper: { corpusId: '13756489', title: 'Attention is All you Need', authors: ['Ashish Vaswani'], url: 'https://www.semanticscholar.org/p/13756489' },
    }])
    const text = textOf(tool.output.render({ query: 'transformer architecture' }, value as never))
    expect(text).toContain('body / Introduction')
    expect(text).toContain('score 0.912')
  })
})

describe('search_pubmed', () => {
  it('posts the search body and normalizes author, journal, and date variants', async () => {
    stub = stubFetch(() => ({ json: PUBMED_SEARCH_RESPONSE }))
    const tool = mount().tools.get('search_pubmed')!
    const value = await tool.execute({ query: 'CRISPR cancer', max_results: 2, sort: 'date', min_date: '2020/01/01', max_date: '2025' }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    const call = stub.calls[0]!
    expect(call.method).toBe('POST')
    expect(call.url.pathname).toBe('/pubmed/v1/paper/search')
    expect(call.body).toEqual({ query: 'CRISPR cancer', limit: 2, offset: 0, sort: 'date', minDate: '2020/01/01', maxDate: '2025' })
    expect(value).toMatchObject({ source: 'pubmed', total: 42, truncated: true, nextOffset: 2 })
    const papers = value.papers as Array<Record<string, unknown>>
    expect(papers[0]).toMatchObject({
      source: 'pubmed',
      id: '39575807',
      title: 'CRISPR-based therapies in oncology: a review',
      authors: ['Jane Doe', 'John Q Public', 'Ada Lovelace'],
      year: 2024,
      date: '2024 Nov',
      venue: 'Nature Reviews Cancer',
      abstract: 'CRISPR-Cas9 genome editing has advanced rapidly toward clinical application in cancer.',
      doi: '10.1038/s41568-024-00001-x',
      url: 'https://pubmed.ncbi.nlm.nih.gov/39575807/',
      externalIds: { PubMed: '39575807', DOI: '10.1038/s41568-024-00001-x', PMC: 'PMC1234567' },
      categories: ['Neoplasms', 'CRISPR-Cas Systems'],
    })
    expect(papers[1]).toMatchObject({ id: '30102808', year: 2018, date: '2018/08/01', authors: [] })
    const text = textOf(tool.output.render({ query: 'CRISPR cancer' }, value as never))
    expect(text).toContain('PubMed results for "CRISPR cancer" (showing 2 of 42)')
    expect(text).toContain('PMID: 39575807 · DOI: 10.1038/s41568-024-00001-x')
    expect(text).toContain('Unknown authors · 2018')
  })

  it('validates date filters and sort enum before requesting', async () => {
    stub = stubFetch(() => ({ json: PUBMED_SEARCH_RESPONSE }))
    const tool = mount().tools.get('search_pubmed')!
    await expect(tool.execute({ query: 'x', min_date: '01/01/2020' }, runContext())).rejects.toThrow(/min_date/)
    await expect(tool.execute({ query: 'x', sort: 'newest' }, runContext())).rejects.toThrow()
    expect(stub.calls).toHaveLength(0)
  })

  it('get_pubmed_paper_detail unwraps a { paper } envelope and requires a numeric pmid', async () => {
    stub = stubFetch(() => ({ json: { paper: PUBMED_SEARCH_RESPONSE.papers[0] } }))
    const tool = mount().tools.get('get_pubmed_paper_detail')!
    await expect(tool.execute({ pmid: 'abc' }, runContext())).rejects.toThrow(/numeric/)
    const value = await tool.execute({ pmid: '39575807' }, runContext()) as { paper: Record<string, unknown> }
    assertOutput(tool.output.schema, value)
    expect(stub.calls[0]?.url.pathname).toBe('/pubmed/v1/paper/39575807')
    expect(value.paper.title).toBe('CRISPR-based therapies in oncology: a review')
    expect(textOf(tool.output.render({ pmid: '39575807' }, value as never))).toContain('PMC: PMC1234567')
  })
})

describe('search_google_scholar', () => {
  it('paginates until max_results is met and parses publicationInfo', async () => {
    stub = stubFetch((_url, init) => {
      const body = JSON.parse(String(init.body)) as { page: number }
      return { json: body.page === 1 ? GS_PAGE_1 : GS_PAGE_2 }
    })
    const tool = mount().tools.get('search_google_scholar')!
    const value = await tool.execute({ query: 'protein folding', max_results: 12, year_from: 2020, year_to: 2025 }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    expect(stub.calls.map((c) => c.body)).toEqual([
      { query: 'protein folding', page: 1, yearFrom: 2020, yearTo: 2025 },
      { query: 'protein folding', page: 2, yearFrom: 2020, yearTo: 2025 },
    ])
    const papers = value.papers as Array<Record<string, unknown>>
    expect(papers).toHaveLength(12)
    expect(value).toMatchObject({ source: 'google-scholar', total: 12, truncated: true })
    expect(papers[0]).toEqual({
      source: 'google-scholar',
      id: 'https://example.org/paper-1',
      title: 'Scholar paper 1',
      authors: ['A Author', 'B Writer', 'C Scribe'],
      year: 2020,
      venue: 'Journal of Examples',
      abstract: 'Snippet 1 about protein folding …',
      citationCount: 100,
      url: 'https://example.org/paper-1',
      pdfUrl: 'https://example.org/paper-1.pdf',
    })
    expect('pdfUrl' in papers[1]!).toBe(false)
    const text = textOf(tool.output.render({ query: 'protein folding' }, value as never))
    expect(text).toContain('Google Scholar results for "protein folding" (showing 12)')
    expect(text).toContain('link: https://example.org/paper-1')
    expect(text).toContain('narrow the query or raise max_results')
  })

  it('stops when a page comes back short and reports no truncation', async () => {
    stub = stubFetch(() => ({ json: GS_PAGE_2 }))
    const tool = mount().tools.get('search_google_scholar')!
    const value = await tool.execute({ query: 'rare topic', max_results: 30 }, runContext()) as Record<string, unknown>
    expect(stub.calls).toHaveLength(1)
    expect(value).toMatchObject({ total: 3, truncated: false })
  })

  it('keeps fetched pages and warns when a later page fails; fails when the first page fails', async () => {
    let calls = 0
    stub = stubFetch(() => (++calls === 1 ? { json: GS_PAGE_1 } : { status: 502, text: 'bad gateway' }))
    const tool = mount({ maxRetries: 1 }).tools.get('search_google_scholar')!
    const value = await tool.execute({ query: 'x', max_results: 20 }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    expect((value.papers as unknown[]).length).toBe(10)
    expect(value.warning).toMatch(/Pagination stopped early: HTTP 502/)
    expect(textOf(tool.output.render({ query: 'x' }, value as never))).toContain('Note: Pagination stopped early')

    stub.restore()
    stub = stubFetch(() => ({ status: 502, text: 'bad gateway' }))
    await expect(tool.execute({ query: 'x' }, runContext())).rejects.toThrow(/Google Scholar search failed: HTTP 502/)
    await expect(tool.execute({ query: 'x', year_from: 2025, year_to: 2020 }, runContext())).rejects.toThrow(/year_from/)
  })
})

describe('settings namespace (rc.7 keyed card pairing)', () => {
  it('registers the ai4scholar namespace when the settings service is composed', () => {
    const fake = mount()
    expect([...fake.settingsNamespaces.keys()]).toContain('ai4scholar')
  })

  it('mounts cleanly when the deployment has no settings service', () => {
    const fake = mount({}, { apiKey: 'test-key', settings: false })
    expect(fake.settingsNamespaces.size).toBe(0)
    expect(fake.tools.size).toBeGreaterThan(0)
  })
})
