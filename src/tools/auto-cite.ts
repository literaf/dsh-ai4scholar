/**
 * `auto_cite`: annotate academic text with real citations through the
 * ai4scholar.net Auto-Cite service (a server-sent-events endpoint; billed).
 * @module dsh-ai4scholar/tools/auto-cite
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InferValue } from '@deepseek-ai/dsh-tools'
import { CREDITS_SCHEMA, compact, creditsMeta, formatCredits, isRecord, presentGenericWithCredits, str } from '../paper.js'
import { withCredits } from '../pdf.js'
import type { Runtime } from '../runtime.js'

const MIN_TEXT = 100
const MAX_TEXT = 10_000

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    annotatedText: { type: 'string', required: true, description: 'The input text with citation markers inserted.' },
    references: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          number: { type: 'integer', required: true },
          formatted: { type: 'string', required: true, description: 'Reference formatted in the requested citation style.' },
          title: { type: 'string' },
          year: { type: 'integer' },
          doi: { type: 'string' },
          url: { type: 'string' },
          venue: { type: 'string' },
          citedBy: { type: 'integer' },
          matchReason: { type: 'string' },
          relevanceScore: { type: 'number' },
          impactFactor: { type: 'number' },
          jcrQuartile: { type: 'string' },
        },
      },
    },
    bibtex: { type: 'string', description: 'BibTeX entries for the references, when the service produced them.' },
    stats: {
      type: 'object',
      additionalProperties: false,
      properties: {
        citationCount: { type: 'integer' },
        searchCount: { type: 'integer' },
        processingTime: { type: 'number' },
      },
    },
    credits: CREDITS_SCHEMA,
  },
} as const
type AutoCiteValue = InferValue<typeof OUTPUT_SCHEMA>
type Reference = AutoCiteValue['references'][number]

function normalizeReference(record: unknown, index: number): Reference | undefined {
  if (!isRecord(record)) return undefined
  const formatted = str(record, 'formatted')
  if (formatted === undefined) return undefined
  const num = typeof record.number === 'number' ? Math.trunc(record.number) : index + 1
  const numberish = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  return compact({
    number: num,
    formatted,
    title: str(record, 'title'),
    year: numberish(record.year) !== undefined ? Math.trunc(record.year as number) : undefined,
    doi: str(record, 'doi'),
    url: str(record, 'url'),
    venue: str(record, 'venue'),
    citedBy: numberish(record.citedBy) !== undefined ? Math.trunc(record.citedBy as number) : undefined,
    matchReason: str(record, 'matchReason'),
    relevanceScore: numberish(record.relevanceScore),
    impactFactor: numberish(record.impactFactor),
    jcrQuartile: str(record, 'jcrQuartile'),
  })
}

/**
 * Register `auto_cite`.
 * @param ctx - context whose `tools` registry receives the effect-scoped registration.
 * @param runtime - plugin instance runtime.
 */
