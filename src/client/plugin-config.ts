import type { ComponentType } from 'react'
import type { LocaleNamespaceMap, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/** Public owner props consumed from ui-plugin-manager's configuration slots. */
export interface PluginConfigView {
  readonly view: 'summary' | 'page'
}

type ConfigSlot = 'plugins.bundle.config' | 'plugins.row.config'
type CompatibleSlot = ConfigSlot | 'settings.section' | 'settings.plugin.item' | 'conversation.chat.commandview'
type Dispose = () => void

/** Only the command-node fields consumed by our legacy command card. */
export interface CommandView {
  node: { outcome: { kind: string; text?: string } | null }
}

/** The stable getSnapshot/subscribe hook protocol, independent of SDK type re-exports. */
export type InjectedFace<Face extends object> = Face extends { hooks: infer Hooks }
  ? Omit<Face, 'hooks'> & {
    [Key in keyof Hooks & string as `use${Capitalize<Key>}`]:
      <Selected>(selector: (snapshot: Hooks[Key] extends { getSnapshot(): infer T } ? T : never) => Selected) => Selected
  }
  : Face

type Owner<Slot extends CompatibleSlot> = Slot extends ConfigSlot ? PluginConfigView : Slot extends 'conversation.chat.commandview' ? CommandView : object

interface PluginConfigSlots {
  inject(name: CompatibleSlot, callback: () => Dispose): Dispose
  register<Slot extends CompatibleSlot, Face extends object, NS extends keyof LocaleNamespaceMap & string>(options: {
    name: Slot
    key?: string
    id?: string
    order?: number
    label?: () => string
    locale: NS
    inject: () => Face
  }, component: ComponentType<Owner<Slot> & PropsLocale<NS> & InjectedFace<Face>>): Dispose
}

/**
 * The build SDK predates ui-plugin-manager and newer SDKs omit legacy slots.
 * Keep the supported slots' structural contracts local
 * instead of globally redeclaring SlotMap (which would conflict with newer
 * SDKs). Only the documented view/key/locale/inject surface is used; the host
 * still owns declaration, validation, lazy injection, and disposal.
 * @see https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/src/client/slot-contract.ts
 */
export function pluginConfigSlots(slots: unknown): PluginConfigSlots {
  return slots as PluginConfigSlots
}
