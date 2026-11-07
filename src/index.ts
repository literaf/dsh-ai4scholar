/**
 * dsh-ai4scholar: AI4Scholar academic tools for DeepSeek Harness. Registers
 * Semantic Scholar, PubMed, Google Scholar, arXiv, bioRxiv/medRxiv, DOI,
 * full-text, auto-cite, figure-drawing, and credit-balance tools on
 * `ctx.tools`, a system-prompt guidance section, and the `/ai4scholar`
 * command; the API key resolves per call through `ctx.credentials`.
 * @module dsh-ai4scholar
 */

import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-credentials'
import { Ai4ScholarClient } from './api-client.js'
import { buildGuidance } from './prompt.js'
import { CreditLedger, makeCreditsFolder, makeCredentialResolvers } from './runtime.js'
import type { Runtime } from './runtime.js'
import { applySemanticScholarTools } from './tools/semantic-scholar.js'
import { applyPubmedTools } from './tools/pubmed.js'
import { applyGoogleScholarTools } from './tools/google-scholar.js'
import { applyChineseTools } from './tools/chinese.js'
import { applyArxivTools } from './tools/arxiv.js'
import { applyRxivTools } from './tools/rxiv.js'
import { applyDoiTools } from './tools/doi.js'
import { applyAutoCiteTool } from './tools/auto-cite.js'
import { applySciDrawTool } from './tools/sci-draw.js'
import { applyCreditsTools } from './tools/credits.js'
import { applyUnifiedSearchTool, defaultSourcesFor, DEFAULT_SOURCES, UNIFIED_SOURCES } from './tools/unified.js'
import type { UnifiedSource } from './tools/unified.js'
import { CITE_STYLES, DRAW_MODELS, DRAW_SIZES, PLATFORM_CAP } from './shared/search-settings.js'
import type { CiteStyle, DrawModel, DrawSize, ResultsPerSource } from './shared/search-settings.js'

export { Ai4ScholarClient } from './api-client.js'
export type { ApiClientOptions, ApiResult, RequestOptions, CreditsInfo } from './api-client.js'
export { PAPER_SCHEMA, PAPER_SEARCH_OUTPUT_SCHEMA, CREDITS_SCHEMA, formatPaper, formatPaperSearch, formatCredits } from './paper.js'
export type { Paper, PaperSearchValue, PaperSource, CreditsValue } from './paper.js'
export { normalizeS2Paper, normalizeS2Author, AUTHOR_SCHEMA } from './tools/semantic-scholar.js'
export { normalizePubmedPaper } from './tools/pubmed.js'
export { normalizeScholarResult } from './tools/google-scholar.js'
export { normalizeChinesePaper } from './tools/chinese.js'
export { parseArxivFeed, normalizeArxivId } from './tools/arxiv.js'
export { normalizeRxivPaper, normalizeRxivDoi } from './tools/rxiv.js'
export { normalizeDoi } from './tools/doi.js'
export { mergePaperLists, identityKeys, titleKey, UNIFIED_SOURCES } from './tools/unified.js'
export { READ_OUTPUT_SCHEMA, sliceText, pdfCandidatesFor } from './pdf.js'
export { CreditLedger } from './runtime.js'
export { buildGuidance } from './prompt.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'ai4scholar'

/** Services required before `apply` runs; `credentials` and `commands` are read lazily and stay optional. */
export const inject = ['tools', 'systemPrompt']

const manifest = createRequire(import.meta.url)('../package.json') as { version: string }

/** Version string sent as `User-Agent`, sourced from the published package manifest. */
export const VERSION = manifest.version

