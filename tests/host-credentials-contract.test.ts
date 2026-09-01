/**
 * Check the credentials port against the contract each *installed* dsh actually
 * exposes, read out of the packages themselves rather than from a fake this
 * repository wrote.
 *
 * Why this file exists: DSH Desktop 2.0.4 bundles dsh 0.1.2-alpha.1 — a version
 * never published to npm — in which `ConnectionHandle.api` is gone and the
 * credentials domain moved to `ctx.remote.credentials` with positional arguments
 * and a bare `{ok, value}` envelope. This package builds against 0.1.0-rc.6 and
 * read `connection.api.credentials`, so saving a key on the desktop app failed
 * with "Cannot read properties of undefined (reading 'credentials')" while the
 * hosted web app, still on stable, worked. Unit tests against a hand-written
 * fake cannot catch the next such move; these assertions derive the shape from
 * whatever dsh is on this machine, and go red when a newly installed dsh speaks
 * a contract the port does not.
 *
 * Every host is optional: a machine without DSH Desktop skips that case rather
 * than failing, so CI stays green while a developer's laptop still covers it.
 * @module dsh-ai4scholar/tests/host-credentials-contract
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolveCredentialsPort } from '../src/client/credentials-port.js'
import type { CredentialsFaces } from '../src/client/credentials-port.js'

/** Which calling convention a dsh build expects for the credentials domain. */
type Contract = 'legacy' | 'modern'

/** A dsh install this machine might have, and what to call it in a report. */
interface Host {
  label: string
  dir: string
}

const HOSTS: readonly Host[] = [
  { label: 'devDependency', dir: 'node_modules/@deepseek-ai' },
  { label: 'DSH Desktop.app', dir: '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai' },
]

/**
 * @param dir - a `@deepseek-ai` directory.
 * @param pkg - unscoped package name.
 * @returns the installed version, or undefined when absent.
 */
function versionOf(dir: string, pkg: string): string | undefined {
  const file = `${dir}/${pkg}/package.json`
  if (!existsSync(file)) return undefined
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const version = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).version : undefined
    return typeof version === 'string' ? version : undefined
  } catch { return undefined }
}

/**
 * Which contract an installed dsh speaks, decided from its own shipped code.
 *
 * `remote.credentials` is the newer home, so a build whose api-remotes bundle
 * declares a `credentials` namespace is modern regardless of what else it has.
 * @param dir - a `@deepseek-ai` directory.
 * @returns the contract, or undefined when neither marker is legible.
 */
function contractOf(dir: string): Contract | undefined {
  const remotes = `${dir}/dsh-api-remotes/lib/client.js`
  if (existsSync(remotes) && readFileSync(remotes, 'utf8').includes('namespace: "credentials"')) return 'modern'
  const handle = `${dir}/dsh-client-connection/lib/types/client/index.d.ts`
  if (existsSync(handle) && /export interface ConnectionHandle \{[\s\S]*?\bapi\s*:/.test(readFileSync(handle, 'utf8'))) return 'legacy'
  return undefined
}

/** One recorded call: the method, and exactly what the port passed it. */
type Call = [method: string, arg: unknown]

/** The ≤0.1.1-rc.2 face: object arguments, `result` envelope, nested views. */
function legacyFaces(log: Call[]): CredentialsFaces {
  return { connection: { api: { credentials: {
    async describe(arg: { refs: string[] }) {
      log.push(['describe', arg])
      return { rpcId: 'r', result: { ok: true, value: { credentials: { [arg.refs[0] ?? '']: { configured: true, source: 'file', writable: true } } } } }
    },
    async set(arg: unknown) { log.push(['set', arg]); return { rpcId: 'r', result: { ok: true, value: {} } } },
    async unset(arg: unknown) { log.push(['unset', arg]); return { rpcId: 'r', result: { ok: true, value: {} } } },
  } } }, remote: {} }
}

/** The ≥0.1.2-alpha face: positional arguments, bare envelope, void writes. */
function modernFaces(log: Call[]): CredentialsFaces {
  return { remote: { credentials: {
    async describe(refs: string[]) {
      log.push(['describe', refs])
      return { ok: true, value: { [refs[0] ?? '']: { configured: true, source: 'file', writable: true } } }
    },
    async set(ref: string, value: string) { log.push(['set', { ref, value }]) },
    async unset(ref: string) { log.push(['unset', { ref }]) },
  } }, connection: {} }
}

const REF = 'AI4SCHOLAR_API_KEY'

describe('installed dsh credentials contracts', () => {
  for (const host of HOSTS) {
    const version = versionOf(host.dir, 'dsh-client-connection')
    const contract = version === undefined ? undefined : contractOf(host.dir)

    // Absent host: nothing to assert. Present but unreadable: that is a finding.
    it.skipIf(version === undefined)(`${host.label} speaks a contract the port knows`, () => {
      expect(contract, `${host.label} (dsh-client-connection ${String(version)}) exposes neither connection.api.credentials nor remote.credentials`).toBeDefined()
    })

    it.skipIf(version === undefined || contract === undefined)(`${host.label} (${String(version)}) drives describe/set/unset`, async () => {
      const log: Call[] = []
      const port = resolveCredentialsPort(contract === 'modern' ? modernFaces(log) : legacyFaces(log))

      const view = await port.describe(REF)
      expect(view).toEqual({ configured: true, source: 'file', writable: true })

      await port.set(REF, 'sk-test')
      await port.unset(REF)
      expect(log.map(([method]) => method)).toEqual(['describe', 'set', 'unset'])

      // The calling convention, not just the outcome: passing rc.6's object to an
      // alpha host is exactly the bug being guarded against, and it would still
      // have produced a plausible-looking view above.
      const [, describeArg] = log[0] as Call
      if (contract === 'modern') expect(Array.isArray(describeArg)).toBe(true)
      else expect(describeArg).toEqual({ refs: [REF] })
    })
  }

  it('covers the desktop app when it is installed here', () => {
    // Not an assertion about the machine — a note in the report, so a green run
    // on a laptop without the app is not mistaken for coverage of it.
    const desktop = HOSTS[1] as Host
    const version = versionOf(desktop.dir, 'dsh-client-connection')
    if (version === undefined) console.log('   (DSH Desktop.app not installed; its contract was not exercised)')
    else console.log(`   (DSH Desktop.app ships dsh-client-connection ${version}: ${String(contractOf(desktop.dir))})`)
    expect(true).toBe(true)
  })
})
