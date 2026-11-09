import { useEffect, useId, useRef, useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Ai4ScholarPluginConfig } from './Card.js'
import type { Ai4ScholarCardFace } from './Card.js'
import type { CardStore } from './controller.js'
import type { InjectedFace } from './plugin-config.js'
import { Ai4ScholarBrand } from './Brand.js'
import { UpdateCheck } from './UpdateCheck.js'
import { NS } from './locales.js'
import type { Ai4ScholarLocaleKey } from './locales.js'
import { WorkbenchController } from './workbench-controller.js'
import type { SearchDraft, WorkbenchState } from './workbench-controller.js'
import { hasDateSort, hasYearFilter, isCategorySource, isPreprint, WORKBENCH_ID } from '../shared/workbench.js'
import type { WorkbenchItem, WorkbenchSource } from '../shared/workbench.js'
import { installWorkbenchStyles } from './workbench-styles.js'

export interface WorkbenchFace extends Ai4ScholarCardFace {
  hooks: Ai4ScholarCardFace['hooks'] & { workbench: CardStore<WorkbenchState> }
  attachWorkbench(): void
  editWorkbench(patch: Partial<SearchDraft>): void
  chooseSource(source: WorkbenchSource): void
  searchWorkbench(): void
  cancelWorkbench(): void
  previousPage(): void
  nextPage(): void
  selectPaper(index: number): void
  openPluginManager(): boolean
}
type Props = PropsLocale<'ai4scholar'> & InjectedFace<WorkbenchFace>
type Translate = Props['t']
type IconName =
  | 'search'
  | 'filter'
  | 'arrow'
  | 'settings'
  | 'history'
  | 'book'
  | 'copy'
  | 'external'
  | 'back'
  | 'close'
  | 'panel'
  | 'check'
  | 'next'
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    search: 'm21 21-5-5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
    filter: 'M4 6h16M4 12h16M4 18h16M9 3v6M16 9v6M8 15v6',
    arrow: 'M12 20V4m-7 7 7-7 7 7',
    settings:
      'M9.5 3h5l.5 2.5 2 1 2.5-.5 2.5 4-2 2v2l2 2-2.5 4-2.5-.5-2 1-.5 2.5h-5L9 20.5l-2-1-2.5.5L2 16l2-2v-2l-2-2 2.5-4 2.5.5 2-1L9.5 3M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2',
    book: 'M12 5v16m0-16C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1',
    copy: 'M8 8h12v13H8zM4 16H2V2h13v2',
    external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
    back: 'M20 12H4m7-7-7 7 7 7',
    next: 'm9 5 7 7-7 7',
    close: 'm6 6 12 12M6 18 18 6',
    panel: 'M3 3h18v18H3zM14 3v18',
    check: 'm5 12 4 4L19 6',
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
const sourceLabels: Record<
  WorkbenchSource,
  Ai4ScholarLocaleKey | 'Semantic Scholar' | 'PubMed' | 'arXiv' | 'bioRxiv' | 'medRxiv'
