import { afterEach, describe, expect, it } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { mount, runContext, stubFetch, textOf } from './helpers.js'
import type { StubbedFetch } from './helpers.js'
import { normalizeScholarResult } from '../src/tools/google-scholar.js'
import { formatPaper } from '../src/paper.js'

let stub: StubbedFetch | undefined
afterEach(() => { stub?.restore(); stub = undefined })
async function call(name: string, args: Record<string, unknown>) {
  const tool = mount().tools.get(name)!
  const value = await tool.execute(args, runContext())
  expect(validateJsonSchemaValue(tool.output.schema as ObjectJsonSchema, value, '')).toEqual([])
  return { value, text: textOf(tool.output.render(args, value as never)), meta: tool.output.presentationMeta?.(args, value as never) }
}

describe('Google Scholar follow-up identifiers', () => {
  it('preserves opaque paper, cited-by and cluster identifiers, including numbers beyond JS precision', () => {
    const paper = normalizeScholarResult({ title: 'Battery', id: 'AbCdEfGh123J', link: 'https://example.org/paper', inlineLinks: { citedByCitesId: '9007199254740993123', versionsLink: '/scholar?cluster=9007199254740993124', relatedLink: '/scholar?q=related:x' } })!
    expect(paper.id).toBe('AbCdEfGh123J')
    expect(paper.externalIds).toEqual({ GoogleScholar: 'AbCdEfGh123J', GoogleScholarCites: '9007199254740993123', GoogleScholarCluster: '9007199254740993124' })
    expect(formatPaper(paper, 1, { abstractMaxChars: 0 })).toContain('GoogleScholarCites: 9007199254740993123')
    const missing = normalizeScholarResult({ title: 'No IDs', id: 90071992547409930, inlineLinks: { citedByCitesId: 90071992547409930 } })!
    expect(missing.externalIds?.GoogleScholar).toBeUndefined()
    expect(missing.externalIds?.GoogleScholarCites).toBeUndefined()
  })

  it('sends natural-language criteria mapped to supported search filters without changing pagination', async () => {
    stub = stubFetch(() => ({ json: { results: [{ id: 'paperId', title: 'Review' }] } }))
    await call('search_google_scholar', { query: 'solid state batteries', max_results: 5, offset: 5, year_from: 2022, review_only: true, sort_by_date: true, language: 'en', cites: '9007199254740993123' })
    expect(stub.calls[0]?.body).toEqual({ query: 'solid state batteries', page: 2, results: 5, yearFrom: 2022, reviewOnly: true, sortByDate: true, language: 'en', cites: '9007199254740993123' })
  })
})

