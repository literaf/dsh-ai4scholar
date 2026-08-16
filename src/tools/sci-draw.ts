/**
 * `sci_draw`: AI scientific figure generation and processing through the
 * ai4scholar.net Nano Draw service (billed).
 * @module dsh-ai4scholar/tools/sci-draw
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InferValue } from '@deepseek-ai/dsh-tools'
import { CREDITS_SCHEMA, compact, creditsMeta, formatCredits, isRecord, presentGenericWithCredits, str } from '../paper.js'
import type { Runtime } from '../runtime.js'

const ACTIONS = ['smart', 'generate', 'edit', 'style', 'compose', 'iterate', 'critic', 'svg', 'vectorize'] as const
const NEEDS_IMAGES = new Set(['edit', 'style', 'compose', 'iterate', 'critic', 'vectorize'])

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string', required: true },
    imageUrl: { type: 'string', description: 'Result image URL (raster actions).' },
    svgUrl: { type: 'string' },
    svgCode: { type: 'string', description: 'Inline SVG markup (svg action).' },
    pdfUrl: { type: 'string', description: 'Vector PDF (vectorize action).' },
    pptxUrl: { type: 'string', description: 'Editable PPTX (vectorize action).' },
    optimizedPrompt: { type: 'string', description: 'The prompt the service actually used (smart action).' },
    critique: { type: 'string', description: 'Expert review text (critic action).' },
    warning: { type: 'string' },
    credits: CREDITS_SCHEMA,
  },
} as const
type SciDrawValue = InferValue<typeof OUTPUT_SCHEMA>

/**
 * Register `sci_draw`.
 * @param ctx - context whose `tools` registry receives the effect-scoped registration.
 * @param runtime - plugin instance runtime.
 */
