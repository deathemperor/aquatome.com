import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { galleryPlan, TARGETS } from '../src/gallery-plan'

async function root(pages: [string, string, string[]][]) {
  const r = await mkdtemp(join(tmpdir(), 'aq-plan-'))
  for (const [kind, id, sources] of pages) {
    await mkdir(join(r, 'content', kind, id), { recursive: true })
    await writeFile(join(r, 'content', kind, id, 'entity.json'), JSON.stringify({ scientificName: id, photos: [], sections: sources.map(source => ({ source })) }))
  }
  return r
}
const shopList = async (r: string, file: string, names: string[]) => {
  await mkdir(join(r, 'engine-state/shop-lists'), { recursive: true })
  await writeFile(join(r, 'engine-state/shop-lists', file), JSON.stringify({ lang: 'vi', items: names.map(n => ({ trade: n, name: n, scientificName: n, confidence: 0.9, evidence: '' })), sources: [], updatedAt: '' }))
}

test('targets go down with popularity, to the owner\'s floor of 20', () => {
  expect(TARGETS).toEqual({ staple: 100, shop: 60, popular: 40, covered: 30, rest: 20 })
})

test('tiers: staples, shop species, the most-kept fish, pages two sources cover, the rest; plants by their shop list and coverage', async () => {
  const r = await root([
    ['species', 'aaa-rest', ['seriouslyfish']], ['species', 'zzz-covered', ['seriouslyfish', 'glaser']], ['species', 'danio-margaritatus', ['seriouslyfish']],
    ['species', 'betta-splendens', []], ['species', 'shop-fish', ['seriouslyfish']], ['species', 'danio-rerio', []],
    ['plants', 'anubias-barteri', ['tropica']], ['plants', 'covered-plant', ['tropica', 'aquariumcoop']], ['plants', 'rest-plant', ['tropica']],
  ])
  await shopList(r, 'th.json', ['Shop fish', 'Danio rerio'])
  await shopList(r, 'plants-vi.json', ['Anubias barteri'])
  const plan = await galleryPlan(r)
  expect(plan.map(p => `${p.tier}:${p.id}:${p.target}`)).toEqual([
    'staple:betta-splendens:100', 'staple:danio-rerio:100', // a staple stays a staple when a shop sells it too
    'shop:shop-fish:60', 'shop:anubias-barteri:60',
    'popular:danio-margaritatus:40',
    'covered:zzz-covered:30', 'covered:covered-plant:30',
    'rest:aaa-rest:20', 'rest:rest-plant:20',
  ])
  expect(plan.find(p => p.id === 'anubias-barteri')!.kind).toBe('plants')
})

const breed = async (r: string, id: string, urls: string[]) => {
  await mkdir(join(r, 'content/breeds', id), { recursive: true })
  await writeFile(join(r, 'content/breeds', id, 'entity.json'), JSON.stringify({ id, kind: 'variety', photos: [], sources: urls.map(url => ({ url, title: url, kind: 'article' })) }))
}

test('breeds: the bred fish shops keep most as what shops sell, ahead of pages two sources cover; the rest by how many sites write about them', async () => {
  const r = await root([
    ['species', 'zzz-covered', ['seriouslyfish', 'glaser']], ['species', 'shop-fish', ['seriouslyfish']], ['species', 'aaa-rest', ['seriouslyfish']],
    ['plants', 'covered-plant', ['tropica', 'aquariumcoop']],
  ])
  await shopList(r, 'vi.json', ['Shop fish'])
  await breed(r, 'balloon-molly', ['https://a.example/molly', 'https://www.b.example/balloon'])
  await breed(r, 'koi', ['https://a.example/koi', 'https://b.example/koi'])
  await breed(r, 'albino-oscar', ['https://a.example/oscar', 'https://b.example/oscar'])
  await breed(r, 'platinum-angelfish', ['https://a.example/angel', 'https://www.a.example/angel-2']) // one site, twice
  const plan = await galleryPlan(r)
  expect(plan.map(p => `${p.tier}:${p.kind}:${p.id}:${p.target}`)).toEqual([
    // POPULAR_BREEDS order (balloon molly, then koi), among the shop species by rank; the breed is written about by more.
    'shop:breeds:balloon-molly:60', 'shop:species:shop-fish:60', 'shop:breeds:koi:60',
    // As many sources: species, plants, then breeds.
    'covered:species:zzz-covered:30', 'covered:plants:covered-plant:30', 'covered:breeds:albino-oscar:30',
    'rest:species:aaa-rest:20', 'rest:breeds:platinum-angelfish:20',
  ])
})

test('breeds: an id that is also a species page stops the plan (a gallery is one file by id)', async () => {
  const r = await root([['species', 'koi', ['seriouslyfish']]])
  await breed(r, 'koi', ['https://a.example/koi'])
  await expect(galleryPlan(r)).rejects.toThrow(/"koi" is both a species page and a breeds page/)
})

test('a Malay shop list moves its fish up now the site serves Malay: galleries follow the readers it has', async () => {
  const r = await root([['species', 'aaa-rest', ['seriouslyfish']]])
  await shopList(r, 'ms.json', ['aaa-rest'])
  expect((await galleryPlan(r)).map(x => x.tier)).toEqual(['shop'])
  expect((await galleryPlan(r, ['vi', 'id', 'th'])).map(x => x.tier)).toEqual(['rest'])
})
