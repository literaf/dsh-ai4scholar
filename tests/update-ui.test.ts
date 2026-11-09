// @vitest-environment jsdom
import { act, createElement } from 'react'
import type { ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateCheck } from '../src/client/UpdateCheck.js'
import { zh } from '../src/client/locales.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => vi.unstubAllGlobals())

async function mount() {
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  const openPluginManager = vi.fn(() => true)
  const props: ComponentProps<typeof UpdateCheck> = { t: (key) => (zh as Record<string, string>)[key] ?? key, openPluginManager }
  await act(async () => root.render(createElement(UpdateCheck, props)))
  return { element, openPluginManager,
    async click(text: string) {
      const button = [...element.querySelectorAll('button')].find((b) => b.textContent === text || b.getAttribute('aria-label') === text)
      expect(button, text).toBeDefined()
      await act(async () => button!.click())
    },
    async dispose() { await act(async () => root.unmount()); element.remove() },
  }
}
const ready = (status: 'available' | 'current' | 'ahead' = 'available') => Response.json({ ok: true, value: { currentVersion: '0.6.0-beta.1', latestVersion: '0.6.0', status } })

describe('workbench update control', () => {
  it('checks only on click and offers explicit navigation without starting an installation', async () => {
    const fetch = vi.fn(async () => ready())
    vi.stubGlobal('fetch', fetch)
    const ui = await mount()
    try {
      expect(fetch).not.toHaveBeenCalled()
      await ui.click('检查更新')
      expect(ui.element.textContent).toContain('发现新版本')
      expect(ui.element.textContent).toContain('v0.6.0-beta.1')
      expect(ui.element.textContent).toContain('v0.6.0')
      expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭')
      expect(ui.openPluginManager).not.toHaveBeenCalled()
      await ui.click('管理插件')
      expect(ui.openPluginManager).toHaveBeenCalledOnce()
      expect(fetch).toHaveBeenCalledOnce()
      await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
      expect(ui.element.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement?.textContent).toBe('检查更新')
    } finally { await ui.dispose() }
  })

  it('reports registry failures, retries, and never offers a downgrade for a newer local build', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ready('ahead'))
    vi.stubGlobal('fetch', fetch)
    const ui = await mount()
    try {
      await ui.click('检查更新')
      expect(ui.element.textContent).toContain('检查失败')
      await ui.click('重试')
      expect(ui.element.textContent).toContain('当前版本领先于最新正式版')
      expect(ui.element.textContent).not.toContain('管理插件')
      expect(fetch).toHaveBeenCalledTimes(2)
    } finally { await ui.dispose() }
  })

  it('aborts a dismissed check and ignores its late answer after a new check', async () => {
    let finish: (value: Response) => void = () => {}
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve })).mockResolvedValueOnce(ready('current'))
    vi.stubGlobal('fetch', fetch)
    const ui = await mount()
    try {
      await ui.click('检查更新')
      expect(ui.element.textContent).toContain('正在检查')
      const signal = (fetch.mock.calls[0]![1] as RequestInit).signal!
      await ui.click('关闭')
      expect(signal.aborted).toBe(true)
      await ui.click('检查更新')
      await act(async () => finish(ready('available')))
      expect(ui.element.textContent).toContain('已是最新正式版')
      expect(ui.element.textContent).not.toContain('发现新版本')
    } finally { await ui.dispose() }
  })

  it('handles a missing host route and malformed replies without claiming success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('<html>missing</html>', { status: 404 })).mockResolvedValueOnce(Response.json({ ok: true })))
    const ui = await mount()
    try {
      await ui.click('检查更新')
      expect(ui.element.textContent).toContain('当前宿主暂不支持')
      await ui.click('重试')
      expect(ui.element.textContent).toContain('检查失败')
    } finally { await ui.dispose() }
  })
})
