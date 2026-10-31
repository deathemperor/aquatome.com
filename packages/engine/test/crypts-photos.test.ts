import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { cryptsPhotos, ownPhotos, type CryptsDeps } from '../src/crypts-photos'
import { SOURCE_PHOTO_LICENCE } from '../src/source-photos'

const a = (file: string, caption: string) => `<td><a href="alphabet_files/C. nurii_files/${file}"class="gal_link"><img src="t.jpg"></a><br><font size="2">${caption}</font></td>`
const page = [
  a('nur_B802_x_2485.jpg', 'View on the Kahang river in Johore. coll. B802'),
  a('nur_B803_x_2502.jpg', 'Before the limb opens, the spathe shows the typical formed bud. coll. B803'),
  a('nur_B803_x_2502.jpg', 'Before the limb opens (same photo again)'),
  a('nur_x_B9_157.jpg', 'A emersed cultivated C. nurii. The plant is very tiny.'),
  a('rau_HastingsLH7_x_x.jpg', 'Found by Peter Boyce. photo Boyce'),
  a('nur_x_W83_2324.jpg', 'The same plant seen from the front. coll. hort., cult. W83'),
  a('nur_B802_x_2499.jpg', 'Close up of the limb. coll. B802 photo van Wijngaarden'),
  a('bec_x_B92_383.jpg', 'This is not a C. nurii but may be regarded as C. beckettii.'),
  a('nur-loc.jpg', 'Distribution of C. nurii.'),
  a('nur_B990_x_1.jpg', 'Herbarium specimen of C. nurii, the type.'),
].join('\n')

test("only Bastmeijer's own photos of the page's species, whole plants first and habitat last", () => {
  expect(ownPhotos(page, 'nurii').map(x => x.file)).toEqual(['nur_x_B9_157.jpg', 'nur_B803_x_2502.jpg', 'nur_B802_x_2485.jpg'])
})

test('a Cryptocoryne page without his photos gets up to 3, credited and linked; a rerun adds nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-crypts-'))
  const old = { url: 'https://media.aquatome.com/tropica/a.webp', width: 1200, height: 800, licence: SOURCE_PHOTO_LICENCE, author: 'Tropica', sourceUrl: 'https://tropica.com/x', source: 'tropica' }
  for (const [id, sci, photos] of [['cryptocoryne-nurii', 'Cryptocoryne nurii', []], ['cryptocoryne-x-willisii', 'Cryptocoryne x willisii', [old]], ['anubias-nana', 'Anubias nana', []]] as const) {
    await mkdir(join(root, 'content/plants', id), { recursive: true })
    await writeFile(join(root, 'content/plants', id, 'entity.json'), JSON.stringify({ scientificName: sci, photos }))
  }
  const fetched: string[] = []
  const d: CryptsDeps = {
    get: async u => (fetched.push(u), page),
    bytes: async (u, referer) => (fetched.push(`${u} <- ${referer}`), new Uint8Array([1])),
    media: { urlFor: k => `https://media.aquatome.com/${k}`, put: async k => ({ url: `https://media.aquatome.com/${k}`, width: 467, height: 691 }) },
    sleep: async () => {},
  }
  expect(await cryptsPhotos(root, d)).toEqual({ added: ['cryptocoryne-nurii: 3'], skipped: [], failed: [] })
  expect(fetched[0]).toBe('https://www.cryptocoryneworld.org/c_nurii.php')
  expect(fetched[1]).toBe('https://www.cryptocoryneworld.org/alphabet_files/C.%20nurii_files/nur_x_B9_157.jpg <- https://www.cryptocoryneworld.org/c_nurii.php')
  const e = JSON.parse(await readFile(join(root, 'content/plants/cryptocoryne-nurii/entity.json'), 'utf8'))
  expect(e.photos[0]).toEqual({ url: 'https://media.aquatome.com/cryptspages/nur_x_B9_157.webp', width: 467, height: 691, licence: SOURCE_PHOTO_LICENCE, author: 'Jan D. Bastmeijer', sourceUrl: 'https://www.cryptocoryneworld.org/c_nurii.php', source: 'cryptspages' })
  expect(e.photos).toHaveLength(3)
  expect((await cryptsPhotos(root, d)).added).toEqual([])
})