export function applySciDrawTool(ctx: Context, runtime: Runtime): void {
  const { client, timeouts } = runtime
  ctx.tools.register(defineTool({
    name: 'sci_draw',
    description: 'Generate or process scientific figures with AI (AI4Scholar Nano Draw; costs credits). Actions: smart (auto-optimizes the prompt, Chinese OK — recommended), generate (text-to-image), edit (modify an image), style (style transfer), compose (combine 2+ images), iterate (auto-review and refine), critic (expert review, returns text), svg (vector graphic), vectorize (PNG/JPG → PDF + PPTX). Generation takes 30–90 seconds — tell the user to wait before calling. Show the returned imageUrl to the user as a Markdown image.',
    parameters: {
      action: { type: 'string', required: true, enum: ACTIONS, description: 'Operation.' },
      prompt: { type: 'string', description: 'Description or instruction; may be empty for critic and vectorize.' },
      model: { type: 'string', enum: ['flash', 'flash31', 'pro', 'gptimage'], description: 'flash (fast), flash31 (balanced, default), pro (highest quality), gptimage (GPT Image 2, detailed illustrations).' },
      image_size: { type: 'string', enum: ['1K', '2K', '4K'], description: 'Output resolution (default 2K).' },
      aspect_ratio: { type: 'string', description: 'Aspect ratio: 1:1 (default), 16:9, 4:3, 3:4, 9:16.' },
      images: { type: 'array', items: { type: 'string' }, description: 'Input images as URLs or base64 data URIs; required for edit/style/compose/iterate/critic/vectorize.' },
      style_preset: { type: 'string', description: 'Style preset name (style action).' },
      lang: { type: 'string', enum: ['en', 'zh'], description: 'Language of critique/optimized prompt (default en).' },
      vectorize_mode: { type: 'string', enum: ['fast', 'standard', 'premium'], description: 'Vectorize quality (vectorize action; default fast).' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      presentationMeta: (_args, value) => creditsMeta(value),
      render: (_args, value: SciDrawValue) => {
        const lines: string[] = [`sci_draw ${value.action} finished.`]
        if (value.imageUrl !== undefined) lines.push(`Image: ${value.imageUrl}`, '', `![scientific figure](${value.imageUrl})`)
        if (value.svgUrl !== undefined) lines.push(`SVG: ${value.svgUrl}`)
        if (value.svgCode !== undefined) lines.push('SVG code:\n```svg\n' + value.svgCode + '\n```')
        if (value.pdfUrl !== undefined) lines.push(`Vector PDF: ${value.pdfUrl}`)
        if (value.pptxUrl !== undefined) lines.push(`PPTX: ${value.pptxUrl}`)
        if (value.optimizedPrompt !== undefined) lines.push(`Optimized prompt: ${value.optimizedPrompt}`)
        if (value.critique !== undefined) lines.push(`Critique:\n${value.critique}`)
        if (value.warning !== undefined) lines.push(`Note: ${value.warning}`)
        lines.push('Show the image/links to the user (Markdown image syntax for imageUrl).')
        const credits = formatCredits(value.credits)
        if (credits !== undefined) lines.push('', credits)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    timeoutMs: timeouts.generation + timeouts.tool,
    isConcurrencySafe: () => false,
    presentCall: (args) => ({ card: 'generic', title: `sci_draw ${args.action}${args.prompt !== undefined && args.prompt.length > 0 ? `: ${args.prompt.slice(0, 80)}` : ''}`, kind: 'other', rawInput: args.prompt ?? '' }),
    presentResult: (args, result) => presentGenericWithCredits(`sci_draw ${args.action}${args.prompt !== undefined && args.prompt.length > 0 ? `: ${args.prompt.slice(0, 80)}` : ''}`, result),
    async execute(args, exec) {
      const images = args.images?.map((i) => i.trim()).filter((i) => i.length > 0) ?? []
      if (NEEDS_IMAGES.has(args.action) && images.length === 0) throw new Error(`action "${args.action}" requires at least one image in "images"`)
      if (args.action === 'compose' && images.length < 2) throw new Error('action "compose" requires at least 2 images')
      const prompt = args.prompt?.trim() ?? ''
      if (prompt.length === 0 && !['critic', 'vectorize'].includes(args.action)) throw new Error(`action "${args.action}" requires a prompt`)
      const apiKey = await runtime.requireApiKey()
      const body: Record<string, unknown> = { action: args.action, prompt }
      if (args.model !== undefined) body.model = args.model
      if (args.image_size !== undefined) body.imageSize = args.image_size
      if (args.aspect_ratio !== undefined) body.aspectRatio = args.aspect_ratio
      if (images.length > 0) body.images = images
      if (args.style_preset !== undefined) body.stylePreset = args.style_preset
      if (args.lang !== undefined) body.lang = args.lang
      if (args.vectorize_mode !== undefined && args.action === 'vectorize') body.vectorizeMode = args.vectorize_mode
      const res = await client.post<Record<string, unknown>>('/api/proxy/nano/generate', body, { apiKey, signal: exec.signal, timeoutMs: timeouts.generation })
      if (!res.ok) throw new Error(`sci_draw failed: ${res.error}`)
      const data = res.data
      if (data.success === false) throw new Error(str(data, 'message') ?? str(data, 'error') ?? 'image generation failed (credits are refunded automatically)')
      const imageUrl = str(data, 'imageUrl')
      const credits = runtime.creditsOf(res, exec.agent)
      const bodyCost = typeof data.creditCost === 'number' ? data.creditCost : undefined
      const mergedCredits = credits ?? (bodyCost !== undefined && runtime.showCredits ? compact({ charged: bodyCost, sessionTotal: runtime.ledger.record(exec.agent, bodyCost) }) : undefined)
      const value = compact({
        action: args.action,
        imageUrl,
        svgUrl: str(data, 'svgUrl'),
        svgCode: str(data, 'svgCode'),
        pdfUrl: str(data, 'pdfUrl'),
        pptxUrl: str(data, 'pptxUrl'),
        optimizedPrompt: str(data, 'optimizedPrompt'),
        critique: str(data, 'critique'),
        warning: imageUrl === undefined && !['critic', 'svg', 'vectorize'].includes(args.action) ? 'the service reported success but returned no imageUrl; retry once' : undefined,
        credits: mergedCredits,
      })
      return value
    },
  }))
}
