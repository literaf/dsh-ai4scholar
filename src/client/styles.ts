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
  research: `${P}-research`, researchHead: `${P}-research-head`, researchBody: `${P}-research-body`,
  researchList: `${P}-research-list`, researchItem: `${P}-research-item`, researchTitle: `${P}-research-title`,
  researchFacts: `${P}-research-facts`, researchActions: `${P}-research-actions`, researchNotice: `${P}-research-notice`, researchRaw: `${P}-research-raw`,
  card: `${P}-card`,
  page: `${P}-page`,
  pageHead: `${P}-page-head`,
  pageTitle: `${P}-page-title`,
  pageIntro: `${P}-page-intro`,
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
  hintError: `${P}-hint-error`,
  badgeOff: `${P}-badge-off`,
  group: `${P}-group`,
  groupHead: `${P}-group-head`,
  groupText: `${P}-group-text`,
  groupTitle: `${P}-group-title`,
  groupIntro: `${P}-group-intro`,
  help: `${P}-help`,
  panel: `${P}-panel`,
  row: `${P}-row`,
  rowInline: `${P}-row-inline`,
  rowText: `${P}-row-text`,
  inputRow: `${P}-input-row`,
  keyState: `${P}-key-state`,
  keyStateConfigured: `${P}-key-state-configured`,
  keyStateIcon: `${P}-key-state-icon`,
  keyStateTitle: `${P}-key-state-title`,
  keyValue: `${P}-key-value`,
  keySecret: `${P}-key-secret`,
  keyToggle: `${P}-key-toggle`,
  keyAccess: `${P}-key-access`,
  linkIcon: `${P}-link-icon`,
  balance: `${P}-balance`,
  balanceNumber: `${P}-balance-number`,
  balanceUnit: `${P}-balance-unit`,
  chips: `${P}-chips`,
  chip: `${P}-chip`,
  chipOn: `${P}-chip-on`,
  chipMark: `${P}-chip-mark`,
  chipIcon: `${P}-chip-icon`,
  chipText: `${P}-chip-text`,
  chipName: `${P}-chip-name`,
  chipNote: `${P}-chip-note`,
  numberBox: `${P}-number-box`,
  numberBoxInvalid: `${P}-number-box-invalid`,
  numberInput: `${P}-number-input`,
  numberUnit: `${P}-number-unit`,
  switch: `${P}-switch`,
  thumb: `${P}-thumb`,
  buttonGhost: `${P}-button-ghost`,
  visuallyHidden: `${P}-visually-hidden`,
  actions: `${P}-actions`,
  platform: `${P}-platform`,
  box: `${P}-box`,
  boxOn: `${P}-box-on`,
  boxIcon: `${P}-box-icon`,
  selectBox: `${P}-select-box`,
  select: `${P}-select`,
  selectChevron: `${P}-select-chevron`,
  segmented: `${P}-segmented`,
  segment: `${P}-segment`,
  segmentOn: `${P}-segment-on`,
  cmd: `${P}-cmd`,
  cmdError: `${P}-cmd-error`,
  cmdHead: `${P}-cmd-head`,
  cmdBrand: `${P}-cmd-brand`,
  cmdLogo: `${P}-cmd-logo`,
  cmdMuted: `${P}-cmd-muted`,
  cmdPill: `${P}-cmd-pill`,
  cmdMetrics: `${P}-cmd-metrics`,
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
  cmdDefaults: `${P}-cmd-defaults`,
  cmdHelp: `${P}-cmd-help`,
  cmdHelpBody: `${P}-cmd-help-body`,
  cmdCommands: `${P}-cmd-commands`,
} as const

