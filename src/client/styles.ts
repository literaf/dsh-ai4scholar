/**
 * The card's stylesheet, injected as one plugin-owned `<style>` tag so the
 * bundle needs no CSS pipeline. Colors come from the dsh theme tokens
 * (`--dsw-alias-*`), so the card follows light/dark like the built-in cards.
 */

/** Tag attribute marking the style element as this plugin's. */
export const STYLE_TAG_ID = 'dsh-ai4scholar/settings-card'

const P = 'ai4s'

/** Class names used by the card component. */
export const cls = {
  card: `${P}-card`,
  cardOpen: `${P}-card-open`,
  header: `${P}-header`,
  headText: `${P}-head-text`,
  name: `${P}-name`,
  description: `${P}-description`,
  badge: `${P}-badge`,
  badgeOn: `${P}-badge-on`,
  chevron: `${P}-chevron`,
  chevronOpen: `${P}-chevron-open`,
  body: `${P}-body`,
  field: `${P}-field`,
  fieldHead: `${P}-field-head`,
  label: `${P}-label`,
  input: `${P}-input`,
  hint: `${P}-hint`,
  link: `${P}-link`,
  notice: `${P}-notice`,
  noticeError: `${P}-notice-error`,
  readOnly: `${P}-read-only`,
  footer: `${P}-footer`,
  button: `${P}-button`,
  buttonPrimary: `${P}-button-primary`,
  check: `${P}-check`,
  checkMuted: `${P}-check-muted`,
  checkOk: `${P}-check-ok`,
  checkError: `${P}-check-error`,
  linkButton: `${P}-link-button`,
  cmd: `${P}-cmd`,
  cmdError: `${P}-cmd-error`,
  cmdHead: `${P}-cmd-head`,
  cmdBrand: `${P}-cmd-brand`,
  cmdMuted: `${P}-cmd-muted`,
  cmdPill: `${P}-cmd-pill`,
  cmdHero: `${P}-cmd-hero`,
  cmdNumber: `${P}-cmd-number`,
  cmdUnit: `${P}-cmd-unit`,
  cmdStats: `${P}-cmd-stats`,
  cmdStat: `${P}-cmd-stat`,
  cmdStatLabel: `${P}-cmd-stat-label`,
  cmdStatValue: `${P}-cmd-stat-value`,
  cmdPre: `${P}-cmd-pre`,
  cmdErrorText: `${P}-cmd-error-text`,
  cmdFoot: `${P}-cmd-foot`,
} as const

export const CSS = `
.${cls.cmd} { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-3); max-width: 560px; }
.${cls.cmdError} { border-color: var(--dsw-alias-label-error); }
.${cls.cmdHead} { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.${cls.cmdBrand} { font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); }
.${cls.cmdMuted} { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.${cls.cmdPill} { border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 17px; font-weight: 500; white-space: nowrap; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); }
.${cls.cmdHero} { display: flex; align-items: baseline; gap: 8px; }
.${cls.cmdNumber} { font-size: 28px; font-weight: 600; line-height: 1.2; letter-spacing: -.01em; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.${cls.cmdUnit} { font-size: 13px; color: var(--dsw-alias-label-secondary); }
.${cls.cmdStats} { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px 16px; margin: 0; padding: 10px 0 0; border-top: 1px solid var(--dsw-alias-border-l2); }
.${cls.cmdStat} { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.${cls.cmdStatLabel} { font-size: 11px; line-height: 1.4; color: var(--dsw-alias-label-tertiary); }
.${cls.cmdStatValue} { margin: 0; font-size: 13px; font-weight: 500; line-height: 1.4; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.${cls.cmdPre} { margin: 0; white-space: pre-wrap; font: inherit; font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.${cls.cmdErrorText} { margin: 0; font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-error); }
.${cls.cmdFoot} { display: flex; justify-content: flex-end; font-size: 12px; }
.${cls.card} { list-style: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-3); transition: border-color .16s, background .16s; }
.${cls.card}:hover { border-color: var(--dsw-alias-label-dimmed); }
.${cls.cardOpen} { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-label-dimmed); }
.${cls.header} { width: 100%; appearance: none; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; }
.${cls.header}:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.${cls.headText} { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.${cls.name} { font-size: 15px; font-weight: 600; line-height: 1.4; color: var(--dsw-alias-label-primary); }
.${cls.description} { font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.${cls.badge} { flex: none; border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 17px; font-weight: 500; white-space: nowrap; color: var(--dsw-alias-label-tertiary); }
.${cls.badgeOn} { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); }
.${cls.chevron} { flex: none; width: 14px; height: 14px; color: var(--dsw-alias-label-tertiary); transition: transform .16s; }
.${cls.chevronOpen} { transform: rotate(180deg); }
.${cls.body} { border-top: 1px solid var(--dsw-alias-border-l2); margin: 0 16px; padding-bottom: 8px; }
.${cls.field} { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
.${cls.fieldHead} { display: flex; align-items: center; gap: 8px; }
.${cls.label} { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--dsw-alias-label-primary); }
.${cls.input} { height: 34px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 1.5; }
.${cls.input}:focus-visible { outline: none; border-color: var(--dsw-alias-brand-primary); }
.${cls.input}:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.${cls.hint} { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.${cls.link} { color: var(--dsw-alias-brand-primary); text-decoration: none; }
.${cls.link}:hover { text-decoration: underline; }
.${cls.check} { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; margin: 2px 0 0; font-size: 12px; line-height: 1.5; }
.${cls.checkMuted} { color: var(--dsw-alias-label-tertiary); }
.${cls.checkOk} { color: var(--dsw-alias-label-secondary); }
.${cls.checkError} { color: var(--dsw-alias-label-error); overflow-wrap: anywhere; }
.${cls.linkButton} { appearance: none; border: 0; padding: 0; background: none; font: inherit; font-size: 12px; cursor: pointer; color: var(--dsw-alias-brand-primary); }
.${cls.linkButton}:hover:not(:disabled) { text-decoration: underline; }
.${cls.linkButton}:disabled { opacity: .5; cursor: default; }
.${cls.notice} { flex: 1; min-width: 0; margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.${cls.noticeError} { color: var(--dsw-alias-label-error); }
.${cls.readOnly} { margin: 12px 0 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.${cls.footer} { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 0 4px; border-top: 1px solid var(--dsw-alias-border-l2); }
.${cls.button} { appearance: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 5px 14px; font: inherit; font-size: 13px; line-height: 1.5; cursor: pointer; background: none; color: var(--dsw-alias-label-secondary); }
.${cls.button}:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); }
.${cls.buttonPrimary} { border-color: transparent; background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3); }
.${cls.buttonPrimary}:hover:not(:disabled) { color: var(--dsw-alias-bg-layer-3); border-color: transparent; opacity: .9; }
.${cls.button}:disabled { opacity: .4; cursor: default; }
.${cls.button}:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
`

/**
 * Install the stylesheet once; idempotent across HMR re-evaluation.
 * @returns a disposer that removes the tag.
 */
export function installStyles(): () => void {
  if (typeof document === 'undefined') return () => undefined
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`
  let tag = document.head.querySelector<HTMLStyleElement>(selector)
  if (tag === null) {
    tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-ai4scholar'
    tag.dataset.pluginCss = STYLE_TAG_ID
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
  return () => { tag?.remove() }
}