/** Plugin configuration; every deployment-varying value is a field with a schema default. */
export interface Config {
  /** ai4scholar.net API origin. */
  baseUrl?: string
  /** Credential reference (environment-variable name) that holds the AI4Scholar API key. */
  apiKeyEnv?: string
  /** Register the Semantic Scholar tools. */
  semanticScholar?: boolean
  /** Register the PubMed tools. */
  pubmed?: boolean
  /** Register the Google Scholar tool. */
  googleScholar?: boolean
  /** Register the Chinese literature search tool. */
  chineseLiterature?: boolean
  /** Register the arXiv tools. */
  arxiv?: boolean
  /** Register the bioRxiv and medRxiv tools. */
  biorxiv?: boolean
  /** Register the DOI download/read tools. */
  doi?: boolean
  /** Register the full-text `read_*` tools (PDF download + text extraction). */
  fullText?: boolean
  /** Register `auto_cite`. */
  autoCite?: boolean
  /** Register `sci_draw`. */
  sciDraw?: boolean
  /** Register `search_papers` (unified cross-platform search over the enabled families). */
  unifiedSearch?: boolean
  /** Platforms `search_papers` queries when the model names none; the settings page edits it. */
  searchSources?: UnifiedSource[]
  /** Default results per platform for its search tool and `search_papers`; a missing platform uses `defaultMaxResults`. */
  resultsPerSource?: ResultsPerSource
  /** `auto_cite` reference format when the model names none. */
  citeStyle?: CiteStyle
  /** Whether `auto_cite` leaves preprints out unless the model says otherwise. */
  citeExcludePreprints?: boolean
  /** `sci_draw` model when the model names none. */
  drawModel?: DrawModel
  /** `sci_draw` output resolution when the model names none. */
  drawImageSize?: DrawSize
  /** Register `get_ai4scholar_credits`. */
  creditsTool?: boolean
  /** Register the `/ai4scholar` command (needs the commands service). */
  command?: boolean
  /** Register `GET /ai4scholar/balance` on the web server for the settings card's key test. */
  balanceRoute?: boolean
  /** Attach credits charged/remaining and the session tally to billed results. */
  showCredits?: boolean
  /** Register the system-prompt guidance section. */
  promptGuidance?: boolean
  /** Order of the guidance section within the assembled prompt (tool guidance uses 100–199). */
  promptOrder?: number
  /** Results returned when the model omits `max_results`. */
  defaultMaxResults?: number
  /** Upper bound the model may request per call. */
  maxResultsCap?: number
  /** Cap on abstract characters per paper in model-facing text; 0 omits abstracts. */
  abstractMaxChars?: number
  /** Characters returned per full-text read call when the model omits `max_chars`. */
  readMaxChars?: number
  /** Per-attempt HTTP timeout in milliseconds. */
  requestTimeoutMs?: number
  /** Per-download timeout for PDFs in milliseconds. */
  pdfTimeoutMs?: number
  /** Timeout for generation/streaming endpoints (auto_cite, sci_draw) in milliseconds. */
  generationTimeoutMs?: number
  /** Attempts for retryable failures (HTTP 429 and network errors). */
  maxRetries?: number
  /** Base delay before the second attempt in milliseconds; doubles per attempt. */
  retryBackoffMs?: number
  /** Cooperative per-tool-call budget in milliseconds enforced by dsh-tool-call-timeout-policy. */
  toolTimeoutMs?: number
}

/**
 * Mark a field editable from the settings page. Hosts from dsh 0.2.1 serve only
 * `.volatile()` fields to configuration forms; older schemastery copies (the
 * host's, since schemastery is a peer) lack the method, and there the field
 * stays an ordinary one edited through `cordis.patch.yml`.
 */
function live<S>(schema: S): S {
  const candidate = schema as S & { volatile?: () => S }
  return typeof candidate.volatile === 'function' ? candidate.volatile() : schema
}

/** The fields the settings page edits; everything else stays file-only. */
export const SETTINGS_FIELDS = [
  'searchSources', 'resultsPerSource', 'defaultMaxResults', 'abstractMaxChars', 'showCredits',
  'readMaxChars', 'citeStyle', 'citeExcludePreprints', 'drawModel', 'drawImageSize',
] as const

/** One optional count per platform, bounded by what that platform serves per search. */
const ResultsPerSourceSchema = Schema.object(Object.fromEntries(UNIFIED_SOURCES.map((s) =>
  [s, Schema.natural().min(1).max(PLATFORM_CAP[s])]))) as unknown as Schema<ResultsPerSource>

