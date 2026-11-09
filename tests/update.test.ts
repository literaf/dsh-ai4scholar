import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyUpdateRoute, checkForUpdate, compareStableRelease } from '../src/update.js'
import { UPDATE_ROUTE } from '../src/shared/update.js'

afterEach(() => vi.unstubAllGlobals())

describe('stable release checks', () => {
  it.each([
    ['0.5.2', '0.5.2', 'current'],
    ['0.5.9', '0.5.10', 'available'],
    ['0.5.2', '0.6.0', 'available'],
    ['0.6.0-beta.1', '0.5.2', 'ahead'],
    ['0.6.0-beta.1', '0.6.0', 'available'],
    ['0.6.0-beta.1+local.1', '0.6.0', 'available'],
    ['0.6.0+local.1', '0.6.0+registry.2', 'current'],
    ['1.0.0', '0.99.99', 'ahead'],
  ])('compares %s to stable %s without downgrading', (current, latest, status) => {
    expect(compareStableRelease(current, latest)).toBe(status)
  })

  it('rejects malformed versions and a prerelease assigned to the stable channel', () => {
    for (const latest of ['0.6.0-rc.1', 'v0.6.0', '0.06.0', '0.6', '<script>', '99999999999999999999.0.0'])
      expect(() => compareStableRelease('0.5.2', latest)).toThrow()
    expect(() => compareStableRelease('0.6.0-01', '0.6.0')).toThrow()
  })

  it('reads only fixed public registry metadata and propagates cancellation', async () => {
    const fetch = vi.fn(async () => Response.json({ name: 'dsh-ai4scholar', version: '0.5.2' }))
    vi.stubGlobal('fetch', fetch)
    const abort = new AbortController()
    expect(await checkForUpdate('0.6.0-beta.1', abort.signal)).toEqual({ currentVersion: '0.6.0-beta.1', latestVersion: '0.5.2', status: 'ahead' })
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://registry.npmjs.org/dsh-ai4scholar/latest')
    expect(options.headers).toEqual({ Accept: 'application/json' })
    expect(options.body).toBeUndefined()
    expect(options.cache).toBe('no-store')
    abort.abort()
    expect(options.signal?.aborted).toBe(true)
  })

  it('does not turn invalid or failed registry responses into an up-to-date result', async () => {
    for (const response of [new Response('offline', { status: 503 }), Response.json({ name: 'another-plugin', version: '99.0.0' }), Response.json({ name: 'dsh-ai4scholar' }), Response.json({ name: 'dsh-ai4scholar', version: '1.0.0-beta' })]) {
      vi.stubGlobal('fetch', vi.fn(async () => response))
      await expect(checkForUpdate('0.5.2', new AbortController().signal)).rejects.toThrow()
    }
  })
})

const compatRoot = process.env.DSH_COMPAT_ROOT
describe.skipIf(!compatRoot)('update check on the published host', () => {
  it('checks only for authenticated owners, reports errors, and removes the route on unload', async () => {
    const sdk = createRequire(resolve(compatRoot!, 'package.json'))
    const { Context } = sdk('@deepseek-ai/cordis')
    const { HostConnectionService } = sdk('@deepseek-ai/dsh-client-connection')
    const ctx = new Context()
    let authenticated = false
    const connection = new HostConnectionService(ctx, [], { isAuthenticated: () => authenticated, authenticateApi: () => undefined })
    const registry = vi.fn(async () => Response.json({ name: 'dsh-ai4scholar', version: '0.6.0' }))
    vi.stubGlobal('fetch', registry)
    const fiber = await ctx.plugin({ inject: ['connection'], apply(context: Context) { applyUpdateRoute(context, '0.6.0-beta.1') } }, {})
    const request = () => new Request(`http://localhost${UPDATE_ROUTE}`)
    try {
      const headers = { host: 'localhost', origin: 'http://localhost' }
      expect(connection.admit({ headers })).toEqual({ rejection: 401 })
      authenticated = true
      expect(connection.admit({ headers: { ...headers, origin: 'https://other.example' } })).toEqual({ rejection: 403 })
      const { peer } = connection.admit({ headers })
      const handler = connection.createSharedFetchHandler('/api')
      expect((await handler.fetch(request(), { principal: { kind: 'guest' } })).status).toBe(403)
      expect(registry).not.toHaveBeenCalled()
      const result = await handler.fetch(request(), peer)
      expect(await result.json()).toEqual({ ok: true, value: { currentVersion: '0.6.0-beta.1', latestVersion: '0.6.0', status: 'available' } })
      expect(result.headers.get('cache-control')).toBe('no-store')
      registry.mockRejectedValueOnce(new Error('sensitive transport diagnostic'))
      const failed = await handler.fetch(request(), peer)
      expect(failed.status).toBe(502)
      expect(await failed.json()).toEqual({ ok: false, currentVersion: '0.6.0-beta.1', code: 'CHECK_FAILED' })
      await fiber.dispose()
      expect((await handler.fetch(request(), peer)).status).toBe(404)
    } finally {
      await fiber.dispose()
    }
  })
})
