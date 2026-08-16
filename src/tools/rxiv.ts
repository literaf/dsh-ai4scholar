/**
 * bioRxiv and medRxiv tools over the public api.biorxiv.org (no key, no
 * credits) plus PDF reading.
 * @module dsh-ai4scholar/tools/rxiv
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  PAPER_SEARCH_OUTPUT_SCHEMA,
  compact,
  isRecord,
  paperSearchMeta,
  presentPaperSearchCall,
  presentPaperSearchResult,
  renderPaperSearch,
  str,
} from '../paper.js'
import type { Paper } from '../paper.js'
import { READ_OUTPUT_SCHEMA, extractPdfText, fetchPdf, presentReadCall, renderRead, sliceText } from '../pdf.js'
import { boundResults, requireQuery } from '../runtime.js'
import type { Runtime } from '../runtime.js'

type Server = 'biorxiv' | 'medrxiv'
const LABEL: Record<Server, string> = { biorxiv: 'bioRxiv', medrxiv: 'medRxiv' }
const RXIV_PAGE = 100
const MAX_DAYS = 3650

/** Accept a bare DOI (10.1101/…), with or without a version suffix, or a content URL. */
export function normalizeRxivDoi(input: string): { doi: string; version: string | undefined } {
  const trimmed = input.trim().replace(/^https?:\/\/www\.(bio|med)rxiv\.org\/content\//, '').replace(/\.full(\.pdf)?$/, '')
  // bioRxiv/medRxiv DOIs use the 10.1101 prefix historically and 10.64898 since 2026.
  const m = /^(10\.\d{4,9}\/[^\sv]+?)(?:v(\d+))?$/.exec(trimmed)
  if (m === null) throw new Error(`"${input}" is not a bioRxiv/medRxiv DOI (expected e.g. 10.1101/2024.01.01.123456)`)
  return { doi: m[1]!, version: m[2] }
}

/**
 * Normalize one `collection[]` record from api.biorxiv.org.
 * @param record - untyped item.
 * @param server - which server it came from.
 * @returns the normalized paper, or `undefined` for a record without DOI or title.
 */
export function normalizeRxivPaper(record: unknown, server: Server): Paper | undefined {
  if (!isRecord(record)) return undefined
  const doi = str(record, 'doi')
  const title = str(record, 'title')
  if (doi === undefined || title === undefined) return undefined
  const version = str(record, 'version') ?? '1'
  const authors = (str(record, 'authors') ?? '').split(';').map((a) => a.trim()).filter((a) => a.length > 0)
  const date = str(record, 'date')
  const year = date !== undefined ? /^(\d{4})/.exec(date)?.[1] : undefined
  const category = str(record, 'category')
  return compact({
    source: server,
    id: doi,
    title,
    authors,
    year: year !== undefined ? Number.parseInt(year, 10) : undefined,
    date,
    venue: LABEL[server],
    abstract: str(record, 'abstract'),
    doi,
    url: `https://www.${server}.org/content/${doi}v${version}`,
    pdfUrl: `https://www.${server}.org/content/${doi}v${version}.full.pdf`,
    externalIds: { DOI: doi },
    categories: category !== undefined ? [category] : undefined,
    extra: compact({ version, published: str(record, 'published') }),
  })
}

function applyServer(ctx: Context, runtime: Runtime, server: Server, fullText: boolean): void {
  const { client, limits, render, timeouts } = runtime
  const label = LABEL[server]

  ctx.tools.register(defineTool({
    name: `search_${server}`,
    description: `List recent ${label} preprints in a subject category within a look-back window (the ${label} API browses by category and date, not by free text — filter the returned titles/abstracts for the topic). Free; no API key needed.`,
    parameters: {
      query: { type: 'string', required: true, description: `${label} category, e.g. ${server === 'biorxiv' ? '"neuroscience", "cell biology", "bioinformatics", "genomics"' : '"epidemiology", "oncology", "cardiovascular medicine", "public and global health"'}.` },
      max_results: { type: 'integer', description: `Number of results (default ${limits.defaultMaxResults}, max ${limits.maxResultsCap}).` },
      days: { type: 'integer', description: 'Look-back window in days (default 30, max 3650).' },
    },
    output: {
      schema: PAPER_SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => renderPaperSearch(value, render),
      presentationMeta: (_args, value) => paperSearchMeta(value),
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentPaperSearchCall(server, args.query),
    presentResult: (args, result) => presentPaperSearchResult(server, args.query, result),
    async execute(args, exec) {
      const category = requireQuery(args.query).toLowerCase().replace(/[\s_-]+/g, '_')
      const wanted = boundResults(args.max_results, limits)
      const days = args.days !== undefined ? Math.min(Math.max(1, Math.trunc(args.days)), MAX_DAYS) : 30
      const now = new Date()
      const start = new Date(now.getTime() - days * 86_400_000)
      const fmt = (d: Date): string => d.toISOString().slice(0, 10)
      const papers: Paper[] = []
      let cursor = 0
      let exhausted = false
      let warning: string | undefined
      let total = 0
      while (papers.length < wanted && !exhausted) {
        exec.signal.throwIfAborted()
        const url = `https://api.biorxiv.org/details/${server}/${fmt(start)}/${fmt(now)}/${cursor}?category=${encodeURIComponent(category)}`
        const res = await client.fetchJson<{ collection?: unknown[]; messages?: Array<Record<string, unknown>> }>(url, { signal: exec.signal })
        if (!res.ok) {
          if (papers.length === 0) throw new Error(`${label} search failed: ${res.error}`)
          warning = `Pagination stopped early: ${res.error}`
          break
        }
        const message = res.data.messages?.[0]
        const reportedTotal = message !== undefined ? Number(message.total) : Number.NaN
        if (Number.isFinite(reportedTotal)) total = reportedTotal
        const batch = (res.data.collection ?? []).map((item) => normalizeRxivPaper(item, server)).filter((p): p is Paper => p !== undefined)
        papers.push(...batch)
        if (batch.length === 0 || batch.length < RXIV_PAGE) exhausted = true
        cursor += RXIV_PAGE
      }
      const kept = papers.slice(0, wanted)
      const reported = Math.max(total, papers.length)
      return compact({
        source: server,
        query: args.query.trim(),
        total: reported,
        papers: kept,
        truncated: kept.length < reported,
        warning,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: `download_${server}`,
    description: `Get the article page and direct full-text PDF URL for a ${label} preprint by DOI. Free.`,
    parameters: {
      paper_id: { type: 'string', required: true, description: `${label} DOI, e.g. "10.1101/2024.01.01.123456" (optionally with a version suffix like v2).` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          url: { type: 'string', required: true },
          pdfUrl: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${label} ${value.id}\nArticle: ${value.url}\nPDF: ${value.pdfUrl}` }],
    },
    timeoutMs: timeouts.tool,
    isConcurrencySafe: () => true,
    async execute(args) {
      const { doi, version } = normalizeRxivDoi(args.paper_id)
      const v = version ?? '1'
      return { id: doi, url: `https://www.${server}.org/content/${doi}v${v}`, pdfUrl: `https://www.${server}.org/content/${doi}v${v}.full.pdf` }
    },
  }))

  if (!fullText) return
  ctx.tools.register(defineTool({
    name: `read_${server}_paper`,
    description: `Download a ${label} preprint's PDF and return its extracted full text. Free. Long papers are returned in slices: use offset/max_chars to continue.`,
    parameters: {
      paper_id: { type: 'string', required: true, description: `${label} DOI, e.g. "10.1101/2024.01.01.123456".` },
      offset: { type: 'integer', description: 'Character offset to start from (default 0).' },
      max_chars: { type: 'integer', description: `Characters to return (default ${runtime.read.maxChars}).` },
    },
    output: {
      schema: READ_OUTPUT_SCHEMA,
      render: (_args, value) => renderRead(value),
    },
    timeoutMs: timeouts.pdf + timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentReadCall(label, args.paper_id),
    async execute(args, exec) {
      const { doi, version } = normalizeRxivDoi(args.paper_id)
      const pdfUrl = `https://www.${server}.org/content/${doi}v${version ?? '1'}.full.pdf`
      const pdf = await fetchPdf(client, pdfUrl, { signal: exec.signal, timeoutMs: timeouts.pdf })
      if (!pdf.ok) throw new Error(`${label} PDF download failed: ${pdf.error}`)
      const { text, pages } = await extractPdfText(pdf.data)
      if (text.trim().length === 0) throw new Error('the PDF downloaded but no readable text could be extracted')
      return { id: doi, pdfUrl: pdf.finalUrl, pages, ...sliceText(text, args.offset, args.max_chars ?? runtime.read.maxChars) }
    },
  }))
}

/**
 * Register the bioRxiv and medRxiv tools.
 * @param ctx - context whose `tools` registry receives the effect-scoped registrations.
 * @param runtime - plugin instance runtime.
 * @param fullText - whether to register the PDF-reading tools.
 */
export function applyRxivTools(ctx: Context, runtime: Runtime, fullText: boolean): void {
  applyServer(ctx, runtime, 'biorxiv', fullText)
  applyServer(ctx, runtime, 'medrxiv', fullText)
}
