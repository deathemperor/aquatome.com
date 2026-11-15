import { expect, test } from 'vitest'
import { headWord, KIND_FALLBACKS, kindWord, plainName, recordKindFallback, tilapiaUnnamed, wrongKind } from '../src/kind-words'

const cichlid = { family: 'Cichlidae', order: 'Cichliformes' }

test('a fish word fits the families keepers use it for, and names another kind elsewhere', () => {
  expect(kindWord('Cá trê vàng', { family: 'Clariidae', genus: 'Clarias', order: 'Siluriformes' })).toEqual({ word: 'trê', fits: true })
  expect(kindWord('Cá trê Malawi', { ...cichlid, genus: 'Champsochromis' })).toEqual({ word: 'trê', fits: false })
  expect(kindWord('Cá trê thủy tinh Mekong', { family: 'Ambassidae', order: 'Perciformes' })).toEqual({ word: 'trê', fits: false })
  expect(kindWord('Cá rồng đỏ Kribensis', { ...cichlid, genus: 'Pelvicachromis' })).toEqual({ word: 'rồng', fits: false })
  expect(kindWord('Cá mèo gỗ sọc', { family: 'Auchenipteridae', order: 'Siluriformes' })).toEqual({ word: 'mèo', fits: false })
  expect(kindWord('Cá mắt xanh Olmec', { family: 'Poeciliidae', genus: 'Priapella', order: 'Cyprinodontiformes' })).toEqual({ word: 'mắt xanh', fits: false })
  expect(kindWord('Cá mắt xanh neon đỏ', { family: 'Pseudomugilidae', genus: 'Pseudomugil', order: 'Atheriniformes' })).toEqual({ word: 'mắt xanh', fits: true })
})

test('"rô phi" is the tilapias\' alone, read before "rô"', () => {
  expect(kindWord('Cá rô phi', { ...cichlid, genus: 'Oreochromis' })).toEqual({ word: 'rô phi', fits: true })
  expect(kindWord('Cá rô phi lùn đốm đỏ', { ...cichlid, genus: 'Apistogramma' })).toEqual({ word: 'rô phi', fits: false })
  expect(kindWord('Cá rô đồng', { family: 'Anabantidae', genus: 'Anabas', order: 'Anabantiformes' })).toEqual({ word: 'rô', fits: true })
  expect(kindWord('Cá rô sông Nile', { family: 'Latidae', genus: 'Lates', order: 'Perciformes' })).toEqual({ word: 'rô', fits: false })
})

test('a text says "rô phi" only where its English names a tilapia, by the word or by a tilapia genus', () => {
  // Curation & Media, 15 Nov 2026: "A brand-new dwarf cichlid" written "Một loài cá rô phi lùn hoàn toàn mới".
  expect(tilapiaUnnamed('Một loài cá rô phi lùn hoàn toàn mới: Apistogramma sp. Cristal', 'A brand-new dwarf cichlid: Apistogramma sp. Cristal')).toBe(true)
  expect(tilapiaUnnamed('Những thay đổi lớn trong phân loại cá rô phi Tân Thế Giới', 'Major changes in New World cichlid taxonomy')).toBe(true)
  expect(tilapiaUnnamed('Cá Rô Phi'.normalize('NFD'), 'cichlids')).toBe(true)
  // Xenotilapia and Paratilapia are other cichlids: their names hold "tilapia" but name none.
  expect(tilapiaUnnamed('Cá rô phi cát vàng Xenotilapia', 'Xenotilapia flavipinnis, a sand-sifting cichlid')).toBe(true)
  expect(tilapiaUnnamed('Cá rô phi', 'Paratilapia polleni')).toBe(true)
  expect(tilapiaUnnamed('Thức ăn từ tim bò, tôm, cá rô phi và rau', 'beef heart, shrimp, tilapia fillet and greens')).toBe(false)
  expect(tilapiaUnnamed('Cá rô phi Mozambique', 'Oreochromis mossambicus')).toBe(false)
  expect(tilapiaUnnamed('Cá rô phi', 'TILAPIAS are hardy')).toBe(false)
  expect(tilapiaUnnamed('Cá rô phi', 'Tilapia mariae, the spotted tilapia')).toBe(false)
  // "Rô" alone is another fish, and a word holding it isn't the word.
  expect(tilapiaUnnamed('Cá rô đồng', 'climbing perch')).toBe(false)
  expect(tilapiaUnnamed('Cá rô phiên', 'cichlid')).toBe(false)
})

