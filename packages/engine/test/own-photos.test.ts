import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { ownPhotos } from '../src/own-photos'
import { SOURCE_PHOTO_LICENCE } from '../src/source-photos'

test('listed photos go on their pages, cropped and credited; a rerun adds nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-own-'))
  const old = { url: 'https://media.aquatome.com/tropica/a.webp', width: 1200, height: 800, licence: 'CC BY 4.0', author: 'Bo', sourceUrl: 'https://commons.wikimedia.org/wiki/File:A.jpg' }
  await mkdir(join(root, 'content/plants/bolbitis-heudelotii'), { recursive: true })
  await writeFile(join(root, 'content/plants/bolbitis-heudelotii/entity.json'), JSON.stringify({ scientificName: 'Bolbitis heudelotii', photos: [old] }))
  await mkdir(join(root, 'given'))
  await writeFile(join(root, 'given/plant_37.jpg'), await sharp({ create: { width: 100, height: 200, channels: 3, background: '#2a6' } }).jpeg().toBuffer())
  await writeFile(join(root, 'given/list.json'), JSON.stringify([{ file: 'plant_37.jpg', page: 'plants/bolbitis-heudelotii', crop: { left: 0, top: 0, right: 1, bottom: 0.8 } }]))
  const put: { key: string; height: number }[] = []
  const media = {
    urlFor: (k: string) => `https://media.aquatome.com/${k}`,
    put: async (k: string, b: Uint8Array) => { const m = await sharp(b).metadata(); put.push({ key: k, height: m.height! }); return { url: `https://media.aquatome.com/${k}`, width: m.width!, height: m.height! } },
  }
  expect(await ownPhotos(root, join(root, 'given/list.json'), media)).toEqual(['plants/bolbitis-heudelotii: plant_37.jpg'])
  expect(put).toEqual([{ key: 'aquatome/plants-bolbitis-heudelotii-plant_37.webp', height: 160 }])
  const e = JSON.parse(await readFile(join(root, 'content/plants/bolbitis-heudelotii/entity.json'), 'utf8'))
  expect(e.photos).toEqual([old, { url: 'https://media.aquatome.com/aquatome/plants-bolbitis-heudelotii-plant_37.webp', width: 100, height: 160, licence: SOURCE_PHOTO_LICENCE, author: 'AquaTome', sourceUrl: 'https://aquatome.com/vi/gioi-thieu/', source: 'aquatome' }])
  expect(await ownPhotos(root, join(root, 'given/list.json'), media)).toEqual([])
})
