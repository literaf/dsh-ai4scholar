/** An explicit saved-key reveal through the host's authenticated owner channel. */
import type { Context } from '@deepseek-ai/cordis'
import { makeCredentialResolvers } from './runtime.js'
import { API_KEY_REF, KEY_REVEAL_ROUTE } from './shared/key-reveal.js'
import type { KeyRevealResponse } from './shared/key-reveal.js'

/** Structural bridge: older SDKs do not declare the authenticated Fetch registry. */
interface KeyRevealConnection {
  fetch?: {
    register(route: {
      path: string
      methods: readonly ['POST']
      requestBody: 'buffered'
      fetch(request: Request): Promise<Response>
    }): () => Promise<void>
  }
}

function answer(body: KeyRevealResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/**
 * Connection enforces Host/Origin checks, session authentication, and owner-only
 * access before dispatch. Hosts without that registry get no reveal route.
 * The registry owns disposal with this plugin's child context.
 */
export function applyKeyRevealRoute(ctx: Context): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.get('connection') as KeyRevealConnection | undefined
    if (typeof connection?.fetch?.register !== 'function') return
    // Match the card's fixed reference, including when tools use a custom ref.
    const { apiKey } = makeCredentialResolvers(connectionCtx, API_KEY_REF)
    connection.fetch.register({
      path: KEY_REVEAL_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch() {
        try {
          const key = await apiKey()
          return key === undefined
            ? answer({ ok: false, code: 'MISSING_KEY' }, 404)
            : answer({ ok: true, key })
        } catch {
          // Provider errors must never echo a secret into error text or logs.
          return answer({ ok: false, code: 'UNAVAILABLE' }, 503)
        }
      },
    })
  })
}
