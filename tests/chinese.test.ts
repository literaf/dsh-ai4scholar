import { afterEach, describe, expect, it } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { normalizeChinesePaper } from '../src/tools/chinese.js'
import { formatPaper, paperListMeta, presentPaperListResult } from '../src/paper.js'
import type { Paper, PaperSearchValue } from '../src/paper.js'
import { mergePaperLists } from '../src/tools/unified.js'
import { mount, runContext, stubFetch, textOf } from './helpers.js'
import type { StubbedFetch } from './helpers.js'

const record = {
  source: 'wanfang', id: 'OpenPeriodical:test-2024', documentId: 'test-2024', collection: 'OpenPeriodical',
  title: '人工智能技术在鸟类迁徙研究中的应用', authors: ['张三', '李四'], year: 2024,
  venue: '测试期刊', doi: '10.1234/migration.2024', abstract: '用于接口测试的中文摘要。',
  keywords: ['鸟类迁徙', '人工智能'], publicationInfo: '2024, 1(2): 3–9', resource: 'journal',
  content_kind: 'abstract', content_truncated: false, citationCount: 12,
}
const response = { source: 'wanfang', query: '鸟类迁徙', papers: [record], total: 1, offset: 0, nextOffset: null }
let stub: StubbedFetch | undefined
afterEach(() => { stub?.restore(); stub = undefined })

describe('Chinese literature records', () => {
  it('keeps bibliographic data with public source names and no invented article or PDF links', () => {
    const paper = normalizeChinesePaper(record)!
    expect(paper).toMatchObject({
      source: 'chinese', id: record.id, title: record.title, authors: record.authors,
      doi: record.doi, url: `https://doi.org/${record.doi}`, abstract: record.abstract,
      extra: { resource: 'journal', contentKind: 'abstract', contentTruncated: false, keywords: record.keywords },
    })
    expect(JSON.stringify(paper)).not.toMatch(/wanfang|万方|collection|documentId/i)
    expect(paper.pdfUrl).toBeUndefined()
    const unlinked = normalizeChinesePaper({ ...record, doi: undefined, abstract: undefined, content_kind: 'metadata' })!
    expect(unlinked.url).toBe('')
    expect(unlinked.abstract).toBeUndefined()
    expect(formatPaper(unlinked, 1, { abstractMaxChars: 600 })).toContain(`**${record.title}**`)
    expect(presentPaperListResult('Chinese literature', { isError: false, content: [], meta: paperListMeta([unlinked], false, undefined) })).toBeUndefined()
    expect(normalizeChinesePaper({ title: 'No id' })).toBeUndefined()
  })

  it('merges Chinese and English versions by DOI and preserves their source labels', () => {
    const chinese = normalizeChinesePaper(record)!
    const english: Paper = { source: 'semantic-scholar', id: 's2', title: 'An English title for the same article', authors: ['Zhang San'], url: 'https://example.org/paper', doi: 'https://doi.org/10.1234/MIGRATION.2024' }
    const merged = mergePaperLists([[english], [chinese]])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ abstract: record.abstract, externalIds: { ChineseLiterature: record.id }, extra: { foundIn: ['semantic-scholar', 'chinese'] } })
    expect(mergePaperLists([[{ ...english, doi: undefined } as unknown as Paper], [chinese]])).toHaveLength(2)
  })

  it('matches normalized Chinese titles, corroborates short ones, and keeps conflicting DOIs separate', () => {
    const chinese = normalizeChinesePaper({ ...record, doi: undefined, title: '深度学习综述' })!
    const other: Paper = { ...chinese, source: 'google-scholar', id: 'gs', externalIds: {}, title: '深度学习：综述', url: 'https://example.org/paper' }
    expect(mergePaperLists([[chinese], [other]])).toHaveLength(1)
    expect(mergePaperLists([[chinese], [{ ...other, authors: ['王五'] }]])).toHaveLength(2)
    expect(mergePaperLists([[chinese], [{ ...other, year: 2023 }]])).toHaveLength(2)
    expect(mergePaperLists([[chinese], [chinese]])).toHaveLength(1)
    const long = normalizeChinesePaper(record)!
    const different: Paper = { ...other, title: record.title + '。', doi: '10.1234/different' }
    expect(mergePaperLists([[long], [different]])).toHaveLength(2)
    const noDoi = normalizeChinesePaper({ ...record, doi: undefined })!
    expect(mergePaperLists([[noDoi], [{ ...different, doi: undefined } as unknown as Paper]])).toHaveLength(1)
  })
})

