/**
 * PDF download, DOI resolution, and text extraction shared by every
 * `read_*` / `download_*` tool, plus the common full-text output shape.
 * @module dsh-ai4scholar/pdf
 */

import { pathToFileURL } from 'node:url'
import type { PDFParse as PDFParser } from 'pdf-parse'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { InferValue, GenericCallView } from '@deepseek-ai/dsh-tools'
import type { Ai4ScholarClient, ApiErr } from './api-client.js'
import { BROWSER_HEADERS, requestSignal } from './api-client.js'
import { CREDITS_SCHEMA, compact, formatCredits } from './paper.js'
import type { CreditsValue } from './paper.js'

/** `%PDF` magic. */
function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

/** A downloaded PDF. */
export interface PdfDownload {
  ok: true
  data: Uint8Array
  finalUrl: string
}

/**
 * Download a PDF, rejecting bodies that are not PDFs (publisher landing pages).
 * @param client - the shared client (browser-like headers, timeout).
 * @param url - PDF URL.
 * @param options - cancellation and timeout.
 * @returns the bytes or a described failure.
 */
export async function fetchPdf(client: Ai4ScholarClient, url: string, options: { signal?: AbortSignal | undefined; timeoutMs: number }): Promise<PdfDownload | ApiErr> {
  const res = await client.fetchBinary(url, options)
  if (!res.ok) return res
  if (!looksLikePdf(res.data)) {
    return { ok: false, error: `the URL did not return a PDF (content-type ${res.contentType || 'unknown'}); it may be a landing page or require access`, status: 0 }
  }
  return { ok: true, data: res.data, finalUrl: res.finalUrl }
}

/** Extracted text with the page count. */
export interface PdfText {
  text: string
  pages: number
}

type PdfParserConstructor = typeof PDFParser
type PdfLoadOptions = ConstructorParameters<PdfParserConstructor>[0]

interface PdfRuntime {
  PDFParse: PdfParserConstructor
  options: Omit<PdfLoadOptions, 'data'>
}

let pdfRuntimePromise: Promise<PdfRuntime> | undefined

function isElectronNonBrowserProcess(): boolean {
  const processType = (process as NodeJS.Process & { type?: string }).type
  return process.versions.electron !== undefined && processType !== undefined && processType !== 'browser'
}

function installCanvasGlobals(canvas: typeof import('@napi-rs/canvas')): void {
  for (const key of ['DOMMatrix', 'ImageData', 'Path2D'] as const) {
    if (globalThis[key] === undefined) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: canvas[key] })
    }
  }
}

async function initializePdfRuntime(): Promise<PdfRuntime> {
  if (!isElectronNonBrowserProcess()) {
    const { PDFParse } = await import('pdf-parse')
    return { PDFParse, options: {} }
  }

  installCanvasGlobals(await import('@napi-rs/canvas'))
  const { PDFParse } = await import('pdf-parse')
  const { CanvasFactory, getPath } = await import('pdf-parse/worker')
  PDFParse.setWorker(pathToFileURL(getPath()).href)
  return {
    PDFParse,
    options: {
      CanvasFactory,
      disableFontFace: true,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      useWorkerFetch: false,
    },
  }
}

function loadPdfRuntime(): Promise<PdfRuntime> {
  pdfRuntimePromise ??= initializePdfRuntime()
  return pdfRuntimePromise
}

/**
 * Extract text from PDF bytes.
 * @param data - PDF bytes.
 * @returns the concatenated page text and page count.
 */
export async function extractPdfText(data: Uint8Array): Promise<PdfText> {
  const { PDFParse, options } = await loadPdfRuntime()
  const pdf = new PDFParse({ ...options, data })
  try {
    const result = await pdf.getText()
    return { text: result.text, pages: result.total }
  } finally {
    await pdf.destroy()
  }
}

