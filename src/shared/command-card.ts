import type { UnifiedSource } from './search-settings.js'

/** Owner-authenticated local metadata; reading this never calls AI4Scholar. */
export const COMMAND_CARD_ROUTE = '/api/ai4scholar/command-card'
export interface CommandMenuEntry { name: string; title: string; example?: string }
export interface CommandCardCatalog {
  enabled: boolean
  commands: CommandMenuEntry[]
  defaults: Array<{ source: UnifiedSource; count: number }>
}
