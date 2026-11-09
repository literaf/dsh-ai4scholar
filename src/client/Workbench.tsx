import { useEffect, useId, useState } from 'react'
import type { ComponentType } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Ai4ScholarPluginConfig } from './Card.js'
import type { Ai4ScholarCardFace } from './Card.js'
import type { CardStore } from './controller.js'
import type { InjectedFace } from './plugin-config.js'
import { Ai4ScholarBrand } from './Brand.js'
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
}
type Props = PropsLocale<'ai4scholar'> & InjectedFace<WorkbenchFace>
type Translate = Props['t']
type IconName = 'search' | 'filter' | 'arrow' | 'settings' | 'history' | 'book' | 'copy' | 'external' | 'back'
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

function Detail({ item, query, t }: { item: WorkbenchItem; query: string; t: Translate }) {
  const [copy, setCopy] = useState<'copied' | 'error' | undefined>()
  useEffect(() => {
    setCopy(undefined)
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
        <span>
          {t(item.kind === 'patent' ? 'wbPatentDetails' : item.kind === 'snippet' ? 'wbExcerptDetails' : 'wbDetails')}
        </span>
        <button
          type="button"
          className="ai4s-wb-icon-button"
          onClick={() => {
            void copyReference()
          }}
          title={t('wbCopy')}
          aria-label={t('wbCopy')}
        >
          <Icon name="copy" />
        </button>
      </header>
      <div className="ai4s-wb-detail-body">
        <h2>
          <Highlight text={item.title} query={query} />
        </h2>
        {item.authors.length ? <p className="ai4s-wb-muted">{item.authors.join(', ')}</p> : null}
        <p className="ai4s-wb-meta">
          {[
            item.year,
            item.venue,
            item.citationCount !== undefined ? t('wbCitations', { count: formatCount(item.citationCount) }) : undefined,
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
        <p className="ai4s-wb-muted ai4s-wb-content-note">
          {t(item.kind === 'snippet' ? 'wbSnippetNote' : item.kind === 'patent' ? 'wbPatentNote' : 'wbContentNote')}
        </p>
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
          <p>{item.abstract ? <Highlight text={item.abstract} query={query} /> : t('wbNoAbstract')}</p>
        </div>
      </div>
    </section>
  )
}

export function Ai4ScholarWorkbench(props: Props) {
  const { t } = props
  const state = props.useWorkbench((s) => s)
  const key = props.useCard((s) => s)
  const [settings, setSettings] = useState(false)
  const [filters, setFilters] = useState(false)
  const [history, setHistory] = useState(false)
  const id = useId()
  useEffect(() => {
    props.attachWorkbench()
    props.refresh()
  }, [props.attachWorkbench, props.refresh])
  const page = state.pages[state.pageIndex]
  const result = page?.result
  const catalog = state.catalog
  const entry = catalog?.sources.find((s) => s.id === state.source)
  const noKey = !!entry?.needsKey && key.loaded && !key.configured
  const primary = catalog?.sources.filter((s) => !isPreprint(s.id)) ?? []
  const preprints = catalog?.sources.filter((s) => isPreprint(s.id)) ?? []
  const selected = result?.items[state.selected]
  const edit = props.editWorkbench
  const closeSettings = (): void => {
    setSettings(false)
    props.attachWorkbench()
  }
  return (
    <main className={`ai4s-wb${result ? ' ai4s-wb-has-results' : ''}`}>
      <header className="ai4s-wb-header">
        <div>
          <Ai4ScholarBrand />
          <span className="ai4s-wb-header-divider" />
          <span>{t(settings ? 'wbSettings' : 'wbTitle')}</span>
        </div>
        <button
          type="button"
          className="ai4s-wb-button"
          onClick={() => (settings ? closeSettings() : setSettings(true))}
        >
          <Icon name={settings ? 'back' : 'settings'} />
          {t(settings ? 'wbBack' : 'wbSettings')}
        </button>
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
          <form
            className="ai4s-wb-search-box"
            onSubmit={(event) => {
              event.preventDefault()
              if (!state.busy && !noKey) props.searchWorkbench()
            }}
          >
            <div className="ai4s-wb-sources" role="group" aria-label={t('wbSources')}>
              {primary.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`ai4s-wb-source${state.source === s.id ? ' is-selected' : ''}`}
                  aria-pressed={state.source === s.id}
                  onClick={() => props.chooseSource(s.id)}
                >
                  <Icon name={s.id === 'snippets' ? 'search' : 'book'} />
                  {label(s.id, t)}
                </button>
              ))}
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
            <div className="ai4s-wb-query-row">
              <input
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
              <button
                type={state.busy ? 'button' : 'submit'}
                className={`ai4s-wb-submit${state.busy ? ' is-busy' : ''}`}
                disabled={!state.busy && (!entry || noKey || !state.draft.query.trim())}
                title={t(state.busy ? 'wbCancel' : 'wbSearch')}
                aria-label={t(state.busy ? 'wbCancel' : 'wbSearch')}
              onClick={(event) => {
                if (state.busy) {
                  // Cancelling changes this control back to a submit button
                  // before the browser runs its default click action.
                  event.preventDefault()
                  props.cancelWorkbench()
                }
                }}
              >
                {state.busy ? <span className="ai4s-wb-stop" /> : <Icon name="arrow" size={22} />}
              </button>
            </div>
            <div className="ai4s-wb-search-footer">
              <button
                className="ai4s-wb-button"
                type="button"
                aria-expanded={filters}
                aria-controls={`${id}-filters`}
                onClick={() => setFilters(!filters)}
              >
                <Icon name="filter" />
                {t('wbFilters')}
              </button>
              <span className="ai4s-wb-cost">{entry ? t(entry.needsKey ? 'wbBilled' : 'wbFree') : ''}</span>
              <button
                className="ai4s-wb-icon-button"
                type="button"
                title={t('wbHistory')}
                aria-label={t('wbHistory')}
                aria-expanded={history}
                onClick={() => setHistory(!history)}
              >
                <Icon name="history" />
              </button>
            </div>
            {filters && entry ? (
              <div className="ai4s-wb-filters" id={`${id}-filters`}>
                <label>
                  {t('wbCount')}
                  <input
                    type="number"
                    min={1}
                    max={entry.maxLimit}
                    step={1}
                    value={state.draft.limit}
                    onChange={(event) => edit({ limit: Number(event.target.value) })}
                    required
                  />
                </label>
                {hasYearFilter(state.source) ? (
                  <>
                    <label>
                      {t('wbYearFrom')}
                      <input
                        type="number"
                        min={1000}
                        max={9999}
                        placeholder={t('wbAnyYear')}
                        value={state.draft.yearFrom}
                        onChange={(event) => edit({ yearFrom: event.target.value })}
                      />
                    </label>
                    <label>
                      {t('wbYearTo')}
                      <input
                        type="number"
                        min={1000}
                        max={9999}
                        placeholder={t('wbAnyYear')}
                        value={state.draft.yearTo}
                        onChange={(event) => edit({ yearTo: event.target.value })}
                      />
                    </label>
                  </>
                ) : null}
                {isCategorySource(state.source) ? (
                  <label>
                    {t('wbDays')}
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={state.draft.days}
                      onChange={(event) => edit({ days: Number(event.target.value) })}
                      required
                    />
                  </label>
                ) : null}
                {hasDateSort(state.source) ? (
                  <label>
                    {t('wbSort')}
                    <select
                      value={state.draft.sort}
                      onChange={(event) => edit({ sort: event.target.value as SearchDraft['sort'] })}
                    >
                      <option value="relevance">{t('wbRelevance')}</option>
                      <option value="date">{t('wbNewest')}</option>
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
            {history ? (
              <div className="ai4s-wb-history">
                <h3>{t('wbHistory')}</h3>
                {state.history.length ? (
                  state.history.map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        props.chooseSource(h.source)
                        edit({ query: h.query })
                        setHistory(false)
                      }}
                    >
                      <Icon name="history" />
                      <span>{h.query}</span>
                      <small>{label(h.source, t)}</small>
                    </button>
                  ))
                ) : (
                  <p>{t('wbNoHistory')}</p>
                )}
              </div>
            ) : null}
          </form>
          {isCategorySource(state.source) || state.source === 'snippets' ? (
            <p className="ai4s-wb-source-hint">
              {t(isCategorySource(state.source) ? 'wbCategoryHint' : 'wbSnippetHint')}
            </p>
          ) : null}
          {state.loading ? (
            <p className="ai4s-wb-status" role="status">
              {t('wbLoading')}
            </p>
          ) : null}
          {catalog && !catalog.sources.length ? <p className="ai4s-wb-status">{t('wbNoSources')}</p> : null}
          {noKey ? (
            <div className="ai4s-wb-status">
              <span>{t('wbKeyRequired')}</span>
              <button type="button" className="ai4s-wb-button" onClick={() => setSettings(true)}>
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
                onClick={() => (state.errorCode === 'UNAVAILABLE' ? props.attachWorkbench() : props.searchWorkbench())}
                disabled={state.busy}
              >
                {t('wbRetry')}
              </button>
            </div>
          ) : null}
          {state.busy ? (
            <p className="ai4s-wb-status" role="status">
              <span className="ai4s-wb-spinner" />
              {t('wbSearching')}
            </p>
          ) : null}
          {!result && !isCategorySource(state.source) && !state.loading ? (
            <div className="ai4s-wb-examples" role="group" aria-label={t('wbExamples')}>
              {(['wbExampleOne', 'wbExampleTwo', 'wbExampleThree'] as const).map((k) => (
                <button type="button" key={k} onClick={() => edit({ query: t(k) })}>
                  <Icon name="search" size={16} />
                  {t(k)}
                </button>
              ))}
            </div>
          ) : null}
          {result ? (
            <>
              <div className="ai4s-wb-result-context" role="status">
                <span>{t('wbResultFor', { query: result.query })}</span>
                <span>
                  {result.credits?.charged !== undefined
                    ? t('wbCharge', { count: formatCount(result.credits.charged) })
                    : ''}
                  {result.credits?.remaining !== undefined
                    ? ` · ${t('wbRemaining', { count: formatCount(result.credits.remaining) })}`
                    : ''}
                </span>
              </div>
              {result.warning ? <p className="ai4s-wb-status">{result.warning}</p> : null}
              {result.items.length ? (
                <div className="ai4s-wb-results" aria-busy={state.busy}>
                  <section className="ai4s-wb-list" aria-label={t('wbResultFor', { query: result.query })}>
                    <header className="ai4s-wb-panel-head">
                      <span>
                        {t('wbPage', {
                          count:
                            page?.request.page ??
                            Math.floor((page?.request.offset ?? 0) / (page?.request.limit ?? 10)) + 1,
                        })}{' '}
                        · {t('wbResults', { count: result.items.length })}
                      </span>
                      {result.total !== undefined && result.total > result.items.length ? (
                        <small>{t('wbTotal', { count: formatCount(result.total) })}</small>
                      ) : null}
                    </header>
                    <ol>
                      {result.items.map((item, index) => (
                        <li key={`${item.id}:${index}`}>
                          <button
                            type="button"
                            className={`ai4s-wb-result${index === state.selected ? ' is-selected' : ''}`}
                            aria-current={index === state.selected ? 'true' : undefined}
                            onClick={() => props.selectPaper(index)}
                          >
                            <span className="ai4s-wb-result-number">
                              {(page?.request.offset ?? ((page?.request.page ?? 1) - 1) * (page?.request.limit ?? 10)) +
                                index +
                                1}
                            </span>
                            <span className="ai4s-wb-result-content">
                              <strong>
                                <Highlight text={item.title} query={result.query} />
                              </strong>
                              <span className="ai4s-wb-result-authors">
                                {item.authors.slice(0, 3).join(', ')}
                                {item.authors.length > 3 ? ' et al.' : ''}
                              </span>
                              <span className="ai4s-wb-result-meta">
                                {[item.year, item.venue].filter(Boolean).join(' · ')}
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
                                {safeUrl(item.pdfUrl) ? <small className="ai4s-wb-fulltext">{t('wbPdf')}</small> : null}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                    <footer className="ai4s-wb-pagination">
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
                    </footer>
                  </section>
                  {selected ? <Detail item={selected} query={result.query} t={t} /> : null}
                </div>
              ) : (
                <div className="ai4s-wb-empty">
                  <Icon name="search" size={36} />
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
  }
  const slots = ctx.slots as unknown as WorkbenchSlots
  slots.inject('main', () =>
    slots.register({ name: 'main', key: WORKBENCH_ID, locale: NS, inject: () => face }, Ai4ScholarWorkbench),
  )
  slots.inject('sidebar.panellist', () =>
    slots.register(
      { name: 'sidebar.panellist', id: WORKBENCH_ID, order: 65, label: () => 'AI4Scholar' },
      ({ size }) => <Icon name="search" size={size ?? 20} />,
    ),
  )
}
