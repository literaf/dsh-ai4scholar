import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export type DraftResult = 'filled' | 'busy' | 'unavailable'
interface SessionInput {
  state: { getSnapshot(): { draft: string; phase: string } }
  setDraft(text: string): void
  focus?(): void
}

/** Address the originating session; never submit or replace an existing draft. */
export function fillConversationDraft(ctx: ClientContext, sessionId: string, text: string): DraftResult {
  const sessions = ctx.get('sessions') as unknown as { binding(id: string): { ctx: ClientContext } | undefined } | undefined
  const conversation = ctx.get('conversation') as unknown as { input: { for(ctx: ClientContext): SessionInput } } | undefined
  const binding = sessions?.binding(sessionId)
  if (!binding || !conversation) return 'unavailable'
  try {
    const input = conversation.input.for(binding.ctx)
    const state = input.state.getSnapshot()
    if (state.draft.trim() || ['submitting', 'adjudicating', 'submitted'].includes(state.phase)) return 'busy'
    input.setDraft(text)
    if (input.state.getSnapshot().draft !== text) return 'busy'
    input.focus?.()
    return 'filled'
  } catch { return 'unavailable' }
}
