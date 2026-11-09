import type { Context } from '@deepseek-ai/cordis'
import { COMMAND_CARD_ROUTE } from './shared/command-card.js'
import type { CommandCardCatalog } from './shared/command-card.js'

interface Connection {
  fetch?: { register(route: { path: string; methods: readonly string[]; requestBody: 'buffered'; fetch(request: Request): Response }): unknown }
}

/** Use the host's authenticated fetch registry; no external balance/search request. */
export function applyCommandCardRoute(ctx: Context, catalog: () => CommandCardCatalog): void {
  ctx.inject(['connection'], child => {
    const bridge = (child.get('connection') as Connection | undefined)?.fetch
    if (!bridge?.register) return
    bridge.register({
      path: COMMAND_CARD_ROUTE, methods: ['GET'], requestBody: 'buffered',
      fetch(request) {
        return new Response(JSON.stringify(request.method === 'GET' ? { ok: true, value: catalog() } : { ok: false }), {
          status: request.method === 'GET' ? 200 : 405,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        })
      },
    })
  })
}
