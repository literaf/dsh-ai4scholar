import { useEffect, useId, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { RELEASES_URL, UPDATE_ROUTE } from '../shared/update.js'
import type { UpdateInfo, UpdateResponse } from '../shared/update.js'

type State =
  | { status: 'idle' | 'checking' }
  | { status: 'done'; value: UpdateInfo }
  | { status: 'error'; currentVersion?: string; unavailable?: boolean }

/** An explicit check never installs, removes or reloads a plugin. */
export function UpdateCheck({ t, openPluginManager }: PropsLocale<'ai4scholar'> & { openPluginManager(): boolean }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ status: 'idle' })
  const [navigationUnavailable, setNavigationUnavailable] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dismiss = useRef<HTMLButtonElement>(null)
  const request = useRef<AbortController>()
  const id = useId()
  const checking = state.status === 'checking'
  const current = state.status === 'done' ? state.value.currentVersion : state.status === 'error' ? state.currentVersion : undefined

  const close = (restoreFocus = false): void => {
    request.current?.abort()
    request.current = undefined
    setOpen(false)
    setState((previous) => previous.status === 'checking' ? { status: 'idle' } : previous)
    if (restoreFocus) trigger.current?.focus()
  }
  const check = async (): Promise<void> => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setOpen(true)
    setState({ status: 'checking' })
    setNavigationUnavailable(false)
    try {
      const response = await fetch(new URL(UPDATE_ROUTE.replace(/^\//, ''), document.baseURI), {
        credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      })
      if (request.current !== controller) return
      if (response.status === 404 || response.status === 403) {
        setState({ status: 'error', unavailable: true })
        return
      }
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Update service unavailable')
      const result = await response.json() as UpdateResponse
      if (request.current !== controller) return
      if (result.ok && (!result.value || typeof result.value.currentVersion !== 'string' ||
        typeof result.value.latestVersion !== 'string' || !['available', 'current', 'ahead'].includes(result.value.status)))
        throw new Error('Invalid update response')
      setState(result.ok && response.ok
        ? { status: 'done', value: result.value }
        : { status: 'error', ...(!result.ok && typeof result.currentVersion === 'string' ? { currentVersion: result.currentVersion } : {}) })
    } catch {
      if (request.current === controller) setState({ status: 'error' })
    } finally {
      if (request.current === controller) request.current = undefined
    }
  }
  useEffect(() => () => { request.current?.abort(); request.current = undefined }, [])
  useEffect(() => {
    if (!open) return
    dismiss.current?.focus({ preventScroll: true })
    const outside = (event: Event): void => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close()
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); close(true) }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return <div ref={root} className="ai4s-wb-update">
    <button ref={trigger} type="button" className="ai4s-wb-button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-busy={checking} onClick={() => open ? close() : void check()}>
      {checking ? <span className="ai4s-wb-spinner" aria-hidden="true" /> :
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" />
        </svg>}
      {t(checking ? 'wbUpdateChecking' : 'wbCheckUpdate')}
    </button>
    {open && <section id={id} className="ai4s-wb-update-popover" role="dialog" aria-label={t('wbUpdateTitle')}>
      <header className="ai4s-wb-popover-head">
        <h3>{t('wbUpdateTitle')}</h3>
        <button ref={dismiss} type="button" className="ai4s-wb-icon-button" aria-label={t('wbClose')} onClick={() => close(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
      </header>
      <div className="ai4s-wb-update-body">
        <p role="status" aria-live="polite" className={state.status === 'error' ? 'ai4s-wb-error' : 'ai4s-wb-update-result'}>
          {t(state.status === 'done'
            ? state.value.status === 'available' ? 'wbUpdateAvailable' : state.value.status === 'ahead' ? 'wbUpdateAhead' : 'wbUpdateCurrent'
            : state.status === 'error' ? state.unavailable ? 'wbUpdateUnavailable' : 'wbUpdateFailed' : 'wbUpdateChecking')}
        </p>
        {current && <dl>
          <div><dt>{t('wbUpdateInstalled')}</dt><dd>v{current}</dd></div>
          {state.status === 'done' && <div><dt>{t('wbUpdateLatest')}</dt><dd>v{state.value.latestVersion}</dd></div>}
        </dl>}
        {navigationUnavailable && <p className="ai4s-wb-update-hint">{t('wbUpdateManageHint')}</p>}
      </div>
      {!checking && <footer className="ai4s-wb-update-actions">
        <a className="ai4s-wb-button" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">{t('wbUpdateNotes')}</a>
        {state.status === 'error' ? <button type="button" className="ai4s-wb-button" onClick={() => void check()}>{t('wbRetry')}</button>
          : state.status === 'done' && state.value.status === 'available' && <button type="button" className="ai4s-wb-button ai4s-wb-primary" onClick={() => {
            if (!openPluginManager()) setNavigationUnavailable(true)
          }}>{t('wbUpdateManage')}</button>}
      </footer>}
    </section>}
  </div>
}
