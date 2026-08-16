#!/usr/bin/env node
/**
 * Ask npmmirror (registry.npmmirror.com, the default registry for most users
 * in China) to sync this package right now, then wait until the version just
 * published is visible there. Runs as `postpublish`, so `dsh plugin add
 * dsh-ai4scholar` works from either registry within a minute of a release.
 * Never fails the publish: mirror hiccups only print a note.
 */
import { readFileSync } from 'node:fs'

const MIRROR = 'https://registry.npmmirror.com'
const { name, version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const deadline = Date.now() + 5 * 60_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const json = async (url, init) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

try {
  const mirrorHas = async () => {
    const { body } = await json(`${MIRROR}/${name}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } })
    return body?.versions !== undefined && version in body.versions
  }
  if (await mirrorHas()) {
    console.log(`npmmirror already has ${name}@${version}`)
    process.exit(0)
  }
  const { body: task } = await json(`${MIRROR}/-/package/${name}/syncs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skipDependencies: true }),
  })
  console.log(`npmmirror sync requested for ${name}@${version}: task ${task.id ?? '?'} (${task.state ?? '?'})`)
  while (Date.now() < deadline) {
    await sleep(5_000)
    if (await mirrorHas()) {
      console.log(`npmmirror now serves ${name}@${version}`)
      process.exit(0)
    }
    if (task.id !== undefined) {
      const { body: status } = await json(`${MIRROR}/-/package/${name}/syncs/${task.id}`)
      if (status.state === 'fail') {
        console.log(`npmmirror sync task failed: ${status.error ?? 'unknown'} — it will pick the version up on its own schedule.`)
        process.exit(0)
      }
    }
  }
  console.log(`npmmirror has not surfaced ${name}@${version} yet; users can pass --registry https://registry.npmjs.org meanwhile.`)
} catch (error) {
  console.log(`npmmirror sync skipped: ${error instanceof Error ? error.message : String(error)}`)
}
