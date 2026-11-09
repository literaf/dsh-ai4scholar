/** Read-only stable-release check, including locally installed prerelease builds. */
import type { Context } from '@deepseek-ai/cordis'
import { UPDATE_ROUTE } from './shared/update.js'
import type { UpdateInfo, UpdateResponse } from './shared/update.js'

const REGISTRY_URL = 'https://registry.npmjs.org/dsh-ai4scholar/latest'
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/

function version(value: string): { core: number[]; prerelease: boolean } {
  const match = value.length <= 256 ? VERSION_PATTERN.exec(value) : null
  if (!match) throw new Error('Invalid version')
  const core = match.slice(1, 4).map(Number)
  if (!core.every(Number.isSafeInteger) || match[4]?.split('.').some((part) => /^0\d+$/.test(part)))
    throw new Error('Invalid version')
  return { core, prerelease: match[4] !== undefined }
}

/** The registry target must be stable; only the installed version may be a prerelease. */
export function compareStableRelease(currentVersion: string, latestVersion: string): UpdateInfo['status'] {
  const current = version(currentVersion)
  const latest = version(latestVersion)
  if (latest.prerelease) throw new Error('The latest tag does not name a stable release')
  for (let i = 0; i < 3; i++) {
    if (current.core[i]! < latest.core[i]!) return 'available'
    if (current.core[i]! > latest.core[i]!) return 'ahead'
  }
  return current.prerelease ? 'available' : 'current'
}

export async function checkForUpdate(currentVersion: string, signal: AbortSignal): Promise<UpdateInfo> {
  // No AI4Scholar key, request data or profile information leaves the Host.
  const response = await fetch(REGISTRY_URL, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  })
  if (!response.ok) throw new Error('Registry request failed')
  const data: unknown = await response.json()
  if (typeof data !== 'object' || data === null || !('name' in data) || data.name !== 'dsh-ai4scholar' ||
      !('version' in data) || typeof data.version !== 'string') throw new Error('Invalid registry response')
  return { currentVersion, latestVersion: data.version, status: compareStableRelease(currentVersion, data.version) }
}

interface Connection {
  fetch?: {
    register(route: {
      path: string
      methods: readonly string[]
      requestBody: 'buffered'
      fetch(request: Request): Promise<Response>
    }): () => Promise<void>
  }
}

export function applyUpdateRoute(ctx: Context, currentVersion: string): void {
  ctx.inject(['connection'], (child) => {
    const connection = child.get('connection') as Connection | undefined
    if (!connection?.fetch?.register) return
    // The host enforces authentication and owner access, and removes the route on unload.
    connection.fetch.register({
      path: UPDATE_ROUTE,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        let body: UpdateResponse
        let status = 200
        if (request.method !== 'GET') {
          body = { ok: false, currentVersion, code: 'METHOD_NOT_ALLOWED' }
          status = 405
        } else {
          try {
            body = { ok: true, value: await checkForUpdate(currentVersion, request.signal) }
          } catch {
            body = { ok: false, currentVersion, code: 'CHECK_FAILED' }
            status = 502
          }
        }
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        })
      },
    })
  })
}
