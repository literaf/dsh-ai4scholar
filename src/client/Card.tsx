/**
 * The plugin's configuration UI: the native plugin page and the Settings page
 * share two groups (API key, search defaults); older hosts get the
 * collapsible key card instead.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { ApiKeyCardState, CardStore } from './controller.js'
import { cls } from './styles.js'
import { revealSavedKey } from './key-reveal.js'
import type { InjectedFace, PluginConfigView } from './plugin-config.js'
import type { SearchDraft, SearchSettingsState } from './search-controller.js'
import { ABSTRACT_LIMIT, CITE_STYLES, DRAW_MODELS, DRAW_SIZES, PLATFORM_CAP, READ_MAX, READ_MIN, UNIFIED_SOURCES } from '../shared/search-settings.js'
import type { CiteStyle, DrawModel, UnifiedSource } from '../shared/search-settings.js'

/** The search-settings actions the page injects beside the key actions. */
export interface SearchSettingsActions {
  /** Bind the Host's form when the page opens (late-provided on some hosts). */
  attachSearch(): void
  toggleSource(source: UnifiedSource): void
  editCount(source: UnifiedSource, text: string): void
  editSearch<K extends keyof SearchDraft>(field: K, value: SearchDraft[K]): void
  saveSearch(): void
  resetSearch(): void
  discardSearch(): void
}

