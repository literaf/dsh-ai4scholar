/**
 * dsh-ai4scholar, browser half. Contributes one card to Settings → Plugins
 * that stores the AI4Scholar API key through the dsh credentials domain —
 * the same wire calls the Models page uses for provider keys — so users
 * configure the plugin without touching files. The Node half (`../index.ts`)
 * resolves the same reference per tool call, so a saved key applies to the
 * next call without a restart.
 * @module dsh-ai4scholar/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the SlotMap merge declaring `settings.plugin.item`.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
// Type-only: the SlotMap merge declaring `conversation.chat.commandview`.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the locale runtime's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.remote merge and the forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { ApiKeyCardController } from './controller.js'
import { resolveCredentialsPort } from './credentials-port.js'
import { Ai4ScholarCard } from './Card.js'
import type { Ai4ScholarCardFace } from './Card.js'
import { Ai4ScholarCommandCard } from './CommandCard.js'
import type { Ai4ScholarCommandFace } from './CommandCard.js'
import { NS, en, zh } from './locales.js'
import { installStyles } from './styles.js'

export type { ApiKeyCardState } from './controller.js'
export { ApiKeyCardController, createCardStore } from './controller.js'
export type { Ai4ScholarCardFace, Ai4ScholarCardProps } from './Card.js'
export type { Ai4ScholarCommandFace, Ai4ScholarCommandCardProps } from './CommandCard.js'
export { parseBalance } from './balance.js'
export type { BalanceView } from './balance.js'

/**
 * Credential reference the card edits. The browser Loader creates client
 * entries without the row config, so this mirrors the Node half's default
 * `apiKeyEnv`; a deployment overriding that field manages its key outside the
 * card (documented limitation).
 */
export const API_KEY_REF = 'AI4SCHOLAR_API_KEY'

/** Services required before `apply` runs — all provided by the dsh web app composition. */
export const inject = ['slots', 'connection', 'locale', 'remote']

/**
 * Register the dictionaries, the stylesheet, and the settings card. Every
 * registration is an effect on the plugin fiber, so unloading (or HMR) removes
 * the card, its copy, and its styles together.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ai4scholar: copy dictionaries')
  ctx.effect(() => installStyles(), 'ai4scholar: settings card styles')

  // Resolved per call, not captured here: dsh 0.1.2-alpha removed
  // `connection.api` and moved credentials to a `remote.credentials` service, so
  // the face that exists depends on the build the plugin is loaded into. Reading
  // it at apply() time is what made the desktop app report
  // "Cannot read properties of undefined (reading 'credentials')".
  //
  // Both faces are fetched with `ctx.get()`, which reads cordis's flat service
  // store without the inject requirement — absent names come back undefined.
  // `ctx.remote.credentials` would NOT work here even though `remote` is
  // injected: `remote` is a Service whose sub-domains are separate store entries
  // under dotted names, and its traceable proxy turns that property read into a
  // guarded `Reflect.get(ctx, 'remote.credentials')`, which throws
  // "cannot get property "remote.credentials" without inject". Injecting that
  // name instead would gate apply() on every host that lacks the service.
  const controller = new ApiKeyCardController(
    () => resolveCredentialsPort({
      connection: ctx.get('connection'),
      remoteCredentials: ctx.get('remote.credentials'),
    }),
    API_KEY_REF,
  )
  void controller.refresh()

  // A key written on another surface (env, file, another tab) is only visible
  // through this forwarded event; the section publishes nothing for it. The
  // event was renamed in 0.1.2-alpha, so both names are subscribed — an unknown
  // name is inert on the host that does not forward it, and registering only the
  // right one would need a version probe for no gain.
  // The cast covers `credentials/reference-updated`, which the rc.6 event union
  // this package builds against does not declare yet. Subscribing to a name a
  // host does not forward is inert, so the cast costs nothing on either build.
  type CredentialEvent = Parameters<typeof ctx.remote.$on>[0]
  for (const event of ['credentials/updated', 'credentials/reference-updated']) {
    ctx.effect(
      () => ctx.remote.$on(event as CredentialEvent, (changed: string) => { controller.onCredentialUpdated(changed) }),
      `ai4scholar: credential invalidations (${event})`,
    )
  }

  const face = (): Ai4ScholarCardFace => ({
    hooks: { card: controller.store },
    edit: (text) => { controller.edit(text) },
    save: () => { void controller.save() },
    remove: () => { void controller.remove() },
    refresh: () => { void controller.refresh() },
    testKey: () => { void controller.testKey() },
  })

  // dsh ≤0.1.0-rc.6 declares `settings.plugin.item` as a list slot — register
  // throws without `id`. rc.7 redeclared it keyed by the settings namespace
  // the card edits — register throws without `key`, and because loader
  // entries apply at boot, that single throw took the whole web client down
  // ("failed to apply loader entry … requires options.key"). Each kind checks
  // only its own field and ignores the other, and register copies through
  // whichever is present, so sending both works on every dsh this package
  // supports. The `key` value must equal the namespace the host half registers
  // with the settings service, or the keyed slot never dispatches the card.
  //
  // Which pair the *types* accept flips with the slot's declared kind, so the
  // spread always hides the pair belonging to the other kind. This package now
  // builds against 0.1.1-rc.2, where the slot is keyed: `key` is the declared
  // field and the list pair (`id`/`order`) is what has to hide. `order` is the
  // list host's display position; the keyed host has no use for it and reads
  // nothing in its place, so no `priority` is sent.
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'ai4scholar',
    locale: NS,
    inject: face,
    ...({ id: 'ai4scholar', order: 100 } as object),
  }, Ai4ScholarCard))

  // The `/ai4scholar` command row: a balance card instead of the generic
  // monospace command card. Keyed by command name; the generic card stays the
  // fallback for every other command.
  ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
    name: 'conversation.chat.commandview',
    key: 'ai4scholar',
    locale: NS,
    inject: (): Ai4ScholarCommandFace => ({ topUpUrl: 'https://ai4scholar.net?src=dsh' }),
  }, Ai4ScholarCommandCard))
}
