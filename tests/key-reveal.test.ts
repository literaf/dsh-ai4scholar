import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { applyKeyRevealRoute } from '../src/key-reveal.js'
import { API_KEY_REF, KEY_REVEAL_ROUTE } from '../src/shared/key-reveal.js'

type Route = { path: string; methods: readonly string[]; requestBody: string; fetch(request: Request): Promise<Response> }

function mountReveal(resolveKey: (ref: string) => Promise<{ value: string } | undefined>) {
  const routes: Route[] = []
  const context = {
    get: (name: string) => name === 'connection'
      ? { fetch: { register: (route: Route) => { routes.push(route); return async () => {} } } }
      : name === 'credentials' ? { resolve: resolveKey } : undefined,
    inject: (_deps: string[], callback: (ctx: unknown) => void) => { callback(context) },
  }
  applyKeyRevealRoute(context as unknown as Context)
  return routes[0]!
}

describe('saved-key reveal', () => {
  it('only registers an explicit POST on the owner channel and resolves the card reference on each click', async () => {
    let key = 'test-key-one'
    const read = vi.fn(async () => ({ value: key }))
    const route = mountReveal(read)
    expect(route).toMatchObject({ path: KEY_REVEAL_ROUTE, methods: ['POST'], requestBody: 'buffered' })
    expect(read).not.toHaveBeenCalled()
    const request = new Request(`http://localhost${KEY_REVEAL_ROUTE}`, { method: 'POST' })
    const response = await route.fetch(request)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: true, key })
    expect(read).toHaveBeenCalledWith(API_KEY_REF)
    key = 'test-key-two'
    expect(await (await route.fetch(request)).json()).toEqual({ ok: true, key })
  })

  it('returns no secret in missing-key or provider-error responses', async () => {
    const request = new Request(`http://localhost${KEY_REVEAL_ROUTE}`, { method: 'POST' })
    const missing = await mountReveal(async () => undefined).fetch(request)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ ok: false, code: 'MISSING_KEY' })
    const failed = await mountReveal(async () => { throw new Error('sensitive provider details') }).fetch(request)
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({ ok: false, code: 'UNAVAILABLE' })
    expect(failed.headers.get('cache-control')).toBe('no-store')
  })

  it('does not fall back to an unprotected route when the owner channel is unavailable', () => {
    const get = vi.fn(() => undefined)
    const context = { get, inject: (_deps: string[], callback: (ctx: unknown) => void) => { callback(context) } }
    expect(() => applyKeyRevealRoute(context as unknown as Context)).not.toThrow()
    expect(get.mock.calls).toHaveLength(1)
  })
})

const compatRoot = process.env.DSH_COMPAT_ROOT
describe.skipIf(!compatRoot)('saved-key reveal through the published host', () => {
  it('enforces authentication, origin and owner access, and removes the route on unload', async () => {
    const sdk = createRequire(resolve(compatRoot!, 'package.json'))
    const { Context } = sdk('@deepseek-ai/cordis')
    const { HostConnectionService } = sdk('@deepseek-ai/dsh-client-connection')
    const ctx = new Context()
    let authenticated = false
    const connection = new HostConnectionService(ctx, [], {
      isAuthenticated: () => authenticated,
      authenticateApi: () => undefined,
    })
    const read = vi.fn(async () => ({ value: 'host-fixture-key' }))
    ctx.reflect.provide('credentials', { resolve: read })
    const fiber = await ctx.plugin({ apply: applyKeyRevealRoute }, {})
    try {
      const headers = { host: 'localhost', origin: 'http://localhost' }
      expect(connection.admit({ headers })).toEqual({ rejection: 401 })
      authenticated = true
      expect(connection.admit({ headers: { ...headers, origin: 'https://untrusted.example' } })).toEqual({ rejection: 403 })
      const { peer } = connection.admit({ headers })
      expect(peer.principal.kind).toBe('owner')
      const handler = connection.createSharedFetchHandler('/api')
      const request = () => new Request(`http://localhost${KEY_REVEAL_ROUTE}`, { method: 'POST' })
      const denied = await handler.fetch(request(), { principal: { kind: 'guest' } })
      expect(denied.status).toBe(403)
      expect(read).not.toHaveBeenCalled()
      expect((await handler.fetch(new Request(`http://localhost${KEY_REVEAL_ROUTE}`), peer)).status).toBe(404)
      expect(read).not.toHaveBeenCalled()
      expect(await (await handler.fetch(request(), peer)).json()).toEqual({ ok: true, key: 'host-fixture-key' })
      await fiber.dispose()
      expect((await handler.fetch(request(), peer)).status).toBe(404)
    } finally {
      await fiber.dispose()
      await connection.browserPeer.dispose()
    }
  })
})
