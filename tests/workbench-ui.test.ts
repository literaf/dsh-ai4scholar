// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore } from 'react'
import type { ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { Ai4ScholarWorkbench } from '../src/client/Workbench.js'
import { WorkbenchController } from '../src/client/workbench-controller.js'
import { zh } from '../src/client/locales.js'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('workbench browser controls', () => {
  it('cancels without the changing button type accidentally submitting another search', async () => {
    const controller = new WorkbenchController()
    controller.store.set({
      ...controller.store.getSnapshot(),
      loading: false,
      busy: true,
      catalog: {
        defaultSource: 'semantic-scholar',
        sources: [{ id: 'semantic-scholar', defaultLimit: 10, maxLimit: 100, needsKey: true }],
      },
      draft: { query: 'slow', limit: 10, yearFrom: '', yearTo: '', days: 30, sort: 'relevance' },
    })
    const search = vi.fn()
    const cancel = vi.fn(() => controller.cancel())
    const props: ComponentProps<typeof Ai4ScholarWorkbench> = {
      t: (key, params) =>
        ((zh as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_: string, name: string) =>
          String(params?.[name] ?? `{${name}}`),
        ),
      useWorkbench: (select) =>
        useSyncExternalStore(controller.store.subscribe, () => select(controller.store.getSnapshot())),
      useCard: (select) =>
        select({
          ref: 'AI4SCHOLAR_API_KEY',
          loaded: true,
          configured: true,
          writable: true,
          revision: 0,
          draft: '',
          busy: false,
        }),
      useSearch: () => {
        throw new Error('Settings are not open')
      },
      attachWorkbench: vi.fn(),
      refresh: vi.fn(),
      searchWorkbench: search,
      cancelWorkbench: cancel,
      editWorkbench: (patch) => controller.edit(patch),
      chooseSource: vi.fn(),
      previousPage: vi.fn(),
      nextPage: vi.fn(),
      selectPaper: vi.fn(),
      openPluginManager: vi.fn(() => false),
      edit: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      testKey: vi.fn(),
      attachSearch: vi.fn(),
      toggleSource: vi.fn(),
      editCount: vi.fn(),
      editSearch: vi.fn(),
      saveSearch: vi.fn(),
      resetSearch: vi.fn(),
      discardSearch: vi.fn(),
    }
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    try {
      await act(async () => root.render(createElement(Ai4ScholarWorkbench, props)))
      const button = element.querySelector<HTMLButtonElement>('button[aria-label="取消"]')!
      await act(async () => button.click())
      expect(cancel).toHaveBeenCalledOnce()
      expect(search).not.toHaveBeenCalled()
      expect(controller.store.getSnapshot().busy).toBe(false)
      expect(element.querySelector('button[aria-label="搜索"]')).not.toBeNull()
    } finally {
      await act(async () => root.unmount())
      element.remove()
      controller.dispose()
    }
  })
})
