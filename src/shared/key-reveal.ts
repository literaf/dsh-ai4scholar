/** The one credential managed by the settings card. */
export const API_KEY_REF = 'AI4SCHOLAR_API_KEY'

/** Owner-authenticated, explicit reveal action; never fetched on page load. */
export const KEY_REVEAL_ROUTE = '/api/ai4scholar/key/reveal'

export type KeyRevealResponse =
  | { ok: true; key: string }
  | { ok: false; code: 'MISSING_KEY' | 'UNAVAILABLE' }
