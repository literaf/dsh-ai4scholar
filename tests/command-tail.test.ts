// @vitest-environment jsdom
import { createElement, act, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Ai4ScholarCommandTail, isLatestReply, readCommandCardCatalog, turnCredits } from '../src/client/CommandTail.js'
import type { CommandTailChat, CommandTailTurn } from '../src/client/CommandTail.js'
import { createCardStore } from '../src/client/controller.js'
import { SearchSettingsController } from '../src/client/search-controller.js'
import { fillConversationDraft } from '../src/client/draft.js'
import { fakeForm } from './settings-fixture.js'
import { COMMAND_CARD_ROUTE } from '../src/shared/command-card.js'
import { zh } from '../src/client/locales.js'
import type { Ai4ScholarLocaleKey } from '../src/client/locales.js'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const clean of cleanups.splice(0)) await clean(); vi.unstubAllGlobals() })
const catalog = { enabled: true, commands: [
  { name: 'ai4s-search', title: '统一论文检索' }, { name: 'ai4s-references', title: '参考文献' },
], defaults: [{ source: 'semantic-scholar', count: 10 }] }
const translate = (key: Ai4ScholarLocaleKey, params?: Record<string, unknown>): string => Object.entries(params ?? {}).reduce((value, [name, text]) => value.replace(`{${name}}`, String(text)), zh[key])
function fixture(reason = 'completed') {
  const turn: CommandTailTurn = { turn: 2, status: 'closed', end: { data: { reason: { kind: reason } } }, data: new Map([['turn-tail', { closing: { blocks: [{ kind: 'text', text: '研究结果已整理。' }] } }]]) }
  const tools = [{ kind: 'tool-call', data: { root: { kind: 'tool-result', callId: 'search-1', name: 'search_semantic', seq: 9, meta: { credits: { charged: 1, remaining: 99 } }, subCalls: [] } } }]
  const chat: CommandTailChat = { timeline: { turnOrder: [1, 2] }, locations: { getTurn: () => ['search-1'] }, nodes: { get: () => tools[0] } }
  return { turn, chat }
}
function render(options: { enabled?: boolean; reason?: string; response?: unknown; attach?: boolean } = {}) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = fakeForm({ showCommandCard: options.enabled ?? false })
  const settings = new SearchSettingsController(() => host.form)
  if (options.attach !== false) settings.attach()
  const { turn, chat } = fixture(options.reason)
  const chatStore = createCardStore(chat)
  const key = createCardStore({ configured: true, loaded: true })
  let draft = ''
  const submit = vi.fn()
  const input = { state: { getSnapshot: () => ({ draft, phase: 'plain' }) }, setDraft: (text: string) => { draft = text }, focus: vi.fn(), submit }
  const binding = { ctx: {} }
  const ctx = { get: (name: string) => name === 'sessions' ? { binding: (id: string) => id === 'this-session' ? binding : undefined } : name === 'conversation' ? { input: { for: () => input } } : undefined }
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, value: options.response ?? catalog }), { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetch)
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const props = {
    turn, t: translate,
    useChat: <T,>(select: (value: CommandTailChat) => T) => useSyncExternalStore(chatStore.subscribe, () => select(chatStore.getSnapshot())),
    useSearch: <T,>(select: (value: ReturnType<typeof settings.store.getSnapshot>) => T) => useSyncExternalStore(settings.store.subscribe, () => select(settings.store.getSnapshot())),
    useCard: <T,>(select: (value: ReturnType<typeof key.getSnapshot>) => T) => useSyncExternalStore(key.subscribe, () => select(key.getSnapshot())),
    attachSearch: () => settings.attach(),
    fillDraft: (text: string) => fillConversationDraft(ctx as never, 'this-session', text),
  }
  cleanups.push(async () => { await act(async () => root.unmount()); settings.dispose(); container.remove() })
  return { container, settings, host, chatStore, fetch, submit, draft: () => draft, setDraft: (text: string) => { draft = text }, mount: () => act(async () => root.render(createElement(Ai4ScholarCommandTail, props as never))) }
}

