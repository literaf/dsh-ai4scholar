import { describe, expect, it, vi } from 'vitest'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { mount, stubFetch } from './helpers.js'
import { RESEARCH_COMMANDS, RESEARCH_TOOL_NAMES } from '../src/shared/commands.js'
import { availableCommands } from '../src/commands.js'

function invocation(rawInput = '', options: Partial<CommandInvocation> = {}) {
  return { commandId: 'test-command', rawInput, attachments: [], signal: new AbortController().signal, agent: { followup: vi.fn() }, ...options } as unknown as CommandInvocation
}

describe('natural-language commands', () => {
  it('covers every enabled research tool through 21 main commands plus the legacy alias', () => {
    const fake = mount()
    expect(fake.tools.size).toBe(43)
    expect(fake.commands.size).toBe(22)
    expect(RESEARCH_COMMANDS).toHaveLength(20)
    expect([...fake.tools.keys()].filter((n) => n !== 'get_ai4scholar_credits' && !RESEARCH_TOOL_NAMES.has(n))).toEqual([])
    for (const c of RESEARCH_COMMANDS) {
      expect(fake.commands.get(c.name)?.input?.hint).toBe(c.example)
      expect(fake.commands.get(c.name)?.input?.hint).not.toContain('--')
      for (const t of c.tools) expect(fake.tools.has(t)).toBe(true)
    }
    const disabled = mount({ googleScholar: false, googlePatents: false, biorxiv: false, sciDraw: false })
    for (const c of ['ai4s-google', 'ai4s-patents', 'ai4s-biorxiv', 'ai4s-medrxiv', 'ai4s-draw']) expect(disabled.commands.has(c)).toBe(false)
    expect(disabled.commands.has('ai4s-author')).toBe(true)
    expect(mount({ command: false }).commands.size).toBe(0)
  })

  it('hides operation shortcuts when only their lookup helpers remain enabled', () => {
    const helperOnly = availableCommands(new Set(['get_semantic_paper_detail', 'get_pubmed_paper_detail', 'search_semantic_paper_match']))
    for (const name of ['ai4s-references', 'ai4s-citations', 'ai4s-related', 'ai4s-read', 'ai4s-pdf', 'ai4s-export']) {
      expect(helperOnly.some((c) => c.name === name)).toBe(false)
    }
    const noRead = mount({ fullText: false })
    expect(noRead.commands.has('ai4s-read')).toBe(false)
    expect(noRead.commands.has('ai4s-pdf')).toBe(true)
    const noSemantic = mount({ semanticScholar: false })
    expect(noSemantic.commands.has('ai4s-snippets')).toBe(false)
    expect(noSemantic.commands.has('ai4s-references')).toBe(false)
    expect(noSemantic.commands.has('ai4s-citations')).toBe(true)
    expect(noSemantic.commands.has('ai4s-related')).toBe(true)
    expect(mount({ googleScholar: false }).commands.has('ai4s-export')).toBe(false)
    const pdfOnly = availableCommands(new Set(['download_by_doi']))
    expect(pdfOnly.find((c) => c.name === 'ai4s-pdf')?.tools).toEqual(['download_by_doi'])
  })

  it.each([
    ['ai4s-snippets', 'search_semantic_snippets', 'search_semantic'],
    ['ai4s-references', 'get_semantic_references', 'get_semantic_citations'],
    ['ai4s-citations', 'get_semantic_citations', 'get_semantic_references'],
    ['ai4s-read', 'read_arxiv_paper', 'download_arxiv'],
    ['ai4s-pdf', 'download_arxiv', 'read_arxiv_paper'],
    ['ai4s-related', 'get_semantic_recommendations_for_paper', 'get_semantic_references'],
    ['ai4s-export', 'get_google_scholar_citation', 'auto_cite'],
  ])('%s queues a contextual request and prevents substitution of a different operation', async (name, allowed, denied) => {
    const fake = mount(); const input = invocation('处理刚才第一篇论文')
    await fake.commands.get(name!)!.handler(input)
    const request = vi.mocked(input.agent.followup).mock.calls[0]![0]
    expect(request.content).toEqual([{ type: 'text', text: `/${name} 处理刚才第一篇论文` }])
    const [entered] = await fake.dispatch('agent/pre-step', { agent: input.agent }, async () => ({ kind: 'enter', messages: [request] })) as [{ messages: UserMessage[] }]
    expect(JSON.stringify(entered.messages[1])).toContain(allowed)
    const guard = (tool: string) => fake.dispatch('tools/pre-execute', { agent: input.agent, name: tool, arguments: {} }, async () => ({ kind: 'allow' }))
    expect(await guard(allowed!)).toEqual([{ kind: 'allow' }])
    expect(await guard(denied!)).toEqual([{ kind: 'deny', reason: expect.stringContaining(`/${name}`) }])
    // Host tools remain usable, and a subsequent ordinary request releases this operation.
    expect(await guard('host_file_write')).toEqual([{ kind: 'allow' }])
    const followup = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '再换一种操作' }] })
    await fake.dispatch('agent/pre-step', { agent: input.agent }, async () => ({ kind: 'enter', messages: [request, followup] }))
    expect(await guard(denied!)).toEqual([{ kind: 'allow' }])
  })

  it('returns useful empty/help examples without an API call or queued model turn', async () => {
    const stub = stubFetch(() => { throw new Error('Help must not call an API') })
    try {
      const fake = mount({}, { apiKey: undefined })
      for (const c of RESEARCH_COMMANDS) for (const text of ['', '帮助']) {
        const input = invocation(text)
        const result = await fake.commands.get(c.name)!.handler(input)
        expect(result).toMatchObject({ kind: 'success', text: expect.stringContaining(`/${c.name}`) })
        expect(input.agent.followup).not.toHaveBeenCalled()
      }
      expect(stub.calls).toHaveLength(0)
    } finally { stub.restore() }
  })

  it('queues only the user’s readable request, preserves attached images, and deduplicates an invocation ID', async () => {
    const fake = mount()
    const attachments = [{ type: 'image', attachment: { id: 'image-1', mediaType: 'image/png' } }] as unknown as CommandInvocation['attachments']
    const input = invocation('  把这张图改成蓝色  ', { attachments })
    const command = fake.commands.get('ai4s-draw')!
    expect(command.input).toMatchObject({ images: true, attachments: true })
    expect(await command.handler(input)).toMatchObject({ kind: 'success' })
    await command.handler(input)
    expect(input.agent.followup).toHaveBeenCalledTimes(1)
    const message = vi.mocked(input.agent.followup).mock.calls[0]![0]
    expect(message.content).toEqual([{ type: 'text', text: '/ai4s-draw 把这张图改成蓝色' }, ...attachments])
    expect(message.source).toEqual({ kind: 'user' })
    expect(message.id).toBeTruthy()
  })

  it('does not enqueue cancelled requests and refuses image-only commands without an instruction', async () => {
    const fake = mount(); const controller = new AbortController(); controller.abort()
    const input = invocation('battery', { signal: controller.signal })
    await expect(fake.commands.get('ai4s-google')!.handler(input)).rejects.toThrow()
    expect(input.agent.followup).not.toHaveBeenCalled()
    const imageOnly = invocation('', { attachments: [{}] as unknown as CommandInvocation['attachments'] })
    expect(await fake.commands.get('ai4s-draw')!.handler(imageOnly)).toMatchObject({ kind: 'error' })
    expect(imageOnly.agent.followup).not.toHaveBeenCalled()
  })

  it('pins the source only when that queued request enters a step and releases it for the next user request', async () => {
    const fake = mount(); const agent = invocation().agent
    await fake.commands.get('ai4s-google')!.handler(invocation('固态电池，2022 年以来的 10 篇', { agent, commandId: 'first' as CommandInvocation['commandId'] }))
    await fake.commands.get('ai4s-pubmed')!.handler(invocation('CAR-T', { agent, commandId: 'second' as CommandInvocation['commandId'] }))
    const messages = vi.mocked(agent.followup).mock.calls.map(([m]) => m)
    const guard = (name: string) => fake.dispatch('tools/pre-execute', { agent, name, arguments: {} }, async () => ({ kind: 'allow' }))
    const enter = (m: UserMessage) => fake.dispatch('agent/pre-step', { agent, messages: [m] }, async () => ({ kind: 'enter', messages: [m] }))
    expect(await guard('search_semantic')).toEqual([{ kind: 'allow' }])
    const [entered] = await enter(messages[0]!) as [{ messages: UserMessage[] }]
    expect(entered.messages).toHaveLength(2)
    expect(entered.messages[1]?.source).toMatchObject({ kind: 'ai4scholar-command', form: 'instructions' })
    expect(JSON.stringify(entered.messages[1])).toContain('/ai4s-google')
    expect(JSON.stringify(entered.messages[1])).toContain('configured defaults')
    expect(await guard('search_google_scholar')).toEqual([{ kind: 'allow' }])
    expect(await guard('search_semantic')).toEqual([{ kind: 'deny', reason: expect.stringContaining('selected google-scholar') }])
    expect(await guard('search_papers')).toEqual([{ kind: 'deny', reason: expect.stringContaining('selected google-scholar') }])
    await enter(messages[1]!)
    expect(await guard('search_pubmed')).toEqual([{ kind: 'allow' }])
    expect(await guard('search_google_scholar')).toEqual([{ kind: 'deny', reason: expect.stringContaining('selected pubmed') }])
    await enter(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '读刚才第三篇论文' }] }))
    expect(await guard('read_semantic_paper')).toEqual([{ kind: 'allow' }])
    await enter(messages[0]!)
    fake.emit('agent/status', { agent, status: 'idle' })
    expect(await guard('search_pubmed')).toEqual([{ kind: 'allow' }])
  })

  it('shows current source/count settings alongside status even when the key is absent', async () => {
    const fake = mount({ searchSources: ['google-scholar', 'chinese'], resultsPerSource: { 'google-scholar': 5, chinese: 3 } }, { apiKey: undefined })
    for (const name of ['ai4s', 'ai4scholar']) {
      const result = await fake.commands.get(name)!.handler(invocation())
      expect(result.text).toContain('google-scholar 5 篇')
      expect(result.text).toContain('chinese 3 篇')
      expect(result.text).toContain('/ai4s-author')
      expect(result.text).toContain('/ai4s-patents')
    }
  })
})
