import { expect, test } from 'vitest'
import { headWord, kindWord } from '../src/kind-words'

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

test('read the same whatever the case, the spaces or the Unicode form', () => {
  const clarias = { family: 'Clariidae', order: 'Siluriformes' }
  expect(kindWord('  CÁ   TRÊ  phi ', clarias)).toEqual({ word: 'trê', fits: true })
  expect(kindWord('Cá trê'.normalize('NFD'), clarias)).toEqual({ word: 'trê', fits: true })
  expect(kindWord('Cá trêx', clarias)).toEqual({ word: 'cá', fits: true }) // a word, not the start of one
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
