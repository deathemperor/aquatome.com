import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
// @ts-expect-error plain .mjs git merge driver
import { merge3, mergeFile } from '../../../scripts/merge-entity.mjs'

// The angelfish, as the two engine jobs each made it on 2026-10-30: Seriously Fish's page and Glaser's.
const sf = {
  id: 'pterophyllum-scalare', scientificName: 'Pterophyllum scalare', family: 'Cichlidae', places: ['south-america', 'colombia', 'brazil'],
  dataCard: { tempC: [{ source: 'seriouslyfish', value: { min: 24, max: 30 } }], ph: [{ source: 'seriouslyfish', value: { min: 6, max: 7.4 } }], sizeCm: [{ source: 'seriouslyfish', value: 15 }] },
  sections: [{ key: 'quickFacts', source: 'seriouslyfish', html: '<p>sf</p>' }],
  photos: [{ url: 'https://m/sf.webp', source: 'seriouslyfish' }], videos: [{ youtubeId: 'a' }], updatedAt: '2026-10-30',
}
const glaser = {
  id: 'pterophyllum-scalare', scientificName: 'Pterophyllum scalare', family: 'Cichlidae', places: ['south-america', 'brazil', 'rio-xingu'],
  dataCard: { sizeCm: [{ source: 'glaser', value: 15 }] },
  sections: [{ key: 'quickFacts', source: 'glaser', html: '<p>glaser</p>' }],
  photos: [{ url: 'https://m/glaser.webp', source: 'glaser' }], videos: [{ youtubeId: 'a' }, { youtubeId: 'b' }], updatedAt: '2026-10-31',
}

test('the same new page from two sources: both sources\' figures, places, sections, photos and videos stay', () => {
  expect(merge3(undefined, sf, glaser)).toEqual({
    id: 'pterophyllum-scalare', scientificName: 'Pterophyllum scalare', family: 'Cichlidae', places: ['south-america', 'colombia', 'brazil', 'rio-xingu'],
    dataCard: { tempC: sf.dataCard.tempC, ph: sf.dataCard.ph, sizeCm: [{ source: 'seriouslyfish', value: 15 }, { source: 'glaser', value: 15 }] },
    sections: [...sf.sections, ...glaser.sections],
    photos: [...sf.photos, ...glaser.photos], videos: [{ youtubeId: 'a' }, { youtubeId: 'b' }], updatedAt: '2026-10-31',
  })
})

test('changes on an existing page: each side\'s edit lands, a removal stands, a clash goes to theirs', () => {
  const base = { photos: [{ url: 'p1' }, { url: 'face' }], dataCard: { tempC: [{ source: 'sf', value: { min: 22, max: 28 } }] }, name: 'A' }
  const ours = { photos: [{ url: 'p1' }], dataCard: { tempC: [{ source: 'sf', value: { min: 24, max: 28 } }] }, name: 'B' } // faces dropped a photo; sf refreshed
  const theirs = { photos: [{ url: 'p1' }, { url: 'face' }, { url: 'p2' }], dataCard: { tempC: [{ source: 'sf', value: { min: 22, max: 28 } }, { source: 'glaser', value: { min: 23, max: 27 } }] }, name: 'C' }
  expect(merge3(base, ours, theirs)).toEqual({
    photos: [{ url: 'p1' }, { url: 'p2' }],
    dataCard: { tempC: [{ source: 'sf', value: { min: 24, max: 28 } }, { source: 'glaser', value: { min: 23, max: 27 } }] },
    name: 'C',
  })
})

test('as a git merge driver: the push fallback after both jobs added the page keeps both sources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'me-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  const driver = fileURLToPath(new URL('../../../scripts/merge-entity.mjs', import.meta.url))
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  git('config', 'merge.entity.driver', `node ${driver} %O %A %B`)
  await writeFile(join(dir, '.gitattributes'), 'content/species/*/*.json merge=entity\n')
  const page = join(dir, 'content/species/pterophyllum-scalare')
  const file = join(page, 'entity.json')
  const write = async (v: object) => { await mkdir(page, { recursive: true }); await writeFile(file, `${JSON.stringify(v, null, 2)}\n`) }
  git('add', '.'); git('commit', '-qm', 'base')
  git('checkout', '-qb', 'pages'); await write(glaser); git('add', '.'); git('commit', '-qm', 'pages')
  git('checkout', '-q', 'main'); await write(sf); git('add', '.'); git('commit', '-qm', 'sf')
  git('checkout', '-q', 'pages'); git('rebase', '-q', 'main') // what `git pull --rebase` does in the pages job
  const merged = JSON.parse(await readFile(file, 'utf8'))
  expect(merged.dataCard.tempC).toEqual(sf.dataCard.tempC)
  expect(merged.dataCard.sizeCm).toHaveLength(2)
  expect(merged.sections.map((s: { source: string }) => s.source)).toEqual(['seriouslyfish', 'glaser'])
})

// 2026-11-07: the sf job, started before the place-names step, made "Lam" from its source while main named it "sông Lam"
// (nameFixed); the push fallback kept the job's whole file, and the test on rivers stopped its publish.
const lamFixed = { slug: 'lam', name: 'sông Lam', altNames: ['Lam'], sections: {}, quality: { score: 1, indexable: true }, nameFixed: true }
const lamSource = { slug: 'lam', name: 'Lam', altNames: [], sections: {}, quality: { score: 1, indexable: true } }
test('a name one side fixed stays, on whichever side it is; with neither or both fixed, the merge is as before', () => {
  expect(mergeFile(undefined, lamFixed, lamSource)).toEqual(lamFixed)
  expect(mergeFile(undefined, lamSource, lamFixed)).toEqual(lamFixed)
  expect(mergeFile(lamSource, lamFixed, { ...lamSource, quality: { score: 0.9, indexable: true } })).toEqual({ ...lamFixed, quality: { score: 0.9, indexable: true } })
  expect(mergeFile(undefined, lamSource, { ...lamSource, name: 'Lam River' })).toEqual({ ...lamSource, name: 'Lam River' })
  expect(mergeFile(undefined, lamFixed, { ...lamFixed, name: 'Sông Lam' })).toEqual({ ...lamFixed, name: 'Sông Lam' })
})

test('as a git merge driver, a place both jobs added keeps the name main fixed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'me-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  const driver = fileURLToPath(new URL('../../../scripts/merge-entity.mjs', import.meta.url))
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  git('config', 'merge.entity.driver', `node ${driver} %O %A %B`)
  await writeFile(join(dir, '.gitattributes'), await readFile(new URL('../../../.gitattributes', import.meta.url), 'utf8'))
  const place = join(dir, 'content/places/lam')
  const file = join(place, 'vi.json')
  const write = async (v: object) => { await mkdir(place, { recursive: true }); await writeFile(file, `${JSON.stringify(v, null, 2)}\n`) }
  git('add', '.'); git('commit', '-qm', 'base')
  git('checkout', '-qb', 'sf'); await write(lamSource); git('add', '.'); git('commit', '-qm', 'sf')
  git('checkout', '-q', 'main'); await write(lamFixed); git('add', '.'); git('commit', '-qm', 'place names')
  git('checkout', '-q', 'sf'); git('rebase', '-q', 'main') // the job's push, after main named the place
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(lamFixed)
})
