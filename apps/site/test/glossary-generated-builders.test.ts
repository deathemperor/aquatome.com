import { rm } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { expect, test, vi } from 'vitest'
import { CurationSchema, LANGS, type Content, type Lang } from '@aq/schema'
import { slow } from '@aq/schema/test-time'
import { waitingKindPhoto, waitingKindStore } from './helpers/glossary-kind-store'

/** Reload builders under each actual exported switch value, including values captured at module initialization. */
async function output(lang: Lang, content: Content, on: boolean) {
  vi.resetModules()
  vi.doMock('@aq/schema', async original => ({ ...await original<typeof import('@aq/schema')>(), GLOSSARY_KIND_IMAGES: Object.freeze({ on }) }))
  try {
    const schema = await import('@aq/schema')
    expect(schema.GLOSSARY_KIND_IMAGES.on).toBe(on)
    const [{ appIndex }, { glossaryDoc }] = await Promise.all([import('../src/lib/app-index'), import('../src/lib/app-page')])
    const fish = content.species[0]!
    expect(fish).toBeTruthy()
    // Include the address-only calendar path; it must not leak an unlabelled kind stand-in.
    const calendar = CurationSchema.parse({ version: 1, weeks: [], days: [{ date: '2026-11-17', fish: `species/${fish.id}`, img: waitingKindPhoto.url }] })
    const index = appIndex(lang, content, undefined, undefined, { calendar, today: '2026-11-17' })
    expect(index.home.days).toHaveLength(1)
    expect(index.home.days![0]?.img).toBeUndefined()
    const listed = new Set(index.items.map(item => item.path))
    const pages = content.glossary.map(g => glossaryDoc(lang, content, g, listed))
    return { index, pages }
  } finally {
    vi.doUnmock('@aq/schema')
    vi.resetModules()
  }
}

for (const lang of LANGS) test(`${lang}: waiting stand-in, no approvals: both switch settings give identical app index and every glossary page`, async () => {
  const fixture = await waitingKindStore(lang)
  try {
    const off = await fixture.load(false), on = await fixture.load(true)
    for (const content of [off, on]) {
      const term = content.glossary.find(g => g.id === 'lua')!
      expect(term.kinds).toEqual([])
      expect(term.photos).toEqual([])
      expect(content.photoWaits?.(waitingKindPhoto.url)).toBe(true)
    }
    const before = await output(lang, off, false), after = await output(lang, on, true)
    expect(isDeepStrictEqual(after, before)).toBe(true)
    expect(JSON.stringify(after)).not.toContain(waitingKindPhoto.url)
    // Positive admission control: the pending case cannot pass merely because this fixture can never show a stand-in.
    await fixture.approve(true)
    const approved = await fixture.load(true)
    expect(approved.glossary.find(g => g.id === 'lua')?.kinds?.[0]?.photo.url).toBe(waitingKindPhoto.url)
    // The real proof's no-approval premise remains explicit when a later release has real approvals on disk.
    expect((await fixture.load(true, false)).glossary.find(g => g.id === 'lua')?.kinds).toEqual([])
    // Approved site-only kind pictures also stay out of app output, under either builder module setting.
    for (const flag of [false, true]) expect(isDeepStrictEqual(await output(lang, approved, flag), before)).toBe(true)
  } finally { await rm(fixture.dir, { recursive: true, force: true }) }
}, slow(30_000))