describe('search_chinese', () => {
  it('sends one bounded, authenticated request with filters and returns the API cursor and credits', async () => {
    stub = stubFetch(() => ({ json: { ...response, total: 42, offset: 10, nextOffset: 15 }, headers: { 'X-Credits-Charged': '1', 'X-Credits-Remaining': '99' } }))
    const tool = mount({ resultsPerSource: { chinese: 5 } }).tools.get('search_chinese')!
    const args = { query: ' 鸟类迁徙 ', offset: 10, resource: 'journal', sort: 'citations', year_from: 2020, year_to: 2025 }
    const value = await tool.execute(args, runContext()) as PaperSearchValue
    expect(stub.calls).toHaveLength(1)
    expect(stub.calls[0]!.url.pathname).toBe('/api/proxy/wanfang/search')
    expect(stub.calls[0]).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer test-key' }, body: { query: '鸟类迁徙', limit: 5, offset: 10, resource: 'journal', sort: 'citations', yearFrom: 2020, yearTo: 2025 } })
    expect(value).toMatchObject({ source: 'chinese', total: 42, nextOffset: 15, truncated: true, credits: { charged: 1, remaining: 99 } })
    expect(validateJsonSchemaValue(tool.output.schema as ObjectJsonSchema, value, '')).toEqual([])
    expect(textOf(tool.output.render(args, value))).toContain('offset=15')
    expect(JSON.stringify([tool.description, tool.parameters, value])).not.toMatch(/wanfang|万方/i)
    await tool.execute({ query: '鸟类迁徙', max_results: 900 }, runContext())
    expect(stub.calls[1]!.body).toMatchObject({ limit: 100 })
  })

  it('keeps missing abstracts and an exhausted cursor distinct from full-text access', async () => {
    stub = stubFetch(() => ({ json: { ...response, papers: [{ ...record, abstract: undefined, content_kind: 'metadata' }] } }))
    const tool = mount().tools.get('search_chinese')!
    const value = await tool.execute({ query: '鸟类迁徙' }, runContext()) as PaperSearchValue
    expect(value.truncated).toBe(false)
    expect(value.nextOffset).toBeUndefined()
    expect(value.papers[0]!.abstract).toBeUndefined()
    expect(value.papers[0]!.pdfUrl).toBeUndefined()
  })

  it('stops at the supported pagination window and explains the remaining matches', async () => {
    stub = stubFetch(() => ({ json: { ...response, offset: 5000, total: 8000 } }))
    const tool = mount().tools.get('search_chinese')!
    const value = await tool.execute({ query: '鸟类迁徙', offset: 5000 }, runContext()) as PaperSearchValue
    expect(value.nextOffset).toBeUndefined()
    expect(value.warning).toContain('Refine the keywords or year range')
  })

  it.each([
    { query: '' }, { query: '中'.repeat(301) }, { query: Array(21).fill('词').join(' ') },
    { query: '鸟类', offset: 5001 }, { query: '鸟类', offset: -1 }, { query: '鸟类', offset: 1.5 },
    { query: '鸟类', year_from: 2026, year_to: 2020 }, { query: '鸟类', year_from: 99 },
  ])('rejects invalid parameters before making a billed request: %j', async (args) => {
    stub = stubFetch(() => ({ json: response }))
    await expect(mount().tools.get('search_chinese')!.execute(args, runContext())).rejects.toThrow()
    expect(stub.calls).toHaveLength(0)
  })

  it('reports API failures instead of calling them an empty search', async () => {
    stub = stubFetch(() => ({ status: 502, json: { error: 'UPSTREAM_ERROR', message: '中文文献检索暂不可用' } }))
    await expect(mount({ maxRetries: 1 }).tools.get('search_chinese')!.execute({ query: '鸟类' }, runContext())).rejects.toThrow(/中文文献检索暂不可用/)
  })
})

describe('Chinese literature in search_papers', () => {
  it('uses translated keywords for Chinese results, de-duplicates by DOI, and sums both charges', async () => {
    stub = stubFetch((url) => url.pathname.startsWith('/graph/')
      ? { json: { total: 1, data: [{ paperId: 's2', title: 'English title of the same paper', authors: [], externalIds: { DOI: record.doi } }] }, headers: { 'X-Credits-Charged': '1', 'X-Credits-Remaining': '99' } }
      : { json: { ...response, total: 12, nextOffset: 1 }, headers: { 'X-Credits-Charged': '1', 'X-Credits-Remaining': '98' } })
    const tool = mount({ resultsPerSource: { chinese: 3 } }).tools.get('search_papers')!
    const value = await tool.execute({ query: 'bird migration', chinese_query: '鸟类迁徙', sources: ['semantic-scholar', 'chinese'], year_from: 2020 }, runContext()) as { papers: Paper[] }
    expect(stub.calls).toHaveLength(2)
    expect(stub.calls.find((call) => call.url.pathname.startsWith('/graph/'))!.url.searchParams.get('query')).toBe('bird migration')
    expect(stub.calls.find((call) => call.url.pathname.startsWith('/api/proxy/'))!.body).toMatchObject({ query: '鸟类迁徙', limit: 3, yearFrom: 2020 })
    expect(value).toMatchObject({ total: 1, sources: ['semantic-scholar', 'chinese'], credits: { charged: 2, remaining: 98 }, perSource: [{ source: 'semantic-scholar' }, { source: 'chinese', query: '鸟类迁徙', nextOffset: 1 }] })
    expect(value.papers[0]!.extra?.foundIn).toEqual(['semantic-scholar', 'chinese'])
    expect(validateJsonSchemaValue(tool.output.schema as ObjectJsonSchema, value, '')).toEqual([])
  })

  it('supports Chinese-only defaults, the family toggle, and partial-source failures', async () => {
    const only = mount({ searchSources: ['chinese'] })
    expect(only.tools.get('search_papers')!.description).toContain('default Chinese literature only')
    const disabled = mount({ chineseLiterature: false })
    expect(disabled.tools.has('search_chinese')).toBe(false)
    expect(JSON.stringify(disabled.sections)).not.toContain('search_chinese')
    const schema = JSON.parse(JSON.stringify(disabled.tools.get('search_papers')!.parameters))
    expect(schema.properties.sources.items.enum).not.toContain('chinese')
    stub = stubFetch((url) => url.pathname.startsWith('/graph/')
      ? { json: { total: 1, data: [{ paperId: 's2', title: 'A result still available', authors: [] }] } }
      : { status: 502, json: { message: 'Temporarily unavailable' } })
    const value = await mount({ maxRetries: 1 }).tools.get('search_papers')!.execute({ query: 'birds', sources: ['semantic-scholar', 'chinese'] }, runContext())
    expect(value).toMatchObject({ total: 1, warning: expect.stringContaining('Chinese literature') })
  })
})
