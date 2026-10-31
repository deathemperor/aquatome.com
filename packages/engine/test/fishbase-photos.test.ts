import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { collaboratorPhotos, fishbasePhotos, inatPhotos, listUrl, PANITVONG, photoPage, type FishbaseDeps } from '../src/fishbase-photos'
import { SOURCE_PHOTO_LICENCE } from '../src/source-photos'

const row = (genus: string, species: string, pic: string) => `<tr class="even">
  <td class="lalign"><i><a href="/summary/SpeciesSummary.php?genusname=${genus}&speciesname=${species}">${genus} ${species}</a></i></td>
  <td>Common name</td><td></td>
  <td><a href='/photos/PicturesSummary.php?pic=${pic}&personnel=1825&what=collab_pic&SortBy=country&id=1'><img src='../images/tnn_files/tnn_Jpg/tnn_${pic}' alt='${pic}'/></a></td>
</tr>`
const list = `<table><tr><th>Species</th></tr>${row('Betta', 'mahachaiensis', 'Bemah_m0.jpg')}${row('Rasbora', 'nobody', 'Ranob_u0.jpg')}${row('Schistura', 'vinciguerrae', 'Scvin_u0.jpg')}</table>`

test('the collaborator list gives each photo with its species', () => {
  expect(collaboratorPhotos(list)).toEqual([
    { scientificName: 'Betta mahachaiensis', pic: 'Bemah_m0.jpg' },
    { scientificName: 'Rasbora nobody', pic: 'Ranob_u0.jpg' },
    { scientificName: 'Schistura vinciguerrae', pic: 'Scvin_u0.jpg' },
  ])
  expect(listUrl(PANITVONG)).toBe('https://fishbase.se/photos/PhotosList.php?id=1825&vCollaborator=Nonn+Panitvong')
})

test('photos of species the site has go on their pages, credited and linked; a rerun adds nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-fishbase-'))
  const old = { url: 'https://media.aquatome.com/bwaquatics/a.webp', width: 1200, height: 800, licence: SOURCE_PHOTO_LICENCE, author: 'BW Aquatics', sourceUrl: 'https://bwaquatics.com/x', source: 'bwaquatics' }
  for (const [id, sci, photos] of [['betta-mahachaiensis', 'Betta mahachaiensis', [old]], ['schistura-vinciguerrae', 'Schistura vinciguerrae', []]] as const) {
    await mkdir(join(root, 'content/species', id), { recursive: true })
    await writeFile(join(root, 'content/species', id, 'entity.json'), JSON.stringify({ scientificName: sci, photos }))
  }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  // The owner took the Schistura photo off its page before.
  await writeFile(join(root, 'engine-state/_photo-rejected.json'), JSON.stringify({ 'https://media.aquatome.com/panitvong/Scvin_u0.webp': '2026-10-31' }))
  const fetched: string[] = []
  const d: FishbaseDeps = {
    get: async u => (fetched.push(u), list),
    bytes: async (u, referer) => (fetched.push(`${u} <- ${referer}`), new Uint8Array([1])),
    media: { urlFor: k => `https://media.aquatome.com/${k}`, put: async k => ({ url: `https://media.aquatome.com/${k}`, thumb: `https://media.aquatome.com/${k.replace('.webp', '-480.webp')}`, width: 600, height: 400 }) },
    sleep: async () => {},
  }
  const r = await fishbasePhotos(root, d)
  expect(r).toEqual({ listed: 3, added: ['betta-mahachaiensis: Bemah_m0.jpg'], failed: [] })
  const page = photoPage(PANITVONG, 'Bemah_m0.jpg')
  expect(fetched[1]).toBe(`https://fishbase.se/images/species/Bemah_m0.jpg <- ${page}`)
  const e = JSON.parse(await readFile(join(root, 'content/species/betta-mahachaiensis/entity.json'), 'utf8'))
  // Added after the page's own photos: the lead photo stays.
  expect(e.photos).toEqual([old, {
    url: 'https://media.aquatome.com/panitvong/Bemah_m0.webp', thumb: 'https://media.aquatome.com/panitvong/Bemah_m0-480.webp', width: 600, height: 400,
    licence: SOURCE_PHOTO_LICENCE, author: 'Nonn Panitvong', sourceUrl: 'https://fishbase.se/photos/PicturesSummary.php?pic=Bemah_m0.jpg&personnel=1825&what=collab_pic', source: 'panitvong',
  }])
  expect(JSON.parse(await readFile(join(root, 'content/species/schistura-vinciguerrae/entity.json'), 'utf8')).photos).toEqual([])
  expect((await fishbasePhotos(root, d)).added).toEqual([])
})

