import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { RESEARCH_COMMANDS, RESEARCH_TOOL_NAMES, commandHelp, commandIndex } from './shared/commands.js'
import type { ResearchCommand } from './shared/commands.js'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'ai4scholar-command': { kind: 'ai4scholar-command'; form: 'instructions' }
  }
}

/** Feature-aware catalog, shared by discovery, help and command routing. */
export function availableCommands(enabledTools: ReadonlySet<string>): ResearchCommand[] {
  return RESEARCH_COMMANDS.filter((c) => c.tools.some((t) => enabledTools.has(t)))
    .map((c) => ({ ...c, tools: c.tools.filter((t) => enabledTools.has(t)) }))
}

/** The same source rule is checked at execution, including Code Mode subcalls. */
export function sourceDenial(command: ResearchCommand | undefined, name: string): string | undefined {
  if (!command?.source || !RESEARCH_TOOL_NAMES.has(name) || command.tools.includes(name)) return undefined
  return `/${command.name} selected ${command.source}. Use ${command.tools.join(' or ')} for this request. Do not silently switch sources; explain the limitation or ask the user to choose a different command.`
}

function routeFromMessage(message: UserMessage, commands: readonly ResearchCommand[]): ResearchCommand | undefined {
  const first = message.content.find((b) => b.type === 'text')
  if (first?.type !== 'text') return undefined
  const name = /^\/(ai4s-[a-z]+)(?:\s|$)/.exec(first.text)?.[1]
  return commands.find((c) => c.name === name)
}

/** Native slash discovery + a normal queued model turn, preserving tool history. */
export function applyResearchCommands(ctx: Context, enabledTools: ReadonlySet<string>): string {
  const commands = availableCommands(enabledTools)
  const active = new WeakMap<object, ResearchCommand>()
  const seen = new WeakMap<object, Map<string, true>>()

  // Activate a source only when its queued message enters a step, never while
  // an earlier unrelated turn is still running. Plain user followups release it.
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    let command: ResearchCommand | undefined
    for (const message of decision.messages) {
      if (message.source.kind !== 'user') continue
      const route = routeFromMessage(message, commands)
      command = route
      if (route) active.set(payload.agent, route)
      else active.delete(payload.agent)
    }
    if (!command) return decision
    // Some hosts assemble the system header before pre-step. Put guidance in
    // this admitted batch so it reaches the FIRST model request, without
    // exposing implementation instructions in the user's message bubble.
    const guidance = createUserMessage({ source: { kind: 'ai4scholar-command', form: 'instructions' }, content: [{ type: 'text', text: [
      `Current AI4Scholar command: /${command.name}. These instructions apply to the accompanying user request only.`, command.guidance,
      `Available tools for this activity: ${command.tools.join(', ')}.`,
      'Interpret the natural-language request into tool parameters. Before executing, briefly show the understood source, dates, count and material criteria in the user’s language. Inherit configured defaults for omitted criteria. Ask only about conflicting sources, ambiguous identities or missing essential inputs. Do not change global settings.',
      'Preserve returned IDs and pagination state. After results, offer a few applicable next actions in natural language: details, full text, PDF, citations, references, similar papers, author profile or citation formats. Offer only actions supported by returned identifiers and enabled tools. Label actual data sources and credit charges.',
    ].join('\n') }] })
    return { ...decision, messages: [...decision.messages, guidance] }
  })
  ctx.on('agent/status', ({ agent, status }) => { if (status === 'idle') active.delete(agent) })
  const guard = (exec: ToolExecution): string | undefined => sourceDenial(exec.agent ? active.get(exec.agent) : undefined, exec.name)
  if (typeof ctx.tools.guard === 'function') ctx.tools.guard(guard)
  else ctx.on('tools/pre-execute', async (exec, next) => {
    const reason = guard(exec)
    return reason ? { kind: 'deny', reason } : next()
  })

  ctx.inject(['commands'], (child) => {
    for (const command of commands) child.commands.register({
      name: command.name, description: `AI4Scholar · ${command.title} · 后面接自然语言`,
      // rc hosts call this images; newer hosts call it attachments. Each
      // registry snapshots only the flag it understands.
      input: { hint: command.example, images: command.name === 'ai4s-draw', ...{ attachments: command.name === 'ai4s-draw' } },
      async handler(invocation: CommandInvocation) {
        const request = invocation.rawInput.trim()
        const attachments = invocation.attachments ?? []
        if (!request || /^(help|帮助|用法|\?)$/i.test(request)) {
          if (attachments.length) return { kind: 'error', text: '请同时用文字说明如何处理这张图片。' }
          return { kind: 'success', text: commandHelp(command) }
        }
        invocation.signal.throwIfAborted()
        const agent = invocation.agent
        if (typeof agent.followup !== 'function') return { kind: 'error', text: '当前 Harness 版本不支持把研究命令送入对话，请更新 Harness 后重试。' }
        let receipts = seen.get(agent)
        if (!receipts) { receipts = new Map(); seen.set(agent, receipts) }
        const id = String(invocation.commandId)
        if (receipts.has(id)) return { kind: 'success', text: '这条请求已进入当前对话。' }
        const message = createUserMessage({ source: { kind: 'user' as const }, content: [
          { type: 'text' as const, text: `/${command.name} ${request}` },
          ...attachments,
        ] })
        invocation.signal.throwIfAborted()
        agent.followup(message)
        receipts.set(id, true)
        while (receipts.size > 128) receipts.delete(receipts.keys().next().value!)
        return { kind: 'success', text: `${command.title}：${request}\n已加入当前对话；结果出来后可以继续追问。` }
      },
    })
  })
  return commandIndex(commands)
}
