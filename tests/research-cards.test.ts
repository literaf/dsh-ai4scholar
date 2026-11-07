// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { researchMeta } from '../src/research-meta.js'
import { Ai4ScholarResearchCard, applyResearchCards, readResearchItems } from '../src/client/ResearchCard.js'
import { zh } from '../src/client/locales.js'
import type { Ai4ScholarLocaleKey } from '../src/client/locales.js'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { RESULT_CARD_TOOLS } from '../src/shared/commands.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const paper = { source: 'semantic-scholar', id: 'paper-123', title: 'Battery mechanisms', authors: ['A Li'], url: 'https://example.org/paper', doi: '10.1234/battery' }

describe('result actions', () => {
  it('offers only enabled actions supported by a paper’s identifiers', () => {
    const meta = researchMeta({ papers: [paper] }, new Set(['read_semantic_paper', 'get_semantic_references']), {})
    const items = readResearchItems(meta)
    expect(items[0]?.actions.map((a) => a.label)).toEqual(['read', 'references'])
    expect(items[0]?.actions[0]?.prompt).toContain('paper-123')
    expect(items[0]?.actions[0]?.prompt).toContain('10.1234/battery')
    const google = { ...paper, source: 'google-scholar', id: 'https://example.org/no-id', externalIds: {} }
    const noIds = readResearchItems(researchMeta({ papers: [google] }, new Set(['get_google_scholar_citation', 'search_google_scholar']), {}))
    expect(noIds[0]?.actions).toEqual([])
    const withIds = { ...google, externalIds: { GoogleScholar: 'nativeID', GoogleScholarCites: '9007199254740993123' } }
    const yesIds = readResearchItems(researchMeta({ papers: [withIds] }, new Set(['get_google_scholar_citation', 'search_google_scholar']), {}))
    expect(yesIds[0]?.actions.map((a) => a.label)).toEqual(['citations', 'citation'])
    expect(yesIds[0]?.actions[0]?.prompt).toContain('9007199254740993123')
  })

  it('keeps author identities distinct and offers comparison and profile/paper actions', () => {
    const meta = researchMeta({ authors: [
      { authorId: 'author-1', name: 'Li', affiliations: ['A'], hIndex: 4 },
      { source: 'google-scholar', id: 'author-2', name: 'Li', affiliations: 'B', citationCount: 10 },
    ] }, new Set(['get_semantic_author_detail', 'get_semantic_author_papers', 'get_google_scholar_author']), {})
    const items = readResearchItems(meta)
    expect(items[0]).toMatchObject({ source: 'Semantic Scholar', identity: 'author-1', summary: 'A · h-index 4' })
    expect(items[1]).toMatchObject({ source: 'Google Scholar', identity: 'author-2' })
    expect(items[1]?.summary).not.toContain('h-index')
    expect(items[0]?.actions.map((a) => a.label)).toEqual(['profile', 'papers'])
    expect(JSON.stringify(meta)).toContain('/ai4s-author 比较以下作者')
  })

  it('filters unsafe URLs and renders malformed/older metadata without inventing actions', () => {
    expect(readResearchItems({ ai4s: { version: 99, items: [] } })).toEqual([])
    const items = readResearchItems({ ai4s: { version: 1, items: [{ title: '<img src=x>', source: 'google-scholar', url: 'javascript:alert(1)', actions: [{ label: 'pdf', url: 'javascript:alert(2)' }, { label: 'read', prompt: '/bash rm -rf x' }] }] } })
    expect(items[0]?.url).toBeUndefined()
    expect(items[0]?.actions).toEqual([])
  })

  it('fills an editable natural-language follow-up from the selected row and shows charge/balance', async () => {
    const meta = researchMeta({ papers: [paper] }, new Set(['read_semantic_paper']), { credits: { charged: 1, remaining: 99 } })
    const fillDraft = vi.fn(() => 'filled' as const)
    const el = document.createElement('div'); document.body.append(el)
    const root = createRoot(el)
    const t = (key: Ai4ScholarLocaleKey, params?: Record<string, unknown>) => Object.entries(params ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), zh[key])
    try {
      await act(async () => root.render(createElement(Ai4ScholarResearchCard, { toolName: 'search_semantic', phase: 'result', block: { kind: 'tool-result', meta, content: [{ type: 'text', text: 'Full text output' }] }, fillDraft, t } as never)))
      expect(el.textContent).toContain('1 积分')
      expect(el.textContent).toContain('剩余 99')
      const button = [...el.querySelectorAll('button')].find((b) => b.textContent === '读全文')!
      await act(async () => button.click())
      expect(fillDraft).toHaveBeenCalledWith(expect.stringContaining('/ai4s-paper 读《Battery mechanisms》'))
      expect(el.textContent).toContain('已填入输入框')
      expect(el.querySelector('img')).toBeNull()
    } finally { await act(async () => root.unmount()); el.remove() }
  })

  it('addresses the originating session and preserves an existing draft without sending requests', () => {
    const entries: Array<{ key: string; inject(id: string): { fillDraft(text: string): string } }> = []
    let draft = ''
    const binding = { ctx: {} }
    const input = { state: { getSnapshot: () => ({ draft, phase: 'plain' }) }, setDraft: vi.fn((text: string) => { draft = text }), focus: vi.fn(), submit: vi.fn() }
    const resolveInput = vi.fn(() => input)
    const ctx = {
      slots: { inject: (_name: string, callback: () => void) => callback(), register: (options: never) => { entries.push(options); return () => {} } },
      get: (name: string) => name === 'sessions' ? { binding: (id: string) => id === 'session-1' ? binding : undefined } : name === 'conversation' ? { input: { for: resolveInput } } : undefined,
    } as unknown as ClientContext
    applyResearchCards(ctx)
    expect(entries.map((e) => e.key)).toEqual(RESULT_CARD_TOOLS)
    expect(entries.map((e) => e.key)).not.toContain('sci_draw')
    const face = entries[0]!.inject('session-1')
    expect(face.fillDraft('/ai4s-paper 读这篇论文')).toBe('filled')
    expect(resolveInput).toHaveBeenCalledWith(binding.ctx)
    expect(face.fillDraft('/ai4s-paper 查另一篇')).toBe('busy')
    expect(draft).toBe('/ai4s-paper 读这篇论文')
    expect(input.submit).not.toHaveBeenCalled()
    expect(entries[0]!.inject('other-session').fillDraft('request')).toBe('unavailable')
  })
})
