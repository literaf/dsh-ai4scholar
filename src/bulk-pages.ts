import { randomUUID } from 'node:crypto'

const PREFIX = 'ai4s-bulk:'

interface Page<T> {
  rows: readonly T[]
  total: number
  next: string | undefined
  query: string
  owner: object | undefined
  expires: number
}

export interface BulkSlice<T> {
  papers: T[]
  total: number
  nextToken?: string
  truncated: boolean
}

/**
 * Preserve the unshown part of an upstream bulk page. Cursors are scoped to
 * the calling agent and query; replaying one does not repeat a paid request.
 * Bounded, short-lived memory is deliberately not a persistent paper library.
 */
export class BulkPageCache<T> {
  private readonly pages = new Map<string, Page<T>>()

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 15 * 60_000,
    private readonly maxPages = 32,
  ) {}

  private prune(): void {
    for (const [key, page] of this.pages) if (page.expires <= this.now()) this.pages.delete(key)
  }

  private slice(key: string, page: Page<T>, offset: number, size: number): BulkSlice<T> {
    const papers = page.rows.slice(offset, offset + size)
    const end = offset + papers.length
    const nextToken = end < page.rows.length ? `${PREFIX}${key}:${end}` : page.next
    return {
      papers, total: page.total, truncated: nextToken !== undefined,
      ...(nextToken !== undefined ? { nextToken } : {}),
    }
  }

  /** Return a local continuation, or undefined for a platform-owned token. */
  read(token: string | undefined, query: string, owner: object | undefined, size: number): BulkSlice<T> | undefined {
    if (!token?.startsWith(PREFIX)) return undefined
    this.prune()
    const match = /^ai4s-bulk:([a-f0-9-]{36}):(\d+)$/.exec(token)
    const page = match !== null ? this.pages.get(match[1]!) : undefined
    if (page === undefined) throw new Error('This bulk-search cursor has expired. Restart the search to obtain a new page.')
    if (page.owner !== owner || page.query !== query) throw new Error('This bulk-search cursor belongs to another conversation or query. Keep the original query and filters.')
    const offset = Number(match![2])
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= page.rows.length) throw new Error('Invalid bulk-search cursor offset.')
    return this.slice(match![1]!, page, offset, size)
  }

  /** Keep a fetched page only when its first visible slice leaves rows behind. */
  first(rows: readonly T[], total: number, next: string | undefined, query: string, owner: object | undefined, size: number): BulkSlice<T> {
    this.prune()
    const page: Page<T> = { rows, total, next, query, owner, expires: this.now() + this.ttlMs }
    if (rows.length <= size) return this.slice('', page, 0, size)
    while (this.pages.size >= this.maxPages) this.pages.delete(this.pages.keys().next().value!)
    const key = randomUUID()
    this.pages.set(key, page)
    return this.slice(key, page, 0, size)
  }
}