test('his iNaturalist photos go on pages with fewer than 4 photos, only those credited to him', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-inat-'))
  const p = (n: number) => ({ url: `https://media.aquatome.com/x/${n}.webp`, width: 800, height: 600, licence: 'CC BY 4.0', author: 'Bo', sourceUrl: `https://commons.wikimedia.org/wiki/File:${n}.jpg` })
  for (const [id, sci, photos] of [['rasbora-paviana', 'Rasbora paviana', [p(1)]], ['carassius-auratus', 'Carassius auratus', [p(1), p(2), p(3), p(4)]]] as const) {
    await mkdir(join(root, 'content/species', id), { recursive: true })
    await writeFile(join(root, 'content/species', id, 'entity.json'), JSON.stringify({ scientificName: sci, photos }))
  }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state/_photo-rejected.json'), JSON.stringify({ 'https://media.aquatome.com/panitvong/inat-11.webp': 'murky field shot' }))
  const obs = [
    { taxon: { name: 'Rasbora paviana', rank: 'species' }, photos: [{ id: 7, url: 'https://static.inaturalist.org/photos/7/square.jpg', attribution: '(c) Nonn Panitvong, all rights reserved' }, { id: 8, url: 'https://static.inaturalist.org/photos/8/square.jpg', attribution: '(c) Someone Else, some rights reserved (CC BY)' }] },
    { taxon: { name: 'Carassius auratus', rank: 'species' }, photos: [{ id: 9, url: 'https://static.inaturalist.org/photos/9/square.jpg', attribution: '(c) Nonn Panitvong, all rights reserved' }] },
    { taxon: { name: 'Rasbora paviana', rank: 'species' }, photos: [{ id: 11, url: 'https://static.inaturalist.org/photos/11/square.jpg', attribution: '(c) Nonn Panitvong, all rights reserved' }] },
    { taxon: { name: 'Rasbora', rank: 'genus' }, photos: [{ id: 10, url: 'https://static.inaturalist.org/photos/10/square.jpg', attribution: '(c) Nonn Panitvong, all rights reserved' }] },
  ]
  const fetched: string[] = []
  const d: FishbaseDeps = {
    get: async u => (fetched.push(u), JSON.stringify({ results: obs })),
    bytes: async (u, referer) => (fetched.push(`${u} <- ${referer}`), new Uint8Array([1])),
    media: { urlFor: k => `https://media.aquatome.com/${k}`, put: async k => ({ url: `https://media.aquatome.com/${k}`, width: 1024, height: 680 }) },
    sleep: async () => {},
  }
  expect(await inatPhotos(root, d)).toEqual({ added: ['rasbora-paviana: 7'], failed: [] })
  expect(fetched).toEqual(['https://api.inaturalist.org/v1/observations?user_login=nonnp&per_page=200&page=1&order_by=id&order=asc', 'https://static.inaturalist.org/photos/7/large.jpg <- https://www.inaturalist.org/photos/7'])
  const e = JSON.parse(await readFile(join(root, 'content/species/rasbora-paviana/entity.json'), 'utf8'))
  expect(e.photos[1]).toEqual({ url: 'https://media.aquatome.com/panitvong/inat-7.webp', width: 1024, height: 680, licence: SOURCE_PHOTO_LICENCE, author: 'Nonn Panitvong', sourceUrl: 'https://www.inaturalist.org/photos/7', source: 'panitvong' })
  expect((await inatPhotos(root, d)).added).toEqual([])
})
