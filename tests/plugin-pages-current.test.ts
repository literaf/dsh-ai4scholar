// @vitest-environment jsdom
/**
 * Mount the built client in the published current Cordis + SlotRegistry.
 * Run with DSH_COMPAT_ROOT pointing to an isolated npm install containing
 * cordis, dsh-client-ui-slots, dsh-client-ui-renderer, and
 * dsh-client-ui-plugin-manager. See the plugin-pages CI job.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement, useSyncExternalStore } from 'react'
import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

const local = createRequire(resolve('package.json'))
const compatRoot = process.env.DSH_COMPAT_ROOT
const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { name: string }
const isScholar = manifest.name === 'dsh-ai4scholar'
const rowId = isScholar ? 'ai4scholar' : 'research-market'

type Entry = { options: { key?: string; id?: string }; component: ComponentType<Record<string, unknown>>; inject: () => Record<string, unknown> }
type Registry = {
  register(options: object, component: () => null): () => void
  entries(name: string): Entry[]
}

function loadClient(path: string, require: (id: string) => unknown): Record<string, unknown> {
  let factory: ((require: (id: string) => unknown) => Record<string, unknown>) | undefined
  new Function('window', readFileSync(path, 'utf8'))({ __ModuleLoader__: { load(entry: { factory: typeof factory }) { factory = entry.factory } } })
  if (factory === undefined) throw new Error('No client factory')
  return factory(require)
}

describe.skipIf(!compatRoot)('published current UI runtime', () => {
  it('mounts native pages before their declarations and removes all contributions on fiber unload', async () => {
    const sdk = createRequire(resolve(compatRoot!, 'package.json'))
    const platform = (id: string) => id.startsWith('react') ? local(id) : sdk(id)
    const { SlotRegistry } = loadClient(sdk.resolve('@deepseek-ai/dsh-client-ui-renderer/client'), platform) as unknown as { SlotRegistry: new (ctx: unknown) => Registry }
    const { Context } = sdk('@deepseek-ai/cordis') as typeof import('@deepseek-ai/cordis')
    const ctx = new Context()
    const slots = new SlotRegistry(ctx)
    const dicts = new Map<string, Record<string, string>>()
    ctx.reflect.provide('locale', {
      register(ns: string, copy: { en: Record<string, string> }) { dicts.set(ns, copy.en); return () => { dicts.delete(ns) } },
      bind: (ns: string) => (key: string) => dicts.get(ns)?.[key] ?? key,
      getLocale: () => ({ active: 'en' }),
      subscribe: () => () => undefined,
    })
    ctx.reflect.provide('remote', { $on: () => () => undefined })
    ctx.reflect.provide('remote.credentials', {
      describe: async () => ({ ok: true, value: { AI4SCHOLAR_API_KEY: { configured: true, writable: true, source: 'file' } } }),
      set: async () => undefined,
      unset: async () => undefined,
    })
    const client = loadClient(resolve('lib/client.js'), platform)
    const fiber = await ctx.plugin(client as { inject: string[]; apply(context: typeof ctx, config: object): void }, {})
    let removeOwner: (() => void) | undefined
    const container = document.createElement('div')
    const root = createRoot(container)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'fixture catalog unavailable' }), { status: 503 })))
    try {
      expect(slots.entries('plugins.bundle.config')).toHaveLength(0)
      // The two kinds/scopes come from the host's published declaration, not
      // this plugin's compatibility types or its legacy SDK.
      const source = readFileSync(sdk.resolve('@deepseek-ai/dsh-client-ui-plugin-manager/client'), 'utf8')
      const children: Record<string, object> = { 'settings.section': { kind: 'list', scope: 'root' } }
      for (const name of ['plugins.bundle.config', 'plugins.row.config']) {
        const escaped = name.replaceAll('.', '\\.')
        const declaration = source.match(new RegExp(`"${escaped}":\\s*(\\{\\s*kind:\\s*"\\w+",\\s*scope:\\s*"[\\w-]+"\\s*\\})`))
        expect(declaration, `published declaration ${name}`).not.toBeNull()
        children[name] = new Function(`return (${declaration![1]})`)() as object
      }
      removeOwner = slots.register({ name: 'root', children }, () => null)
      expect(slots.entries('plugins.bundle.config')[0]?.options.key).toBe(manifest.name)
      expect(slots.entries('plugins.row.config')[0]?.options.key).toBe(`${manifest.name}#${rowId}`)
      expect(slots.entries('settings.section')[0]?.options.id).toBe(rowId)
      expect(slots.entries('settings.plugin.item')).toHaveLength(0)
      await act(async () => {
        const entries = ['plugins.bundle.config', 'plugins.row.config', 'settings.section'].map((name) => slots.entries(name)[0]!)
        root.render(createElement('div', {}, ...entries.map((entry, key) => {
          const { hooks, ...actions } = entry.inject()
          const props: Record<string, unknown> = { key, view: 'page', ...actions, t: (key: string) => [...dicts.values()][0]?.[key] ?? key }
          for (const [name, store] of Object.entries(hooks as Record<string, { subscribe(fn: () => void): () => void; getSnapshot(): unknown }>)) {
            props[`use${name[0]!.toUpperCase()}${name.slice(1)}`] = (select: (state: unknown) => unknown) => useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))
          }
          return createElement(entry.component, props)
        })))
      })
      if (isScholar) {
        expect(container.querySelectorAll('input[type="password"]')).toHaveLength(3)
        expect(container.textContent).toContain('Configured via')
      } else {
        expect(container.querySelectorAll('input')).toHaveLength(3)
        expect(container.textContent).toContain('Research plugins')
        expect(container.textContent).toContain('fixture catalog unavailable')
      }
      // Removing the owner's declaration also removes the injected pages;
      // redeclaring it must re-register them exactly once.
      removeOwner()
      expect(slots.entries('plugins.bundle.config')).toHaveLength(0)
      removeOwner = slots.register({ name: 'root', children }, () => null)
      expect(slots.entries('plugins.bundle.config')).toHaveLength(1)
      await act(async () => { root.unmount() })
      await fiber.dispose()
      for (const name of Object.keys(children)) expect(slots.entries(name)).toHaveLength(0)
      expect(dicts.size).toBe(0)
      expect(document.querySelector(`style[data-plugin="${manifest.name}"]`)).toBeNull()
    } finally {
      await act(async () => { root.unmount() })
      await fiber.dispose()
      removeOwner?.()
      vi.unstubAllGlobals()
    }
  })
})
