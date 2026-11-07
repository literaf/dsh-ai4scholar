import { afterEach, describe, expect, it } from 'vitest'
import { BulkPageCache } from '../src/bulk-pages.js'
import { mount, runContext, stubFetch } from './helpers.js'
import type { StubbedFetch } from './helpers.js'
import type { PaperSearchValue } from '../src/paper.js'

let stub: StubbedFetch | undefined
afterEach(() => { stub?.restore(); stub = undefined })

describe('bulk search continuation', () => {
  it('returns every row before advancing the upstream token and charges only fetched pages', async () => {
    stub = stubFetch((url) => ({
      json: url.searchParams.has('token')
        ? { data: [{ paperId: 'd', title: 'Paper D' }], total: 4 }
        : { data: ['a', 'b', 'c'].map((paperId) => ({ paperId, title: `Paper ${paperId}` })), total: 4, token: 'upstream-2' },
      headers: { 'X-Credits-Charged': '1', 'X-Credits-Remaining': '99' },
    }))
    const tool = mount().tools.get('search_semantic_bulk')!
    const exec = { ...runContext(), agent: {} } as ReturnType<typeof runContext>
    const search = (token?: string) => tool.execute({ query: 'battery', max_results: 1, ...(token ? { token } : {}) }, exec) as Promise<PaperSearchValue>
    const first = await search()
    const second = await search(first.nextToken)
    const repeated = await search(first.nextToken)
    const third = await search(second.nextToken)
    expect([first, second, third].flatMap((x) => x.papers.map((p) => p.id))).toEqual(['a', 'b', 'c'])
    expect(repeated.papers).toEqual(second.papers)
    expect(second.credits).toBeUndefined()
    expect(third.nextToken).toBe('upstream-2')
    expect(stub.calls).toHaveLength(1)
    const fourth = await search(third.nextToken)
    expect(fourth.papers[0]?.id).toBe('d')
    expect(fourth.truncated).toBe(false)
    expect(stub.calls).toHaveLength(2)
    expect(stub.calls[1]?.url.searchParams.get('token')).toBe('upstream-2')
  })

  it('rejects cross-session, changed-query, malformed and expired local cursors without fetching', () => {
    let now = 1
    const cache = new BulkPageCache<number>(() => now, 10, 2)
    const owner = {}
    const first = cache.first([1, 2, 3], 3, undefined, 'query', owner, 1)
    expect(() => cache.read(first.nextToken, 'query', {}, 1)).toThrow(/another conversation/)
    expect(() => cache.read(first.nextToken, 'changed', owner, 1)).toThrow(/original query/)
    expect(() => cache.read('ai4s-bulk:bad:1', 'query', owner, 1)).toThrow(/expired/)
    expect(cache.read(first.nextToken, 'query', owner, 2)?.papers).toEqual([2, 3])
    now = 12
    expect(() => cache.read(first.nextToken, 'query', owner, 1)).toThrow(/expired/)
  })
})