/** Candidate PDF URLs derived from a publisher landing page URL. */
export function pdfCandidatesFor(landingUrl: string): string[] {
  const candidates: string[] = []
  let u: URL
  try {
    u = new URL(landingUrl)
  } catch {
    return candidates
  }
  const host = u.hostname
  const path = u.pathname
  if (host.includes('sciencedirect.com')) candidates.push(`${u.origin}${path}/pdfft?isDTMRedir=true&download=true`)
  if (host.includes('springer.com') || host.includes('nature.com')) {
    const m = /\/articles?\/(10\.\d+\/[^\s?#]+)/.exec(path)
    if (m !== null) candidates.push(`https://${host}/content/pdf/${m[1]}.pdf`)
  }
  if (host.includes('onlinelibrary.wiley.com')) candidates.push(`${u.origin}${path.replace('/doi/', '/doi/pdfdirect/')}`)
  if (host.includes('tandfonline.com')) candidates.push(`${u.origin}${path.replace('/doi/full/', '/doi/pdf/').replace('/doi/abs/', '/doi/pdf/')}`)
  if (host.includes('mdpi.com') && path.endsWith('/htm')) candidates.push(`${u.origin}${path.replace(/\/htm$/, '/pdf')}`)
  if (host.includes('ieeexplore.ieee.org')) {
    const arnumber = /\/document\/(\d+)/.exec(path)?.[1]
    if (arnumber !== undefined) candidates.push(`https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=${arnumber}`)
  }
  if (host.includes('dl.acm.org') || host.includes('pubs.acs.org')) candidates.push(`${u.origin}${path.replace('/doi/', '/doi/pdf/')}`)
  if (host.includes('pubs.rsc.org')) candidates.push(`${u.origin}${path.replace('/articlelanding/', '/articlepdf/')}`)
  if (host.includes('journals.plos.org')) {
    const id = u.searchParams.get('id')
    if (id !== null) candidates.push(`${u.origin}${path.replace(/\/article$/, '/article/file')}?id=${encodeURIComponent(id)}&type=printable`)
  }
  if (host.includes('frontiersin.org') && /\/articles\/10\./.test(path)) candidates.push(`${u.origin}${path.replace(/\/full$/, '')}/pdf`)
  if ((host.includes('biorxiv.org') || host.includes('medrxiv.org')) && path.startsWith('/content/')) candidates.push(`${u.origin}${path.replace(/(\.full)?(\.pdf)?$/, '')}.full.pdf`)
  if (host.includes('arxiv.org') && path.startsWith('/abs/')) candidates.push(`https://arxiv.org/pdf/${path.slice('/abs/'.length)}`)
  // Generic fallback for path-only URLs; a query string means the site keys on parameters, not paths.
  if (!path.endsWith('.pdf') && u.search.length === 0) candidates.push(`${u.origin}${path}.pdf`)
  return [...new Set(candidates)]
}

/** Outcome of resolving a DOI to PDF bytes. */
export type DoiResolution = (PdfDownload & { landingUrl: string }) | (ApiErr & { landingUrl?: string })

/**
 * Resolve a DOI through doi.org with PDF content negotiation, then try
 * publisher PDF URL patterns derived from the landing page. Publisher access
 * depends on the network dsh runs on (institutional subscriptions).
 * @param client - the shared client.
 * @param doi - bare DOI.
 * @param options - cancellation and per-download timeout.
 * @returns the PDF with the URLs involved, or a described failure.
 */
export async function resolveDoiToPdf(client: Ai4ScholarClient, doi: string, options: { signal?: AbortSignal | undefined; timeoutMs: number }): Promise<DoiResolution> {
  // arXiv DataCite DOIs map straight onto the PDF; skip the resolver round-trip.
  const arxiv = /^10\.48550\/arxiv\.(.+)$/i.exec(doi)
  if (arxiv !== null) {
    const pdfUrl = `https://arxiv.org/pdf/${arxiv[1]}`
    const direct = await fetchPdf(client, pdfUrl, options)
    return direct.ok ? { ...direct, landingUrl: `https://arxiv.org/abs/${arxiv[1]}` } : { ...direct, landingUrl: `https://arxiv.org/abs/${arxiv[1]}` }
  }
  const doiUrl = `https://doi.org/${encodeURI(doi)}`
  let landingUrl = doiUrl
  try {
    const res = await fetch(doiUrl, {
      headers: { ...BROWSER_HEADERS, Accept: 'application/pdf' },
      redirect: 'follow',
      signal: requestSignal(options.signal, options.timeoutMs),
    })
    landingUrl = res.url.length > 0 ? res.url : doiUrl
    if (res.ok) {
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('pdf') || contentType.includes('octet-stream')) {
        const data = new Uint8Array(await res.arrayBuffer())
        if (looksLikePdf(data)) return { ok: true, data, finalUrl: landingUrl, landingUrl }
      }
    } else if (res.status === 404) {
      return { ok: false, error: `DOI ${doi} did not resolve (HTTP 404)`, status: 404, landingUrl }
    }
  } catch (error) {
    if (options.signal?.aborted === true) throw error
    return { ok: false, error: `DOI resolution failed: ${error instanceof Error ? error.message : String(error)}`, status: 0 }
  }
  for (const candidate of pdfCandidatesFor(landingUrl)) {
    options.signal?.throwIfAborted()
    const attempt = await fetchPdf(client, candidate, options)
    if (attempt.ok) return { ...attempt, landingUrl }
  }
  return {
    ok: false,
    error: 'could not obtain the PDF: the publisher may require institutional access (a campus network), or the article has no PDF',
    status: 0,
    landingUrl,
  }
}

/** Output schema of every full-text read tool. */
export const READ_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true, description: 'The identifier the call resolved.' },
    title: { type: 'string' },
    pdfUrl: { type: 'string', required: true, description: 'URL the PDF was fetched from.' },
    pages: { type: 'integer' },
    totalChars: { type: 'integer', required: true, description: 'Length of the whole extracted text.' },
    offset: { type: 'integer', required: true, description: 'Character offset this slice starts at.' },
    text: { type: 'string', required: true, description: 'The returned slice of extracted text.' },
    truncated: { type: 'boolean', required: true, description: 'True when text remains after this slice.' },
    nextOffset: { type: 'integer', description: 'Offset to request the next slice.' },
    credits: CREDITS_SCHEMA,
  },
} as const

