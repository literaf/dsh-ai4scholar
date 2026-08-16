/**
 * HTTP client for the ai4scholar.net API plus the plain fetch helpers the
 * free upstream platforms (arXiv, bioRxiv, doi.org) need. Owns base URL,
 * timeout, retry, bearer authorization, and credit-header capture; tool
 * modules own paths, payloads, and result shapes.
 * @module dsh-ai4scholar/api-client
 */

/** Client construction options; every value comes from the plugin config. */
export interface ApiClientOptions {
  /** API origin, e.g. `https://ai4scholar.net`. */
  baseUrl: string
  /** Per-attempt request timeout in milliseconds. */
  timeoutMs: number
  /** Total attempts for retryable failures (429 and network errors); `1` disables retry. */
  maxRetries: number
  /** Base delay before the second attempt; doubles per attempt. */
  retryBackoffMs: number
  /** `User-Agent` header value. */
  userAgent: string
}

/** Credit accounting the API reports on billed responses (`X-Credits-*` headers). */
export interface CreditsInfo {
  /** Credits this call cost. */
  charged?: number
  /** Account balance after this call. */
  remaining?: number
}

/** Successful response with the parsed JSON body. */
export interface ApiOk<T> {
  ok: true
  data: T
  /** Present when the response carried credit headers. */
  credits?: CreditsInfo
}

/** Failed response: a human-readable message and the HTTP status (`0` for transport errors). */
export interface ApiErr {
  ok: false
  error: string
  status: number
  /** Machine code from the body (`MISSING_API_KEY`, `INSUFFICIENT_CREDITS`, …) when the server sent one. */
  code?: string
}

/** Discriminated result of one API call. */
export type ApiResult<T> = ApiOk<T> | ApiErr

/** Per-request options. */
export interface RequestOptions {
  /** Bearer token; omitted requests go out unauthenticated. */
  apiKey?: string | undefined
  /** Caller cancellation; combined with the per-attempt timeout. */
  signal?: AbortSignal | undefined
  /** Query-string parameters; `undefined` values are skipped. */
  query?: Record<string, string | number | boolean | undefined> | undefined
  /** Override the per-attempt timeout for slow endpoints (image generation, streaming). */
  timeoutMs?: number | undefined
}

/** Result of one plain binary download. */
export interface BinaryResult {
  ok: true
  data: Uint8Array
  /** URL after redirects. */
  finalUrl: string
  contentType: string
}

/** Maximum characters of a non-2xx response body kept in the error message. */
const ERROR_BODY_MAX_CHARS = 240

/** Browser-like headers publishers and preprint servers accept for PDF downloads. */
export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/pdf,application/x-pdf,*/*',
}

/**
 * Sleep that rejects when `signal` aborts, so a retry backoff never outlives
 * the tool call that scheduled it.
 */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      reject(abortError(signal))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function abortError(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason
  return reason instanceof Error ? reason : new Error('The operation was aborted')
}

/** Whether `error` is an abort raised by the caller's own signal (never retried). */
function isCallerAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true && error instanceof Error && error.name === 'AbortError'
}

/** Whether `error` is the per-attempt timeout (retryable). */
function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError'
}

/** Combine the caller signal with a fresh timeout. */
export function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)]
  if (signal !== undefined) signals.push(signal)
  return AbortSignal.any(signals)
}

/** Parse the `X-Credits-*` headers when present. */
export function creditsFromHeaders(headers: Headers): CreditsInfo | undefined {
  const charged = numberHeader(headers.get('x-credits-charged'))
  const remaining = numberHeader(headers.get('x-credits-remaining'))
  if (charged === undefined && remaining === undefined) return undefined
  return {
    ...(charged !== undefined ? { charged } : {}),
    ...(remaining !== undefined ? { remaining } : {}),
  }
}

