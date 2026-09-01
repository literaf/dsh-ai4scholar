import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { ARXIV_FEED, CREDITS_BALANCE, FAKE_PDF, RXIV_PAGE, S2_AUTHORS, S2_CITATIONS } from './fixtures-extended.js'
import { GS_PAGE_2, PUBMED_SEARCH_RESPONSE, S2_SEARCH_RESPONSE } from './fixtures.js'
import { mount, runContext, stubFetch, textOf } from './helpers.js'
import type { FakeRoute, StubbedFetch } from './helpers.js'
import { parseArxivFeed, normalizeArxivId } from '../src/tools/arxiv.js'
import { normalizeRxivDoi } from '../src/tools/rxiv.js'
import { normalizeDoi } from '../src/tools/doi.js'
import { pdfCandidatesFor, sliceText } from '../src/pdf.js'
import { CreditLedger } from '../src/runtime.js'

// Real PDF parsing is exercised manually against arXiv; here the parser is a stub so the
// read tools' download/slice/render paths are deterministic and offline.
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    constructor(private readonly options: { data: Uint8Array }) {}
    async getText() {
      return { text: `Extracted text of ${this.options.data.byteLength} bytes. `.repeat(50).trim(), total: 3 }
    }
    async destroy() {}
  },
}))

let stub: StubbedFetch | undefined
afterEach(() => {
  stub?.restore()
  stub = undefined
})

function assertOutput(schema: unknown, value: unknown): void {
  expect(validateJsonSchemaValue(schema as ObjectJsonSchema, value, '')).toEqual([])
}

const agent = {} // stands in for exec.agent identity
const ctxWithAgent = () => ({ ...runContext(), agent } as unknown as ReturnType<typeof runContext>)

/**
 * A `/ai4scholar` invocation. `attachments` became required on
 * `CommandInvocation` in dsh 0.1.1-rc.2; it stays empty here because the command
 * does not declare `input.images`, so the registry never admits any.
 */
const invocation = () => ({
  commandId: 'c' as never,
  agent: agent as never,
  rawInput: '',
  attachments: [],
  signal: new AbortController().signal,
})