/** The registration-side face this plugin's slot entry injects. */
export interface Ai4ScholarCardFace extends SearchSettingsActions {
  hooks: {
    /** Card snapshot, bound by the renderer as `useCard`. */
    card: CardStore<ApiKeyCardState>
    /** Search-settings snapshot, bound as `useSearch`. */
    search: CardStore<SearchSettingsState>
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
  & InjectedFace<Ai4ScholarCardFace>

export type Ai4ScholarCardProps = Ai4ScholarSettingsProps

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
  const tone = !state.loaded ? '' : state.configured ? ` ${cls.badgeOn}` : ` ${cls.badgeOff}`
  return <span className={`${cls.badge}${tone}`}>{badge}</span>
}

/** Saved key and configuration state; the secret exists only while this row reveals it. */
function KeyConfigurationState({ t, state, id }: PropsLocale<'ai4scholar'> & { state: ApiKeyCardState; id?: string }) {
  const [key, setKey] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const request = useRef<AbortController>()
  const valueId = useId()
  const conceal = useCallback(() => {
    request.current?.abort()
    request.current = undefined
    setKey(undefined)
    setLoading(false)
    setFailed(false)
  }, [])
  // Credential changes invalidate a reveal, including an in-flight response.
  // Balance updates do not interrupt someone reading the saved key.
  useEffect(() => { conceal() }, [state.revision, state.configured, state.busy, state.draft, conceal])
  useEffect(() => {
    const visibilityChanged = (): void => { if (document.visibilityState !== 'visible') conceal() }
    window.addEventListener('blur', conceal)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      request.current?.abort()
      window.removeEventListener('blur', conceal)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [conceal])

  const toggle = async (): Promise<void> => {
    if (key !== undefined || loading) { conceal(); return }
    const active = new AbortController()
    request.current = active
    setLoading(true)
    setFailed(false)
    try {
      const value = await revealSavedKey(active.signal)
      if (!active.signal.aborted) setKey(value)
    } catch {
      if (!active.signal.aborted) setFailed(true)
    } finally {
      if (!active.signal.aborted) {
        request.current = undefined
        setLoading(false)
      }
    }
  }
  const pending = state.draft.trim().length > 0
  const configured = state.loaded && state.configured
  const title = !state.loaded ? 'checking' : configured ? 'keyConfiguredTitle' : pending ? 'keyPendingTitle' : 'keyMissingTitle'
  const sourceKey = state.source !== undefined && state.source in SOURCE_KEYS
    ? SOURCE_KEYS[state.source as keyof typeof SOURCE_KEYS]
    : undefined
  return (
    <>
      <div className={`${cls.keyState}${configured ? ` ${cls.keyStateConfigured}` : ''}`} onKeyDown={(event) => { if (event.key === 'Escape') conceal() }}>
        {configured ? (
          <div className={cls.keyValue}>
            <span id={valueId} className={cls.keySecret} aria-label={key === undefined ? t('keyHidden') : undefined} title={t('storedKey')}>{key ?? '••••••••••••••••'}</span>
            <button
              type="button"
              className={cls.keyToggle}
              aria-label={t(key !== undefined || loading ? 'hideKey' : 'showKey')}
              title={t(key !== undefined || loading ? 'hideKey' : 'showKey')}
              aria-pressed={key !== undefined || loading}
              aria-controls={valueId}
              aria-busy={loading}
              disabled={state.busy}
              onClick={() => { void toggle() }}
            >
              <EyeIcon hidden={key === undefined} />
            </button>
          </div>
        ) : null}
        <span id={id} className={cls.keyStateTitle} role="status" title={configured && sourceKey !== undefined ? t('configuredVia', { source: t(sourceKey) }) : undefined}>
          {configured ? <CheckIcon className={cls.keyStateIcon} /> : null}
          {t(title)}
        </span>
      </div>
      {failed ? <p className={cls.hintError} role="alert">{t('keyRevealFailed')}</p> : null}
    </>
  )
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {hidden ? (
        <>
          <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A10 10 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3 3.8M6.3 6.3C3.6 8.4 2 12 2 12s4 7 10 7a10 10 0 0 0 5.7-1.8" />
        </>
      ) : (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}

/**
 * The Settings → AI4Scholar page. The host draws no heading for a settings
 * section, so the page carries its own; the plugin page below already has the
 * bundle's title and description above it.
 */
export function Ai4ScholarSettings(props: Ai4ScholarSettingsProps) {
  return (
    <section className={cls.page} aria-label={props.t('settingsTitle')}>
      <header className={cls.pageHead}>
        <h2 className={cls.pageTitle}>{props.t('title')}</h2>
        <p className={cls.pageIntro}>{props.t('description')}</p>
      </header>
      <KeyGroup {...props} />
      <SettingsGroups {...props} />
    </section>
  )
}

/** Native bundle/row pages supply a view; summaries must remain inline text. */
export function Ai4ScholarPluginConfig(props: Ai4ScholarSettingsProps & PluginConfigView) {
  if (props.view === 'summary') return <>{props.t('settingsIntro')}</>
  return (
    <section className={cls.page} aria-label={props.t('settingsTitle')}>
      <KeyGroup {...props} />
      <SettingsGroups {...props} />
    </section>
  )
}

const SOURCE_LABEL_KEYS = {
  'semantic-scholar': 'sourceSemantic',
  'pubmed': 'sourcePubmed',
  'arxiv': 'sourceArxiv',
  'google-scholar': 'sourceGoogle',
  'chinese': 'sourceChinese',
} as const satisfies Record<UnifiedSource, string>

/** What each platform costs, shown under its name. */
const SOURCE_NOTE_KEYS = {
  'semantic-scholar': 'noteBilled',
  'pubmed': 'noteBilled',
  'arxiv': 'noteFree',
  'google-scholar': 'noteBilled',
  'chinese': 'noteBilled',
} as const satisfies Record<UnifiedSource, string>

function CheckIcon(props: { className: string }) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ExternalIcon(props: { className: string }) {
  return (
    <svg className={props.className} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4.5 2.5h5v5M9.5 2.5L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KeyAccessLink({ t }: PropsLocale<'ai4scholar'>) {
  return (
    <div className={cls.keyAccess}>
      <a className={cls.link} href="https://ai4scholar.net?src=dsh" target="_blank" rel="noreferrer">
        {t('getKey')}
        <ExternalIcon className={cls.linkIcon} />
      </a>
      <span className={cls.hint}>{t('keyOffer')}</span>
    </div>
  )
}

/** Group heading in the host's section-title style, with an optional status on the right. */
function GroupHead(props: { title: string; intro?: string; status?: ReactNode }) {
  return (
    <div className={cls.groupHead}>
      <div className={cls.groupText}>
        <h3 className={cls.groupTitle}>{props.title}</h3>
        {props.intro !== undefined ? <p className={cls.groupIntro}>{props.intro}</p> : null}
      </div>
      {props.status}
    </div>
  )
}

/** The API key group: one row with the field and its buttons, one row for the balance. */
function KeyGroup(props: Ai4ScholarSettingsProps) {
  const { t } = props
  const state = props.useCard((snapshot) => snapshot)
  const inputId = useId()
  const statusId = useId()
  const errorId = useId()
  useEffect(() => { props.refresh() }, [props.refresh])
  const canSave = state.draft.trim().length > 0 && state.writable && !state.busy
  const canRemove = state.configured && state.writable && !state.busy

  return (
    <div className={cls.group}>
      <GroupHead title={t('keyGroupTitle')} status={<KeyAccessLink t={t} />} />
      <div className={cls.panel}>
        <div className={cls.row}>
          {!state.writable ? <p className={cls.readOnly} role="status">{t('readOnly')}</p> : null}
          {/* The group heading names the field; the label stays for screen readers. */}
          <label className={cls.visuallyHidden} htmlFor={inputId}>{t('apiKeyLabel')}</label>
          <div className={cls.inputRow}>
            <input
              id={inputId}
              className={cls.input}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t(state.configured ? 'apiKeyPlaceholderReplace' : 'apiKeyPlaceholder')}
              aria-describedby={state.notice?.kind === 'error' ? `${statusId} ${errorId}` : statusId}
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
            <button type="button" className={`${cls.button} ${cls.buttonPrimary}`} disabled={!canSave} onClick={() => { props.save() }}>
              {t(state.busy ? 'saving' : 'save')}
            </button>
          </div>
          <KeyConfigurationState t={t} state={state} id={statusId} />
          {state.notice?.kind === 'error'
            ? <p id={errorId} className={cls.hintError} role="alert">{t('failed', { message: state.notice.message ?? '' })}</p>
            : null}
        </div>
        {state.loaded && state.configured ? <KeyCheckRow {...props} state={state} canRemove={canRemove} /> : null}
      </div>
    </div>
  )
}

/** The balance row: what the key has left once checked, with check and remove on the right. */
function KeyCheckRow(props: Ai4ScholarSettingsProps & { state: ApiKeyCardState; canRemove: boolean }) {
  const { t, state } = props
  const check = state.check
  return (
    <div className={`${cls.row} ${cls.rowInline}`}>
      <div className={cls.rowText} role="status">
        <span className={cls.label}>{t('keyCheckTitle')}</span>
        {check === undefined
          ? null
          : check.status === 'checking'
            ? <p className={cls.hint}>{t('checking')}</p>
            : check.status === 'ok'
              ? (
                <p className={cls.hint}>
                  <span className={cls.balance}>
                    <span className={cls.balanceNumber}>{check.totalAvailable.toLocaleString('en-US')}</span>
                    <span>{t('creditsAvailable')}</span>
                  </span>
                  {check.keyCreditsUsed !== undefined ? ` · ${t('keySpent', { credits: check.keyCreditsUsed.toLocaleString('en-US') })}` : ''}
                  {check.membership !== undefined ? ` · ${check.membership}` : ''}
                </p>
              )
              : <p className={cls.hintError}>{t('keyInvalid', { message: check.message })}</p>}
      </div>
      <div className={cls.actions}>
        <button type="button" className={cls.buttonGhost} disabled={!props.canRemove} onClick={() => { props.remove() }}>
          {t('remove')}
        </button>
        <button type="button" className={cls.button} disabled={state.busy || check?.status === 'checking'} onClick={() => { props.testKey() }}>
          {check === undefined ? t('testKey') : t('recheckKey')}
        </button>
      </div>
    </div>
  )
}

/** Choices for the select and segmented controls, with their copy keys. */
const CITE_STYLE_KEYS = { ieee: 'styleIeee', apa: 'styleApa', vancouver: 'styleVancouver', nature: 'styleNature', numbered: 'styleNumbered' } as const satisfies Record<CiteStyle, string>
const DRAW_MODEL_KEYS = { flash: 'modelFlash', flash31: 'modelFlash31', pro: 'modelPro', gptimage: 'modelGptImage', gpt26flare: 'modelGpt26Flare', gpt26sunburst: 'modelGpt26Sunburst', banana21: 'modelBanana21', bananalite: 'modelBananaLite' } as const satisfies Record<DrawModel, string>

/**
 * Everything the Host's configuration form holds, in three groups that share
 * one save: search (platforms and their counts), results (abstract, full
 * text, credit line), and generation (auto_cite and sci_draw defaults).
 */
function SettingsGroups(props: Ai4ScholarSettingsProps) {
  const { t } = props
  const state = props.useSearch((snapshot) => snapshot)
  const ids = { abstract: useId(), read: useId(), credits: useId(), commandCard: useId(), style: useId(), preprints: useId(), model: useId(), size: useId() }
  useEffect(() => { props.attachSearch() }, [props.attachSearch])

  if (state.status === 'unsupported' || state.status === 'unavailable') {
    return (
      <div className={cls.group}>
        <GroupHead title={t('searchTitle')} />
        <div className={cls.panel}>
          <div className={cls.row}><p className={cls.hint}>{t('searchUnsupported')}</p></div>
        </div>
      </div>
    )
  }
  const disabled = state.status !== 'ready' || !state.writable || state.saving
  const { invalid, draft } = state
  const anyInvalid = invalid.searchSources || invalid.abstractMaxChars || invalid.readMaxChars || Object.values(invalid.resultsPerSource).some(Boolean)
  const canSave = !disabled && state.dirty && !anyInvalid

  return (
    <>
      {state.status === 'ready' && !state.writable ? <p className={cls.readOnly} role="status">{t('searchReadOnly')}</p> : null}

      <div className={cls.group}>
        <GroupHead title={t('searchTitle')} intro={t(invalid.searchSources ? 'sourcesEmpty' : 'sourcesHint')} />
        <div className={cls.panel}>
          {UNIFIED_SOURCES.map((source) => {
            const on = draft.searchSources.includes(source)
            const countId = `${ids.abstract}-${source}`
            const bad = invalid.resultsPerSource[source]
            return (
              <div key={source} className={`${cls.row} ${cls.rowInline}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className={cls.platform}
                  disabled={disabled}
                  onClick={() => { props.toggleSource(source) }}
                >
                  <span className={`${cls.box}${on ? ` ${cls.boxOn}` : ''}`}>{on ? <CheckIcon className={cls.boxIcon} /> : null}</span>
                  <span className={cls.rowText}>
                    <span className={cls.label}>{t(SOURCE_LABEL_KEYS[source])}</span>
                    <span className={bad ? cls.hintError : cls.hint}>
                      {bad ? t('countInvalid', { max: String(PLATFORM_CAP[source]) }) : t(SOURCE_NOTE_KEYS[source], { max: String(PLATFORM_CAP[source]) })}
                    </span>
                  </span>
                </button>
                <NumberBox
                  id={countId}
                  label={t('countLabelFor', { name: t(SOURCE_LABEL_KEYS[source]) })}
                  unit={t('unitResults')}
                  value={draft.resultsPerSource[source]}
                  invalid={bad}
                  disabled={disabled}
                  onEdit={(text) => { props.editCount(source, text) }}
                />
              </div>
            )
          })}
        </div>
        <details className={cls.help}>
          <summary><Chevron className={cls.chevron} />{t('sourcesDetailsLabel')}</summary>
          <p className={cls.hint}>{t('sourcesDetails')}</p>
        </details>
      </div>

      <div className={cls.group}>
        <GroupHead title={t('resultsTitle')} />
        <div className={cls.panel}>
          <NumberRow
            id={ids.abstract}
            label={t('abstractLabel')}
            hint={t(invalid.abstractMaxChars ? 'abstractInvalid' : 'abstractHint', { max: String(ABSTRACT_LIMIT) })}
            invalid={invalid.abstractMaxChars}
            unit={t('unitChars')}
            value={draft.abstractMaxChars}
            disabled={disabled}
            onEdit={(text) => { props.editSearch('abstractMaxChars', text) }}
          />
          <NumberRow
            id={ids.read}
            label={t('readLabel')}
            hint={t(invalid.readMaxChars ? 'readInvalid' : 'readHint', { min: READ_MIN.toLocaleString('en-US'), max: READ_MAX.toLocaleString('en-US') })}
            invalid={invalid.readMaxChars}
            unit={t('unitChars')}
            value={draft.readMaxChars}
            disabled={disabled}
            onEdit={(text) => { props.editSearch('readMaxChars', text) }}
          />
          <SwitchRow id={ids.credits} label={t('creditsLabel')} on={draft.showCredits} disabled={disabled} onToggle={() => { props.editSearch('showCredits', !draft.showCredits) }} />
          <SwitchRow id={ids.commandCard} label={t('commandCardLabel')} hint={t('commandCardHint')} on={draft.showCommandCard} disabled={disabled} onToggle={() => { props.editSearch('showCommandCard', !draft.showCommandCard) }} />
        </div>
      </div>

      <div className={cls.group}>
        <GroupHead title={t('generationTitle')} />
        <div className={cls.panel}>
          <SelectRow
            id={ids.style}
            label={t('styleLabel')}
            value={draft.citeStyle}
            options={CITE_STYLES.map((v) => ({ value: v, label: t(CITE_STYLE_KEYS[v]) }))}
            disabled={disabled}
            onPick={(v) => { props.editSearch('citeStyle', v as CiteStyle) }}
          />
          <SwitchRow id={ids.preprints} label={t('preprintsLabel')} hint={t('preprintsHint')} on={draft.citeExcludePreprints} disabled={disabled} onToggle={() => { props.editSearch('citeExcludePreprints', !draft.citeExcludePreprints) }} />
          <SelectRow
            id={ids.model}
            label={t('modelLabel')}
            hint={t('modelHint')}
            value={draft.drawModel}
            options={DRAW_MODELS.map((v) => ({ value: v, label: t(DRAW_MODEL_KEYS[v]) }))}
            disabled={disabled}
            onPick={(v) => { props.editSearch('drawModel', v as DrawModel); if (v === 'bananalite' || v === 'flash') props.editSearch('drawImageSize', '1K') }}
          />
          <div className={`${cls.row} ${cls.rowInline}`}>
            <div className={cls.rowText}>
              <span id={ids.size} className={cls.label}>{t('sizeLabel')}</span>
              <p className={cls.hint}>{t('sizeHint')}</p>
            </div>
            <div className={cls.segmented} role="radiogroup" aria-labelledby={ids.size}>
              {DRAW_SIZES.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={draft.drawImageSize === v}
                  className={`${cls.segment}${draft.drawImageSize === v ? ` ${cls.segmentOn}` : ''}`}
                  disabled={disabled || ((draft.drawModel === 'bananalite' || draft.drawModel === 'flash') && v !== '1K')}
                  onClick={() => { props.editSearch('drawImageSize', v) }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={cls.footer}>
        <button type="button" className={`${cls.button} ${cls.buttonPrimary}`} disabled={!canSave} onClick={() => { props.saveSearch() }}>
          {t(state.saving ? 'saving' : 'save')}
        </button>
        {state.dirty
          ? (
            <button type="button" className={cls.buttonGhost} disabled={state.saving} onClick={() => { props.discardSearch() }}>
              {t('discard')}
            </button>
          )
          : null}
        {!state.dirty && state.overridden
          ? (
            <button type="button" className={cls.buttonGhost} disabled={disabled} onClick={() => { props.resetSearch() }}>
              {t('restoreDefaults')}
            </button>
          )
          : null}
        {state.notice !== undefined
          ? (
            <p className={`${cls.notice}${state.notice === 'failed' ? ` ${cls.noticeError}` : ''}`} role="status">
              {t(state.notice === 'saved' ? 'searchSaved' : state.notice === 'reset' ? 'searchReset' : 'searchFailed')}
            </p>
          )
          : null}
      </div>
    </>
  )
}

/** A short number field with its unit inside the border. */
function NumberBox(props: { id: string; label?: string; describedBy?: string; unit: string; value: string; invalid: boolean; disabled: boolean; onEdit: (text: string) => void }) {
  return (
    <div className={`${cls.numberBox}${props.invalid ? ` ${cls.numberBoxInvalid}` : ''}`}>
      <input
        id={props.id}
        className={cls.numberInput}
        inputMode="numeric"
        value={props.value}
        disabled={props.disabled}
        aria-invalid={props.invalid}
        aria-label={props.label}
        aria-describedby={props.describedBy}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
      <span className={cls.numberUnit}>{props.unit}</span>
    </div>
  )
}

/** Label and hint on the left, a number field on the right. */
function NumberRow(props: { id: string; label: string; hint: string; invalid: boolean; unit: string; value: string; disabled: boolean; onEdit: (text: string) => void }) {
  const hintId = `${props.id}-hint`
  return (
    <div className={`${cls.row} ${cls.rowInline}`}>
      <div className={cls.rowText}>
        <label className={cls.label} htmlFor={props.id}>{props.label}</label>
        <p id={hintId} className={props.invalid ? cls.hintError : cls.hint}>{props.hint}</p>
      </div>
      <NumberBox id={props.id} describedBy={hintId} unit={props.unit} value={props.value} invalid={props.invalid} disabled={props.disabled} onEdit={props.onEdit} />
    </div>
  )
}

/** Label and hint on the left, the host-style switch on the right. */
function SwitchRow(props: { id: string; label: string; hint?: string; on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <div className={`${cls.row} ${cls.rowInline}`}>
      <div className={cls.rowText}>
        <label className={cls.label} htmlFor={props.id}>{props.label}</label>
        {props.hint !== undefined ? <p className={cls.hint}>{props.hint}</p> : null}
      </div>
      <button id={props.id} type="button" role="switch" className={cls.switch} aria-checked={props.on} disabled={props.disabled} onClick={props.onToggle}>
        <span className={cls.thumb} />
      </button>
    </div>
  )
}

/** Label and hint on the left, a native select on the right. */
function SelectRow(props: { id: string; label: string; hint?: string; value: string; options: { value: string; label: string }[]; disabled: boolean; onPick: (value: string) => void }) {
  return (
    <div className={`${cls.row} ${cls.rowInline}`}>
      <div className={cls.rowText}>
        <label className={cls.label} htmlFor={props.id}>{props.label}</label>
        {props.hint !== undefined ? <p className={cls.hint}>{props.hint}</p> : null}
      </div>
      <div className={cls.selectBox}>
        <select id={props.id} className={cls.select} value={props.value} disabled={props.disabled} onChange={(event) => { props.onPick(event.target.value) }}>
          {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Chevron className={cls.selectChevron} />
      </div>
    </div>
  )
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
          <KeyAccessLink t={t} />
        </div>
        <input
          id={inputId}
          className={cls.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={t(state.configured ? 'apiKeyPlaceholderReplace' : 'apiKeyPlaceholder')}
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
        <KeyConfigurationState t={t} state={state} />
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