function numberHeader(value: string | null): number | undefined {
  if (value === null) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Turn a non-2xx response into a message the model can act on: the status,
 * plus the server's own explanation when the body carries one.
 */
async function describeFailure(res: Response, hintCredentials = true): Promise<{ error: string; code?: string }> {
  let detail = ''
  let code: string | undefined
  try {
    const text = await res.text()
    if (text.length > 0) {
      try {
        const parsed: unknown = JSON.parse(text)
        if (typeof parsed === 'object' && parsed !== null) {
          const record = parsed as Record<string, unknown>
          const candidate = record.message ?? record.error ?? record.detail
          detail = typeof candidate === 'string' ? candidate : text
          if (typeof record.error === 'string' && /^[A-Z0-9_]+$/.test(record.error)) code = record.error
        } else {
          detail = text
        }
      } catch {
        // Not JSON: keep the raw text as the detail.
        detail = text
      }
    }
  } catch {
    // Body unreadable: the status alone still explains the failure.
  }
  detail = detail.replace(/\s+/g, ' ').trim()
  if (detail.length > ERROR_BODY_MAX_CHARS) detail = `${detail.slice(0, ERROR_BODY_MAX_CHARS)}…`
  const hint = hintCredentials && (res.status === 401 || res.status === 403)
    ? ' (check the AI4Scholar API key)'
    : hintCredentials && res.status === 402
      ? ' (insufficient AI4Scholar credits; top up at https://ai4scholar.net)'
      : res.status === 403
        ? ' (the site refused the download; it may block automated clients)'
        : ''
  const error = detail.length > 0
    ? `HTTP ${res.status}${hint}: ${detail}`
    : `HTTP ${res.status} ${res.statusText}${hint}`.trim()
  return code !== undefined ? { error, code } : { error }
}

/** Thin JSON client over `fetch` with bounded retry and credit-header capture. */
export class Ai4ScholarClient {
  constructor(private readonly options: ApiClientOptions) {}

  /**
   * GET a JSON endpoint.
   * @param path - path relative to `baseUrl`.
   * @param options - authorization, cancellation, and query parameters.
   * @returns the parsed body or a described failure; never throws for HTTP or
   *   transport errors, only for caller-initiated aborts.
   */
  get<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    return this.request<T>('GET', path, undefined, options)
  }

  /**
   * POST a JSON body.
   * @param path - path relative to `baseUrl`.
   * @param body - JSON payload.
   * @param options - authorization, cancellation, and query parameters.
   * @returns the parsed body or a described failure; never throws for HTTP or
   *   transport errors, only for caller-initiated aborts.
   */
  post<T>(path: string, body: Record<string, unknown>, options: RequestOptions = {}): Promise<ApiResult<T>> {
    return this.request<T>('POST', path, body, options)
  }

  /**
   * POST a JSON body to a server-sent-events endpoint and collect the final
   * `result` event. Not retried: the server bills as it streams.
   * @param path - path relative to `baseUrl`.
   * @param body - JSON payload.
   * @param options - authorization, cancellation, and the stream timeout.
   * @returns the `result` event payload, or the last `error` event / transport failure.
   */
  async postSse<T>(path: string, body: Record<string, unknown>, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const url = this.buildUrl(path, options.query)
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { ...this.headers(options.apiKey), Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: requestSignal(options.signal, timeoutMs),
      })
    } catch (error) {
      if (isCallerAbort(error, options.signal)) throw error
      return { ok: false, error: isTimeout(error) ? `request timed out after ${timeoutMs} ms` : String(error instanceof Error ? error.message : error), status: 0 }
    }
    if (!res.ok) return { ok: false, ...(await describeFailure(res)), status: res.status }
    const credits = creditsFromHeaders(res.headers)
    if (res.body === null) return { ok: false, error: 'empty response body', status: res.status }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let event = ''
    let result: T | undefined
    let lastError: string | undefined
    const consume = (line: string): void => {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim()
        if (raw.length === 0) return
        try {
          const data: unknown = JSON.parse(raw)
          if (event === 'result') result = data as T
          else if (event === 'error') {
            lastError = typeof data === 'object' && data !== null && typeof (data as { message?: unknown }).message === 'string'
              ? (data as { message: string }).message
              : raw
          }
        } catch {
          // Malformed frame: ignore, the final result frame is what matters.
        }
      } else if (line.length === 0) {
        event = ''
      }
    }
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) consume(line.replace(/\r$/, ''))
      }
      if (buffer.length > 0) consume(buffer)
    } catch (error) {
      if (isCallerAbort(error, options.signal)) throw error
      return { ok: false, error: isTimeout(error) ? `stream timed out after ${timeoutMs} ms` : String(error instanceof Error ? error.message : error), status: 0 }
    }
    if (result === undefined) return { ok: false, error: lastError ?? 'stream ended without a result', status: res.status }
    return { ok: true, data: result, ...(credits !== undefined ? { credits } : {}) }
  }

  /**
   * GET a URL outside ai4scholar.net (arXiv, bioRxiv APIs) as text. No auth,
   * no retry, one timeout.
   * @param url - absolute URL.
   * @param options - cancellation and timeout.
   * @returns the body text or a described failure.
   */
  async fetchText(url: string, options: Pick<RequestOptions, 'signal' | 'timeoutMs'> = {}): Promise<ApiResult<string>> {
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': this.options.userAgent, 'Accept': 'application/atom+xml, application/json, text/plain, */*' },
        signal: requestSignal(options.signal, timeoutMs),
      })
      if (!res.ok) return { ok: false, ...(await describeFailure(res, false)), status: res.status }
      return { ok: true, data: await res.text() }
    } catch (error) {
      if (isCallerAbort(error, options.signal)) throw error
      return { ok: false, error: isTimeout(error) ? `request timed out after ${timeoutMs} ms` : String(error instanceof Error ? error.message : error), status: 0 }
    }
  }

  /**
   * GET a URL outside ai4scholar.net as JSON. No auth, no retry, one timeout.
   * @param url - absolute URL.
   * @param options - cancellation and timeout.
   * @returns the parsed body or a described failure.
   */
  async fetchJson<T>(url: string, options: Pick<RequestOptions, 'signal' | 'timeoutMs'> = {}): Promise<ApiResult<T>> {
    const text = await this.fetchText(url, options)
    if (!text.ok) return text
    try {
      return { ok: true, data: JSON.parse(text.data) as T }
    } catch {
      return { ok: false, error: 'response is not valid JSON', status: 0 }
    }
  }

  /**
   * Download a binary resource (a PDF) following redirects with browser-like
   * headers.
   * @param url - absolute URL.
   * @param options - cancellation and timeout.
   * @returns the bytes with the final URL and content type, or a described failure.
   */
  async fetchBinary(url: string, options: Pick<RequestOptions, 'signal' | 'timeoutMs'> = {}): Promise<BinaryResult | ApiErr> {
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs
    try {
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        redirect: 'follow',
        signal: requestSignal(options.signal, timeoutMs),
      })
      if (!res.ok) return { ok: false, ...(await describeFailure(res, false)), status: res.status }
      return {
        ok: true,
        data: new Uint8Array(await res.arrayBuffer()),
        finalUrl: res.url.length > 0 ? res.url : url,
        contentType: res.headers.get('content-type') ?? '',
      }
    } catch (error) {
      if (isCallerAbort(error, options.signal)) throw error
      return { ok: false, error: isTimeout(error) ? `download timed out after ${timeoutMs} ms` : String(error instanceof Error ? error.message : error), status: 0 }
    }
  }

  private buildUrl(path: string, query: RequestOptions['query']): string {
    const url = new URL(path, this.options.baseUrl)
    if (query !== undefined) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value))
      }
    }
    return url.toString()
  }

  private headers(apiKey: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': this.options.userAgent,
    }
    if (apiKey !== undefined && apiKey.length > 0) headers.Authorization = `Bearer ${apiKey}`
    return headers
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: Record<string, unknown> | undefined,
    options: RequestOptions,
  ): Promise<ApiResult<T>> {
    const url = this.buildUrl(path, options.query)
    const attempts = Math.max(1, this.options.maxRetries)
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs
    let lastError: ApiErr = { ok: false, error: 'request not attempted', status: 0 }
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        await sleep(this.options.retryBackoffMs * 2 ** (attempt - 1), options.signal)
      }
      try {
        const res = await fetch(url, {
          method,
          headers: this.headers(options.apiKey),
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: requestSignal(options.signal, timeoutMs),
        })
        if (res.status === 429) {
          lastError = { ok: false, ...(await describeFailure(res)), status: 429 }
          continue
        }
        if (!res.ok) return { ok: false, ...(await describeFailure(res)), status: res.status }
        const credits = creditsFromHeaders(res.headers)
        return { ok: true, data: (await res.json()) as T, ...(credits !== undefined ? { credits } : {}) }
      } catch (error) {
        if (isCallerAbort(error, options.signal)) throw error
        const message = error instanceof Error ? error.message : String(error)
        lastError = {
          ok: false,
          error: isTimeout(error) ? `request timed out after ${timeoutMs} ms` : message,
          status: 0,
        }
      }
    }
    return { ok: false, error: `${lastError.error} (after ${attempts} attempt${attempts === 1 ? '' : 's'})`, status: lastError.status, ...(lastError.code !== undefined ? { code: lastError.code } : {}) }
  }
}
