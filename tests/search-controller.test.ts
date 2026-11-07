import { describe, expect, it } from 'vitest'
import { readSettings, SearchSettingsController } from '../src/client/search-controller.js'
import { fakeForm } from './settings-fixture.js'

describe('readSettings', () => {
  it('falls back field by field, keeps platforms in merge order, and caps counts per platform', () => {
    const plain = readSettings(undefined)
    expect(plain).toMatchObject({ searchSources: ['semantic-scholar'], abstractMaxChars: 600, showCredits: true, readMaxChars: 60_000, citeStyle: 'ieee', drawModel: 'flash31', drawImageSize: '2K' })
    expect(plain.resultsPerSource).toEqual({ 'semantic-scholar': 10, 'pubmed': 10, 'arxiv': 10, 'google-scholar': 10, 'chinese': 10 })
    expect(readSettings({ searchSources: ['google-scholar', 'bing', 'semantic-scholar'] }).searchSources).toEqual(['semantic-scholar', 'google-scholar'])
    // A platform without its own count follows the file-only shared default.
    expect(readSettings({ defaultMaxResults: 20, resultsPerSource: { 'semantic-scholar': 100 } }).resultsPerSource).toEqual({ 'semantic-scholar': 100, 'pubmed': 20, 'arxiv': 20, 'google-scholar': 10, 'chinese': 20 })
    expect(readSettings({ citeStyle: 'bogus', drawImageSize: '8K' })).toMatchObject({ citeStyle: 'ieee', drawImageSize: '2K' })
  })
})

describe('SearchSettingsController', () => {
  it('reports an older host without configuration forms', () => {
    const controller = new SearchSettingsController(() => undefined)
    controller.attach()
    expect(controller.store.getSnapshot().status).toBe('unsupported')
  })

  it('stages edits and writes only the changed fields, per platform, in one fenced mutation', async () => {
    const host = fakeForm()
    const controller = new SearchSettingsController(() => host.form)
    controller.attach()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', dirty: false, overridden: false })

    controller.toggleSource('google-scholar')
    controller.editCount('semantic-scholar', '100')
    controller.edit('citeStyle', 'apa')
    controller.edit('drawImageSize', '4K')
    expect(controller.store.getSnapshot().dirty).toBe(true)
    expect(host.writes).toHaveLength(0) // nothing written until save

    await controller.save()
    expect(host.writes).toEqual([{
      revision: 0,
      ops: [
        { op: 'set', path: ['searchSources'], value: ['semantic-scholar', 'google-scholar'] },
        { op: 'set', path: ['resultsPerSource', 'semantic-scholar'], value: 100 },
        { op: 'set', path: ['citeStyle'], value: 'apa' },
        { op: 'set', path: ['drawImageSize'], value: '4K' },
      ],
    }])
    expect(host.user()).toMatchObject({ resultsPerSource: { 'semantic-scholar': 100 }, citeStyle: 'apa' })
    expect(controller.store.getSnapshot()).toMatchObject({ dirty: false, overridden: true, notice: 'saved', draft: { resultsPerSource: { 'semantic-scholar': '100', 'pubmed': '10' } } })
  })

  it('blocks drafts outside each platform\u2019s cap instead of dropping them', async () => {
    const host = fakeForm()
    const controller = new SearchSettingsController(() => host.form)
    controller.attach()
    controller.editCount('semantic-scholar', '100')
    controller.editCount('google-scholar', '120')
    controller.edit('readMaxChars', '500')
    const { invalid } = controller.store.getSnapshot()
    expect(invalid.resultsPerSource).toEqual({ 'semantic-scholar': false, 'pubmed': false, 'arxiv': false, 'google-scholar': true, 'chinese': false })
    expect(invalid.readMaxChars).toBe(true)
    expect(controller.canSave()).toBe(false)
    await controller.save()
    expect(host.writes).toHaveLength(0)
    controller.toggleSource('semantic-scholar')
    expect(controller.store.getSnapshot().invalid.searchSources).toBe(true)
  })

  it('keeps drafts when the Host refuses, and restores defaults by unsetting what the profile overrides', async () => {
    const refused = fakeForm({}, { refuse: true })
    const a = new SearchSettingsController(() => refused.form)
    a.attach()
    a.edit('showCredits', false)
    await a.save()
    expect(a.store.getSnapshot()).toMatchObject({ notice: 'failed', dirty: true, draft: { showCredits: false } })

    const host = fakeForm({ resultsPerSource: { pubmed: 25 }, drawModel: 'pro' })
    const b = new SearchSettingsController(() => host.form)
    b.attach()
    expect(b.store.getSnapshot()).toMatchObject({ overridden: true, draft: { resultsPerSource: { pubmed: '25' }, drawModel: 'pro' } })
    await b.reset()
    expect(host.writes.at(-1)!.ops).toEqual([{ op: 'unset', path: ['resultsPerSource'] }, { op: 'unset', path: ['drawModel'] }])
    expect(host.user()).toEqual({})
    expect(b.store.getSnapshot()).toMatchObject({ overridden: false, notice: 'reset', draft: { resultsPerSource: { pubmed: '10' }, drawModel: 'flash31' } })
  })

  it('follows Host changes for untouched fields only, and discards on request', async () => {
    const host = fakeForm()
    const controller = new SearchSettingsController(() => host.form)
    controller.attach()
    controller.edit('abstractMaxChars', '100')
    // Another surface writes a different field.
    await host.form.mutate([{ op: 'set', path: ['citeStyle'], value: 'nature' }], 0)
    expect(controller.store.getSnapshot().draft).toMatchObject({ citeStyle: 'nature', abstractMaxChars: '100' })
    controller.discard()
    expect(controller.store.getSnapshot()).toMatchObject({ dirty: false, draft: { abstractMaxChars: '600' } })
  })

  it('disables writes on a read-only document', () => {
    const host = fakeForm({}, { writable: false })
    const controller = new SearchSettingsController(() => host.form)
    controller.attach()
    controller.edit('showCredits', false)
    expect(controller.canSave()).toBe(false)
  })

  it('preserves another surface\u2019s platform counts while saving the edited count', async () => {
    const host = fakeForm()
    const controller = new SearchSettingsController(() => host.form)
    controller.attach()
    controller.editCount('semantic-scholar', '40')
    await host.form.mutate([{ op: 'set', path: ['resultsPerSource', 'pubmed'], value: 25 }], 0)
    expect(controller.store.getSnapshot().draft.resultsPerSource).toMatchObject({ 'semantic-scholar': '40', pubmed: '25' })
    await controller.save()
    expect(host.writes.at(-1)).toEqual({ revision: 1, ops: [{ op: 'set', path: ['resultsPerSource', 'semantic-scholar'], value: 40 }] })
    expect(host.user().resultsPerSource).toEqual({ 'semantic-scholar': 40, pubmed: 25 })
    controller.dispose()
  })
})
