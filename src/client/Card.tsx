/**
 * One credentials form shared by the native plugin page, the Settings page,
 * and the collapsible card on older hosts.
 */

import { useEffect, useId, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { ApiKeyCardState, CardStore } from './controller.js'
import { cls } from './styles.js'
import type { PluginConfigView } from './plugin-config.js'

/** The registration-side face this plugin's slot entry injects. */
export interface Ai4ScholarCardFace {
  hooks: {
    /** Card snapshot, bound by the renderer as `useCard`. */
    card: CardStore<ApiKeyCardState>
  }
  /** Stage key text. */
  edit(text: string): void
  /** Write the staged key. */
  save(): void
  /** Remove the stored key. */
  remove(): void
  /** Re-read the configured state (used when the card opens). */
  refresh(): void
  /** Test the stored key by reading the balance through the host. */
  testKey(): void
}

/** Props the renderer binds for the card. */
export type Ai4ScholarSettingsProps = PropsLocale<'ai4scholar'>
  & InjectFace<Ai4ScholarCardFace>

export type Ai4ScholarCardProps = PropsRuntime<'settings.plugin.item'> & Ai4ScholarSettingsProps

const SOURCE_KEYS = {
  'env': 'sourceEnv',
  'file': 'sourceFile',
  'project-env': 'sourceProjectEnv',
  'user-env': 'sourceUserEnv',
} as const

function Chevron(props: { className: string }) {
  return (
    <svg className={props.className} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Render the card.
 * @param props - locale copy, the card snapshot hook, and the controller actions.
 * @returns the card list item.
 */
export function Ai4ScholarCard(props: Ai4ScholarCardProps) {
  const { t } = props
  const state = props.useCard((snapshot) => snapshot)
  const [open, setOpen] = useState(false)

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next) props.refresh()
  }

  return (
    <li className={`${cls.card}${open ? ` ${cls.cardOpen}` : ''}`}>
      <button
        type="button"
        className={cls.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`}
        onClick={toggle}
      >
        <span className={cls.headText}>
          <span className={cls.name}>{t('title')}</span>
          <span className={cls.description}>{t('description')}</span>
        </span>
        <KeyStatus t={t} state={state} />
        <Chevron className={`${cls.chevron}${open ? ` ${cls.chevronOpen}` : ''}`} />
      </button>
      {open ? <KeyForm {...props} state={state} /> : null}
    </li>
  )
}

function KeyStatus({ t, state }: PropsLocale<'ai4scholar'> & { state: ApiKeyCardState }) {
  const sourceKey = state.source !== undefined && state.source in SOURCE_KEYS
    ? SOURCE_KEYS[state.source as keyof typeof SOURCE_KEYS]
    : undefined
  const badge = !state.loaded
    ? t('checking')
    : state.configured
      ? (sourceKey !== undefined ? t('configuredVia', { source: t(sourceKey) }) : t('configured'))
      : t('notConfigured')
  return <span className={`${cls.badge}${state.loaded && state.configured ? ` ${cls.badgeOn}` : ''}`}>{badge}</span>
}

/** A full page always exposes the field; reopening re-reads the credential status. */
export function Ai4ScholarSettings(props: Ai4ScholarSettingsProps) {
  const state = props.useCard((snapshot) => snapshot)
  useEffect(() => { props.refresh() }, [props.refresh])

  return (
    <section className={`${cls.card} ${cls.page}`} aria-label={props.t('settingsTitle')}>
      <div className={cls.pageHead}>
        <div className={cls.headText}>
          <h2 className={cls.pageTitle}>{props.t('settingsTitle')}</h2>
          <p className={cls.pageIntro}>{props.t('settingsIntro')}</p>
        </div>
        <KeyStatus t={props.t} state={state} />
      </div>
      <KeyForm {...props} state={state} />
    </section>
  )
}

/** Native bundle/row pages supply a view; summaries must remain inline text. */
export function Ai4ScholarPluginConfig(props: Ai4ScholarSettingsProps & PluginConfigView) {
  return props.view === 'summary' ? <>{props.t('settingsIntro')}</> : <Ai4ScholarSettings {...props} />
}

function KeyForm(props: Ai4ScholarSettingsProps & { state: ApiKeyCardState }) {
  const { t, state } = props
  const inputId = useId()
  const canSave = state.draft.trim().length > 0 && state.writable && !state.busy
  const canRemove = state.configured && state.writable && !state.busy
  return (
    <div className={cls.body}>
      {!state.writable ? <p className={cls.readOnly} role="status">{t('readOnly')}</p> : null}
      <div className={cls.field}>
        <div className={cls.fieldHead}>
          <label className={cls.label} htmlFor={inputId}>{t('apiKeyLabel')}</label>
          <a className={cls.link} href="https://ai4scholar.net?src=dsh" target="_blank" rel="noreferrer">{t('getKey')}</a>
        </div>
        <input
          id={inputId}
          className={cls.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('apiKeyPlaceholder')}
          value={state.draft}
          disabled={!state.writable || state.busy}
          onChange={(event) => { props.edit(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSave) {
              event.preventDefault()
              props.save()
            }
          }}
        />
        <p className={cls.hint}>{t('apiKeyHint')}</p>
        {state.loaded && state.configured
          ? (
            <p className={cls.check} role="status">
              {state.check === undefined
                ? null
                : state.check.status === 'checking'
                  ? <span className={cls.checkMuted}>{t('checking')}</span>
                  : state.check.status === 'ok'
                    ? (
                      <span className={cls.checkOk}>
                        {t('keyValid', { credits: state.check.totalAvailable.toLocaleString('en-US') })}
                        {state.check.keyCreditsUsed !== undefined ? ` · ${t('keySpent', { credits: state.check.keyCreditsUsed.toLocaleString('en-US') })}` : ''}
                        {state.check.membership !== undefined ? ` · ${state.check.membership}` : ''}
                      </span>
                    )
                    : <span className={cls.checkError}>{t('keyInvalid', { message: state.check.message })}</span>}
              {state.check?.status !== 'checking'
                ? (
                  <button type="button" className={cls.linkButton} disabled={state.busy} onClick={() => { props.testKey() }}>
                    {state.check === undefined ? t('testKey') : t('recheckKey')}
                  </button>
                )
                : null}
            </p>
          )
          : null}
      </div>
      <div className={cls.footer}>
        {state.notice !== undefined
          ? (
            <p className={`${cls.notice}${state.notice.kind === 'error' ? ` ${cls.noticeError}` : ''}`} role="status">
              {state.notice.kind === 'saved'
                ? t('saved')
                : state.notice.kind === 'removed'
                  ? t('removed')
                  : t('failed', { message: state.notice.message ?? '' })}
            </p>
          )
          : null}
        <button type="button" className={cls.button} disabled={!canRemove} onClick={() => { props.remove() }}>
          {t('remove')}
        </button>
        <button type="button" className={`${cls.button} ${cls.buttonPrimary}`} disabled={!canSave} onClick={() => { props.save() }}>
          {t(state.busy ? 'saving' : 'save')}
        </button>
      </div>
    </div>
  )
}
