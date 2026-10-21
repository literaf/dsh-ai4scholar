import type { ComponentType } from 'react'
import type { InjectFace, LocaleNamespaceMap, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/** Public owner props consumed from ui-plugin-manager's configuration slots. */
export interface PluginConfigView {
  readonly view: 'summary' | 'page'
}

type ConfigSlot = 'plugins.bundle.config' | 'plugins.row.config'
type Dispose = () => void

interface PluginConfigSlots {
  inject(name: ConfigSlot, callback: () => Dispose): Dispose
  register<Face extends object, NS extends keyof LocaleNamespaceMap & string>(options: {
    name: ConfigSlot
    key: string
    locale: NS
    inject: () => Face
  }, component: ComponentType<PluginConfigView & PropsLocale<NS> & InjectFace<Face>>): Dispose
}

/**
 * The build SDK predates ui-plugin-manager. Keep its additive contract local
 * instead of globally redeclaring SlotMap (which would conflict with newer
 * SDKs). Only the documented view/key/locale/inject surface is used; the host
 * still owns declaration, validation, lazy injection, and disposal.
 * @see https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/src/client/slot-contract.ts
 */
export function pluginConfigSlots(slots: unknown): PluginConfigSlots {
  return slots as PluginConfigSlots
}