describe('automatic command card', () => {
  it('resolves the initial settings form before fetching an opt-in menu', async () => {
    const app = render({ attach: false }); await app.mount()
    expect(app.settings.store.getSnapshot().status).toBe('ready')
    expect(app.container.textContent).toBe(''); expect(app.fetch).not.toHaveBeenCalled()
  })

  it('shows only after the latest completed answer, and hides for failures, cancellations and textless turns', () => {
    const { turn, chat } = fixture()
    expect(isLatestReply(turn, chat)).toBe(true)
    expect(isLatestReply({ ...turn, status: 'open', end: undefined } as unknown as CommandTailTurn, chat)).toBe(false)
    expect(isLatestReply(turn, { ...chat, timeline: { turnOrder: [1, 2, 3] } })).toBe(false)
    for (const reason of ['error', 'aborted', 'interrupted']) expect(isLatestReply(fixture(reason).turn, chat)).toBe(false)
    expect(isLatestReply({ ...turn, data: new Map([['turn-tail', { closing: null }]]) }, chat)).toBe(false)
  })

  it('deduplicates nested Code Mode calls and reads only recorded Ai4Scholar credits', () => {
    const child = { callId: 'a', name: 'search_semantic', seq: 3, meta: { credits: { charged: .5, remaining: 99.5 } } }
    const later = { callId: 'b', name: 'get_semantic_references', seq: 7, meta: { credits: { charged: 1, remaining: 98.5 } } }
    const root = { callId: 'code', name: 'execute_code', meta: { credits: { charged: 1000 } }, subCalls: [child, later, child] }
    const chat: CommandTailChat = { ...fixture().chat, nodes: { get: () => ({ kind: 'tool-call', data: { root } }) } }
    expect(turnCredits(2, chat)).toEqual({ charged: 1.5, remaining: 98.5 })
    expect(turnCredits(2, { ...chat, locations: { getTurn: () => [] } })).toEqual({})
  })

  it('accepts only known command names and valid platform defaults', () => {
    expect(readCommandCardCatalog({ ...catalog, commands: [...catalog.commands, { name: 'bash', title: 'Bad' }, catalog.commands[0]], defaults: [...catalog.defaults, { source: 'google-scholar', count: 100 }] })).toEqual(catalog)
    expect(() => readCommandCardCatalog({})).toThrow()
  })

  it('requires a saved switch, persists its value, and fills a draft without sending or overwriting it', async () => {
    const app = render(); await app.mount()
    expect(app.container.textContent).toBe(''); expect(app.fetch).not.toHaveBeenCalled()
    await act(async () => app.settings.edit('showCommandCard', true))
    expect(app.container.textContent).toBe(''); expect(app.fetch).not.toHaveBeenCalled()
    await act(async () => { await app.settings.save() })
    expect(app.host.user().showCommandCard).toBe(true)
    expect(app.fetch).toHaveBeenCalledTimes(1)
    expect(String(app.fetch.mock.calls[0]?.[0])).toContain(COMMAND_CARD_ROUTE)
    expect(app.container.querySelector('[data-ai4s-command-tail="2"]')).not.toBeNull()
    expect(app.container.textContent).toContain('本轮消耗 1 积分')
    expect(app.container.textContent).toContain('剩余 99')
    const references = app.container.querySelector('button[aria-label^="/ai4s-references"]') as HTMLButtonElement
    await act(async () => references.click())
    expect(app.draft()).toBe('/ai4s-references '); expect(app.submit).not.toHaveBeenCalled()
    app.setDraft('用户已有的草稿')
    await act(async () => (app.container.querySelector('button[aria-label^="/ai4s-search"]') as HTMLButtonElement).click())
    expect(app.draft()).toBe('用户已有的草稿'); expect(app.container.textContent).toContain('输入框已有草稿')
    await act(async () => { app.settings.edit('showCommandCard', false); await app.settings.save() })
    expect(app.container.textContent).toBe('')
    expect(app.fetch).toHaveBeenCalledTimes(1)
    const reloaded = new SearchSettingsController(() => app.host.form); reloaded.attach()
    expect(reloaded.store.getSnapshot().committed.showCommandCard).toBe(false); reloaded.dispose()
  })

  it('responds to the committed credits preference and disappears when a newer turn begins', async () => {
    const app = render({ enabled: true }); await app.mount()
    expect(app.container.textContent).toContain('本轮消耗')
    await act(async () => app.settings.edit('showCredits', false))
    expect(app.container.textContent).toContain('本轮消耗')
    await act(async () => { await app.settings.save() })
    expect(app.container.textContent).not.toContain('本轮消耗'); expect(app.container.textContent).not.toContain('剩余 99')
    await act(async () => app.chatStore.set({ ...app.chatStore.getSnapshot(), timeline: { turnOrder: [1, 2, 3] } }))
    expect(app.container.textContent).toBe('')
  })

  it('does not render a disabled backend menu, even if the form requested one', async () => {
    const app = render({ enabled: true, response: { ...catalog, enabled: false } }); await app.mount()
    expect(app.container.textContent).toBe('')
  })
})
