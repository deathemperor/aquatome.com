import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { speciesOrder } from '../src/localize'
import { addShopNames, makeShopList, popularFirst, shopIds, type ShopItem } from '../src/shops'

async function site() {
  const root = await mkdtemp(join(tmpdir(), 'shop-'))
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), join(root, 'content'), { recursive: true })
  return root
}
const item = (trade: string, scientificName: string | null, confidence: number, name: string | null = trade): ShopItem => ({ trade, name, scientificName, confidence, evidence: '' })
async function list(root: string, lang: 'vi' | 'id' | 'th', items: ShopItem[]) {
  await mkdir(join(root, 'engine-state/shop-lists'), { recursive: true })
  await writeFile(join(root, 'engine-state/shop-lists', `${lang}.json`), JSON.stringify({ lang, items, sources: [], updatedAt: '2026-10-31' }))
}
const names = async (root: string, id: string, lang = 'vi') => (JSON.parse(await readFile(join(root, 'content/species', id, `${lang}.json`), 'utf8')) as { altNames: string[] }).altNames

test('shop list: the seed shop\'s items are mapped first; marketplaces are off limits; written to engine-state', async () => {
  const root = await site()
  const prompts: string[] = []
  const research: Llm = async <T>({ prompt }: { prompt: string }) => {
    prompts.push(prompt)
    return { items: [item(' Neon Vua ', ' Paracheirodon  axelrodi ', 1.4, ' Cá neon vua '), item('Các dòng cá chuột', null, 0.9, '')], sources: [{ url: 'https://shop.example/list', title: 'List' }] } as T
  }
  const r = await makeShopList(root, research, 'vi', { seed: ['Neon Vua', 'Các dòng cá chuột'], now: () => new Date('2026-10-31T00:00:00Z') })
  expect(prompts[0]).toContain('- Neon Vua')
  expect(prompts[0]).toMatch(/Never open Shopee, Lazada, Tokopedia/)
  expect(prompts[0]).toContain('Vietnam')
  expect(r.items[0]).toEqual({ trade: 'Neon Vua', name: 'Cá neon vua', scientificName: 'Paracheirodon axelrodi', confidence: 1, evidence: '' })
  expect(r.items[1]).toMatchObject({ name: null, scientificName: null })
  expect(JSON.parse(await readFile(join(root, 'engine-state/shop-lists/vi.json'), 'utf8'))).toMatchObject({ lang: 'vi', updatedAt: '2026-10-31' })
})

test('shop species: sure enough to rank by (0.6), list order, each once; new pages are fetched for them before the most-kept fish', async () => {
  const root = await site()
  await list(root, 'vi', [item('Cánh buồm', 'Gymnocorymbus ternetzi', 0.9), item('Táo đỏ', 'Glossolepis incisus', 0.5), item('Neon vua', 'Paracheirodon axelrodi', 0.9), item('Neon vua short', 'Paracheirodon axelrodi', 0.9)])
  await list(root, 'th', [item('ปลาหางนกยูง', 'Poecilia reticulata', 0.9)])
  expect(await shopIds(root, ['vi', 'th'])).toEqual(['gymnocorymbus-ternetzi', 'paracheirodon-axelrodi', 'poecilia-reticulata'])
  expect((await popularFirst(root)).slice(0, 4)).toEqual(['Gymnocorymbus ternetzi', 'Paracheirodon axelrodi', 'Poecilia reticulata', 'Pterophyllum scalare'])
})

test('translation order: the country\'s shop species come right after the staples, before the most-kept fish', async () => {
  const root = await site()
  await list(root, 'id', [item('Apisto kakatua', 'Apistogramma cacatuoides', 0.9)])
  const id = await speciesOrder(root, 'id')
  expect(id.indexOf('apistogramma-cacatuoides')).toBeLessThan(id.indexOf('danio-margaritatus')) // a most-kept fish
  expect((await speciesOrder(root, 'th')).at(-1)).toBe('apistogramma-cacatuoides') // not on the Thai list
})

test('shop names: sure ones only, at most two a page, never a name shops give two species or another page uses', async () => {
  const root = await site()
  await list(root, 'vi', [
    item('Neon tim', 'Paracheirodon axelrodi', 0.9, 'Cá neon tim'),
    item('Neon vua', 'Paracheirodon axelrodi', 0.95, 'Cá neon vua'), // already its name
    item('Neon hoàng đế', 'Paracheirodon axelrodi', 0.9, 'Cá neon hoàng đế'),
    item('Neon x', 'Paracheirodon axelrodi', 0.9, 'Cá neon x'), // a third: over the cap
    item('Neon', 'Paracheirodon innesi', 0.9, 'Cá neon'),
    item('Neon', 'Paracheirodon axelrodi', 0.8, 'Cá neon'), // two species under one name
    item('Galaxy', 'Boraras brigittae', 0.9, 'Cá galaxy'), // another page's name
    item('Đĩa', 'Symphysodon aequifasciatus', 0.7, 'Cá đĩa bò'), // not sure enough
    item('Cánh buồm', 'Gymnocorymbus ternetzi', 0.9, 'Cá cánh buồm'), // no page
    item('Đĩa xanh', 'Symphysodon aequifasciatus', 0.9, 'Cá dĩa'),
    item('Các dòng dĩa', null, 0, 'Cá dĩa'), // a group name, whatever the confidence
    item('Pleco L134', 'Boraras brigittae', 0.9, 'Cá pleco'),
    item('Pleco L397', 'Danio margaritatus', 0.3, 'Cá pleco'), // the same name for another fish, even unsure
    item('Neon', 'Paracheirodon innesi', 0.95, 'Cá Paracheirodon'), // the genus alone
  ])
  const added = await addShopNames(root, 'vi')
  expect(added).toEqual(['paracheirodon-axelrodi: Cá neon tim, Cá neon hoàng đế'])
  expect(await names(root, 'paracheirodon-axelrodi')).toEqual(['Cardinal tetra', 'Cá neon tim', 'Cá neon hoàng đế'])
  expect(await names(root, 'paracheirodon-innesi')).toEqual(['Neon tetra'])
  expect(await names(root, 'boraras-brigittae')).toEqual(['Chili rasbora'])
  expect(await names(root, 'symphysodon-aequifasciatus')).toEqual(['Discus'])
  expect(await addShopNames(root, 'id')).toEqual([]) // no Indonesian list
})
