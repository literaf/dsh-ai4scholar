import { describe, expect, it } from 'vitest'
import { apply, Config } from '../src/index.js'
import { COMMAND_CARD_ROUTE } from '../src/shared/command-card.js'
import { fakeContext, stubFetch } from './helpers.js'

function mount(settings: object) {
  const fake = fakeContext({ apiKey: 'fixture-key-never-exposed' })
  const routes: Array<{ path: string; fetch(request: Request): Response }> = []
  const get = fake.ctx.get.bind(fake.ctx)
  ;(fake.ctx as unknown as { get(name: string): unknown }).get = name => name === 'connection'
    ? { fetch: { register(route: typeof routes[number]) { routes.push(route); return async () => {} } } }
    : get(name as never)
  apply(fake.ctx, new Config(settings))
  return routes.find(route => route.path === COMMAND_CARD_ROUTE)!
}
describe('command card metadata', () => {
  it('is opt-in and never queries balance, search, or the model', async () => {
    const fetch = stubFetch(() => { throw new Error('No upstream request is expected') })
    try {
      const route = mount({})
      const response = route.fetch(new Request('http://localhost'+COMMAND_CARD_ROUTE))
      expect((await response.json()).value.enabled).toBe(false)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(fetch.calls).toHaveLength(0)
    } finally { fetch.restore() }
  })
  it('uses enabled capabilities/defaults and never exposes credentials or hidden guidance', async () => {
    const route = mount({ showCommandCard: true, googleScholar: false, searchSources: ['pubmed'], resultsPerSource: { pubmed: 25 } })
    const body = await route.fetch(new Request('http://localhost'+COMMAND_CARD_ROUTE)).json()
    expect(body.value.enabled).toBe(true)
    expect(body.value.defaults).toEqual([{ source: 'pubmed', count: 25 }])
    expect(body.value.commands.some((command: { name: string }) => command.name === 'ai4s-google')).toBe(false)
    expect(body.value.commands.some((command: { name: string }) => command.name === 'ai4s-references')).toBe(true)
    expect(JSON.stringify(body)).not.toContain('fixture-key-never-exposed')
    expect(body.value.commands.every((command: object) => !('guidance' in command) && !('tools' in command))).toBe(true)
    expect(route.fetch(new Request('http://localhost'+COMMAND_CARD_ROUTE, { method: 'POST' })).status).toBe(405)
    const off = mount({ showCommandCard: true, command: false })
    expect((await off.fetch(new Request('http://localhost'+COMMAND_CARD_ROUTE)).json()).value).toMatchObject({ enabled: false, commands: [] })
  })
})
