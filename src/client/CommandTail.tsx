import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { COMMAND_CARD_ROUTE } from '../shared/command-card.js'
import type { CommandCardCatalog } from '../shared/command-card.js'
import { RESEARCH_COMMANDS, RESEARCH_TOOL_NAMES } from '../shared/commands.js'
import { PLATFORM_CAP, UNIFIED_SOURCES } from '../shared/search-settings.js'
import type { UnifiedSource } from '../shared/search-settings.js'
import type { Ai4ScholarCardFace } from './Card.js'
import { Ai4ScholarBrand } from './Brand.js'
import { CommandMenu } from './CommandMenu.js'
import { NS } from './locales.js'
import type { Ai4ScholarLocaleKey } from './locales.js'
import type { InjectedFace } from './plugin-config.js'
import { fillConversationDraft } from './draft.js'
import type { DraftResult } from './draft.js'
import { cls } from './styles.js'

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const commands = new Set(RESEARCH_COMMANDS.map(c => c.name))

/** Validate local metadata; no model output can manufacture a command button. */
export function readCommandCardCatalog(value: unknown): CommandCardCatalog {
  if (!record(value) || typeof value.enabled !== 'boolean' || !Array.isArray(value.commands) || !Array.isArray(value.defaults)) throw new Error('Invalid command menu')
  const seen = new Set<string>()
  const menu = value.commands.flatMap(item => {
    if (!record(item) || typeof item.name !== 'string' || !commands.has(item.name) || typeof item.title !== 'string' || seen.has(item.name)) return []
    seen.add(item.name)
    return [{ name: item.name, title: item.title, ...(typeof item.example === 'string' ? { example: item.example } : {}) }]
  })
  return {
    enabled: value.enabled && menu.length > 0,
    commands: menu,
    defaults: value.defaults.flatMap(item => {
      if (!record(item) || !UNIFIED_SOURCES.includes(item.source as UnifiedSource) || !Number.isInteger(item.count) || (item.count as number) < 1 || (item.count as number) > PLATFORM_CAP[item.source as UnifiedSource]) return []
      return [{ source: item.source as UnifiedSource, count: item.count as number }]
    }),
  }
}

/** Minimal public shapes supplied by ui-chat's session-scoped turnTail seat. */
export interface CommandTailTurn {
  turn: number
  status: string
  end?: { data: { reason: { kind: string } } }
  data: { get(key: string): unknown }
}
export interface CommandTailChat {
  timeline: { turnOrder: readonly number[] }
  locations: { getTurn(turn: number): readonly string[] }
  nodes: { get(key: string): { kind: string; data: unknown } | undefined }
}
export function isLatestReply(turn: CommandTailTurn, chat: CommandTailChat): boolean {
  if (turn.status !== 'closed' || !turn.end || ['aborted', 'interrupted', 'error'].includes(turn.end.data.reason.kind) || chat.timeline.turnOrder.at(-1) !== turn.turn) return false
  const tail = turn.data.get('turn-tail')
  return record(tail) && record(tail.closing) && Array.isArray(tail.closing.blocks)
    && tail.closing.blocks.some(block => record(block) && block.kind === 'text' && typeof block.text === 'string' && block.text.trim() !== '')
}

/** Only display already-recorded Ai4Scholar charges; never fetch an account balance. */
export function turnCredits(turn: number, chat: CommandTailChat): { charged?: number; remaining?: number } {
  const seen = new Set<string>(), visited = new Set<object>()
  const stack: unknown[] = []
  for (const key of chat.locations.getTurn(turn)) {
    const node = chat.nodes.get(key)
    if (node?.kind === 'tool-call' && record(node.data)) stack.push(node.data.root)
  }
  let charged: number | undefined, remaining: number | undefined, latest = -Infinity
  while (stack.length) {
    const tool = stack.pop()
    if (!record(tool) || visited.has(tool)) continue
    visited.add(tool)
    if (Array.isArray(tool.subCalls)) stack.push(...tool.subCalls)
    if (typeof tool.callId !== 'string' || seen.has(tool.callId)) continue
    seen.add(tool.callId)
    if (typeof tool.name !== 'string' || !RESEARCH_TOOL_NAMES.has(tool.name) || !record(tool.meta) || !record(tool.meta.credits)) continue
    const credits = tool.meta.credits
    if (typeof credits.charged === 'number' && Number.isFinite(credits.charged) && credits.charged >= 0) charged = (charged ?? 0) + credits.charged
    if (typeof tool.seq === 'number' && tool.seq >= latest && typeof credits.remaining === 'number' && Number.isFinite(credits.remaining)) {
      latest = tool.seq; remaining = credits.remaining
    }
  }
  return { ...(charged === undefined ? {} : { charged }), ...(remaining === undefined ? {} : { remaining }) }
}

