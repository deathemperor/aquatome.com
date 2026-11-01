import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { cardGaps } from '../src/card-fill'

const FULL = { tempC: { min: 22, max: 26 }, ph: { min: 6, max: 7 }, gh: { min: 2, max: 10 }, sizeCm: 4, tankCm: 60, difficulty: 2 }
const cardOf = (source: string, figures: Record<string, unknown>) => Object.fromEntries(Object.entries(figures).map(([f, value]) => [f, [{ source, value }]]))

test('pages whose card, as a public build shows it, lacks a figure: most popular first', async () => {
  const root = await mkdtemp(join(tmpdir(), 'card-fill-'))
  await mkdir(join(root, 'species'), { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(root, 'sources.json'))
  const page = async (id: string, sections: { source: string; html: string }[], dataCard: object, vi = true) => {
    await mkdir(join(root, 'species', id))
    await writeFile(join(root, 'species', id, 'entity.json'), JSON.stringify({ id, dataCard, sections: sections.map(s => ({ key: 'aquariumSize', sourceUrl: 'https://x', ...s })) }))
    if (vi) await writeFile(join(root, 'species', id, 'vi.json'), JSON.stringify({ name: id }))
  }
  await page('full-card', [{ source: 'seriouslyfish', html: '<p>Aquarium base: 60 × 30 cm.</p>' }], cardOf('seriouslyfish', FULL))
  // The Spruce Pets' "10 gallons (about 38 litres)" once became 40 cm: the build drops it, so the page has no tank length.
  await page('betta-splendens', [{ source: 'sprucepets', html: '<p>Minimum tank size: 10 gallons (about 38 litres).</p>' }], cardOf('sprucepets', FULL))
  // A temperature from a source published for its photos only is no figure a page shows.
  await page('alpha-fish', [{ source: 'glaser', html: '<p>A note.</p>' }], { ...cardOf('glaser', { ...FULL, tempC: undefined }), tempC: [{ source: 'diendancacanh', value: { min: 24, max: 28 } }] })
  await page('zeta-fish', [{ source: 'glaser', html: '<p>A note.</p>' }], cardOf('glaser', { sizeCm: 3 }))
  await page('forum-only', [{ source: 'diendancacanh', html: '<p>Nothing shown.</p>' }], {})
  await page('no-translation', [{ source: 'glaser', html: '<p>A note.</p>' }], {}, false)
  expect(await cardGaps(root, ['zeta-fish', 'betta-splendens'])).toEqual([
    { id: 'zeta-fish', sources: ['glaser'], missing: ['tempC', 'ph', 'gh', 'tankCm', 'difficulty'] },
    { id: 'betta-splendens', sources: ['sprucepets'], missing: ['tankCm'] },
    { id: 'alpha-fish', sources: ['glaser'], missing: ['tempC'] },
  ])
})