export const Config: Schema<Config> = Schema.object({
  baseUrl: Schema.string().default('https://ai4scholar.net').description('ai4scholar.net API origin.'),
  apiKeyEnv: Schema.string().default('AI4SCHOLAR_API_KEY').description('Credential reference holding the AI4Scholar API key.'),
  semanticScholar: Schema.boolean().default(true).description('Register the Semantic Scholar tools.'),
  pubmed: Schema.boolean().default(true).description('Register the PubMed tools.'),
  googleScholar: Schema.boolean().default(true).description('Register the Google Scholar tool.'),
  chineseLiterature: Schema.boolean().default(true).description('Register search_chinese (Chinese literature metadata and abstracts).'),
  arxiv: Schema.boolean().default(true).description('Register the arXiv tools.'),
  biorxiv: Schema.boolean().default(true).description('Register the bioRxiv/medRxiv tools.'),
  doi: Schema.boolean().default(true).description('Register the DOI tools.'),
  fullText: Schema.boolean().default(true).description('Register the full-text read_* tools.'),
  autoCite: Schema.boolean().default(true).description('Register auto_cite.'),
  sciDraw: Schema.boolean().default(true).description('Register sci_draw.'),
  unifiedSearch: Schema.boolean().default(true).description('Register search_papers (unified cross-platform search).'),
  searchSources: live(Schema.array(Schema.union([...UNIFIED_SOURCES])).min(1).default([...DEFAULT_SOURCES]).role('checkbox').description('Platforms search_papers queries when the model names none.')),
  resultsPerSource: live(ResultsPerSourceSchema.default({}).description('Default results per platform; a missing platform uses defaultMaxResults.')),
  citeStyle: live(Schema.union([...CITE_STYLES]).default('ieee').description('auto_cite reference format when the model names none.')),
  citeExcludePreprints: live(Schema.boolean().default(false).description('Leave preprints out of auto_cite unless the model asks for them.')),
  drawModel: live(Schema.union([...DRAW_MODELS]).default('flash31').description('sci_draw model when the model names none.')),
  drawImageSize: live(Schema.union([...DRAW_SIZES]).default('2K').description('sci_draw resolution when the model names none.')),
  creditsTool: Schema.boolean().default(true).description('Register get_ai4scholar_credits.'),
  command: Schema.boolean().default(true).description('Register the /ai4scholar command.'),
  balanceRoute: Schema.boolean().default(true).description('Register GET /ai4scholar/balance for the settings card.'),
  showCredits: live(Schema.boolean().default(true).description('Attach credit accounting to billed results.')),
  promptGuidance: Schema.boolean().default(true).description('Register the system-prompt guidance section.'),
  promptOrder: Schema.number().default(150).description('Order of the guidance section within the assembled prompt.'),
  defaultMaxResults: live(Schema.natural().min(1).default(10).description('Results returned when the model omits max_results.')),
  maxResultsCap: Schema.number().default(100).description('Upper bound the model may request per call; each platform also applies its own.'),
  abstractMaxChars: live(Schema.natural().default(600).description('Abstract characters per paper in model-facing text; 0 omits abstracts.')),
  readMaxChars: live(Schema.natural().min(1).default(60_000).description('Characters per full-text read call by default.')),
  requestTimeoutMs: Schema.number().default(30_000).description('Per-attempt HTTP timeout (ms).'),
  pdfTimeoutMs: Schema.number().default(120_000).description('Per-download PDF timeout (ms).'),
  generationTimeoutMs: Schema.number().default(300_000).description('auto_cite / sci_draw timeout (ms).'),
  maxRetries: Schema.number().default(3).description('Attempts for retryable failures.'),
  retryBackoffMs: Schema.number().default(2_000).description('Base retry delay (ms); doubles per attempt.'),
  toolTimeoutMs: Schema.number().default(180_000).description('Cooperative per-call budget (ms) for ordinary tools.'),
})

/** Complete config after schemastery applies every default. */
type ResolvedConfig = Required<Config>

