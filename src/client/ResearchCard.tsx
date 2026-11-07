import { useState } from 'react'
import type { ComponentType } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { RESULT_CARD_TOOLS } from '../shared/commands.js'
import { NS } from './locales.js'
import type { Ai4ScholarLocaleKey } from './locales.js'
import { cls } from './styles.js'

interface Action { label: string; prompt?: string; url?: string }
interface Item { title: string; source: string; identity: string; summary: string; url?: string; actions: Action[] }
interface Owner {
  toolName: string
  phase?: string
  block: { kind?: string; isError?: boolean; meta?: unknown; content?: readonly { type: string; text?: string }[] }
  inspect?: () => void
}
interface Face { fillDraft(text: string): 'filled' | 'busy' | 'unavailable' }
type Props = Owner & Face & PropsLocale<'ai4scholar'>
const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const safeUrl = (x: unknown): string | undefined => {
  if (typeof x !== 'string') return undefined
  try { const u = new URL(x); return ['https:', 'http:'].includes(u.protocol) ? u.href : undefined } catch { return undefined }
}
const actionKey: Record<string, Ai4ScholarLocaleKey> = { details: 'actionDetails', read: 'actionRead', pdf: 'actionPdf', citations: 'actionCitations', references: 'actionReferences', related: 'actionRelated', authors: 'actionAuthors', citation: 'actionCitation', versions: 'actionVersions', profile: 'actionProfile', papers: 'actionPapers' }

export function readResearchItems(meta: unknown): Item[] {
  if (!obj(meta) || !obj(meta.ai4s) || meta.ai4s.version !== 1 || !Array.isArray(meta.ai4s.items)) return []
  return meta.ai4s.items.filter(obj).flatMap((x) => {
    if (typeof x.title !== 'string' || typeof x.source !== 'string') return []
    const actions: Action[] = Array.isArray(x.actions) ? x.actions.filter(obj).flatMap((a): Action[] => {
      if (typeof a.label !== 'string' || !actionKey[a.label]) return []
      const url = safeUrl(a.url)
      const prompt = typeof a.prompt === 'string' && /^\/ai4s-(paper|author)\s/.test(a.prompt) ? a.prompt : undefined
      return url ? [{ label: a.label, url }] : prompt ? [{ label: a.label, prompt }] : []
    }) : []
    const url = safeUrl(x.url)
    return [{ title: x.title, source: x.source, identity: typeof x.identity === 'string' ? x.identity : '', summary: typeof x.summary === 'string' ? x.summary : '', ...(url ? { url } : {}), actions }]
  })
}

/** A replayable result list; action buttons prepare a normal editable prompt. */
export function Ai4ScholarResearchCard({ toolName, phase, block, inspect, fillDraft, t }: Props) {
  const [notice, setNotice] = useState<Ai4ScholarLocaleKey | undefined>()
  const items = block.isError ? [] : readResearchItems(block.meta)
  const text = block.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') ?? ''
  const settled = phase === 'result' || block.kind === 'tool-result'
  const meta = obj(block.meta) ? block.meta : {}
  const credits = obj(meta.credits) ? meta.credits : {}
  const compare = !block.isError && obj(meta.ai4s) && typeof meta.ai4s.compare === 'string' && meta.ai4s.compare.startsWith('/ai4s-author ') ? meta.ai4s.compare : undefined
  const action = (prompt: string): void => {
    const result = fillDraft(prompt)
    setNotice(result === 'filled' ? 'resultDraftReady' : result === 'busy' ? 'resultDraftBusy' : 'resultDraftUnavailable')
  }
  return <details className={cls.research}>
    <summary className={cls.researchHead}>
      <span>AI4Scholar</span>
      <span className={cls.cmdMuted}>{settled ? block.isError ? t('resultError') : items.length ? t('resultCount', { count: items.length }) : toolName : t('resultRunning')}</span>
      {typeof credits.charged === 'number' ? <span className={cls.cmdMuted}>{t('resultCharge', { count: credits.charged })}</span> : null}
      {typeof credits.remaining === 'number' ? <span className={cls.cmdMuted}>{t('resultRemaining', { count: credits.remaining })}</span> : null}
    </summary>
    <div className={cls.researchBody}>
      {items.length ? <ol className={cls.researchList}>{items.map((item, index) => <li className={cls.researchItem} key={`${item.source}:${item.identity}:${index}`}>
        <div className={cls.researchTitle}>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</div>
        <div className={cls.researchFacts}>{item.source}{item.identity ? ` · ${item.identity}` : ''}</div>
        {item.summary ? <div className={cls.researchFacts}>{item.summary}</div> : null}
        {item.actions.length ? <div className={cls.researchActions}>{item.actions.map((a, i) => a.url
          ? <a key={i} href={a.url} target="_blank" rel="noreferrer">{t(actionKey[a.label]!)}</a>
          : <button key={i} type="button" onClick={() => action(a.prompt!)}>{t(actionKey[a.label]!)}</button>)}</div> : null}
      </li>)}</ol> : <pre className={cls.cmdPre}>{text || t('resultRunning')}</pre>}
      {compare ? <div className={cls.researchActions}><button type="button" onClick={() => action(compare)}>{t('actionCompare')}</button></div> : null}
      {notice ? <div className={cls.researchNotice} role="status">{t(notice)}</div> : null}
      {items.length && text ? <details className={cls.researchRaw}><summary>{t('resultFullOutput')}</summary><pre className={cls.cmdPre}>{text}</pre></details> : null}
      {inspect ? <button className={cls.linkButton} type="button" onClick={inspect}>{t('resultInspect')}</button> : null}
    </div>
  </details>
}

interface ResearchSlots {
  inject(name: 'tool.call.toolview', callback: () => () => void): () => void
  register(options: { name: 'tool.call.toolview'; key: string; locale: typeof NS; inject(sessionId: string): Face }, component: ComponentType<Props>): () => void
}
interface SessionInput {
  state: { getSnapshot(): { draft: string; phase: string } }
  setDraft(text: string): void
  focus?(): void
}

export function applyResearchCards(ctx: ClientContext): void {
  const slots = ctx.slots as unknown as ResearchSlots
  // This keyed seat exists on current Harness; older clients keep their
  // ordinary tool cards and still receive the same readable result text.
  for (const name of RESULT_CARD_TOOLS) slots.inject('tool.call.toolview', () => slots.register({
    name: 'tool.call.toolview', key: name, locale: NS,
    inject: (sessionId) => ({ fillDraft: (text) => {
      const sessions = ctx.get('sessions') as unknown as { binding(id: string): { ctx: ClientContext } | undefined } | undefined
      const conversation = ctx.get('conversation') as unknown as { input: { for(ctx: ClientContext): SessionInput } } | undefined
      const binding = sessions?.binding(sessionId)
      if (!binding || !conversation) return 'unavailable'
      const input = conversation.input.for(binding.ctx)
      const state = input.state.getSnapshot()
      if (state.draft.trim() || ['submitting', 'adjudicating', 'submitted'].includes(state.phase)) return 'busy'
      input.setDraft(text)
      if (input.state.getSnapshot().draft !== text) return 'busy'
      input.focus?.()
      return 'filled'
    } }),
  }, Ai4ScholarResearchCard))
}
