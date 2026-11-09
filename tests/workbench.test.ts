import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, Config } from '../src/index.js'
import { applyWorkbenchRoute, parseWorkbenchRequest, workbenchResult } from '../src/workbench.js'
import type { Runtime } from '../src/runtime.js'
import { WORKBENCH_ROUTE } from '../src/shared/workbench.js'
import { fakeContext, stubFetch } from './helpers.js'
import { S2_SEARCH_RESPONSE } from './fixtures.js'

type Route = { path: string; fetch(request: Request): Promise<Response> }
function mount() {
  const routes: Route[] = []
  const fake = fakeContext({ apiKey: 'workbench-test-key' })
  const original = fake.ctx.get.bind(fake.ctx)
  ;(fake.ctx as unknown as { get(name: string): unknown }).get = (name) =>
    name === 'connection'
      ? {
          fetch: {
            register(route: Route) {
              routes.push(route)
              return async () => {}
            },
          },
        }
      : original(name as never)
  apply(
    fake.ctx,
    new Config({ maxRetries: 1, searchSources: ['pubmed'], resultsPerSource: { pubmed: 25 }, googleScholar: false }),
  )
  return routes.find((r) => r.path === WORKBENCH_ROUTE)!
}
const request = (body: unknown) =>
  new Request(`http://localhost${WORKBENCH_ROUTE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('workbench host bridge', () => {
  it('uses configured defaults without searching, then reuses the actual search tool and keeps its cursor/credits', async () => {
    const fetch = stubFetch(() => ({
      json: S2_SEARCH_RESPONSE,
      headers: { 'x-credits-charged': '0.5', 'x-credits-remaining': '99.5' },
    }))
    try {
      const route = mount()
      const catalog = await (await route.fetch(new Request(`http://localhost${WORKBENCH_ROUTE}`))).json()
      expect(catalog.value.defaultSource).toBe('pubmed')
      expect(catalog.value.sources.find((s: { id: string }) => s.id === 'pubmed').defaultLimit).toBe(25)
      expect(catalog.value.sources.some((s: { id: string }) => s.id === 'google-scholar')).toBe(false)
      expect(fetch.calls).toHaveLength(0)
      const response = await route.fetch(
        request({ source: 'semantic-scholar', query: 'attention', limit: 2, yearFrom: 2017, yearTo: 2024 }),
      )
      const body = await response.json()
      expect(body.ok).toBe(true)
      expect(body.value.items).toHaveLength(2)
      expect(body.value.items[0]).toMatchObject({
        title: 'Attention is All you Need',
        kind: 'paper',
        authors: ['Ashish Vaswani', 'Noam M. Shazeer', 'Niki Parmar', 'Jakob Uszkoreit'],
      })
      expect(body.value).toMatchObject({ next: { offset: 2 }, total: 1234, credits: { charged: 0.5, remaining: 99.5 } })
      expect(fetch.calls[0]!.url.searchParams.get('year')).toBe('2017-2024')
      expect(fetch.calls[0]!.url.searchParams.get('limit')).toBe('2')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(JSON.stringify(body)).not.toContain('workbench-test-key')
    } finally {
      fetch.restore()
    }
  })

  it('rejects unknown/disabled tools, invalid ranges and oversized requests before executing', async () => {
    const fetch = stubFetch(() => {
      throw new Error('Unexpected upstream request')
    })
    try {
      const route = mount()
      for (const body of [
        { source: 'sci_draw', query: 'run me', limit: 1 },
        { source: 'google-scholar', query: 'disabled', limit: 10 },
        { source: 'semantic-scholar', query: 'test', limit: 101 },
        { source: 'semantic-scholar', query: 'test', yearFrom: 2025, yearTo: 2020 },
        { source: 'arxiv', query: 'test', yearFrom: 2020 },
        { source: 'snippets', query: 'test', offset: 10 },
        { source: 'pubmed', query: 'test', offset: -1 },
        { source: 'pubmed', query: 'x'.repeat(20_000) },
      ])
        expect((await route.fetch(request(body))).status).toBe(400)
      expect(fetch.calls).toHaveLength(0)
    } finally {
      fetch.restore()
    }
  })

  it('keeps snippets and patents distinct and strips unsafe result links', () => {
    const input = parseWorkbenchRequest({ source: 'snippets', query: 'mechanism', limit: 10 })
    const snippets = workbenchResult(input, {
      snippets: [
        {
          text: '<script>raw text</script>',
          section: 'Methods',
          paper: { paperId: 'CorpusId:42', title: 'Mechanism', authors: ['A Li'], url: 'javascript:alert(1)' },
        },
      ],
    })
    expect(snippets.items[0]).toMatchObject({
      kind: 'snippet',
      section: 'Methods',
      abstract: '<script>raw text</script>',
    })
    expect(snippets.items[0]?.url).toBeUndefined()
    expect(snippets.total).toBeUndefined()
    const patents = workbenchResult(
      { source: 'google-patents', query: 'battery', limit: 10 },
      {
        page: 1,
        nextPage: 2,
        patents: [
          {
            patentId: 'CN1',
            title: 'A battery',
            assignee: 'Company',
            publicationNumber: 'CN123',
            publicationDate: '2024-01-01',
            snippet: 'Patent summary',
            url: 'https://patents.google.com/patent/CN123',
            pdfUrl: 'data:text/html,unsafe',
          },
        ],
      },
    )
    expect(patents.items[0]).toMatchObject({
      kind: 'patent',
      abstract: 'Patent summary',
      facts: [
        { label: 'publicationNumber', value: 'CN123' },
        { label: 'assignee', value: 'Company' },
        { label: 'publicationDate', value: '2024-01-01' },
      ],
    })
    expect(patents.items[0]?.pdfUrl).toBeUndefined()
    expect(patents.next).toEqual({ page: 2 })
  })
})