describe('new Google tools', () => {
  it.each([true, false])('records billed empty author responses even when credit display is %s', async (showCredits) => {
    stub = stubFetch((url) => url.pathname === '/api/credits'
      ? { json: { credits: { total_available: 99 } } }
      : { json: {}, headers: { 'X-Credits-Charged': '1', 'X-Credits-Remaining': '99' } })
    const fake = mount({ showCredits })
    const context = { ...runContext(), agent: {} } as never
    await expect(fake.tools.get('get_google_scholar_author')!.execute({ author_id: 'oneAAAAJ' }, context)).rejects.toThrow(/no author profile/)
    const balance = await fake.tools.get('get_ai4scholar_credits')!.execute({}, context)
    expect(balance).toMatchObject({ totalAvailable: 99, sessionTotal: 1 })
  })

  it('keeps author candidates separate with affiliation, ID and profile pagination', async () => {
    stub = stubFetch(() => ({ json: { profiles: [
      { title: 'Alex Li', authorId: 'oneAAAAJ', affiliations: 'University A', citedBy: 51, interests: [{ title: 'batteries' }] },
      { title: 'Alex Li', authorId: 'twoAAAAJ', affiliations: 'University B', citedBy: 12, interests: [] },
    ], nextPageToken: 'next-opaque' }, headers: { 'X-Credits-Charged': '1', 'X-Credits-Remaining': '99' } }))
    const result = await call('search_google_scholar_profiles', { name: 'Alex Li', after_author: 'previous-opaque' })
    expect(stub.calls[0]?.url.pathname).toBe('/google-scholar/v1/profiles')
    expect(stub.calls[0]?.body).toEqual({ authorName: 'Alex Li', afterAuthor: 'previous-opaque' })
    expect(result.value).toMatchObject({ authors: [{ id: 'oneAAAAJ', affiliations: 'University A' }, { id: 'twoAAAAJ', affiliations: 'University B' }], nextPageToken: 'next-opaque', credits: { charged: 1, remaining: 99 } })
    expect(result.text).toContain('select by name and affiliation')
    expect(result.text).toContain('next-opaque')
  })

  it('returns available author articles and coauthors without inventing h-index or a complete oeuvre', async () => {
    stub = stubFetch(() => ({ json: { name: 'Alex Li', affiliations: 'University A', citedBy: 51, interests: ['batteries'], articles: [{ title: 'Battery paper', link: 'https://example.org/paper', authors: 'Alex Li', year: '2024', citedBy: 5, citationId: 'oneAAAAJ:articleId' }], coAuthors: [{ name: 'Bo Wu', authorId: 'coAAAAJ', affiliations: 'University A' }] } }))
    const result = await call('get_google_scholar_author', { author_id: 'oneAAAAJ', sort: 'pubdate' })
    expect(stub.calls[0]?.body).toEqual({ authorId: 'oneAAAAJ', sort: 'pubdate' })
    expect(result.value).toMatchObject({ author: { id: 'oneAAAAJ', name: 'Alex Li', citationCount: 51 }, articles: [{ title: 'Battery paper', year: 2024, citationId: 'oneAAAAJ:articleId' }], coAuthors: [{ id: 'coAAAAJ' }] })
    expect(result.text).toContain('not a complete publication list')
    expect(result.value).not.toHaveProperty('author.hIndex')
  })

  it('exports a known paper’s citation formats and links and refuses URL/DOI/author-page identifiers', async () => {
    stub = stubFetch(() => ({ json: { citations: [{ title: 'APA', snippet: 'Li (2024). Battery paper.' }], links: [{ name: 'BibTeX', link: 'https://scholar.google.com/bibtex?q=ref' }] } }))
    const result = await call('get_google_scholar_citation', { paper_id: 'AbCdEfGh123J', language: 'en' })
    expect(stub.calls[0]?.body).toEqual({ paperId: 'AbCdEfGh123J', language: 'en' })
    expect(result.value).toMatchObject({ citations: [{ style: 'APA', text: 'Li (2024). Battery paper.' }], links: [{ name: 'BibTeX' }] })
    for (const paper_id of ['https://example.org/paper', '10.1234/paper', 'oneAAAAJ:article']) await expect(call('get_google_scholar_citation', { paper_id })).rejects.toThrow(/platform-native identifier/)
    expect(stub.calls).toHaveLength(1)
  })

  it('searches patent metadata with company, country, status and typed dates, preserving publication numbers', async () => {
    stub = stubFetch(() => ({ json: { results: [{ title: 'Solid state battery', patentId: 'patent/CN123A/zh', publicationNumber: 'CN123A', inventor: 'Inventor', assignee: 'Company', filingDate: '2021-01-02', publicationDate: '2022-02-03', grantDate: null, countryStatus: { CN: 'ACTIVE' }, detailLink: 'https://patents.google.com/patent/CN123A/zh', pdfUrl: 'https://example.org/patent.pdf' }] }, headers: { 'X-Credits-Charged': '1' } }))
    const result = await call('search_google_patents', { query: '固态电池', assignee: '宁德时代', country: 'CN', after: 'filing:20210101', before: 'filing:20261231', status: 'APPLICATION', max_results: 1, page: 2 })
    expect(stub.calls[0]?.url.pathname).toBe('/google-scholar/v1/patents')
    expect(stub.calls[0]?.body).toMatchObject({ query: '固态电池', num: 1, page: 2, assignee: '宁德时代', country: 'CN', after: 'filing:20210101', before: 'filing:20261231', status: 'APPLICATION' })
    expect(result.value).toMatchObject({ source: 'google-patents', nextPage: 3, patents: [{ publicationNumber: 'CN123A', countryStatus: { CN: 'ACTIVE' } }] })
    expect(result.value).not.toHaveProperty('patents.0.grantDate')
    expect(result.text).toContain('filingDate: 2021-01-02')
    await expect(call('search_google_patents', { query: 'battery', after: '2021-01-01' })).rejects.toThrow(/Patent dates/)
    await expect(call('search_google_patents', { query: 'battery', page: 0 })).rejects.toThrow(/positive integer/)
    expect(stub.calls).toHaveLength(1)
  })

  it('surfaces failed responses instead of reporting an empty author or patent result', async () => {
    stub = stubFetch(() => ({ status: 503, json: { error: 'UPSTREAM_UNAVAILABLE', message: 'temporarily unavailable' } }))
    for (const [name, args] of [ ['search_google_patents', { query: 'battery' }], ['search_google_scholar_profiles', { name: 'Li' }], ['get_google_scholar_author', { author_id: 'oneAAAAJ' }], ['get_google_scholar_citation', { paper_id: 'AbCdEfGh123J' }] ] as const) {
      await expect(mount({ maxRetries: 1 }).tools.get(name)!.execute(args, runContext())).rejects.toThrow(/failed/)
    }
  })
})
