/**
 * Path of the Node half's balance route, shared with the browser half so the
 * settings card can test a saved key without ever holding it.
 */
export const BALANCE_ROUTE = '/ai4scholar/balance'

/** JSON body the balance route answers with (always HTTP 200; `ok` carries the outcome). */
export type BalanceRouteResponse =
  | {
    ok: true
    /** Credits available right now. */
    totalAvailable: number
    permanent: number
    memberMonthlyRemaining: number
    keyCreditsUsed?: number
    keyCreditLimit?: number
    keyCreditsRemaining?: number
    membership?: { plan: string; status: string; periodEnd?: string }
  }
  | {
    ok: false
    /** `MISSING_KEY` when no key is configured; else the API's code or `REQUEST_FAILED`. */
    code: string
    error: string
  }