> = {
  'semantic-scholar': 'Semantic Scholar',
  snippets: 'wbSnippets',
  'google-scholar': 'wbGoogle',
  pubmed: 'PubMed',
  'google-patents': 'wbPatents',
  chinese: 'wbChinese',
  arxiv: 'arXiv',
  biorxiv: 'bioRxiv',
  medrxiv: 'medRxiv',
}
const label = (source: WorkbenchSource, t: Translate): string => {
  const key = sourceLabels[source]
  return key.startsWith('wb') ? t(key as Ai4ScholarLocaleKey) : key
}
const formatCount = (n: number): string => n.toLocaleString()
const safeUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  try {
    const u = new URL(value)
    return ['http:', 'https:'].includes(u.protocol) ? u.href : undefined
  } catch {
    return undefined
  }
}
/** Literal matching, without HTML injection or user-controlled regular expressions. */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = [
    ...new Set(
      query
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter((s) => s.length > 1),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .slice(0, 12)
  if (!words.length) return <>{text}</>
  const lower = text.toLocaleLowerCase()
  const parts = []
  let start = 0
  while (start < text.length && parts.length < 300) {
    let at = -1,
      length = 0
    for (const word of words) {
      const next = lower.indexOf(word, start)
      if (next >= 0 && (at < 0 || next < at)) {
        at = next
        length = word.length
      }
    }
    if (at < 0) break
    if (at > start) parts.push(text.slice(start, at))
    parts.push(<mark key={at}>{text.slice(at, at + length)}</mark>)
    start = at + length
  }
  parts.push(text.slice(start))
  return <>{parts}</>
}
const contentLabel = (item: WorkbenchItem): Ai4ScholarLocaleKey =>
  item.kind === 'snippet'
    ? 'wbExcerpt'
    : item.kind === 'patent' || item.source === 'google-scholar'
      ? 'wbSummary'
      : 'wbAbstract'

function Detail({ item, query, t, onClose }: { item: WorkbenchItem; query: string; t: Translate; onClose(): void }) {
  const [copy, setCopy] = useState<'copied' | 'error' | undefined>()
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setCopy(undefined)
    if (body.current) body.current.scrollTop = 0
  }, [item])
  const original = safeUrl(item.url),
    pdf = safeUrl(item.pdfUrl)
  const doi = item.doi ? `https://doi.org/${encodeURIComponent(item.doi)}` : undefined
  const copyReference = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(
        [
          item.title,
          item.authors.join(', '),
          [item.year, item.venue].filter(Boolean).join(' · '),
          item.doi ? `DOI: ${item.doi}` : '',
          original,
          item.abstract,
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
      setCopy('copied')
    } catch {
      setCopy('error')
    }
  }
  const facts: Record<string, Ai4ScholarLocaleKey> = {
    publicationNumber: 'wbPublicationNumber',
    inventor: 'wbInventor',
    assignee: 'wbAssignee',
    filingDate: 'wbFilingDate',
    priorityDate: 'wbPriorityDate',
    publicationDate: 'wbPublicationDate',
    grantDate: 'wbGrantDate',
  }
  return (
    <section
      className="ai4s-wb-detail"
      aria-label={t(
        item.kind === 'patent' ? 'wbPatentDetails' : item.kind === 'snippet' ? 'wbExcerptDetails' : 'wbDetails',
      )}
    >
      <header className="ai4s-wb-panel-head">
        <button
          type="button"
          className="ai4s-wb-icon-button ai4s-wb-mobile-back"
          aria-label={t('wbBackToResults')}
          onClick={onClose}
        >
          <Icon name="back" size={16} />
        </button>
        <span>
          {t(item.kind === 'patent' ? 'wbPatentDetails' : item.kind === 'snippet' ? 'wbExcerptDetails' : 'wbDetails')}
        </span>
        <div className="ai4s-wb-panel-actions">
          <button
            type="button"
            className="ai4s-wb-icon-button"
            onClick={() => {
              void copyReference()
            }}
            title={t('wbCopy')}
            aria-label={t('wbCopy')}
          >
            <Icon name={copy === 'copied' ? 'check' : 'copy'} size={16} />
          </button>
          <button
            type="button"
            className="ai4s-wb-icon-button ai4s-wb-desktop-close"
            title={t('wbCloseDetails')}
            aria-label={t('wbCloseDetails')}
            onClick={onClose}
          >
            <Icon name="panel" size={16} />
          </button>
        </div>
      </header>
      <div className="ai4s-wb-detail-body" ref={body}>
        <article>
          <h2>
            <Highlight text={item.title} query={query} />
          </h2>
          {item.authors.length ? <p className="ai4s-wb-muted">{item.authors.join(', ')}</p> : null}
          <p className="ai4s-wb-meta">
            {[
              item.year,
              item.venue,
              item.citationCount !== undefined
                ? t('wbCitations', { count: formatCount(item.citationCount) })
                : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
            {isPreprint(item.source) ? <span className="ai4s-wb-tag">{t('wbPreprint')}</span> : null}
          </p>
          {doi ? (
            <p>
              <a href={doi} target="_blank" rel="noreferrer">
                DOI: {item.doi}
              </a>
            </p>
          ) : null}
          <div className="ai4s-wb-links">
            {original ? (
              <a href={original} target="_blank" rel="noreferrer">
                <Icon name="external" />
                {t('wbOriginal')}
              </a>
            ) : null}
            {pdf ? (
              <a href={pdf} target="_blank" rel="noreferrer">
                <Icon name="book" />
                {t('wbPdf')}
              </a>
            ) : null}
          </div>
          {copy ? (
            <p role="status" className="ai4s-wb-muted">
              {t(copy === 'copied' ? 'wbCopied' : 'wbCopyFailed')}
            </p>
          ) : null}
          {item.facts?.length ? (
            <dl className="ai4s-wb-facts">
              {item.facts.map((f) => (
                <div key={f.label}>
                  <dt>{facts[f.label] ? t(facts[f.label]!) : f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <div className="ai4s-wb-abstract">
            <h3>
              {t(contentLabel(item))}
              {item.section ? ` · ${item.section}` : ''}
            </h3>
            {item.kind === 'snippet' ? <p className="ai4s-wb-content-note">{t('wbSnippetNote')}</p> : null}
            <p>{item.abstract ? <Highlight text={item.abstract} query={query} /> : t('wbNoAbstract')}</p>
          </div>
        </article>
      </div>
    </section>
  )
}

/** Filters are staged locally; applying them never starts a paid search. */
function FilterPanel({
  draft,
  source,
  defaultLimit,
  maxLimit,
  t,
  onApply,
  onClose,
}: {
  draft: SearchDraft
  source: WorkbenchSource
  defaultLimit: number
  maxLimit: number
  t: Translate
  onApply(patch: Partial<SearchDraft>): void
  onClose(): void
}) {
  const [values, setValues] = useState(draft)
  const [error, setError] = useState(false)
  const fields = useRef<HTMLDivElement>(null)
  const edit = (patch: Partial<SearchDraft>): void => {
    setValues({ ...values, ...patch })
    setError(false)
  }
  const apply = (): void => {
    const inputs = fields.current?.querySelectorAll<HTMLInputElement>('input') ?? []
    if ([...inputs].some((input) => !input.reportValidity())) return
    if (hasYearFilter(source) && values.yearFrom && values.yearTo && Number(values.yearFrom) > Number(values.yearTo)) {
      setError(true)
      return
    }
    const { query: _query, ...filters } = values
    onApply(filters)
  }
  return (
    <div
      className="ai4s-wb-filters"
      ref={fields}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          apply()
        }
      }}
    >
      <header className="ai4s-wb-popover-head">
        <h3>{t('wbFilters')}</h3>
        <button type="button" className="ai4s-wb-icon-button" aria-label={t('wbClose')} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="ai4s-wb-filter-fields">
        <label>
          {t('wbCount')}
          <input
            type="number"
            min={1}
            max={maxLimit}
            step={1}
            value={values.limit}
            onChange={(e) => edit({ limit: Number(e.target.value) })}
            required
          />
        </label>
        {hasYearFilter(source) ? (
          <div className="ai4s-wb-year-range">
            <label>
              {t('wbYearFrom')}
              <input
                type="number"
                min={1000}
                max={9999}
                step={1}
                placeholder={t('wbAnyYear')}
                value={values.yearFrom}
                onChange={(e) => edit({ yearFrom: e.target.value })}
              />
            </label>
            <span aria-hidden="true">—</span>
            <label>
              {t('wbYearTo')}
              <input
                type="number"
                min={1000}
                max={9999}
                step={1}
                placeholder={t('wbAnyYear')}
                value={values.yearTo}
                onChange={(e) => edit({ yearTo: e.target.value })}
              />
            </label>
          </div>
        ) : null}
        {isCategorySource(source) ? (
          <label>
            {t('wbDays')}
            <input
              type="number"
              min={1}
              max={3650}
              step={1}
              value={values.days}
              onChange={(e) => edit({ days: Number(e.target.value) })}
              required
            />
          </label>
        ) : null}
        {hasDateSort(source) ? (
          <label>
            {t('wbSort')}
            <select value={values.sort} onChange={(e) => edit({ sort: e.target.value as SearchDraft['sort'] })}>
              <option value="relevance">{t('wbRelevance')}</option>
              <option value="date">{t('wbNewest')}</option>
            </select>
          </label>
        ) : null}
        {error ? (
          <p className="ai4s-wb-error" role="alert">
            {t('wbYearError')}
          </p>
        ) : null}
        <p className="ai4s-wb-filter-hint">{t('wbFilterHint')}</p>
      </div>
      <footer className="ai4s-wb-popover-footer">
        <button
          type="button"
          className="ai4s-wb-button"
          onClick={() => edit({ limit: defaultLimit, yearFrom: '', yearTo: '', days: 30, sort: 'relevance' })}
        >
          {t('wbReset')}
        </button>
        <button type="button" className="ai4s-wb-button ai4s-wb-primary" onClick={apply}>
          {t('wbApply')}
        </button>
      </footer>
    </div>
  )
}

export function Ai4ScholarWorkbench(props: Props) {
  const { t } = props
  const state = props.useWorkbench((s) => s)
  const key = props.useCard((s) => s)
  const [settings, setSettings] = useState(false)
  const [popover, setPopover] = useState<'filters' | 'history'>()
  const [detailOpen, setDetailOpen] = useState(true)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [listWidth, setListWidth] = useState(40)
  const input = useRef<HTMLInputElement>(null)
  const filterButton = useRef<HTMLButtonElement>(null)
  const historyButton = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const split = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const sources = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)
  const id = useId()
  const page = state.pages[state.pageIndex]
  const result = page?.result
  const catalog = state.catalog
  const entry = catalog?.sources.find((s) => s.id === state.source)
  const noKey = !!entry?.needsKey && key.loaded && !key.configured
  const primary = catalog?.sources.filter((s) => !isPreprint(s.id)) ?? []
  const preprints = catalog?.sources.filter((s) => isPreprint(s.id)) ?? []
  const selected = result?.items[state.selected]
  const edit = props.editWorkbench
  const pageNumber = page?.request.page ?? Math.floor((page?.request.offset ?? 0) / (page?.request.limit ?? 10)) + 1
  const filtersCount =
    Number(state.draft.limit !== (entry?.defaultLimit ?? 10)) +
    Number(hasYearFilter(state.source) && !!(state.draft.yearFrom || state.draft.yearTo)) +
    Number(hasDateSort(state.source) && state.draft.sort !== 'relevance') +
    Number(isCategorySource(state.source) && state.draft.days !== 30)
  const pending =
    !!page &&
    (page.request.query !== state.draft.query.trim() ||
      page.request.limit !== state.draft.limit ||
      (hasYearFilter(state.source) &&
        ((page.request.yearFrom ?? '') !== (state.draft.yearFrom ? Number(state.draft.yearFrom) : '') ||
          (page.request.yearTo ?? '') !== (state.draft.yearTo ? Number(state.draft.yearTo) : ''))) ||
      (hasDateSort(state.source) && (page.request.sort ?? 'relevance') !== state.draft.sort) ||
      (isCategorySource(state.source) && (page.request.days ?? 30) !== state.draft.days))
  useEffect(() => {
    props.attachWorkbench()
    props.refresh()
  }, [props.attachWorkbench, props.refresh])
  useEffect(() => {
    setPopover(undefined)
    setMobileDetail(false)
    const active = sources.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (active && sources.current) {
      const left =
        active.getBoundingClientRect().left - sources.current.getBoundingClientRect().left + sources.current.scrollLeft
      if (left < sources.current.scrollLeft) sources.current.scrollLeft = left
      else if (left + active.offsetWidth > sources.current.scrollLeft + sources.current.clientWidth)
        sources.current.scrollLeft = left + active.offsetWidth - sources.current.clientWidth
    }
  }, [state.source])
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0
    setMobileDetail(false)
  }, [result])
  useEffect(() => {
    if (!detailOpen) list.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true })
  }, [detailOpen])
  useEffect(() => {
    if (!popover) return
    const trigger = popover === 'filters' ? filterButton.current : historyButton.current
    const first =
      popup.current?.querySelector<HTMLElement>('input') ?? popup.current?.querySelector<HTMLElement>('button')
    first?.focus({ preventScroll: true })
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !popup.current?.contains(event.target) && !trigger?.contains(event.target))
        setPopover(undefined)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPopover(undefined)
        trigger?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [popover])
  const closeFilters = (): void => {
    setPopover(undefined)
    filterButton.current?.focus({ preventScroll: true })
  }
  const closeDetails = (): void => {
    setDetailOpen(false)
    setMobileDetail(false)
  }
  const closeSettings = (): void => {
    setSettings(false)
    props.attachWorkbench()
  }
  const showSettings = (): void => {
    setPopover(undefined)
    setSettings(true)
  }
  const submit = (): void => {
    if (!state.busy && !state.loading && !noKey) {
      setPopover(undefined)
      props.searchWorkbench()
    }
  }
  return (
    <main
      className={`ai4s-wb${result && !settings ? ' ai4s-wb-has-results' : ''}${settings ? ' ai4s-wb-show-settings' : ''}`}
    >
      <header className="ai4s-wb-header">
        <div>
          <Ai4ScholarBrand />
          <span className="ai4s-wb-header-divider" />
          <span className="ai4s-wb-header-title">{t(settings ? 'wbSettings' : 'wbTitle')}</span>
        </div>
        <div className="ai4s-wb-header-actions">
          <button type="button" className="ai4s-wb-button" onClick={() => (settings ? closeSettings() : showSettings())}>
            <Icon name={settings ? 'back' : 'settings'} size={16} />
            {t(settings ? 'wbBack' : 'wbSettings')}
          </button>
          <UpdateCheck t={t} openPluginManager={props.openPluginManager} />
        </div>
      </header>
      {settings ? (
        <div className="ai4s-wb-settings">
          <Ai4ScholarPluginConfig {...props} view="page" />
        </div>
      ) : (
        <div className={`ai4s-wb-workspace${result ? '' : ' ai4s-wb-start'}`}>
          {!result ? (
            <div className="ai4s-wb-hero">
              <h1>{t('wbHero')}</h1>
              <p>{t('wbIntro')}</p>
            </div>
          ) : null}
          <div className="ai4s-wb-search-box">
            <div className="ai4s-wb-sources-row">
              <div className="ai4s-wb-sources" role="group" aria-label={t('wbSources')} ref={sources}>
                {primary.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={`ai4s-wb-source${s.id === state.source ? ' is-selected' : ''}`}
                    aria-pressed={s.id === state.source}
                    onClick={() => props.chooseSource(s.id)}
                  >
                    <Icon name={s.id === 'snippets' ? 'search' : 'book'} size={16} />
                    {label(s.id, t)}
                  </button>
                ))}
              </div>
              {preprints.length ? (
                <select
                  className={`ai4s-wb-preprints${isPreprint(state.source) ? ' is-selected' : ''}`}
                  aria-label={t('wbPreprints')}
                  value={isPreprint(state.source) ? state.source : ''}
                  onChange={(event) => props.chooseSource(event.target.value as WorkbenchSource)}
                >
                  <option value="" disabled>
                    {t('wbPreprints')}
                  </option>
                  {preprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {label(s.id, t)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <form
              className="ai4s-wb-query-row"
              aria-busy={state.loading || state.busy}
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              <div className="ai4s-wb-query-field">
                <input
                  ref={input}
                  type="search"
                  value={state.draft.query}
                  maxLength={2000}
                  placeholder={t(isCategorySource(state.source) ? 'wbCategoryPlaceholder' : 'wbPlaceholder')}
                  aria-label={t('wbSearch')}
                  onChange={(event) => edit({ query: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault()
                  }}
                />
                {state.draft.query ? (
                  <button
                    type="button"
                    className="ai4s-wb-icon-button ai4s-wb-clear"
                    aria-label={t('wbClearQuery')}
                    onClick={() => {
                      edit({ query: '' })
                      input.current?.focus()
                    }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                ) : null}
              </div>
              <div className="ai4s-wb-search-actions">
                <button
                  ref={filterButton}
                  className={`ai4s-wb-button ai4s-wb-filter-trigger${filtersCount ? ' is-active' : ''}`}
                  type="button"
                  aria-label={t('wbFilters')}
                  aria-haspopup="dialog"
                  aria-expanded={popover === 'filters'}
                  aria-controls={`${id}-filters`}
                  onClick={() => setPopover(popover === 'filters' ? undefined : 'filters')}
                  disabled={!entry || state.busy || state.loading}
                >
                  <Icon name="filter" size={16} />
                  {t('wbFilters')}
                  {filtersCount ? <span className="ai4s-wb-filter-count">{filtersCount}</span> : null}
                </button>
                <span className="ai4s-wb-cost" title={entry ? t(entry.needsKey ? 'wbBilled' : 'wbFree') : ''}>
                  {entry ? t(entry.needsKey ? 'wbApiCredits' : 'wbFree') : ''}
                </span>
                <button
                  ref={historyButton}
                  className="ai4s-wb-icon-button"
                  type="button"
                  title={t('wbHistory')}
                  aria-label={t('wbHistory')}
                  aria-haspopup="dialog"
                  aria-expanded={popover === 'history'}
                  aria-controls={`${id}-history`}
                  onClick={() => setPopover(popover === 'history' ? undefined : 'history')}
                >
                  <Icon name="history" size={17} />
                </button>
                <button
                  type={state.busy ? 'button' : 'submit'}
                  className={`ai4s-wb-submit${state.busy ? ' is-busy' : ''}`}
                  disabled={!state.busy && (state.loading || !entry || noKey || !state.draft.query.trim())}
                  title={t(state.busy ? 'wbCancel' : 'wbSearch')}
                  aria-label={t(state.busy ? 'wbCancel' : 'wbSearch')}
                  onClick={(event) => {
                    if (state.busy) {
                      event.preventDefault()
                      props.cancelWorkbench()
                    }
                  }}
                >
                  {state.busy ? <span className="ai4s-wb-stop" /> : <Icon name="arrow" size={20} />}
                </button>
              </div>
            </form>
            {popover ? (
              <div
                ref={popup}
                role="dialog"
                aria-label={t(popover === 'filters' ? 'wbFilters' : 'wbHistory')}
                id={`${id}-${popover}`}
                className={`ai4s-wb-popover ai4s-wb-popover-${popover}`}
              >
                {popover === 'filters' && entry ? (
                  <FilterPanel
                    key={state.source}
                    draft={state.draft}
                    source={state.source}
                    defaultLimit={entry.defaultLimit}
                    maxLimit={entry.maxLimit}
                    t={t}
                    onClose={closeFilters}
                    onApply={(patch) => {
                      edit(patch)
                      closeFilters()
                    }}
                  />
                ) : (
                  <div className="ai4s-wb-history">
                    <header className="ai4s-wb-popover-head">
                      <h3>{t('wbHistory')}</h3>
                      <button
                        type="button"
                        className="ai4s-wb-icon-button"
                        aria-label={t('wbClose')}
                        onClick={() => {
                          setPopover(undefined)
                          historyButton.current?.focus()
                        }}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </header>
                    <div className="ai4s-wb-history-list">
                      {state.history.length ? (
                        state.history.map((h, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              props.chooseSource(h.source)
                              edit({ query: h.query })
                              setPopover(undefined)
                              input.current?.focus()
                            }}
                          >
                            <Icon name="history" size={15} />
                            <span>
                              <strong>{h.query}</strong>
                              <small>{label(h.source, t)}</small>
                            </span>
                          </button>
                        ))
                      ) : (
                        <p>{t('wbNoHistory')}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            {isCategorySource(state.source) || state.source === 'snippets' ? (
              <p className="ai4s-wb-source-hint">
                {t(isCategorySource(state.source) ? 'wbCategoryHint' : 'wbSnippetHint')}
              </p>
            ) : null}
          </div>
          {state.loading && !catalog ? (
            <p className="ai4s-wb-status" role="status">
              {t('wbLoading')}
            </p>
          ) : null}
          {catalog && !catalog.sources.length ? <p className="ai4s-wb-status">{t('wbNoSources')}</p> : null}
          {noKey ? (
            <div className="ai4s-wb-status">
              <span>{t('wbKeyRequired')}</span>
              <button type="button" className="ai4s-wb-button" onClick={showSettings}>
                {t('wbConfigure')}
              </button>
            </div>
          ) : null}
          {state.error ? (
            <div className="ai4s-wb-status ai4s-wb-error" role="alert">
              <span>{state.errorCode === 'UNAVAILABLE' ? t('wbUnavailable') : state.error}</span>
              <button
                type="button"
                className="ai4s-wb-button"
                onClick={() => (state.errorCode === 'UNAVAILABLE' ? props.attachWorkbench() : submit())}
                disabled={state.busy}
              >
                {t('wbRetry')}
              </button>
            </div>
          ) : null}
          {state.busy && !result ? (
            <p className="ai4s-wb-status" role="status">
              <span className="ai4s-wb-spinner" />
              {t('wbSearching')}
            </p>
          ) : null}
          {!result && !isCategorySource(state.source) && !state.loading ? (
            <div className="ai4s-wb-examples" role="group" aria-label={t('wbExamples')}>
              {(['wbExampleOne', 'wbExampleTwo', 'wbExampleThree'] as const).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => {
                    edit({ query: t(k) })
                    input.current?.focus()
                  }}
                >
                  <Icon name="search" size={14} />
                  {t(k)}
                </button>
              ))}
            </div>
          ) : null}
          {result ? (
            <>
              <div className="ai4s-wb-result-context" role="status">
                <span className="ai4s-wb-query-context" title={t('wbResultFor', { query: result.query })}>
                  {state.busy ? (
                    <>
                      <span className="ai4s-wb-spinner" />
                      {t('wbUpdating')}
                    </>
                  ) : (
                    t('wbResultFor', { query: result.query })
                  )}
                </span>
                <span>
                  {result.credits?.charged !== undefined
                    ? t('wbCharge', { count: formatCount(result.credits.charged) })
                    : ''}
                  {result.credits?.remaining !== undefined
                    ? ` · ${t('wbRemaining', { count: formatCount(result.credits.remaining) })}`
                    : ''}
                </span>
              </div>
              {pending && !state.busy ? <p className="ai4s-wb-pending">{t('wbPending')}</p> : null}
              {result.warning ? <p className="ai4s-wb-status">{result.warning}</p> : null}
              {result.items.length ? (
                <div
                  ref={split}
                  className={`ai4s-wb-results${detailOpen ? '' : ' ai4s-wb-list-only'}${mobileDetail ? ' ai4s-wb-show-detail' : ''}`}
                  style={{ '--wb-list-width': `${listWidth}%` } as CSSProperties}
                  aria-busy={state.busy}
                >
                  <section className="ai4s-wb-list" aria-label={t('wbResultFor', { query: result.query })}>
                    <header className="ai4s-wb-panel-head">
                      <div className="ai4s-wb-result-count">
                        <span>{t('wbResults', { count: result.items.length })}</span>
                        {result.total !== undefined && result.total > result.items.length ? (
                          <small> · {t('wbTotal', { count: formatCount(result.total) })}</small>
                        ) : null}
                      </div>
                      {!detailOpen ? (
                        <button
                          type="button"
                          className="ai4s-wb-icon-button"
                          aria-label={t('wbOpenDetails')}
                          title={t('wbOpenDetails')}
                          onClick={() => {
                            setDetailOpen(true)
                            setMobileDetail(true)
                          }}
                        >
                          <Icon name="panel" size={16} />
                        </button>
                      ) : null}
                    </header>
                    <ol ref={list}>
                      {result.items.map((item, index) => (
                        <li key={`${item.id}:${index}`}>
                          <button
                            type="button"
                            className={`ai4s-wb-result${index === state.selected ? ' is-selected' : ''}`}
                            aria-current={index === state.selected ? 'true' : undefined}
                            onClick={() => {
                              props.selectPaper(index)
                              setDetailOpen(true)
                              setMobileDetail(true)
                            }}
                          >
                            <span className="ai4s-wb-result-number">
                              {(page?.request.offset ?? ((page?.request.page ?? 1) - 1) * (page?.request.limit ?? 10)) +
                                index +
                                1}
                            </span>
                            <span className="ai4s-wb-result-content">
                              <strong title={item.title}>
                                <Highlight text={item.title} query={result.query} />
                              </strong>
                              {item.authors.length ? (
                                <span className="ai4s-wb-result-authors">
                                  {item.authors.slice(0, 2).join(', ')}
                                  {item.authors.length > 2 ? ' et al.' : ''}
                                </span>
                              ) : null}
                              <span className="ai4s-wb-result-meta">
                                <span title={[item.year, item.venue].filter(Boolean).join(' · ')}>
                                  {[item.year, item.venue].filter(Boolean).join(' · ')}
                                </span>
                                {item.abstract ? (
                                  <small>
                                    {t(
                                      item.kind === 'snippet'
                                        ? 'wbHasExcerpt'
                                        : item.source === 'google-scholar' || item.kind === 'patent'
                                          ? 'wbHasSummary'
                                          : 'wbHasAbstract',
                                    )}
                                  </small>
                                ) : null}
                                {safeUrl(item.pdfUrl) ? (
                                  <small className="ai4s-wb-fulltext">{t('wbPdfShort')}</small>
                                ) : null}
                              </span>
                              {item.kind === 'snippet' && item.abstract ? (
                                <span className="ai4s-wb-result-excerpt">
                                  <Highlight text={item.abstract} query={result.query} />
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                    <footer className="ai4s-wb-pagination">
                      <span>{t('wbPage', { count: pageNumber })}</span>
                      <div>
                        <button
                          type="button"
                          className="ai4s-wb-button"
                          disabled={state.busy || state.pageIndex === 0}
                          onClick={props.previousPage}
                        >
                          {t('wbPrevious')}
                        </button>
                        <button
                          type="button"
                          className="ai4s-wb-button"
                          disabled={state.busy || !(result.next || state.pageIndex < state.pages.length - 1)}
                          onClick={props.nextPage}
                        >
                          {t('wbNext')}
                        </button>
                      </div>
                    </footer>
                  </section>
                  {detailOpen && selected ? (
                    <>
                      <div
                        className="ai4s-wb-divider"
                        role="separator"
                        aria-label={t('wbResize')}
                        aria-orientation="vertical"
                        aria-valuemin={32}
                        aria-valuemax={60}
                        aria-valuenow={listWidth}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          const next =
                            event.key === 'ArrowLeft'
                              ? listWidth - 2
                              : event.key === 'ArrowRight'
                                ? listWidth + 2
                                : event.key === 'Home'
                                  ? 32
                                  : event.key === 'End'
                                    ? 60
                                    : undefined
                          if (next !== undefined) {
                            event.preventDefault()
                            setListWidth(Math.max(32, Math.min(60, next)))
                          }
                        }}
                        onPointerDown={(event) => {
                          resizing.current = true
                          event.currentTarget.setPointerCapture(event.pointerId)
                          event.preventDefault()
                        }}
                        onPointerMove={(event) => {
                          if (!resizing.current || !split.current) return
                          const rect = split.current.getBoundingClientRect()
                          setListWidth(
                            Math.max(32, Math.min(60, Math.round(((event.clientX - rect.left) / rect.width) * 100))),
                          )
                        }}
                        onPointerUp={(event) => {
                          resizing.current = false
                          if (event.currentTarget.hasPointerCapture(event.pointerId))
                            event.currentTarget.releasePointerCapture(event.pointerId)
                        }}
                        onLostPointerCapture={() => {
                          resizing.current = false
                        }}
                      >
                        <span />
                      </div>
                      <Detail item={selected} query={result.query} t={t} onClose={closeDetails} />
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="ai4s-wb-empty">
                  <Icon name="search" size={32} />
                  <h2>{t('wbEmpty')}</h2>
                  <p>{t('wbEmptyHint')}</p>
                  <div className="ai4s-wb-links">
                    {state.pageIndex > 0 ? (
                      <button
                        type="button"
                        className="ai4s-wb-button"
                        onClick={props.previousPage}
                        disabled={state.busy}
                      >
                        {t('wbPrevious')}
                      </button>
                    ) : null}
                    {result.next ? (
                      <button type="button" className="ai4s-wb-button" onClick={props.nextPage} disabled={state.busy}>
                        {t('wbNext')}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </main>
  )
}

interface WorkbenchSlots {
  inject(name: 'main' | 'sidebar.panellist', callback: () => () => void): () => void
  register(
    options: { name: 'main'; key: string; locale: typeof NS; inject(): WorkbenchFace },
    component: ComponentType<Props>,
  ): () => void
  register(
    options: { name: 'sidebar.panellist'; id: string; order: number; label(): string },
    component: ComponentType<{ size?: number }>,
  ): () => void
}
export function applyWorkbench(ctx: ClientContext, settings: Ai4ScholarCardFace): void {
  const controller = new WorkbenchController()
  ctx.effect(() => () => controller.dispose(), 'ai4scholar: workbench state')
  ctx.effect(() => installWorkbenchStyles(), 'ai4scholar: workbench styles')
  const face: WorkbenchFace = {
    ...settings,
    hooks: { ...settings.hooks, workbench: controller.store },
    attachWorkbench: () => {
      void controller.attach()
    },
    editWorkbench: (patch) => controller.edit(patch),
    chooseSource: (source) => controller.choose(source),
    searchWorkbench: () => {
      void controller.search()
    },
    cancelWorkbench: () => controller.cancel(),
    previousPage: () => controller.previous(),
    nextPage: () => {
      void controller.next()
    },
    selectPaper: (index) => controller.select(index),
    openPluginManager: () => {
      const navigation = ctx.get('pluginNavigation' as never) as { openBundle?(name: string): void } | undefined
      if (!navigation?.openBundle) return false
      navigation.openBundle('dsh-ai4scholar')
      return true
    },
  }
  const slots = ctx.slots as unknown as WorkbenchSlots
  slots.inject('main', () =>
    slots.register({ name: 'main', key: WORKBENCH_ID, locale: NS, inject: () => face }, Ai4ScholarWorkbench),
  )
  slots.inject('sidebar.panellist', () =>
    slots.register(
      { name: 'sidebar.panellist', id: WORKBENCH_ID, order: 65, label: () => 'Ai4Scholar' },
      ({ size }) => <Icon name="search" size={size ?? 20} />,
    ),
  )
}
