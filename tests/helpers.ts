import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { PromptSection } from '@deepseek-ai/dsh-system-prompt'
import { apply, Config } from '../src/index.js'
import type { Config as ConfigType } from '../src/index.js'

/** A minimal stand-in for the plugin context: captures registrations, serves a fixed API key. */
export interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => void | Promise<void>
}

export interface FakeContext {
  ctx: Context
  tools: Map<string, ToolDefinition>
  sections: PromptSection[]
  commands: Map<string, CommandDefinition>
  routes: Map<string, FakeRoute>
  settingsNamespaces: Map<string, unknown>
  /** Tear the fiber down the way cordis does on unload, running every effect disposer. */
  dispose: () => void
}

export function fakeContext(options: { apiKey?: string | undefined; credentialsSeam?: boolean; commands?: boolean; webServer?: boolean; settings?: boolean; sharedRoutes?: Map<string, FakeRoute> } = {}): FakeContext {
  const tools = new Map<string, ToolDefinition>()
  const sections: PromptSection[] = []
  const commands = new Map<string, CommandDefinition>()
  // The host owns the route table, not the plugin: pass one in to model two fibers
  // of the same plugin meeting the same web server across a remount.
  const routes = options.sharedRoutes ?? new Map<string, FakeRoute>()
  const settingsNamespaces = new Map<string, unknown>()
  // Disposers cordis would own: `ctx.effect(body)` runs the body and keeps what it
  // returns until the fiber is torn down.
  const effects: (() => void)[] = []
  const apiKey = options.apiKey
  const credentials = options.credentialsSeam === false
    ? undefined
    : {
      resolve: async () => (apiKey !== undefined ? { value: apiKey, source: 'env' } : undefined),
    }
  const ctx = {
    tools: {
      register(definition: ToolDefinition) {
        if (tools.has(definition.name)) throw new Error(`duplicate tool ${definition.name}`)
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    systemPrompt: {
      section(section: PromptSection) {
        sections.push(section)
        return () => undefined
      },
    },
    get(name: string) {
      return name === 'credentials' ? credentials : undefined
    },
    // Cordis `ctx.effect(body, label)`: run the body now, hold its disposer until disposal.
    effect(body: () => (() => void) | void) {
      const disposer = body()
      if (typeof disposer === 'function') effects.push(disposer)
      return () => undefined
    },
    // Cordis `ctx.inject(deps, cb)`: run the callback when the services exist (each optional service is opt-out for tests).
    inject(deps: string[], callback: (child: unknown) => void) {
      if (deps.includes('commands') && options.commands === false) return
      if (deps.includes('webServer') && options.webServer === false) return
      if (deps.includes('settings') && options.settings === false) return
      callback({
        ...ctx,
        settings: {
          register(namespace: string, schema: unknown) {
            settingsNamespaces.set(namespace, schema)
            return { get: () => ({}), watch: () => () => undefined }
          },
        },
        commands: {
          register(definition: CommandDefinition) {
            if (commands.has(definition.name)) throw new Error(`duplicate command ${definition.name}`)
            commands.set(definition.name, definition)
            return () => commands.delete(definition.name)
          },
        },
        webServer: {
          register(route: FakeRoute) {
            if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
            routes.set(route.path, route)
            return () => routes.delete(route.path)
          },
        },
      })
    },
  } as unknown as Context
  const dispose = (): void => {
    while (effects.length > 0) effects.pop()?.()
  }
  return { ctx, tools, sections, commands, routes, settingsNamespaces, dispose }
}

/** Mount the plugin with schemastery defaults applied over `overrides`. */
export function mount(overrides: Partial<ConfigType> = {}, options: { apiKey?: string | undefined; credentialsSeam?: boolean; commands?: boolean; webServer?: boolean; settings?: boolean; sharedRoutes?: Map<string, FakeRoute> } = { apiKey: 'test-key' }): FakeContext {
  const fake = fakeContext(options)
  const config = new Config(overrides)
  apply(fake.ctx, config)
  return fake
}

/** A run context carrying only what the tools read: an abort signal. */
export function runContext(signal: AbortSignal = new AbortController().signal): ToolRunContext {
  return { signal } as unknown as ToolRunContext
}

/** Install a `fetch` stub answering from a routing table; records every request. */
export interface StubbedFetch {
  calls: Array<{ url: URL; method: string; headers: Record<string, string>; body: unknown }>
  restore(): void
}

export interface StubAnswer {
  status?: number
  json?: unknown
  text?: string
  headers?: Record<string, string>
  bytes?: Uint8Array
  contentType?: string
  /** Simulated final URL after redirects. */
  url?: string
}

export function stubFetch(
  route: (url: URL, init: RequestInit) => StubAnswer | Promise<StubAnswer>,
): StubbedFetch {
  const calls: StubbedFetch['calls'] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as unknown : undefined
    calls.push({ url, method: init.method ?? 'GET', headers, body })
    const answer = await route(url, init)
    const status = answer.status ?? 200
    const payload: BodyInit = answer.bytes !== undefined ? new Blob([answer.bytes as unknown as ArrayBuffer]) : answer.text ?? JSON.stringify(answer.json ?? {})
    const response = new Response(payload, {
      status,
      headers: { 'Content-Type': answer.contentType ?? (answer.bytes !== undefined ? 'application/pdf' : 'application/json'), ...(answer.headers ?? {}) },
    })
    if (answer.url !== undefined) Object.defineProperty(response, 'url', { value: answer.url })
    return response
  }) as typeof fetch
  return { calls, restore: () => { globalThis.fetch = original } }
}

export function textOf(blocks: ReturnType<ToolDefinition['output']['render']>): string {
  return blocks.map((b) => (b.type === 'text' ? b.text : `[${b.type}]`)).join('\n')
}
