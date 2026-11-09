import { describe, expect, it, vi } from 'vitest'
import { WorkbenchController } from '../src/client/workbench-controller.js'
import type { WorkbenchCatalog, WorkbenchRequest, WorkbenchResponse, WorkbenchResult } from '../src/shared/workbench.js'

const catalog: WorkbenchCatalog = {
  defaultSource: 'semantic-scholar',
  sources: [
    { id: 'semantic-scholar', defaultLimit: 10, maxLimit: 100, needsKey: true },
    { id: 'arxiv', defaultLimit: 25, maxLimit: 100, needsKey: false },
  ],
}
const result = (query: string, offset = 0): WorkbenchResult => ({
  source: 'semantic-scholar',
  query,
  items: [{ id: String(offset), source: 'semantic-scholar', kind: 'paper', title: query, authors: [] }],
  next: { offset: offset + 10 },
})
type Response = WorkbenchResponse<WorkbenchCatalog | WorkbenchResult>

describe('workbench request lifecycle', () => {
  it('uses submitted parameters for paging, reuses cached pages, and restores a source’s results', async () => {
    const fetch = vi.fn(
      async (body: WorkbenchRequest | undefined): Promise<Response> => ({
        ok: true,
        value: body ? result(body.query, body.offset) : catalog,
      }),
    )
    const controller = new WorkbenchController(fetch)
    await controller.attach()
    controller.edit({ query: 'original', yearFrom: '2020' })
    await controller.search()
    controller.edit({ query: 'unfinished next query', yearFrom: '2024', limit: 50 })
    await controller.next()
    expect(fetch.mock.calls[2]?.[0]).toMatchObject({ query: 'original', yearFrom: 2020, limit: 10, offset: 10 })
    controller.previous()
    await controller.next()
    expect(fetch).toHaveBeenCalledTimes(3)
    controller.choose('arxiv')
    expect(controller.store.getSnapshot().draft.limit).toBe(25)
    expect(controller.store.getSnapshot().pages).toHaveLength(0)
    controller.choose('semantic-scholar')
    expect(controller.store.getSnapshot().pageIndex).toBe(1)
    expect(controller.store.getSnapshot().draft.query).toBe('unfinished next query')
    expect(controller.store.getSnapshot().pages).toHaveLength(2)
    controller.dispose()
  })

  it('ignores out-of-order and cancelled responses even when the transport ignores cancellation', async () => {
    const pending: Array<(response: Response) => void> = []
    const fetch = vi.fn(
      (body: WorkbenchRequest | undefined): Promise<Response> =>
        body ? new Promise((resolve) => pending.push(resolve)) : Promise.resolve({ ok: true, value: catalog }),
    )
    const controller = new WorkbenchController(fetch)
    await controller.attach()
    controller.edit({ query: 'slow' })
    const slow = controller.search()
    controller.edit({ query: 'fast' })
    const fast = controller.search()
    pending[1]!({ ok: true, value: result('fast') })
    await fast
    pending[0]!({ ok: true, value: result('slow') })
    await slow
    expect(controller.store.getSnapshot().pages[0]?.result.query).toBe('fast')
    const cancelled = controller.search()
    controller.cancel()
    pending[2]!({ ok: true, value: result('cancelled') })
    await cancelled
    expect(controller.store.getSnapshot().pages[0]?.result.query).toBe('fast')
    expect(controller.store.getSnapshot().busy).toBe(false)
    controller.dispose()
  })

  it('recovers the catalog after temporary unavailability without leaving a stale error', async () => {
    let available = false
    const controller = new WorkbenchController(async () => {
      if (!available) throw new Error('offline')
      return { ok: true, value: catalog }
    })
    await controller.attach()
    expect(controller.store.getSnapshot().error).toBe('offline')
    available = true
    await controller.attach()
    expect(controller.store.getSnapshot().error).toBeUndefined()
    expect(controller.store.getSnapshot().catalog).toEqual(catalog)
    controller.dispose()
  })

  it('applies updated shared defaults while preserving an explicit per-search count', async () => {
    let defaultLimit = 10
    const controller = new WorkbenchController(async () => ({
      ok: true,
      value: { ...catalog, sources: catalog.sources.map((s) => ({ ...s, defaultLimit })) },
    }))
    await controller.attach()
    defaultLimit = 5
    await controller.attach()
    expect(controller.store.getSnapshot().draft.limit).toBe(5)
    controller.edit({ limit: 12 })
    defaultLimit = 20
    await controller.attach()
    expect(controller.store.getSnapshot().draft.limit).toBe(12)
    controller.dispose()
  })
})