test('read the same whatever the case, the spaces or the Unicode form', () => {
  const clarias = { family: 'Clariidae', order: 'Siluriformes' }
  expect(kindWord('  CÁ   TRÊ  phi ', clarias)).toEqual({ word: 'trê', fits: true })
  expect(kindWord('Cá trê'.normalize('NFD'), clarias)).toEqual({ word: 'trê', fits: true })
  expect(kindWord('Cá trêx', clarias)).toEqual({ word: 'cá', fits: true }) // a word, not the start of one
  // Punctuation is a space between words (Astra's read).
  expect(kindWord('Cá trê-Malawi', { ...cichlid, genus: 'Champsochromis' })).toEqual({ word: 'trê', fits: false })
  expect(kindWord('Cá rô phi-vằn', { family: 'Anabantidae', genus: 'Anabas', order: 'Anabantiformes' })).toEqual({ word: 'rô phi', fits: false })
  expect(kindWord('Ốc mượn hồn-đỏ', { family: 'Neritidae', order: 'Cycloneritida' })).toEqual({ word: 'ốc mượn hồn', fits: false })
  expect(kindWord('Cá (trê) vàng', clarias)).toEqual({ word: 'trê', fits: true })
})

test('plain "Cá" fits any fish and no other animal; with no order it is not judged', () => {
  expect(kindWord('Cá Copadichromis borleyi', cichlid)).toEqual({ word: 'cá', fits: true })
  expect(kindWord('Cá Caridina logemanni', { family: 'Atyidae', order: 'Decapoda' })).toEqual({ word: 'cá', fits: false })
  expect(kindWord('Cá Ambystoma mexicanum', { family: 'Ambystomatidae', order: 'Caudata' })).toEqual({ word: 'cá', fits: false })
  expect(kindWord('Cá Xyz', { family: 'Xyzidae' })).toBeUndefined()
})

test('shrimp and shellfish words begin a name', () => {
  const decapod = { order: 'Decapoda' }
  expect(kindWord('Tép Amano', { ...decapod, family: 'Atyidae' })).toEqual({ word: 'tép', fits: true })
  expect(kindWord('Tép lửa đỏ', { ...decapod, family: 'Lysmatidae' })).toEqual({ word: 'tép', fits: false })
  expect(kindWord('Tôm càng đỏ', { ...decapod, family: 'Palaemonidae' })).toEqual({ word: 'tôm', fits: true })
  expect(kindWord('Tôm hùm đất đỏ', { ...decapod, family: 'Cambaridae' })).toEqual({ word: 'tôm', fits: true })
  expect(kindWord('Trai nước ngọt Corbicula', { family: 'Cyrenidae', order: 'Venerida' })).toEqual({ word: 'trai', fits: false })
  expect(kindWord('Hến Corbicula fluminea', { family: 'Cyrenidae', order: 'Venerida' })).toEqual({ word: 'hến', fits: true })
  expect(kindWord('Ốc nerite ngựa vằn', { family: 'Neritidae', order: 'Cycloneritida' })).toEqual({ word: 'ốc', fits: true })
  expect(kindWord('Ốc mượn hồn đỏ', { ...decapod, family: 'Coenobitidae' })).toEqual({ word: 'ốc mượn hồn', fits: true })
  expect(kindWord('Cua ẩn sĩ đỏ', { ...decapod, family: 'Coenobitidae' })).toEqual({ word: 'cua', fits: true })
})

