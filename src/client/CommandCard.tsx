/**
 * The `/ai4scholar` command row: a balance card in place of the generic
 * monospace command card. Reads the settled outcome text (labeled lines) and
 * shows a compact balance summary, usage, defaults, and collapsible help.
 */

import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { parseBalance } from './balance.js'
import { cls } from './styles.js'
import { Ai4ScholarBrand } from './Brand.js'
import type { CommandView } from './plugin-config.js'

/** Registration-side face of the command card (nothing injected today; kept for symmetry). */
export interface Ai4ScholarCommandFace {
  /** Top-up link shown in the footer. */
  topUpUrl: string
}

/** Props the renderer binds for the command row. */
export type Ai4ScholarCommandCardProps =
  CommandView
  & PropsLocale<'ai4scholar'>
  & Ai4ScholarCommandFace

/**
 * Render the `/ai4scholar` row.
 * @param props - the folded command node, copy, and the top-up link.
 * @returns the balance card, an error card, or a pending card.
 */
export function Ai4ScholarCommandCard(props: Ai4ScholarCommandCardProps) {
  const { t, node } = props
  const outcome = node.outcome
  if (outcome === null) {
    return (
      <div className={cls.cmd}>
        <div className={cls.cmdHead}><Ai4ScholarBrand /><span className={cls.cmdMuted}>{t('checking')}</span></div>
      </div>
    )
  }
  if (outcome.kind === 'error') {
    return (
      <div className={`${cls.cmd} ${cls.cmdError}`}>
        <div className={cls.cmdHead}><Ai4ScholarBrand /><span className={cls.cmdMuted}>{t('cmdFailed')}</span></div>
        <p className={cls.cmdErrorText}>{outcome.text ?? ''}</p>
      </div>
    )
  }
  const view = parseBalance(outcome.text ?? '')
  if (view.available === undefined) {
    // Not a balance report (older plugin, or a future shape): keep the text readable.
    return (
      <div className={cls.cmd}>
        <div className={cls.cmdHead}><Ai4ScholarBrand /></div>
        <pre className={cls.cmdPre}>{outcome.text ?? ''}</pre>
      </div>
    )
  }
  const stats: Array<[string, string | undefined]> = [
    [t('statSessionSpent'), view.sessionSpent],
    [t('statKeySpent'), view.keySpent],
    [t('statKeyCap'), view.keyCap],
  ]
  const defaults = view.other.filter((line) => /^默认(检索来源|条数)：/.test(line))
  const names: Record<string, string> = { 'semantic-scholar': 'Semantic Scholar', 'google-scholar': 'Google Scholar', pubmed: 'PubMed', arxiv: 'arXiv', chinese: '中文文献' }
  const counts = defaults.find((line) => line.startsWith('默认条数：'))?.replace('默认条数：', '').trim()
  const sources = defaults.find((line) => line.startsWith('默认检索来源：'))?.replace('默认检索来源：', '').trim()
  const defaultText = (counts && counts !== '—' ? counts : sources)?.replace(/semantic-scholar|google-scholar|pubmed|arxiv|chinese/g, (source) => names[source]!)
  const help = view.other.filter((line) => !defaults.includes(line))
  const commands = help.filter((line) => /^\/ai4s-[a-z]+\s/.test(line))
  const hints = help.filter((line) => !commands.includes(line))
  return (
    <div className={cls.cmd}>
      <div className={cls.cmdHead}>
        <Ai4ScholarBrand />
        <div className={cls.cmdMetrics}>
          <div className={cls.cmdHero}>
            <span className={cls.cmdUnit}>{t('creditsAvailable')}</span>
            <span className={cls.cmdNumber}>{view.available}</span>
          </div>
          <dl className={cls.cmdStats}>
            {stats.filter((s): s is [string, string] => s[1] !== undefined).map(([label, value]) => (
              <div key={label} className={cls.cmdStat}>
                <dt className={cls.cmdStatLabel}>{label}</dt>
                <dd className={cls.cmdStatValue}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {view.keyStatus !== undefined ? <span className={cls.cmdPill}>{view.keyStatus.replace(/^configured/, t('configured'))}</span> : null}
      </div>
      <div className={cls.cmdFoot}>
        {defaultText ? <div className={cls.cmdDefaults}><span>{t('cmdDefaults')}</span><span>{defaultText}</span></div> : null}
        {help.length > 0 ? <details className={cls.cmdHelp}>
          <summary>{t('cmdHelp')}</summary>
          <div className={cls.cmdHelpBody}>
            {commands.length > 0 ? <dl className={cls.cmdCommands}>{commands.map((line) => {
              const [command, ...title] = line.split(/\s+/)
              return <div key={command}><dt><code>{command}</code></dt><dd>{title.join(' ')}</dd></div>
            })}</dl> : null}
            {hints.length > 0 ? <p className={cls.cmdPre}>{hints.join('\n')}</p> : null}
          </div>
        </details> : null}
        <a className={cls.link} href={props.topUpUrl} target="_blank" rel="noreferrer">{t('topUp')}</a>
      </div>
    </div>
  )
}
