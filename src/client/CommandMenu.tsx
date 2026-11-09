import type { CommandMenuEntry } from '../shared/command-card.js'
import { cls } from './styles.js'

/** The same four-column menu in the manual account card and automatic tail. */
export function CommandMenu({ commands, choose }: { commands: readonly CommandMenuEntry[]; choose?: (name: string) => void }) {
  return <dl className={cls.cmdCommands}>{commands.map(command => <div key={command.name}>
    <dt>{choose
      ? <button type="button" className={cls.cmdChoice} title={command.example} aria-label={`/${command.name}: ${command.title}`} onClick={() => choose(command.name)}><code>/{command.name}</code></button>
      : <code>/{command.name}</code>}</dt>
    <dd>{command.title}</dd>
  </div>)}</dl>
}