test('names keepers really use, from Astra\'s read', () => {
  expect(kindWord('Cá bống vàng', { family: 'Gyrinocheilidae', genus: 'Gyrinocheilus', order: 'Cypriniformes' })).toEqual({ word: 'bống', fits: true })
  expect(kindWord('Tép ma', { family: 'Palaemonidae', genus: 'Palaemonetes', order: 'Decapoda' })).toEqual({ word: 'tép', fits: true })
  // Not the whole family: the sea's anemone shrimp is Palaemonidae too.
  expect(kindWord('Tép hải quỳ đốm', { family: 'Palaemonidae', genus: 'Periclimenes', order: 'Decapoda' })).toEqual({ word: 'tép', fits: false })
  expect(kindWord('Cá rô phi vằn', { ...cichlid, genus: 'Heterotilapia' })).toEqual({ word: 'rô phi', fits: true })
  for (const family of ['Hydrobiidae', 'Tateidae', 'Amnicolidae', 'Cochliopidae', 'Lithoglyphidae']) {
    expect(kindWord('Ốc Potamopyrgus antipodarum', { family, order: 'Littorinimorpha' }), family).toEqual({ word: 'ốc', fits: true })
    expect(headWord({ family, order: 'Littorinimorpha' }), family).toBe('Ốc')
  }
  expect(headWord({ family: 'Palaemonidae', genus: 'Palaemonetes', order: 'Decapoda' })).toBe('Tép')
})

test('a name with no word from the table is not judged', () => {
  expect(kindWord('Lươn đồng', { family: 'Synbranchidae', order: 'Synbranchiformes' })).toBeUndefined()
  expect(kindWord('Bèo Nhật', { family: 'Hydrocharitaceae' })).toBeUndefined()
  expect(kindWord('Asellus aquaticus', { family: 'Asellidae', order: 'Isopoda' })).toBeUndefined()
})

test('the plain scientific form\'s head word', () => {
  expect(headWord(cichlid)).toBe('Cá')
  expect(headWord({ family: 'Atyidae', order: 'Decapoda' })).toBe('Tép')
  expect(headWord({ family: 'Lysmatidae', order: 'Decapoda' })).toBe('Tôm')
  expect(headWord({ family: 'Cyrenidae', order: 'Venerida' })).toBe('Hến')
  expect(headWord({ family: 'Neritidae', order: 'Cycloneritida' })).toBe('Ốc')
  expect(headWord({ family: 'Coenobitidae', order: 'Decapoda' })).toBe('Cua')
  expect(headWord({ family: 'Dendrophylliidae', order: 'Scleractinia' })).toBeUndefined()
  expect(headWord({})).toBeUndefined()
})

test('a name that fell back is listed once a page, the latest, and the same one again rewrites nothing', async () => {
  const { mkdtemp, readFile, stat } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = await mkdtemp(join(tmpdir(), 'aq-kind-'))
  await recordKindFallback(root, 'species/x', { name: 'Cá trê X', word: 'trê', took: 'Cá X y', at: '2026-11-15T01:00:00.000Z' })
  await recordKindFallback(root, 'species/a', { name: 'Tép A', word: 'tép', took: 'Tôm A b', at: '2026-11-15T01:00:00.000Z' })
  const file = join(root, KIND_FALLBACKS)
  const first = (await stat(file)).mtimeMs
  await new Promise(r => setTimeout(r, 20))
  await recordKindFallback(root, 'species/x', { name: 'Cá trê X', word: 'trê', took: 'Cá X y', at: '2026-11-16T01:00:00.000Z' })
  expect((await stat(file)).mtimeMs).toBe(first)
  expect(Object.keys(JSON.parse(await readFile(file, 'utf8')))).toEqual(['species/a', 'species/x'])
  expect(wrongKind('Cá trê X', { family: 'Cichlidae' })).toBe(true)
  expect(plainName('Xenia elongata', { order: 'Malacalcyonacea', family: 'Xeniidae' })).toBe('Xenia elongata')
  expect(plainName('Xyz abc', {})).toBe('Cá Xyz abc')
})
