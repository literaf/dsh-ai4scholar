/**
 * DOI tools: resolve any DOI to a PDF (open access, or publisher access from
 * the network dsh runs on) and read its full text. No credits.
 * @module dsh-ai4scholar/tools/doi
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { READ_OUTPUT_SCHEMA, extractPdfText, presentReadCall, renderRead, resolveDoiToPdf, sliceText } from '../pdf.js'
import type { Runtime } from '../runtime.js'

/** Accept a bare DOI or a doi.org URL; return the bare DOI. */
export function normalizeDoi(input: string): string {
  const trimmed = input.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:/i, '')
  if (!/^10\.\d{4,9}\/\S+$/.test(trimmed)) throw new Error(`"${input}" is not a DOI (expected e.g. 10.1038/s41586-021-03819-2)`)
  return trimmed
}

/**
 * Register the DOI tools.
 * @param ctx - context whose `tools` registry receives the effect-scoped registrations.
 * @param runtime - plugin instance runtime.
 * @param fullText - whether to register the PDF-reading tool.
 */
export function applyDoiTools(ctx: Context, runtime: Runtime, fullText: boolean): void {
  const { client, timeouts } = runtime

  ctx.tools.register(defineTool({
    name: 'download_by_doi',
    description: 'Resolve a DOI and try to obtain the article PDF: open-access copies work anywhere; paywalled publishers work only when dsh runs on a network with institutional access (campus/VPN). Returns the PDF URL that answered. Free.',
    parameters: {
      doi: { type: 'string', required: true, description: 'DOI, e.g. "10.1038/s41586-021-03819-2".' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          doi: { type: 'string', required: true },
          landingUrl: { type: 'string', required: true, description: 'Where doi.org redirected.' },
          pdfUrl: { type: 'string', required: true, description: 'URL that returned the PDF.' },
          bytes: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `DOI ${value.doi} resolved.\nLanding page: ${value.landingUrl}\nPDF (${(value.bytes / 1024).toFixed(0)} KB): ${value.pdfUrl}` }],
    },
    timeoutMs: timeouts.pdf * 3,
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: `Resolve DOI ${args.doi}`, kind: 'fetch', rawInput: args.doi }),
    async execute(args, exec) {
      const doi = normalizeDoi(args.doi)
      const res = await resolveDoiToPdf(client, doi, { signal: exec.signal, timeoutMs: timeouts.pdf })
      if (!res.ok) throw new Error(`DOI download failed: ${res.error}${res.landingUrl !== undefined ? ` (landing page: ${res.landingUrl})` : ''}`)
      return { doi, landingUrl: res.landingUrl, pdfUrl: res.finalUrl, bytes: res.data.byteLength }
    },
  }))

  if (!fullText) return
  ctx.tools.register(defineTool({
    name: 'read_by_doi',
    description: 'Resolve a DOI, download the PDF (open access anywhere; paywalled publishers need institutional network access), and return its extracted full text in slices. Free.',
    parameters: {
      doi: { type: 'string', required: true, description: 'DOI, e.g. "10.1038/s41586-021-03819-2".' },
      offset: { type: 'integer', description: 'Character offset to start from (default 0).' },
      max_chars: { type: 'integer', description: `Characters to return (default ${runtime.read.maxChars}).` },
    },
    output: {
      schema: READ_OUTPUT_SCHEMA,
      render: (_args, value) => renderRead(value),
    },
    timeoutMs: timeouts.pdf * 3 + timeouts.tool,
    isConcurrencySafe: () => true,
    presentCall: (args) => presentReadCall('DOI', args.doi),
    async execute(args, exec) {
      const doi = normalizeDoi(args.doi)
      const res = await resolveDoiToPdf(client, doi, { signal: exec.signal, timeoutMs: timeouts.pdf })
      if (!res.ok) throw new Error(`DOI download failed: ${res.error}${res.landingUrl !== undefined ? ` (landing page: ${res.landingUrl})` : ''}`)
      const { text, pages } = await extractPdfText(res.data)
      if (text.trim().length === 0) throw new Error('the PDF downloaded but no readable text could be extracted')
      return { id: doi, pdfUrl: res.finalUrl, pages, ...sliceText(text, args.offset, args.max_chars ?? runtime.read.maxChars) }
    },
  }))
}