export function applyAutoCiteTool(ctx: Context, runtime: Runtime): void {
  const { client, timeouts } = runtime
  ctx.tools.register(defineTool({
    name: 'auto_cite',
    description: 'Add real citations to a passage of academic text: the AI4Scholar Auto-Cite service finds matching papers (Semantic Scholar / PubMed / Google Scholar), inserts numbered citation markers, and returns the reference list (IEEE, APA, Vancouver, Nature, or numbered style) plus BibTeX. Takes 20–90 seconds and costs credits (refunded if nothing is found). Text must be 100–10,000 characters. Use it when the user pastes a paragraph and asks for citations/references.',
    parameters: {
      text: { type: 'string', required: true, description: 'Academic text to annotate (100–10,000 characters). In manual mode, mark citation points with [CITE].' },
      mode: { type: 'string', enum: ['auto', 'manual'], description: 'auto (default): detect citation points; manual: use [CITE] markers in the text.' },
      min_citations: { type: 'integer', description: 'Minimum citations to add in auto mode (default 10, max 50).' },
      field: { type: 'string', description: 'Academic field to bias the search, e.g. "computer science", "oncology".' },
      year_preference: { type: 'integer', description: 'Preferred publication year for cited papers, e.g. 2024.' },
      exclude_preprints: { type: 'boolean', description: 'Exclude preprints (default false).' },
      exclude_conferences: { type: 'boolean', description: 'Exclude conference papers (default false).' },
      citation_style: { type: 'string', enum: ['ieee', 'apa', 'vancouver', 'nature', 'numbered'], description: 'Reference format (default ieee).' },
      preferred_venues: { type: 'array', items: { type: 'string' }, description: 'Journal or venue names to prefer (a hint, not a guarantee).' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      presentationMeta: (_args, value) => creditsMeta(value),
      render: (_args, value) => {
        const parts: string[] = []
        parts.push('Annotated text:\n\n' + value.annotatedText)
        if (value.references.length > 0) {
          parts.push('References:\n' + value.references.map((r) => `[${r.number}] ${r.formatted}${r.doi !== undefined ? ` https://doi.org/${r.doi}` : r.url !== undefined ? ` ${r.url}` : ''}`).join('\n'))
        } else {
          parts.push('No references were matched; credits for this call are refunded by the service.')
        }
        if (value.bibtex !== undefined && value.bibtex.length > 0) parts.push('BibTeX:\n```bibtex\n' + value.bibtex + '\n```')
        if (value.stats !== undefined) {
          const s = value.stats
          parts.push(`Stats: ${s.citationCount ?? value.references.length} citations from ${s.searchCount ?? '?'} searches${s.processingTime !== undefined ? ` in ${Math.round(s.processingTime)}s` : ''}.`)
        }
        parts.push('Present the annotated text and the reference list to the user; do not invent additional references.')
        const credits = formatCredits(value.credits)
        if (credits !== undefined) parts.push(credits)
        return [{ type: 'text', text: parts.join('\n\n') }]
      },
    },
    timeoutMs: timeouts.generation + timeouts.tool,
    isConcurrencySafe: () => false,
    presentCall: (args) => ({ card: 'generic', title: `Auto-cite ${args.text.length} characters`, kind: 'other', rawInput: args.text.slice(0, 200) }),
    presentResult: (args, result) => presentGenericWithCredits(`Auto-cite ${args.text.length} characters`, result),
    async execute(args, exec) {
      const text = args.text.trim()
      if (text.length < MIN_TEXT) throw new Error(`text must be at least ${MIN_TEXT} characters (got ${text.length})`)
      if (text.length > MAX_TEXT) throw new Error(`text must be at most ${MAX_TEXT} characters (got ${text.length})`)
      if (args.mode === 'manual' && !text.includes('[CITE]')) throw new Error('manual mode needs at least one [CITE] marker in the text')
      const apiKey = await runtime.requireApiKey()
      const body: Record<string, unknown> = { text }
      if (args.mode !== undefined) body.mode = args.mode
      if (args.min_citations !== undefined) body.minCitations = Math.min(Math.max(1, Math.trunc(args.min_citations)), 50)
      if (args.field !== undefined && args.field.trim().length > 0) body.field = args.field.trim()
      if (args.year_preference !== undefined) body.yearPreference = Math.trunc(args.year_preference)
      if (args.exclude_preprints !== undefined) body.excludePreprints = args.exclude_preprints
      if (args.exclude_conferences !== undefined) body.excludeConferences = args.exclude_conferences
      if (args.citation_style !== undefined) body.citationStyle = args.citation_style
      if (args.preferred_venues !== undefined && args.preferred_venues.length > 0) body.preferredVenues = args.preferred_venues
      const res = await client.postSse<Record<string, unknown>>('/api/proxy/auto-cite', body, { apiKey, signal: exec.signal, timeoutMs: timeouts.generation })
      if (!res.ok) throw new Error(`Auto-cite failed: ${res.error}`)
      const data = res.data
      const annotatedText = str(data, 'annotatedText') ?? text
      const references = Array.isArray(data.references) ? data.references.map(normalizeReference).filter((r): r is Reference => r !== undefined) : []
      const statsRecord = isRecord(data.stats) ? data.stats : undefined
      const stats = statsRecord !== undefined
        ? compact({
          citationCount: typeof statsRecord.citationCount === 'number' ? Math.trunc(statsRecord.citationCount) : undefined,
          searchCount: typeof statsRecord.searchCount === 'number' ? Math.trunc(statsRecord.searchCount) : undefined,
          processingTime: typeof statsRecord.processingTime === 'number' ? statsRecord.processingTime : undefined,
        })
        : undefined
      return withCredits(compact({ annotatedText, references, bibtex: str(data, 'bibtex'), stats }), runtime.creditsOf(res, exec.agent))
    },
  }))
}