describe('credits accounting', () => {
  it('folds X-Credits headers into results and tallies the session', async () => {
    stub = stubFetch(() => ({ json: S2_SEARCH_RESPONSE, headers: { 'X-Credits-Charged': '10', 'X-Credits-Remaining': '4990' } }))
    const fake = mount()
    const tool = fake.tools.get('search_semantic')!
    const first = await tool.execute({ query: 'a' }, ctxWithAgent()) as { credits: Record<string, number> }
    assertOutput(tool.output.schema, first)
    expect(first.credits).toEqual({ charged: 10, remaining: 4990, sessionTotal: 10 })
    const second = await tool.execute({ query: 'b' }, ctxWithAgent()) as { credits: Record<string, number> }
    expect(second.credits.sessionTotal).toBe(20)
    const text = textOf(tool.output.render({ query: 'b' }, second as never))
    expect(text).toContain('AI4Scholar credits — this call: 10 · this session: 20 · remaining: 4,990')
    // A different agent has its own tally; no agent means no tally.
    const other = await tool.execute({ query: 'c' }, { ...runContext(), agent: {} } as never) as { credits: Record<string, number> }
    expect(other.credits.sessionTotal).toBe(10)
    const anonymous = await tool.execute({ query: 'd' }, runContext()) as { credits: Record<string, number> }
    expect('sessionTotal' in anonymous.credits).toBe(false)
  })

  it('omits credits when the API sends no headers or showCredits is off', async () => {
    stub = stubFetch(() => ({ json: S2_SEARCH_RESPONSE }))
    const value = await mount().tools.get('search_semantic')!.execute({ query: 'a' }, ctxWithAgent()) as Record<string, unknown>
    expect('credits' in value).toBe(false)
    stub.restore()
    stub = stubFetch(() => ({ json: S2_SEARCH_RESPONSE, headers: { 'X-Credits-Charged': '10' } }))
    const off = await mount({ showCredits: false }).tools.get('search_semantic')!.execute({ query: 'a' }, ctxWithAgent()) as Record<string, unknown>
    expect('credits' in off).toBe(false)
  })

  it('get_ai4scholar_credits reads /api/credits and reports the session tally', async () => {
    stub = stubFetch((url) => (url.pathname === '/api/credits' ? { json: CREDITS_BALANCE } : { json: S2_SEARCH_RESPONSE, headers: { 'X-Credits-Charged': '3' } }))
    const fake = mount()
    await fake.tools.get('search_semantic')!.execute({ query: 'a' }, ctxWithAgent())
    const tool = fake.tools.get('get_ai4scholar_credits')!
    const value = await tool.execute({}, ctxWithAgent()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    expect(value).toMatchObject({ totalAvailable: 5000, permanent: 4500, memberMonthlyRemaining: 500, keyCreditsUsed: 120, sessionTotal: 3, membership: { plan: 'pro', status: 'active' } })
    expect('keyCreditLimit' in value).toBe(false)
    const text = textOf(tool.output.render({}, value as never))
    expect(text).toContain('Credits available: 5,000\nPermanent: 4,500\nMember monthly remaining: 500\nMembership: pro (active), period ends 2026-09-01\nAPI key spent in total: 120\nSession spent: 3')
    expect(stub.calls.at(-1)?.headers.authorization).toBe('Bearer test-key')
  })

  it('/ai4scholar reports key status and balance, and errors without a key', async () => {
    stub = stubFetch(() => ({ json: CREDITS_BALANCE }))
    const fake = mount()
    const command = fake.commands.get('ai4scholar')!
    const result = await command.handler(invocation())
    expect(result.kind).toBe('success')
    expect(result.text).toContain('Credits available: 5,000')
    expect(result.text?.endsWith('API key: configured (…-key)')).toBe(true)
    const nokey = mount({}, { apiKey: undefined }).commands.get('ai4scholar')!
    const missing = await nokey.handler(invocation())
    expect(missing.kind).toBe('error')
    expect(missing.text).toContain('Settings → Plugins → AI4Scholar')
  })

  it('GET /ai4scholar/balance answers ok / missing key / API failure as 200 JSON', async () => {
    stub = stubFetch(() => ({ json: CREDITS_BALANCE }))
    const fake = mount()
    const route = fake.routes.get('/ai4scholar/balance')!
    expect(route.kind).toBe('exact')
    const call = async (method = 'GET') => {
      let status = 0
      let body = ''
      const listeners: Record<string, () => void> = {}
      const req = { method, once(event: string, fn: () => void) { listeners[event] = fn } }
      const res = { writeHead(code: number) { status = code }, end(chunk: string) { body = chunk } }
      await route.handler(req, res)
      return { status, body: JSON.parse(body) as Record<string, unknown> }
    }
    expect(await call()).toEqual({ status: 200, body: { ok: true, totalAvailable: 5000, permanent: 4500, memberMonthlyRemaining: 500, keyCreditsUsed: 120, membership: { plan: 'pro', status: 'active', periodEnd: '2026-09-01T00:00:00.000Z' } } })
    expect((await call('POST')).status).toBe(405)
    stub.restore()
    stub = stubFetch(() => ({ status: 401, json: { error: 'INVALID_API_KEY', message: 'API Key 无效或已禁用' } }))
    expect((await call()).body).toMatchObject({ ok: false, code: 'INVALID_API_KEY', error: expect.stringContaining('API Key 无效') })
    const missing = mount({}, { apiKey: undefined }).routes.get('/ai4scholar/balance')!
    let missingBody = ''
    await missing.handler({ method: 'GET', once() {} }, { writeHead() {}, end(chunk: string) { missingBody = chunk } })
    expect(JSON.parse(missingBody)).toEqual({ ok: false, code: 'MISSING_KEY', error: 'AI4Scholar API key is not configured' })
    // Compositions without a web server (headless) simply have no route.
    expect(mount({}, { apiKey: 'k', webServer: false }).routes.size).toBe(0)
    expect(mount({ balanceRoute: false }).routes.size).toBe(0)
  })

  it('gives the balance route back to the web server when the fiber unloads', () => {
    // The web server owns one route table and throws on a duplicate (kind, path).
    // A hot remount — dshmarket toggling the plugin, a settings change — tears the
    // old fiber down and builds a new one against that same table, so the route
    // has to leave with the fiber it belongs to. It did not: `register`'s disposer
    // was discarded, and the remount died on `webserver: duplicate exact route
    // "/ai4scholar/balance"`.
    const host = new Map<string, FakeRoute>()
    const first = mount({}, { apiKey: 'k', sharedRoutes: host })
    expect([...host.keys()]).toEqual(['/ai4scholar/balance'])
    first.dispose()
    expect(host.size).toBe(0)
    expect(() => mount({}, { apiKey: 'k', sharedRoutes: host })).not.toThrow()
    expect([...host.keys()]).toEqual(['/ai4scholar/balance'])
  })

  it('shows credits in completed card titles (web card and generic card)', async () => {
    stub = stubFetch(() => ({ json: S2_SEARCH_RESPONSE, headers: { 'X-Credits-Charged': '10', 'X-Credits-Remaining': '4990' } }))
    const fake = mount()
    const search = fake.tools.get('search_semantic')!
    const value = await search.execute({ query: 'protein folding' }, ctxWithAgent())
    const meta = search.output.presentationMeta!({ query: 'protein folding' }, value as never)
    expect(search.presentResult!({ query: 'protein folding' }, { content: [], isError: false, meta })).toMatchObject({ card: 'web', title: 'Semantic Scholar: protein folding · 10 credits · 4,990 left' })
    stub.restore()
    stub = stubFetch(() => ({ json: S2_SEARCH_RESPONSE.data[0], headers: { 'X-Credits-Charged': '1', 'X-Credits-Remaining': '4989' } }))
    const detail = fake.tools.get('get_semantic_paper_detail')!
    const paper = await detail.execute({ paper_id: 'x' }, ctxWithAgent())
    const detailMeta = detail.output.presentationMeta!({ paper_id: 'x' }, paper as never)
    expect(detailMeta).toEqual({ credits: { charged: 1, remaining: 4989, sessionTotal: 11 } })
    expect(detail.presentResult!({ paper_id: 'x' }, { content: [], isError: false, meta: detailMeta })).toEqual({ card: 'generic', title: 'Semantic Scholar paper: x · 1 credit · 4,989 left' })
    expect(detail.presentResult!({ paper_id: 'x' }, { content: [], isError: true, meta: detailMeta })).toBeUndefined()
    // Free tools carry no suffix.
    stub.restore()
    stub = stubFetch(() => ({ text: '<feed></feed>', contentType: 'application/atom+xml' }))
    const arxiv = fake.tools.get('search_arxiv')!
    const av = await arxiv.execute({ query: 'x' }, ctxWithAgent())
    const am = arxiv.output.presentationMeta!({ query: 'x' }, av as never)
    expect(arxiv.presentResult!({ query: 'x' }, { content: [], isError: false, meta: am })).toMatchObject({ title: 'arXiv: x' })
  })

  it('CreditLedger keeps per-agent totals', () => {
    const ledger = new CreditLedger()
    const a = {}
    const b = {}
    expect(ledger.record(a, 5)).toBe(5)
    expect(ledger.record(a, 2)).toBe(7)
    expect(ledger.record(b, 1)).toBe(1)
    expect(ledger.total(a)).toBe(7)
    expect(ledger.total(undefined)).toBe(0)
    expect(ledger.record(undefined, 9)).toBeUndefined()
  })
})

describe('arXiv', () => {
  it('parses the Atom feed into normalized papers', () => {
    const { papers, total } = parseArxivFeed(ARXIV_FEED)
    expect(total).toBe(1234)
    expect(papers).toHaveLength(2)
    expect(papers[0]).toEqual({
      source: 'arxiv',
      id: '1706.03762',
      title: 'Attention Is All You Need',
      authors: ['Ashish Vaswani', 'Noam Shazeer'],
      year: 2017,
      date: '2017-06-12',
      venue: 'NeurIPS 2017',
      abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks & friends.',
      doi: '10.48550/arXiv.1706.03762',
      url: 'https://arxiv.org/abs/1706.03762',
      pdfUrl: 'https://arxiv.org/pdf/1706.03762',
      externalIds: { ArXiv: '1706.03762', DOI: '10.48550/arXiv.1706.03762' },
      categories: ['cs.CL', 'cs.LG'],
    })
    expect(papers[1]).toMatchObject({ id: 'hep-th/9901001', title: 'An old-style identifier', categories: ['hep-th'] })
    expect(normalizeArxivId('arXiv:2106.12345v2')).toBe('2106.12345v2')
    expect(normalizeArxivId('https://arxiv.org/pdf/2106.12345.pdf')).toBe('2106.12345')
    expect(() => normalizeArxivId('not an id')).toThrow(/arXiv identifier/)
  })

  it('search_arxiv builds the query, needs no key, and paginates by offset', async () => {
    stub = stubFetch(() => ({ text: ARXIV_FEED, contentType: 'application/atom+xml' }))
    const tool = mount({}, { apiKey: undefined }).tools.get('search_arxiv')!
    const value = await tool.execute({ query: 'transformer', max_results: 2, sort_by: 'submittedDate', date_from: '2017-01-01', offset: 10 }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    const call = stub.calls[0]!
    expect(call.url.origin + call.url.pathname).toBe('https://export.arxiv.org/api/query')
    expect(call.url.searchParams.get('search_query')).toBe('(transformer) AND submittedDate:[201701010000 TO 99991231]')
    expect(call.url.searchParams.get('start')).toBe('10')
    expect(call.url.searchParams.get('max_results')).toBe('2')
    expect(call.url.searchParams.get('sortBy')).toBe('submittedDate')
    expect(call.headers.authorization).toBeUndefined()
    expect(value).toMatchObject({ source: 'arxiv', total: 1234, truncated: true, nextOffset: 12 })
    expect('credits' in value).toBe(false)
    const text = textOf(tool.output.render({ query: 'transformer' }, value as never))
    expect(text).toContain('arXiv results for "transformer" (showing 2 of 1234)')
    expect(text).toContain('arXiv: 1706.03762 · DOI: 10.48550/arXiv.1706.03762 · PDF: https://arxiv.org/pdf/1706.03762')
    expect(text).toContain('Categories: cs.CL, cs.LG')
    await expect(tool.execute({ query: 'x', date_from: '2017/01/01' }, runContext())).rejects.toThrow(/YYYY-MM-DD/)
  })

  it('read_arxiv_paper downloads the PDF, extracts, and slices with continuation', async () => {
    stub = stubFetch(() => ({ bytes: FAKE_PDF, url: 'https://arxiv.org/pdf/1706.03762v7' }))
    const tool = mount({ readMaxChars: 100 }, { apiKey: undefined }).tools.get('read_arxiv_paper')!
    const value = await tool.execute({ paper_id: '1706.03762' }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    expect(value).toMatchObject({ id: '1706.03762', pdfUrl: 'https://arxiv.org/pdf/1706.03762v7', pages: 3, offset: 0, truncated: true, nextOffset: 100 })
    expect((value.text as string).length).toBe(100)
    const text = textOf(tool.output.render({ paper_id: '1706.03762' }, value as never))
    expect(text).toContain('Showing characters 0–100 — call again with offset=100 for the rest.')
    const rest = await tool.execute({ paper_id: '1706.03762', offset: 100, max_chars: 100_000 }, runContext()) as Record<string, unknown>
    expect(rest).toMatchObject({ offset: 100, truncated: false })
    expect('nextOffset' in rest).toBe(false)
    expect(textOf(tool.output.render({ paper_id: 'x' }, rest as never))).toContain('(complete)')
  })

  it('read tools reject non-PDF bodies', async () => {
    stub = stubFetch(() => ({ text: '<html>landing</html>', contentType: 'text/html' }))
    const tool = mount({}, { apiKey: undefined }).tools.get('read_arxiv_paper')!
    await expect(tool.execute({ paper_id: '1706.03762' }, runContext())).rejects.toThrow(/did not return a PDF/)
  })
})

describe('bioRxiv / medRxiv', () => {
  it('lists a category window, normalizes records, and stops on a short page', async () => {
    stub = stubFetch(() => ({ json: RXIV_PAGE }))
    const tool = mount({}, { apiKey: undefined }).tools.get('search_biorxiv')!
    const value = await tool.execute({ query: 'Cell Biology', max_results: 5, days: 7 }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    const call = stub.calls[0]!
    expect(call.url.pathname).toMatch(/^\/details\/biorxiv\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\/0$/)
    expect(call.url.searchParams.get('category')).toBe('cell_biology')
    expect(stub.calls).toHaveLength(1)
    const papers = value.papers as Array<Record<string, unknown>>
    expect(papers[0]).toEqual({
      source: 'biorxiv',
      id: '10.1101/2024.05.01.591234',
      title: 'Single-cell atlas of the mouse retina',
      authors: ['Doe, J.', 'Roe, R.'],
      year: 2024,
      date: '2024-05-02',
      venue: 'bioRxiv',
      abstract: 'We profile 100k cells.',
      doi: '10.1101/2024.05.01.591234',
      url: 'https://www.biorxiv.org/content/10.1101/2024.05.01.591234v2',
      pdfUrl: 'https://www.biorxiv.org/content/10.1101/2024.05.01.591234v2.full.pdf',
      externalIds: { DOI: '10.1101/2024.05.01.591234' },
      categories: ['neuroscience'],
      extra: { version: '2', published: 'NA' },
    })
    expect(value).toMatchObject({ total: 2, truncated: false })
    expect(normalizeRxivDoi('https://www.medrxiv.org/content/10.1101/2024.01.01.123456v3.full.pdf')).toEqual({ doi: '10.1101/2024.01.01.123456', version: '3' })
    // Since 2026 bioRxiv issues 10.64898 DOIs, so any DOI prefix is accepted; non-DOIs are rejected.
    expect(normalizeRxivDoi('10.64898/2026.08.09.26360037')).toEqual({ doi: '10.64898/2026.08.09.26360037', version: undefined })
    expect(() => normalizeRxivDoi('not-a-doi')).toThrow(/bioRxiv\/medRxiv DOI/)
    const medrxiv = mount({}, { apiKey: undefined }).tools.get('download_medrxiv')!
    expect(await medrxiv.execute({ paper_id: '10.1101/2024.01.01.123456' }, runContext())).toEqual({
      id: '10.1101/2024.01.01.123456',
      url: 'https://www.medrxiv.org/content/10.1101/2024.01.01.123456v1',
      pdfUrl: 'https://www.medrxiv.org/content/10.1101/2024.01.01.123456v1.full.pdf',
    })
  })
})

describe('DOI', () => {
  it('normalizes DOIs and derives publisher PDF candidates', () => {
    expect(normalizeDoi('https://doi.org/10.1038/s41586-021-03819-2')).toBe('10.1038/s41586-021-03819-2')
    expect(normalizeDoi('doi:10.1000/x')).toBe('10.1000/x')
    expect(() => normalizeDoi('nope')).toThrow(/not a DOI/)
    // Nature slugs carry no DOI, so only the generic `.pdf` candidate applies; Springer's DOI path gets the content/pdf form too.
    expect(pdfCandidatesFor('https://www.nature.com/articles/s41586-021-03819-2')).toEqual(['https://www.nature.com/articles/s41586-021-03819-2.pdf'])
    expect(pdfCandidatesFor('https://link.springer.com/article/10.1007/s00521-020-05123-4')).toEqual([
      'https://link.springer.com/content/pdf/10.1007/s00521-020-05123-4.pdf',
      'https://link.springer.com/article/10.1007/s00521-020-05123-4.pdf',
    ])
    expect(pdfCandidatesFor('https://onlinelibrary.wiley.com/doi/10.1002/abc')).toContain('https://onlinelibrary.wiley.com/doi/pdfdirect/10.1002/abc')
    expect(pdfCandidatesFor('not a url')).toEqual([])
  })

  it('download_by_doi accepts a direct PDF answer, else walks candidates, else fails with the landing page', async () => {
    stub = stubFetch((url) => (url.hostname === 'doi.org'
      ? { bytes: FAKE_PDF, url: 'https://publisher.example/article/1.pdf' }
      : { status: 404, text: 'no' }))
    const tool = mount({}, { apiKey: undefined }).tools.get('download_by_doi')!
    const direct = await tool.execute({ doi: '10.1000/direct' }, runContext()) as Record<string, unknown>
    assertOutput(tool.output.schema, direct)
    expect(direct).toMatchObject({ doi: '10.1000/direct', landingUrl: 'https://publisher.example/article/1.pdf', pdfUrl: 'https://publisher.example/article/1.pdf', bytes: FAKE_PDF.byteLength })

    stub.restore()
    stub = stubFetch((url) => {
      if (url.hostname === 'doi.org') return { text: '<html>landing</html>', contentType: 'text/html', url: 'https://www.mdpi.com/1234/htm' }
      if (url.href === 'https://www.mdpi.com/1234/pdf') return { bytes: FAKE_PDF, url: url.href }
      return { status: 403, text: 'forbidden' }
    })
    const viaCandidate = await tool.execute({ doi: '10.3390/x' }, runContext()) as Record<string, unknown>
    expect(viaCandidate).toMatchObject({ landingUrl: 'https://www.mdpi.com/1234/htm', pdfUrl: 'https://www.mdpi.com/1234/pdf' })

    stub.restore()
    stub = stubFetch((url) => (url.hostname === 'doi.org'
      ? { text: '<html>paywall</html>', contentType: 'text/html', url: 'https://www.sciencedirect.com/science/article/pii/S000' }
      : { status: 403, text: 'forbidden' }))
    await expect(tool.execute({ doi: '10.1016/j.x' }, runContext())).rejects.toThrow(/institutional access.*landing page: https:\/\/www\.sciencedirect\.com/)
    const read = mount({}, { apiKey: undefined }).tools.get('read_by_doi')!
    stub.restore()
    stub = stubFetch(() => ({ bytes: FAKE_PDF, url: 'https://x.example/p.pdf' }))
    const text = await read.execute({ doi: '10.1000/ok', max_chars: 20 }, runContext()) as Record<string, unknown>
    assertOutput(read.output.schema, text)
    expect(text).toMatchObject({ id: '10.1000/ok', pdfUrl: 'https://x.example/p.pdf', truncated: true })
  })
})

describe('Semantic Scholar graph tools', () => {
  it('get_semantic_citations keeps contexts/intents in extra and paginates with next', async () => {
    stub = stubFetch(() => ({ json: S2_CITATIONS, headers: { 'X-Credits-Charged': '10', 'X-Credits-Remaining': '100' } }))
    const tool = mount().tools.get('get_semantic_citations')!
    const value = await tool.execute({ paper_id: 'ARXIV:1706.03762', max_results: 2 }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    expect(stub.calls[0]?.url.pathname).toBe('/graph/v1/paper/ARXIV%3A1706.03762/citations')
    expect(stub.calls[0]?.url.searchParams.get('fields')).toContain('contexts')
    const papers = value.papers as Array<Record<string, unknown>>
    expect(papers[0]).toMatchObject({ id: 'aaa', title: 'BERT', extra: { contexts: ['We build on the Transformer [1] …', 'As shown in [1] …'], intents: ['methodology'], isInfluential: true } })
    expect('extra' in papers[1]!).toBe(true)
    expect((papers[1]!.extra as Record<string, unknown>)).toEqual({ isInfluential: false })
    expect(value).toMatchObject({ truncated: true, nextOffset: 2, credits: { charged: 10, remaining: 100 } })
    const text = textOf(tool.output.render({ paper_id: 'x' }, value as never))
    expect(text).toContain('Citing context: "We build on the Transformer [1] …"')
    expect(text).toContain('offset=2')
    const refs = mount().tools.get('get_semantic_references')!
    stub.restore()
    stub = stubFetch(() => ({ json: { data: [{ citedPaper: { paperId: 'ccc', title: 'Cited', authors: [] } }] } }))
    const refValue = await refs.execute({ paper_id: 'aaa' }, ctxWithAgent()) as { papers: unknown[]; truncated: boolean }
    expect(stub.calls[0]?.url.pathname).toBe('/graph/v1/paper/aaa/references')
    expect(refValue.papers).toHaveLength(1)
    expect(refValue.truncated).toBe(false)
  })

  it('author tools normalize profiles and lists', async () => {
    stub = stubFetch((url) => (url.pathname === '/graph/v1/author/search' ? { json: S2_AUTHORS } : { json: S2_AUTHORS.data[0] }))
    const fake = mount()
    const search = fake.tools.get('search_semantic_authors')!
    const list = await search.execute({ query: 'Etzioni', max_results: 2 }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(search.output.schema, list)
    expect(list).toMatchObject({ query: 'Etzioni', total: 42, truncated: true, nextOffset: 2 })
    expect((list.authors as unknown[])[0]).toEqual({
      authorId: '1741101', name: 'Oren Etzioni', affiliations: ['Allen Institute for AI'], paperCount: 400, citationCount: 30000, hIndex: 80,
      url: 'https://www.semanticscholar.org/author/1741101', externalIds: { ORCID: '0000-0001-2345-6789' },
    })
    expect((list.authors as unknown[])[1]).toEqual({ authorId: '2', name: 'Another Person', affiliations: [], url: 'https://www.semanticscholar.org/author/2' })
    const text = textOf(search.output.render({ query: 'Etzioni' }, list as never))
    expect(text).toContain('Semantic Scholar authors matching "Etzioni" (showing 2 of 42)')
    expect(text).toContain('h-index 80 · 400 papers · 30000 citations')
    expect(text).toContain('ORCID: 0000-0001-2345-6789')

    const detail = fake.tools.get('get_semantic_author_detail')!
    const one = await detail.execute({ author_id: '1741101' }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(detail.output.schema, one)
    expect(stub.calls.at(-1)?.url.pathname).toBe('/graph/v1/author/1741101')
    expect(textOf(detail.output.render({ author_id: '1741101' }, one as never))).toContain('**[Oren Etzioni]')

    stub.restore()
    stub = stubFetch(() => ({ json: S2_AUTHORS.data }))
    const batch = fake.tools.get('get_semantic_author_batch')!
    const many = await batch.execute({ author_ids: ['1741101', ' 2 '] }, ctxWithAgent()) as { authors: unknown[] }
    expect(stub.calls[0]?.method).toBe('POST')
    expect(stub.calls[0]?.body).toEqual({ ids: ['1741101', '2'] })
    expect(many.authors).toHaveLength(2)
    await expect(batch.execute({ author_ids: ['  '] }, ctxWithAgent())).rejects.toThrow(/at least one identifier/)

    stub.restore()
    stub = stubFetch(() => ({ json: { data: S2_SEARCH_RESPONSE.data, next: 2 } }))
    const papers = fake.tools.get('get_semantic_author_papers')!
    const authored = await papers.execute({ author_id: '1741101', max_results: 2 }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(papers.output.schema, authored)
    expect(stub.calls[0]?.url.pathname).toBe('/graph/v1/author/1741101/papers')
    expect(authored).toMatchObject({ truncated: true, nextOffset: 2 })

    stub.restore()
    stub = stubFetch(() => ({ json: { data: S2_AUTHORS.data } }))
    const paperAuthors = fake.tools.get('get_semantic_paper_authors')!
    const of = await paperAuthors.execute({ paper_id: 'aaa' }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(paperAuthors.output.schema, of)
    expect(of).toMatchObject({ query: 'aaa', total: 2, truncated: false })
  })

  it('batch, recommendations, bulk, and download tools', async () => {
    stub = stubFetch(() => ({ json: [S2_SEARCH_RESPONSE.data[0], null] }))
    const fake = mount()
    const batch = fake.tools.get('get_semantic_paper_batch')!
    const got = await batch.execute({ paper_ids: ['204e', 'missing-one'] }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(batch.output.schema, got)
    expect(stub.calls[0]?.body).toEqual({ ids: ['204e', 'missing-one'] })
    expect(got).toMatchObject({ total: 1, warning: '1 id(s) not found: missing-one' })

    stub.restore()
    stub = stubFetch(() => ({ json: { recommendedPapers: S2_SEARCH_RESPONSE.data } }))
    const recs = fake.tools.get('get_semantic_recommendations')!
    const rec = await recs.execute({ positive_paper_ids: ['a'], negative_paper_ids: ['b'], max_results: 5 }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(recs.output.schema, rec)
    expect(stub.calls[0]?.url.pathname).toBe('/recommendations/v1/papers/')
    expect(stub.calls[0]?.url.searchParams.get('limit')).toBe('5')
    expect(stub.calls[0]?.body).toEqual({ positivePaperIds: ['a'], negativePaperIds: ['b'] })
    expect((rec.papers as unknown[]).length).toBe(2)
    const forPaper = fake.tools.get('get_semantic_recommendations_for_paper')!
    await forPaper.execute({ paper_id: 'a', pool: 'all-cs' }, ctxWithAgent())
    expect(stub.calls[1]?.url.pathname).toBe('/recommendations/v1/papers/forpaper/a')
    expect(stub.calls[1]?.url.searchParams.get('from')).toBe('all-cs')

    stub.restore()
    stub = stubFetch(() => ({ json: { total: 5000, token: 'NEXT', data: [S2_SEARCH_RESPONSE.data[0], S2_SEARCH_RESPONSE.data[1], S2_SEARCH_RESPONSE.data[0]] } }))
    const bulk = fake.tools.get('search_semantic_bulk')!
    const page = await bulk.execute({ query: 'transformer', max_results: 2, sort: 'citationCount:desc' }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(bulk.output.schema, page)
    expect(stub.calls[0]?.url.pathname).toBe('/graph/v1/paper/search/bulk')
    expect(stub.calls[0]?.url.searchParams.get('sort')).toBe('citationCount:desc')
    expect(page).toMatchObject({ total: 5000, truncated: true, nextToken: 'NEXT' })
    expect((page.papers as unknown[]).length).toBe(2)
    expect(page.warning).toMatch(/only the first 2 are shown/)
    expect(textOf(bulk.output.render({ query: 'transformer' }, page as never))).toContain('call again with the returned nextToken')
    await bulk.execute({ query: 'transformer', token: 'NEXT' }, ctxWithAgent())
    expect(stub.calls[1]?.url.searchParams.get('token')).toBe('NEXT')

    stub.restore()
    stub = stubFetch(() => ({ json: S2_SEARCH_RESPONSE.data[0] }))
    const download = fake.tools.get('download_semantic')!
    const oa = await download.execute({ paper_id: 'ARXIV:1706.03762' }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(download.output.schema, oa)
    expect(oa).toMatchObject({ available: true, pdfUrl: 'https://arxiv.org/pdf/1706.03762' })
    stub.restore()
    stub = stubFetch(() => ({ json: S2_SEARCH_RESPONSE.data[1] }))
    const closed = await download.execute({ paper_id: 'x' }, ctxWithAgent()) as Record<string, unknown>
    expect(closed).toMatchObject({ available: false })
    expect(textOf(download.output.render({ paper_id: 'x' }, closed as never))).toContain('No open-access PDF listed')
    const read = fake.tools.get('read_semantic_paper')!
    await expect(read.execute({ paper_id: 'x' }, ctxWithAgent())).rejects.toThrow(/no open-access PDF is listed/)
    stub.restore()
    stub = stubFetch((url) => (url.hostname === 'arxiv.org' ? { bytes: FAKE_PDF } : { json: S2_SEARCH_RESPONSE.data[0], headers: { 'X-Credits-Charged': '1' } }))
    const full = await read.execute({ paper_id: 'ARXIV:1706.03762', max_chars: 50 }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(read.output.schema, full)
    expect(full).toMatchObject({ id: '204e3073870fae3d05bcbc2f6a8e263d9b72e776', title: 'Attention is All you Need', truncated: true, credits: { charged: 1 } })
  })
})

describe('PubMed graph tools', () => {
  it('citations/related unwrap list envelopes; batch reports missing PMIDs', async () => {
    stub = stubFetch(() => ({ json: { data: PUBMED_SEARCH_RESPONSE.papers, total: 7 } }))
    const fake = mount()
    const cit = fake.tools.get('get_pubmed_citations')!
    const value = await cit.execute({ pmid: '39575807', max_results: 5 }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(cit.output.schema, value)
    expect(stub.calls[0]?.url.pathname).toBe('/pubmed/v1/paper/39575807/citations')
    expect(stub.calls[0]?.url.searchParams.get('limit')).toBe('5')
    expect(value).toMatchObject({ total: 7, truncated: true })
    stub.restore()
    stub = stubFetch(() => ({ json: PUBMED_SEARCH_RESPONSE.papers }))
    const rel = fake.tools.get('get_pubmed_related')!
    const related = await rel.execute({ pmid: '39575807' }, ctxWithAgent()) as { papers: unknown[] }
    expect(stub.calls[0]?.url.pathname).toBe('/pubmed/v1/paper/39575807/related')
    expect(related.papers).toHaveLength(2)
    await expect(rel.execute({ pmid: 'abc' }, ctxWithAgent())).rejects.toThrow(/numeric/)
    stub.restore()
    stub = stubFetch(() => ({ json: { papers: [PUBMED_SEARCH_RESPONSE.papers[0]] } }))
    const batch = fake.tools.get('get_pubmed_paper_batch')!
    const got = await batch.execute({ pmids: ['39575807', '1'] }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(batch.output.schema, got)
    expect(stub.calls[0]?.body).toEqual({ pmids: ['39575807', '1'] })
    expect(got).toMatchObject({ total: 1, warning: '1 PMID(s) not found: 1' })
    await expect(batch.execute({ pmids: ['x'] }, ctxWithAgent())).rejects.toThrow(/numeric PMID/)
  })
})

describe('auto_cite', () => {
  const sse = [
    'event: progress', 'data: {"stage":"search"}', '',
    'event: result', 'data: ' + JSON.stringify({ annotatedText: 'Transformers [1] changed NLP [2].', references: [{ number: 1, formatted: 'A. Vaswani et al., "Attention Is All You Need," 2017.', doi: '10.48550/arXiv.1706.03762', year: 2017 }, { formatted: 'J. Devlin et al., BERT, 2019.', url: 'https://x' }], bibtex: '@article{vaswani2017}', stats: { citationCount: 2, searchCount: 6, processingTime: 41.2 } }), '',
  ].join('\n')

  it('streams the SSE result, validates input, and renders references', async () => {
    stub = stubFetch(() => ({ text: sse, contentType: 'text/event-stream', headers: { 'X-Credits-Charged': '20', 'X-Credits-Remaining': '980' } }))
    const tool = mount().tools.get('auto_cite')!
    const paragraph = 'Transformers changed NLP. '.repeat(6)
    const value = await tool.execute({ text: paragraph, citation_style: 'apa', min_citations: 99, field: 'nlp', preferred_venues: ['NeurIPS'] }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    const call = stub.calls[0]!
    expect(call.url.pathname).toBe('/api/proxy/auto-cite')
    expect(call.headers.accept).toBe('text/event-stream')
    expect(call.body).toMatchObject({ text: paragraph.trim(), citationStyle: 'apa', minCitations: 50, field: 'nlp', preferredVenues: ['NeurIPS'] })
    expect(value).toMatchObject({ annotatedText: 'Transformers [1] changed NLP [2].', bibtex: '@article{vaswani2017}', stats: { citationCount: 2, searchCount: 6 }, credits: { charged: 20, remaining: 980 } })
    const refs = value.references as Array<Record<string, unknown>>
    expect(refs[0]).toMatchObject({ number: 1, doi: '10.48550/arXiv.1706.03762', year: 2017 })
    expect(refs[1]).toMatchObject({ number: 2, url: 'https://x' })
    const text = textOf(tool.output.render({ text: paragraph }, value as never))
    expect(text).toContain('[1] A. Vaswani et al., "Attention Is All You Need," 2017. https://doi.org/10.48550/arXiv.1706.03762')
    expect(text).toContain('```bibtex')
    expect(text).toContain('AI4Scholar credits — this call: 20')
    await expect(tool.execute({ text: 'too short' }, ctxWithAgent())).rejects.toThrow(/at least 100 characters/)
    await expect(tool.execute({ text: paragraph, mode: 'manual' }, ctxWithAgent())).rejects.toThrow(/\[CITE\]/)
  })

  it('surfaces stream errors and HTTP failures', async () => {
    stub = stubFetch(() => ({ text: 'event: error\ndata: {"message":"no citation points"}\n\n', contentType: 'text/event-stream' }))
    const tool = mount().tools.get('auto_cite')!
    await expect(tool.execute({ text: 'x'.repeat(120) }, ctxWithAgent())).rejects.toThrow(/no citation points/)
    stub.restore()
    stub = stubFetch(() => ({ status: 402, json: { error: 'INSUFFICIENT_CREDITS', message: '积分不足' } }))
    await expect(tool.execute({ text: 'x'.repeat(120) }, ctxWithAgent())).rejects.toThrow(/HTTP 402 \(insufficient AI4Scholar credits; top up at https:\/\/ai4scholar\.net\): 积分不足/)
  })
})

describe('sci_draw', () => {
  it('validates action inputs, maps the body, and renders the image with credits', async () => {
    stub = stubFetch(() => ({ json: { success: true, imageUrl: 'https://cdn.example/fig.png', optimizedPrompt: 'A crisp diagram…', creditCost: 5 }, headers: { 'X-Credits-Charged': '5', 'X-Credits-Remaining': '95' } }))
    const tool = mount().tools.get('sci_draw')!
    await expect(tool.execute({ action: 'edit', prompt: 'x' }, ctxWithAgent())).rejects.toThrow(/requires at least one image/)
    await expect(tool.execute({ action: 'compose', prompt: 'x', images: ['a'] }, ctxWithAgent())).rejects.toThrow(/at least 2 images/)
    await expect(tool.execute({ action: 'generate' }, ctxWithAgent())).rejects.toThrow(/requires a prompt/)
    const value = await tool.execute({ action: 'smart', prompt: '细胞信号通路示意图', model: 'pro', image_size: '2K', aspect_ratio: '16:9', lang: 'zh' }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    expect(stub.calls[0]?.url.pathname).toBe('/api/proxy/nano/generate')
    expect(stub.calls[0]?.body).toEqual({ action: 'smart', prompt: '细胞信号通路示意图', model: 'pro', imageSize: '2K', aspectRatio: '16:9', lang: 'zh' })
    expect(value).toMatchObject({ action: 'smart', imageUrl: 'https://cdn.example/fig.png', optimizedPrompt: 'A crisp diagram…', credits: { charged: 5, remaining: 95, sessionTotal: 5 } })
    const text = textOf(tool.output.render({ action: 'smart' }, value as never))
    expect(text).toContain('![scientific figure](https://cdn.example/fig.png)')
    expect(text).toContain('AI4Scholar credits — this call: 5')
    stub.restore()
    stub = stubFetch(() => ({ json: { success: false, message: 'model overloaded' } }))
    await expect(tool.execute({ action: 'generate', prompt: 'x' }, ctxWithAgent())).rejects.toThrow(/model overloaded/)
    stub.restore()
    stub = stubFetch(() => ({ json: { success: true, creditCost: 2 } }))
    const noImage = await tool.execute({ action: 'generate', prompt: 'x' }, ctxWithAgent()) as Record<string, unknown>
    expect(noImage.warning).toMatch(/no imageUrl/)
    expect(noImage.credits).toMatchObject({ charged: 2 })
  })
})

describe('PubMed entity decoding', () => {
  it('decodes hex, decimal, and named entities in titles and abstracts', async () => {
    const { normalizePubmedPaper } = await import('../src/tools/pubmed.js')
    const paper = normalizePubmedPaper({ pmid: '1', title: 'Gene Editing for &#x3b2;-Thalassemia &amp; SCD &#946;', abstract: 'IL-6 &gt; 10 pg/mL', journal: { title: 'Nature &amp; Science' } })!
    expect(paper.title).toBe('Gene Editing for β-Thalassemia & SCD β')
    expect(paper.abstract).toBe('IL-6 > 10 pg/mL')
    expect(paper.venue).toBe('Nature & Science')
  })
})

describe('sliceText', () => {
  it('clamps offsets and reports continuation', () => {
    expect(sliceText('abcdef', undefined, 4)).toEqual({ totalChars: 6, offset: 0, text: 'abcd', truncated: true, nextOffset: 4 })
    expect(sliceText('abcdef', 4, 4)).toEqual({ totalChars: 6, offset: 4, text: 'ef', truncated: false })
    expect(sliceText('abcdef', 99, 4)).toEqual({ totalChars: 6, offset: 6, text: '', truncated: false })
    expect(sliceText('abcdef', -3, 0)).toEqual({ totalChars: 6, offset: 0, text: 'a', truncated: true, nextOffset: 1 })
  })
})

describe('google scholar credits', () => {
  it('sums charges across pages and keeps the last balance', async () => {
    let n = 0
    stub = stubFetch(() => ({ json: GS_PAGE_2, headers: { 'X-Credits-Charged': '1', 'X-Credits-Remaining': String(100 - ++n) } }))
    const tool = mount().tools.get('search_google_scholar')!
    const value = await tool.execute({ query: 'x', max_results: 3 }, ctxWithAgent()) as Record<string, unknown>
    assertOutput(tool.output.schema, value)
    expect(value.credits).toEqual({ charged: 1, remaining: 99, sessionTotal: 1 })
  })
})