/** The read tools' canonical value. */
export type ReadValue = InferValue<typeof READ_OUTPUT_SCHEMA>

/**
 * Slice extracted text for one call.
 * @param full - the whole text.
 * @param offset - requested start (clamped).
 * @param maxChars - requested length (clamped to at least 1).
 * @returns the slice fields of {@link ReadValue}.
 */
export function sliceText(full: string, offset: number | undefined, maxChars: number): Pick<ReadValue, 'totalChars' | 'offset' | 'text' | 'truncated' | 'nextOffset'> {
  const start = offset !== undefined && offset > 0 ? Math.min(Math.trunc(offset), full.length) : 0
  const end = Math.min(full.length, start + Math.max(1, Math.trunc(maxChars)))
  const truncated = end < full.length
  return compact({
    totalChars: full.length,
    offset: start,
    text: full.slice(start, end),
    truncated,
    nextOffset: truncated ? end : undefined,
  })
}

/** Model-facing content for a read result: a header, the slice, and the continuation note. */
export function renderRead(value: ReadValue): ContentBlock[] {
  const head: string[] = []
  head.push(`Full text of ${value.title !== undefined ? `"${value.title}" (${value.id})` : value.id}`)
  head.push(`Source PDF: ${value.pdfUrl}${value.pages !== undefined ? ` · ${value.pages} pages` : ''} · ${value.totalChars.toLocaleString('en-US')} characters`)
  head.push(`Showing characters ${value.offset.toLocaleString('en-US')}–${(value.offset + value.text.length).toLocaleString('en-US')}${value.truncated ? ` — call again with offset=${value.nextOffset} for the rest` : ' (complete)'}.`)
  const credits = formatCredits(value.credits)
  const parts = [head.join('\n'), value.text]
  if (credits !== undefined) parts.push(credits)
  return [{ type: 'text', text: parts.join('\n\n') }]
}

/** Pending-call card for a read tool. */
export function presentReadCall(label: string, id: string): GenericCallView {
  return { card: 'generic', title: `Read ${label}: ${id}`, kind: 'read', rawInput: id }
}

/** Fold `credits` into a read value without leaving an undefined member. */
export function withCredits<T extends object>(value: T, credits: CreditsValue | undefined): T & { credits?: CreditsValue } {
  return credits !== undefined ? { ...value, credits } : value
}
