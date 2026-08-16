/**
 * Parse the `/ai4scholar` command result (the Node half's `Label: value`
 * lines) into the fields the balance card renders. Framework-neutral.
 */

/** Structured view of one balance report. */
export interface BalanceView {
  available?: string
  permanent?: string
  memberMonthly?: string
  membership?: string
  keySpent?: string
  keyCap?: string
  sessionSpent?: string
  keyStatus?: string
  /** Lines that matched no known label; shown verbatim so nothing is lost. */
  other: string[]
}

const LABELS: Record<string, keyof Omit<BalanceView, 'other'>> = {
  'credits available': 'available',
  'permanent': 'permanent',
  'member monthly remaining': 'memberMonthly',
  'membership': 'membership',
  'api key spent in total': 'keySpent',
  'api key cap': 'keyCap',
  'session spent': 'sessionSpent',
  'api key': 'keyStatus',
}

/**
 * Parse the command text.
 * @param text - `outcome.text` of a settled `/ai4scholar` run.
 * @returns the recognized fields; `available` is undefined when the text is not a balance report.
 */
export function parseBalance(text: string): BalanceView {
  const view: BalanceView = { other: [] }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue
    const m = /^([^:]+):\s*(.*)$/.exec(line)
    const key = m !== null ? LABELS[m[1]!.trim().toLowerCase()] : undefined
    if (m !== null && key !== undefined) view[key] = m[2]!.trim()
    else view.other.push(line)
  }
  return view
}