const compatRoot = process.env.DSH_COMPAT_ROOT
describe.skipIf(!compatRoot)('workbench on the published host', () => {
  it('requires owner authentication and removes the route on unload', async () => {
    const sdk = createRequire(resolve(compatRoot!, 'package.json'))
    const { Context } = sdk('@deepseek-ai/cordis')
    const { HostConnectionService } = sdk('@deepseek-ai/dsh-client-connection')
    const ctx = new Context()
    let authenticated = false
    const connection = new HostConnectionService(ctx, [], {
      isAuthenticated: () => authenticated,
      authenticateApi: () => undefined,
    })
    const execute = vi.fn(async () => ({ source: 'semantic-scholar', query: 'test', total: 0, papers: [] }))
    ctx.reflect.provide('tools', { get: (name: string) => (name === 'search_semantic' ? { execute } : undefined) })
    const runtime = {
      limits: { defaultMaxResults: 10, maxResultsCap: 100 },
      resultsPerSource: {},
      timeouts: { tool: 30_000 },
    } as Runtime
    const fiber = await ctx.plugin(
      {
        inject: ['tools'],
        apply(context: Context) {
          applyWorkbenchRoute(context, runtime, ['semantic-scholar'])
        },
      },
      {},
    )
    try {
      const headers = { host: 'localhost', origin: 'http://localhost' }
      expect(connection.admit({ headers })).toEqual({ rejection: 401 })
      authenticated = true
      expect(connection.admit({ headers: { ...headers, origin: 'https://other.example' } })).toEqual({ rejection: 403 })
      const { peer } = connection.admit({ headers })
      const handler = connection.createSharedFetchHandler('/api')
      const search = () => request({ source: 'semantic-scholar', query: 'test', limit: 10 })
      expect((await handler.fetch(search(), { principal: { kind: 'guest' } })).status).toBe(403)
      expect(execute).not.toHaveBeenCalled()
      expect((await (await handler.fetch(search(), peer)).json()).ok).toBe(true)
      expect(execute).toHaveBeenCalledOnce()
      await fiber.dispose()
      expect((await handler.fetch(search(), peer)).status).toBe(404)
    } finally {
      await fiber.dispose()
    }
  })
})
