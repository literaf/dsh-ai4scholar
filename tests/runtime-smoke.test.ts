/**
 * Boots the REAL Cordis context with the published `SystemPrompt` and
 * `ToolRuntime` services and mounts the built plugin from `lib/`, proving the
 * shipped artifact registers through the genuine registries (schema
 * compilation, effect-scoped disposal, prompt assembly), not the test fakes.
 * Requires `pnpm build` first (vitest runs it through package.json `pretest`
 * when present; the CI script builds explicitly).
 */
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'

const LIB_ENTRY = new URL('../lib/index.js', import.meta.url)

describe.skipIf(!existsSync(LIB_ENTRY))('built plugin in the real tool runtime', () => {
  it('mounts, registers its tools and prompt section, and unmounts cleanly', async () => {
    const plugin = await import(LIB_ENTRY.href) as typeof import('../src/index.js')
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, {})
    expect(ctx.tools).toBeDefined()

    const fiber = await ctx.plugin(plugin, { googleScholar: false })
    const names = ctx.tools.schemas().map((s) => s.name).sort()
    expect(names).toHaveLength(37) // 38 defaults minus search_google_scholar
    expect(names).not.toContain('search_google_scholar')
    for (const expected of ['search_semantic', 'search_pubmed', 'search_arxiv', 'read_by_doi', 'auto_cite', 'sci_draw', 'get_ai4scholar_credits']) expect(names).toContain(expected)
    const schema = ctx.tools.schemas().find((s) => s.name === 'search_semantic')!
    expect(schema.parameters).toMatchObject({ type: 'object', required: ['query'] })
    expect(schema.description).toContain('Semantic Scholar')

    // Prompt guidance reaches the assembled system prompt.
    const assembly = await ctx.systemPrompt.assemble()
    const section = assembly.sections.find((s) => s.name === 'tool:ai4scholar')
    expect(section).toBeDefined()
    const text = JSON.stringify(section)
    expect(text).toContain('search_semantic')
    expect(text).not.toContain('search_google_scholar')
    expect(assembly.tools.map((t) => t.name)).toContain('search_pubmed')

    // Disposing the plugin fiber withdraws every registration (effects, not leaks).
    await fiber.dispose()
    expect(ctx.tools.schemas()).toHaveLength(0)
  })
})
