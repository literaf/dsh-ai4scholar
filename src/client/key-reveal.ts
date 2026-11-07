import { KEY_REVEAL_ROUTE } from '../shared/key-reveal.js'

/** Fetch only on an explicit reveal click; the caller owns the short-lived value. */
export async function revealSavedKey(signal: AbortSignal): Promise<string> {
  const response = await fetch(KEY_REVEAL_ROUTE, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal,
  })
  if (!response.ok) throw new Error('Key reveal unavailable')
  const body = await response.json() as { ok?: unknown; key?: unknown }
  if (body?.ok !== true || typeof body.key !== 'string' || body.key.length === 0) throw new Error('Key reveal unavailable')
  return body.key
}