export const CSS = `
.${cls.research} { margin: 6px 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-3); }
.${cls.researchHead} { padding: 10px 14px; cursor: pointer; font-size: 13px; line-height: 1.5; }
.${cls.researchHead} > span { margin-right: 10px; }
.${cls.researchBody} { padding: 0 14px 12px; }
.${cls.researchList} { margin: 0; padding-left: 22px; max-height: 580px; overflow: auto; }
.${cls.researchItem} { padding: 12px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.${cls.researchItem}:last-child { border-bottom: 0; }
.${cls.researchTitle} { font-size: 14px; line-height: 1.5; font-weight: 550; overflow-wrap: anywhere; }
.${cls.researchTitle} a { color: inherit; text-decoration: none; }
.${cls.researchTitle} a:hover { text-decoration: underline; }
.${cls.researchFacts} { margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); overflow-wrap: anywhere; }
.${cls.researchActions} { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.${cls.researchActions} button, .${cls.researchActions} a { appearance: none; border: 1px solid var(--dsw-alias-border-l3); background: transparent; border-radius: 6px; padding: 3px 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); text-decoration: none; cursor: pointer; }
.${cls.researchActions} button:hover, .${cls.researchActions} a:hover { background: var(--dsw-alias-interactive-bg-hover-solid); }
.${cls.researchActions} button:focus-visible, .${cls.researchActions} a:focus-visible, .${cls.researchHead}:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.${cls.researchNotice} { margin: 10px 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.${cls.researchRaw} { margin: 8px 0; font-size: 12px; }
.${cls.researchRaw} summary { cursor: pointer; color: var(--dsw-alias-label-tertiary); margin-bottom: 6px; }
.${cls.researchRaw} pre { max-height: 300px; overflow: auto; overflow-wrap: anywhere; }
.${cls.cmd} { container: ai4s-account / inline-size; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: transparent; width: 100%; min-width: 0; box-sizing: border-box; color: var(--dsw-alias-label-primary); }
.${cls.cmdError} { border-color: var(--dsw-alias-label-error); }
.${cls.cmdHead} { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px 18px; line-height: 24px; }
.${cls.cmdBrand} { grid-column: 1; grid-row: 1; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; line-height: 24px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.${cls.cmdLogo} { flex: none; display: block; width: 24px; height: 24px; }
.${cls.cmdMuted} { grid-column: 3; grid-row: 1; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.${cls.cmdPill} { grid-column: 3; grid-row: 1; display: inline-flex; align-items: center; gap: 6px; font-size: 11px; line-height: 24px; white-space: nowrap; color: var(--dsw-alias-label-tertiary); }
.${cls.cmdPill}::before { content: ""; display: block; flex: none; width: 5px; height: 5px; border-radius: 50%; background: var(--dsw-alias-state-success-primary, #41a77e); }
.${cls.cmdMetrics} { grid-column: 2; grid-row: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 20px; min-width: 0; }
.${cls.cmdHero} { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.${cls.cmdNumber} { font-size: 18px; font-weight: 600; line-height: 24px; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.${cls.cmdUnit} { font-size: 12px; line-height: 24px; color: var(--dsw-alias-label-secondary); }
.${cls.cmdStats} { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 20px; margin: 0; padding: 0; }
.${cls.cmdStat} { display: flex; align-items: center; gap: 6px; min-width: 0; }
.${cls.cmdStatLabel} { font-size: 12px; line-height: 24px; color: var(--dsw-alias-label-tertiary); }
.${cls.cmdStatValue} { margin: 0; font-size: 13px; font-weight: 500; line-height: 24px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.${cls.cmdPre} { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.${cls.cmdErrorText} { margin: 0; font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-error); }
.${cls.cmdDefaults} { grid-column: 1; grid-row: 1; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 6px; min-width: 0; font-size: 12px; line-height: 20px; }
.${cls.cmdDefaults} > span:first-child { color: var(--dsw-alias-label-tertiary); }
.${cls.cmdDefaults} > span:last-child { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.${cls.cmdFoot} { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: start; gap: 8px 16px; font-size: 12px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l2); }
.${cls.cmdFoot} > a { grid-column: 3; grid-row: 1; white-space: nowrap; line-height: 20px; }
.${cls.cmdHelp} { display: contents; }
.${cls.cmdHelp}::details-content { display: contents; }
.${cls.cmdHelp} > summary { grid-column: 2; grid-row: 1; cursor: pointer; color: var(--dsw-alias-label-secondary); line-height: 20px; width: fit-content; }
.${cls.cmdHelp} > summary:focus-visible, .${cls.cmdFoot} > a:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; border-radius: 2px; }
.${cls.cmdHelpBody} { grid-column: 1 / -1; padding-top: 4px; }
.${cls.cmdHelp}:not([open]) > .${cls.cmdHelpBody} { display: none; }
.${cls.cmdCommands} { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 20px; margin: 0 0 12px; }
.${cls.cmdCommands} > div { display: grid; align-content: start; min-width: 0; gap: 1px; padding: 6px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.${cls.cmdCommands} dt { min-width: 0; line-height: 18px; }
.${cls.cmdCommands} code { font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.${cls.cmdCommands} dd { margin: 0; font-size: 12px; line-height: 18px; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary); }
@container ai4s-account (max-width: 760px) {
  .${cls.cmdCommands} { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container ai4s-account (max-width: 680px) {
  .${cls.cmdHead} { grid-template-columns: minmax(0, 1fr) auto; }
  .${cls.cmdPill}, .${cls.cmdMuted} { grid-column: 2; }
  .${cls.cmdMetrics} { grid-column: 1 / -1; grid-row: 2; }
}
@container ai4s-account (max-width: 540px) {
  .${cls.cmdFoot} { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; }
  .${cls.cmdDefaults} { grid-column: 1 / -1; grid-row: 1; }
  .${cls.cmdHelp} > summary { grid-column: 1; grid-row: 2; }
  .${cls.cmdFoot} > a { grid-column: 2; grid-row: 2; }
}
@container ai4s-account (max-width: 440px) {
  .${cls.cmdCommands} { grid-template-columns: minmax(0, 1fr); }
}
.${cls.card} { list-style: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-3); transition: border-color .16s, background .16s; }
.${cls.card}:hover { border-color: var(--dsw-alias-label-dimmed); }
.${cls.cardOpen} { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-label-dimmed); }
.${cls.header} { width: 100%; appearance: none; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; }
.${cls.header}:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.${cls.headText} { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.${cls.name} { font-size: 15px; font-weight: 600; line-height: 1.4; color: var(--dsw-alias-label-primary); }
.${cls.description} { font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.${cls.badge} { flex: none; border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 17px; font-weight: 500; white-space: nowrap; color: var(--dsw-alias-label-tertiary); }
.${cls.chevron} { flex: none; width: 14px; height: 14px; color: var(--dsw-alias-label-tertiary); transition: transform .16s; }
.${cls.chevronOpen} { transform: rotate(180deg); }
.${cls.body} { border-top: 1px solid var(--dsw-alias-border-l2); margin: 0 16px; padding-bottom: 8px; }
.${cls.field} { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
.${cls.fieldHead} { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.${cls.label} { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--dsw-alias-label-primary); }
.${cls.input} { flex: 1; min-width: 0; box-sizing: border-box; height: 34px; padding: 0 12px; border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md, 12px); background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 1.5; letter-spacing: .02em; }
.${cls.input}::placeholder { color: var(--dsw-alias-label-tertiary); opacity: 1; }
.${cls.input}:focus-visible { outline: none; border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.${cls.input}:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.${cls.hint} { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.${cls.hintError} { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error)); }
.${cls.keyState} { display: flex; align-items: center; gap: 16px; min-width: 0; min-height: 28px; color: var(--dsw-alias-label-secondary); }
.${cls.keyStateConfigured} .${cls.keyStateTitle} { color: var(--dsw-alias-state-success-primary, var(--dsw-alias-label-primary)); }
.${cls.keyStateIcon} { flex: none; width: 16px; height: 16px; }
.${cls.keyStateTitle} { display: inline-flex; align-items: center; gap: 4px; flex: none; margin-left: auto; font-size: 12px; font-weight: 500; line-height: 1.5; white-space: nowrap; }
.${cls.keyValue} { display: flex; align-items: center; gap: 8px; min-width: 0; }
.${cls.keySecret} { min-width: 0; overflow-x: auto; white-space: nowrap; scrollbar-width: thin; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.5; letter-spacing: .04em; }
.${cls.keyToggle} { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.${cls.keyToggle}:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.${cls.keyToggle}:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.${cls.keyToggle}:disabled { opacity: .5; cursor: default; }
.${cls.keyAccess} { display: flex; align-items: baseline; justify-content: flex-end; flex-wrap: wrap; gap: 4px 10px; }
.${cls.keyAccess} > * { white-space: nowrap; }
.${cls.link} { display: inline-flex; align-items: center; gap: 2px; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-link, var(--dsw-alias-brand-primary)); text-decoration: none; }
.${cls.link}:hover { text-decoration: underline; }
.${cls.linkIcon} { width: 12px; height: 12px; }
.${cls.check} { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; margin: 2px 0 0; font-size: 12px; line-height: 1.5; }
.${cls.checkMuted} { font-size: 13px; color: var(--dsw-alias-label-tertiary); }
.${cls.checkOk} { color: var(--dsw-alias-label-secondary); }
.${cls.checkError} { font-size: 13px; color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error)); overflow-wrap: anywhere; }
.${cls.linkButton} { appearance: none; border: 0; padding: 0; background: none; font: inherit; font-size: 12px; cursor: pointer; color: var(--dsw-alias-link, var(--dsw-alias-brand-primary)); }
.${cls.linkButton}:hover:not(:disabled) { text-decoration: underline; }
.${cls.linkButton}:disabled { opacity: .5; cursor: default; }
.${cls.badgeOn} { color: var(--dsw-alias-state-success-primary, var(--dsw-alias-label-secondary)); }
.${cls.badgeOff} { color: var(--dsw-alias-label-tertiary); }

/* Page: two groups, each a heading over one bordered panel of rows. */
.${cls.page} { width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 32px; }
.${cls.pageHead} { display: flex; flex-direction: column; gap: 4px; }
.${cls.pageTitle} { margin: 0; font-size: 20px; font-weight: 500; line-height: 28px; color: var(--dsw-alias-label-primary); }
.${cls.pageIntro} { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary); }
.${cls.group} { display: flex; flex-direction: column; gap: 12px; }
.${cls.groupHead} { display: flex; align-items: baseline; gap: 12px; }
.${cls.groupText} { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.${cls.groupTitle} { margin: 0; font-size: 14px; font-weight: 500; line-height: 20px; color: var(--dsw-alias-label-primary); }
.${cls.groupIntro} { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.${cls.help} > summary { display: flex; align-items: center; gap: 4px; width: fit-content; cursor: pointer; list-style: none; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.${cls.help} > summary::-webkit-details-marker { display: none; }
.${cls.help} > summary:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; border-radius: 2px; }
.${cls.help} > summary .${cls.chevron} { transform: rotate(-90deg); }
.${cls.help}[open] > summary .${cls.chevron} { transform: rotate(0); }
.${cls.help} > .${cls.hint} { margin: 8px 0 0 18px; max-width: 680px; }
.${cls.groupHead} .${cls.badge} { padding: 0; background: none; border: 0; font-size: 12px; font-weight: 400; }
.${cls.panel} { border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg, 16px); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2)); }
.${cls.row} { display: flex; flex-direction: column; gap: 10px; padding: 16px; }
.${cls.row} + .${cls.row} { border-top: .5px solid var(--dsw-alias-border-l2); }
.${cls.rowInline} { flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; }
.${cls.rowText} { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.${cls.rowText} > .${cls.label} { flex: none; }
.${cls.inputRow} { display: flex; align-items: center; gap: 8px; }
.${cls.readOnly} { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.${cls.notice} { min-width: 0; margin: 0 0 0 4px; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.${cls.noticeError} { color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error)); }

/* Balance once the key is tested. */
.${cls.balance} { display: inline-flex; align-items: baseline; gap: 4px; }
.${cls.balanceNumber} { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.${cls.balanceUnit} { font-size: 12px; color: var(--dsw-alias-label-tertiary); }

/* Platform chips, each with its cost under the name. */
.${cls.chips} { display: flex; flex-wrap: wrap; gap: 8px; }
.${cls.chip} { appearance: none; display: inline-flex; align-items: center; gap: 6px; height: 32px; box-sizing: border-box; padding: 0 12px; border: .5px solid var(--dsw-alias-border-l4); border-radius: 999px; background: none; font: inherit; color: var(--dsw-alias-label-secondary); cursor: pointer; transition: border-color .12s, background .12s, color .12s; }
.${cls.chip}:hover:not(:disabled) { border-color: var(--dsw-alias-label-dimmed); }
.${cls.chipOn} { border-color: transparent; background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-interactive-bg-hover)); color: var(--dsw-alias-label-primary); }
.${cls.chipOn}:hover:not(:disabled) { border-color: transparent; }
.${cls.chip}:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary))); outline-offset: 1px; }
.${cls.chip}:disabled { cursor: default; opacity: .5; }
.${cls.chipMark} { display: none; }
.${cls.chipIcon} { flex: none; width: 14px; height: 14px; margin-left: -2px; color: var(--dsw-alias-label-primary); }
.${cls.chipText} { display: contents; }
.${cls.chipName} { font-size: 13px; line-height: 1; white-space: nowrap; }
.${cls.chipNote} { font-size: 12px; line-height: 1; white-space: nowrap; color: var(--dsw-alias-label-tertiary); }

/* Short number field with its unit inside the border. */
.${cls.numberBox} { flex: none; box-sizing: border-box; display: inline-flex; align-items: center; width: 112px; height: 34px; padding: 0 12px 0 0; border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md, 12px); background: var(--dsw-alias-bg-layer-3); }
.${cls.numberBox}:focus-within { border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.${cls.numberBoxInvalid}, .${cls.numberBoxInvalid}:focus-within { border-color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error)); }
.${cls.numberInput} { flex: 1; min-width: 0; width: 100%; height: 100%; box-sizing: border-box; padding: 0 0 0 12px; border: 0; background: none; outline: none; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); text-align: right; font-variant-numeric: tabular-nums; }
.${cls.numberInput}:disabled { color: var(--dsw-alias-label-tertiary); }
.${cls.numberUnit} { flex: none; padding-left: 6px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }

/* The host's switch, drawn the same way. */
.${cls.switch} { box-sizing: border-box; position: relative; flex: 0 0 auto; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer; }
.${cls.switch}[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.${cls.switch}:disabled { cursor: default; opacity: .5; }
.${cls.switch}:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary))); outline-offset: 2px; }
.${cls.thumb} { display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-label-primary-foreground, #fff); transition: transform .12s; }
.${cls.switch}[aria-checked="false"] .${cls.thumb} { background: var(--dsw-alias-switch-thumb, #fff); }
.${cls.switch}[aria-checked="true"] .${cls.thumb} { transform: translateX(16px); }

/* Buttons: the host's save style; secondary outlined; ghost for reset. */
.${cls.footer} { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 0 4px; border-top: 1px solid var(--dsw-alias-border-l2); }
.${cls.group} > .${cls.footer} { padding: 4px 0 0; border-top: 0; }
.${cls.button} { flex: none; appearance: none; height: 34px; box-sizing: border-box; border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md, 12px); padding: 0 14px; font: inherit; font-size: 13px; line-height: 1.5; white-space: nowrap; cursor: pointer; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
.${cls.button}:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-3)); }
.${cls.buttonPrimary} { border-color: transparent; background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3); }
.${cls.buttonPrimary}:hover:not(:disabled) { background: var(--dsw-alias-label-primary); opacity: .9; }
.${cls.button}:disabled { opacity: .4; cursor: default; }
.${cls.button}:focus-visible, .${cls.buttonGhost}:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary))); outline-offset: 1px; }
.${cls.buttonGhost} { flex: none; appearance: none; height: 34px; border: 0; border-radius: var(--dsw-radius-md, 12px); padding: 0 10px; background: none; font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.${cls.buttonGhost}:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, transparent); color: var(--dsw-alias-label-primary); }
.${cls.buttonGhost}:disabled { opacity: .4; cursor: default; }

.${cls.visuallyHidden} { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.${cls.actions} { flex: none; display: flex; align-items: center; gap: 4px; }

/* A platform row: the whole left side toggles it. */
.${cls.platform} { appearance: none; flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.${cls.platform}:disabled { cursor: default; opacity: .5; }
.${cls.platform}:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary))); outline-offset: 4px; border-radius: 6px; }
.${cls.platform} .${cls.rowText} > span { display: block; }
.${cls.box} { flex: none; box-sizing: border-box; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--dsw-alias-border-l4); border-radius: 5px; background: var(--dsw-alias-bg-layer-3); transition: background .12s, border-color .12s; }
.${cls.platform}:hover:not(:disabled) .${cls.box} { border-color: var(--dsw-alias-label-dimmed); }
.${cls.boxOn}, .${cls.platform}:hover:not(:disabled) .${cls.boxOn} { border-color: var(--dsw-alias-label-primary); background: var(--dsw-alias-label-primary); }
.${cls.boxIcon} { width: 12px; height: 12px; color: var(--dsw-alias-bg-layer-3); }

/* Native select, drawn like the inputs. */
.${cls.selectBox} { flex: none; position: relative; width: 196px; }
.${cls.select} { appearance: none; width: 100%; height: 34px; box-sizing: border-box; padding: 0 32px 0 12px; border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md, 12px); background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; cursor: pointer; }
.${cls.select}:focus-visible { outline: none; border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.${cls.select}:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.${cls.selectChevron} { position: absolute; right: 12px; top: 50%; width: 14px; height: 14px; margin-top: -7px; color: var(--dsw-alias-label-tertiary); pointer-events: none; }

/* Segmented control for a few short options. */
.${cls.segmented} { flex: none; display: inline-flex; padding: 2px; gap: 2px; border: .5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md, 12px); background: var(--dsw-alias-bg-layer-3); }
.${cls.segment} { appearance: none; min-width: 48px; height: 28px; padding: 0 10px; border: 0; border-radius: 9px; background: none; font: inherit; font-size: 13px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.${cls.segment}:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.${cls.segmentOn}, .${cls.segmentOn}:hover:not(:disabled) { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3); }
.${cls.segment}:disabled { cursor: default; opacity: .5; }
.${cls.segment}:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary))); outline-offset: 1px; }

@media (max-width: 560px) {
  .${cls.groupHead} { flex-wrap: wrap; }
  .${cls.rowInline} { flex-direction: column; align-items: stretch; }
  .${cls.numberBox}, .${cls.selectBox} { width: 100%; }
  .${cls.inputRow} { flex-wrap: wrap; }
  .${cls.inputRow} .${cls.input} { flex-basis: 100%; }
}
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