interface TailFace {
  hooks: Ai4ScholarCardFace['hooks']
  attachSearch(): void
  fillDraft(text: string): DraftResult
}
type Props = PropsLocale<'ai4scholar'> & InjectedFace<TailFace> & {
  turn: CommandTailTurn
  useChat?<T>(selector: (chat: CommandTailChat) => T): T
}
type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: CommandCardCatalog }
const sourceKeys = { 'semantic-scholar': 'sourceSemantic', 'google-scholar': 'sourceGoogle', pubmed: 'sourcePubmed', arxiv: 'sourceArxiv', chinese: 'sourceChinese' } as const

/** Older hosts without ui-chat's standard source keep manual /ai4s cards. */
export function Ai4ScholarCommandTail(props: Props) {
  return typeof props.useChat === 'function' ? <CommandTail {...props} useChat={props.useChat}/> : null
}
function CommandTail({ turn, useChat, useSearch, useCard, attachSearch, fillDraft, t }: Props & { useChat: NonNullable<Props['useChat']> }) {
  const settings = useSearch(value => value)
  const configured = useCard(value => value.loaded ? value.configured : undefined)
  const latest = useChat(chat => isLatestReply(turn, chat))
  const charged = useChat(chat => turnCredits(turn.turn, chat).charged)
  const remaining = useChat(chat => turnCredits(turn.turn, chat).remaining)
  const [attached, setAttached] = useState(false)
  const canLoad = latest && attached && (settings.status === 'ready' ? settings.committed.showCommandCard : settings.status !== 'loading')
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  const [notice, setNotice] = useState<Ai4ScholarLocaleKey>()
  useEffect(() => { attachSearch(); setAttached(true) }, [attachSearch])
  useEffect(() => {
    if (!canLoad) return
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    void (async () => {
      try {
        const response = await fetch(new URL(COMMAND_CARD_ROUTE.slice(1), document.baseURI), { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]) })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Command menu unavailable')
        const body: unknown = await response.json()
        if (!record(body) || body.ok !== true) throw new Error('Command menu unavailable')
        const value = readCommandCardCatalog(body.value)
        if (!controller.signal.aborted) setLoad({ status: 'ready', value })
      } catch { if (!controller.signal.aborted) setLoad({ status: 'error' }) }
    })()
    return () => { controller.abort() }
  }, [canLoad, settings.revision, retry, turn.turn])
  if (!canLoad || load.status === 'loading' || load.status === 'ready' && !load.value.enabled) return null
  if (load.status === 'error') return <div className={cls.cmd} role="status">{t('commandCardFailed')} <button type="button" className={cls.linkButton} onClick={() => setRetry(n => n + 1)}>{t('commandCardRetry')}</button></div>
  const menu = load.value
  const n = (value: number): string => value.toLocaleString(undefined, { maximumFractionDigits: 6 })
  const choose = (name: string): void => {
    const result = fillDraft(`/${name} `)
    setNotice(result === 'filled' ? 'resultDraftReady' : result === 'busy' ? 'resultDraftBusy' : 'resultDraftUnavailable')
  }
  return <section className={cls.cmd} aria-label={t('cmdHelp')} data-ai4s-command-tail={turn.turn}>
    <div className={cls.cmdHead}>
      <Ai4ScholarBrand/>
      <div className={cls.cmdMetrics}>{settings.committed.showCredits && charged !== undefined ? <span>{t('commandCardTurnSpent', { credits: n(charged) })}</span> : null}{settings.committed.showCredits && remaining !== undefined ? <span>{t('resultRemaining', { count: n(remaining) })}</span> : null}</div>
      {configured === undefined ? null : <span className={cls.cmdPill}>{t(configured ? 'configured' : 'notConfigured')}</span>}
    </div>
    <div className={cls.cmdFoot}>
      {menu.defaults.length ? <div className={cls.cmdDefaults}><span>{t('cmdDefaults')}</span><span>{menu.defaults.map(item => `${t(sourceKeys[item.source])} ${item.count}`).join(' · ')}</span></div> : null}
      <details className={cls.cmdHelp} open>
        <summary>{t('cmdHelp')}</summary>
        <div className={cls.cmdHelpBody}><CommandMenu commands={menu.commands} choose={choose}/></div>
      </details>
      <a className={cls.link} href="https://ai4scholar.net?src=dsh" target="_blank" rel="noreferrer">{t('topUp')}</a>
    </div>
    {notice ? <div className={cls.researchNotice} role="status">{t(notice)}</div> : null}
  </section>
}

interface TailSlots {
  inject(name: 'conversation.chat.turnTail', callback: () => () => void): () => void
  register(options: { name: 'conversation.chat.turnTail'; id: string; order: number; locale: typeof NS; inject(sessionId: string): TailFace }, component: ComponentType<Props>): () => void
}
export function applyCommandTail(ctx: ClientContext, actions: Pick<Ai4ScholarCardFace, 'hooks' | 'attachSearch'>): void {
  const slots = ctx.slots as unknown as TailSlots
  slots.inject('conversation.chat.turnTail', () => slots.register({
    name: 'conversation.chat.turnTail', id: 'dsh-ai4scholar.commands', order: 80, locale: NS,
    inject: sessionId => ({ ...actions, fillDraft: text => fillConversationDraft(ctx, sessionId, text) }),
  }, Ai4ScholarCommandTail))
}