/** A parsed `.volatile()` field: a stable reference the Loader writes new values into. */
interface VolatileRef { get(): unknown }

const isVolatileRef = (value: unknown): value is VolatileRef =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { get?: unknown }).get === 'function'

/**
 * Read the config with every settings field unwrapped to its current value.
 * The plugin reads them once per mount: a settings save restarts the fiber
 * (see `apply`), because tool descriptions and the prompt quote them.
 */
function plainConfig(config: Config): ResolvedConfig {
  const out: Record<string, unknown> = { ...config }
  for (const field of SETTINGS_FIELDS) {
    const value = out[field]
    if (isVolatileRef(value)) out[field] = value.get()
  }
  return out as ResolvedConfig
}

function assertPositiveInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`ai4scholar: ${field} must be a positive integer`)
}

function assertNonNegativeInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`ai4scholar: ${field} must be a non-negative integer`)
}

/**
 * Validate the config and register the enabled tools, command, and guidance.
 * Every registration is an effect on `ctx`, so disposing the plugin fiber
 * removes the tools, the command, and the prompt section together.
 * @param ctx - plugin context with `tools` and `systemPrompt` ready.
 * @param config - schemastery-validated config with defaults applied.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = plainConfig(config)
  for (const field of ['defaultMaxResults', 'maxResultsCap', 'readMaxChars', 'requestTimeoutMs', 'pdfTimeoutMs', 'generationTimeoutMs', 'maxRetries', 'toolTimeoutMs'] as const) {
    assertPositiveInteger(field, resolved[field])
  }
  assertNonNegativeInteger('abstractMaxChars', resolved.abstractMaxChars)
  assertNonNegativeInteger('retryBackoffMs', resolved.retryBackoffMs)
  if (!Number.isFinite(resolved.promptOrder)) throw new Error('ai4scholar: promptOrder must be a finite number')
  let baseUrl: string
  try {
    baseUrl = new URL(resolved.baseUrl).toString()
  } catch {
    throw new Error(`ai4scholar: baseUrl "${resolved.baseUrl}" is not a valid URL`)
  }
  if (resolved.defaultMaxResults > resolved.maxResultsCap) {
    throw new Error('ai4scholar: defaultMaxResults must not exceed maxResultsCap')
  }

  const client = new Ai4ScholarClient({
    baseUrl,
    timeoutMs: resolved.requestTimeoutMs,
    maxRetries: resolved.maxRetries,
    retryBackoffMs: resolved.retryBackoffMs,
    userAgent: `dsh-ai4scholar/${VERSION}`,
  })
  const ledger = new CreditLedger()
  const runtime: Runtime = {
    client,
    render: { abstractMaxChars: resolved.abstractMaxChars },
    limits: { defaultMaxResults: resolved.defaultMaxResults, maxResultsCap: resolved.maxResultsCap },
    resultsPerSource: { ...resolved.resultsPerSource },
    generation: {
      citeStyle: resolved.citeStyle,
      citeExcludePreprints: resolved.citeExcludePreprints,
      drawModel: resolved.drawModel,
      drawImageSize: resolved.drawImageSize,
    },
    read: { maxChars: resolved.readMaxChars },
    timeouts: { tool: resolved.toolTimeoutMs, pdf: resolved.pdfTimeoutMs, generation: resolved.generationTimeoutMs },
    showCredits: resolved.showCredits,
    ledger,
    ...makeCredentialResolvers(ctx, resolved.apiKeyEnv),
    creditsOf: makeCreditsFolder(ledger, resolved.showCredits),
  }

  if (resolved.semanticScholar) applySemanticScholarTools(ctx, runtime, resolved.fullText)
  if (resolved.pubmed) applyPubmedTools(ctx, runtime)
  if (resolved.googleScholar) applyGoogleScholarTools(ctx, runtime)
  if (resolved.chineseLiterature) applyChineseTools(ctx, runtime)
  if (resolved.arxiv) applyArxivTools(ctx, runtime, resolved.fullText)
  if (resolved.biorxiv) applyRxivTools(ctx, runtime, resolved.fullText)
  if (resolved.doi) applyDoiTools(ctx, runtime, resolved.fullText)
  const platforms: Record<UnifiedSource, boolean> = {
    'semantic-scholar': resolved.semanticScholar,
    'pubmed': resolved.pubmed,
    'arxiv': resolved.arxiv,
    'google-scholar': resolved.googleScholar,
    'chinese': resolved.chineseLiterature,
  }
  if (resolved.unifiedSearch) applyUnifiedSearchTool(ctx, runtime, platforms, resolved.searchSources)
  if (resolved.autoCite) applyAutoCiteTool(ctx, runtime)
  if (resolved.sciDraw) applySciDrawTool(ctx, runtime)
  if (resolved.creditsTool || resolved.command || resolved.balanceRoute) applyCreditsTools(ctx, runtime, resolved.command, resolved.creditsTool, resolved.balanceRoute)

  if (resolved.promptGuidance) {
    const text = buildGuidance({
      semanticScholar: resolved.semanticScholar,
      pubmed: resolved.pubmed,
      googleScholar: resolved.googleScholar,
      chineseLiterature: resolved.chineseLiterature,
      arxiv: resolved.arxiv,
      biorxiv: resolved.biorxiv,
      doi: resolved.doi,
      fullText: resolved.fullText,
      autoCite: resolved.autoCite,
      sciDraw: resolved.sciDraw,
      credits: resolved.creditsTool,
      unified: resolved.unifiedSearch,
    }, defaultSourcesFor(resolved.searchSources, platforms))
    if (text !== undefined) ctx.systemPrompt.section({ name: 'tool:ai4scholar', order: resolved.promptOrder, text })
  }

  // From dsh 0.1.0-rc.7 the Settings → Plugins tab renders the intersection
  // of two ledgers: cards registered under `settings.plugin.item` and the
  // namespaces the Host's settings service serves. The card is in the browser
  // bundle; this is the other half — a namespace whose only job is to make
  // "ai4scholar" a served key, so the key card keeps appearing. The API key
  // itself stays in the credentials store and never enters settings. On rc.6
  // and earlier the tab rendered every card unconditionally and this
  // registration is inert; in a deployment with no settings service the
  // callback simply never runs.
  ctx.inject(['settings'], (settingsCtx) => {
    const service = (settingsCtx as Context & { settings: { register?: (namespace: string, schema: unknown) => unknown } }).settings
    // Newer hosts replaced namespace registration with config forms. Our new
    // pages need no namespace; credentials remain in their dedicated store.
    if (typeof service.register === 'function') {
      service.register('ai4scholar', Schema.object({}).description('AI4Scholar — configured through its Settings card; the API key lives in the credential store.'))
    }
    // From 0.2.1 the service serves this entry's `.volatile()` fields as a form,
    // and the plugin page draws its own (Card.tsx), so no page is generated.
    const configure = (service as { configure?: (policy: { auto: boolean }, owner: unknown) => () => void }).configure
    if (typeof configure === 'function') settingsCtx.effect(() => configure.call(service, { auto: false }, ctx.fiber), 'ai4scholar: settings page policy')
  })

  // A settings save commits new values into the running references and emits
  // this event. Tool descriptions and the prompt section quote those values, so
  // remount: the restart re-parses the saved config and registers everything
  // again, the way any other config change would.
  // The Loader's event is not in this package's Events map; it is declared by
  // the Loader the host composes, so subscribe through the untyped overload.
  //
  // The restart waits a tick: the event fires inside the settings write, and
  // the Host answers that write by describing this entry, which it skips while
  // the fiber is unloading — restarting synchronously turned every accepted
  // save into a reported failure.
  const on = ctx.on as (this: Context, name: string, listener: () => void) => unknown
  on.call(ctx, 'loader/volatile-update', () => {
    const fiber = ctx.fiber
    setTimeout(() => {
      if (fiber.state !== 2) return
      fiber.restart().catch((error: unknown) => { console.warn('ai4scholar: remount after a settings change failed', error) })
    }, 0)
  })
}
