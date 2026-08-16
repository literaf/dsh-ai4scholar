/**
 * The `/ai4scholar` command row: a balance card in place of the generic
 * monospace command card. Reads the settled outcome text (labeled lines) and
 * shows the available credits large, the breakdown small, and the key status.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { parseBalance } from './balance.js'
import { cls } from './styles.js'

/** Registration-side face of the command card (nothing injected today; kept for symmetry). */
export interface Ai4ScholarCommandFace {
  /** Top-up link shown in the footer. */
  topUpUrl: string
}

/** Props the renderer binds for the command row. */
export type Ai4ScholarCommandCardProps =
  PropsRuntime<'conversation.chat.commandview'>
  & PropsLocale<'ai4scholar'>
  & InjectFace<Ai4ScholarCommandFace>

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
        <div className={cls.cmdHead}><span className={cls.cmdBrand}>AI4Scholar</span><span className={cls.cmdMuted}>{t('checking')}</span></div>
      </div>
    )
  }
  if (outcome.kind === 'error') {
    return (
      <div className={`${cls.cmd} ${cls.cmdError}`}>
        <div className={cls.cmdHead}><span className={cls.cmdBrand}>AI4Scholar</span><span className={cls.cmdMuted}>{t('cmdFailed')}</span></div>
        <p className={cls.cmdErrorText}>{outcome.text ?? ''}</p>
      </div>
    )
  }
  const view = parseBalance(outcome.text ?? '')
  if (view.available === undefined) {
    // Not a balance report (older plugin, or a future shape): keep the text readable.
    return (
      <div className={cls.cmd}>
        <div className={cls.cmdHead}><span className={cls.cmdBrand}>AI4Scholar</span></div>
        <pre className={cls.cmdPre}>{outcome.text ?? ''}</pre>
      </div>
    )
  }
  const stats: Array<[string, string | undefined]> = [
    [t('statPermanent'), view.permanent],
    [t('statMemberMonthly'), view.memberMonthly],
    [t('statSessionSpent'), view.sessionSpent],
    [t('statKeySpent'), view.keySpent],
    [t('statKeyCap'), view.keyCap],
  ]
  return (
    <div className={cls.cmd}>
      <div className={cls.cmdHead}>
        <span className={cls.cmdBrand}>AI4Scholar</span>
        {view.keyStatus !== undefined ? <span className={cls.cmdPill}>{view.keyStatus.replace(/^configured/, t('configured'))}</span> : null}
        {view.membership !== undefined ? <span className={cls.cmdPill}>{view.membership}</span> : null}
      </div>
      <div className={cls.cmdHero}>
        <span className={cls.cmdNumber}>{view.available}</span>
        <span className={cls.cmdUnit}>{t('creditsAvailable')}</span>
      </div>
      <dl className={cls.cmdStats}>
        {stats.filter((s): s is [string, string] => s[1] !== undefined).map(([label, value]) => (
          <div key={label} className={cls.cmdStat}>
            <dt className={cls.cmdStatLabel}>{label}</dt>
            <dd className={cls.cmdStatValue}>{value}</dd>
          </div>
        ))}
      </dl>
      {view.other.length > 0 ? <pre className={cls.cmdPre}>{view.other.join('\n')}</pre> : null}
      <div className={cls.cmdFoot}>
        <a className={cls.link} href={props.topUpUrl} target="_blank" rel="noreferrer">{t('topUp')}</a>
      </div>
    </div>
  )
}
