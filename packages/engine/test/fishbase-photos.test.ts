import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { collaboratorPhotos, fishbasePhotos, listUrl, PANITVONG, photoPage, type FishbaseDeps } from '../src/fishbase-photos'
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
