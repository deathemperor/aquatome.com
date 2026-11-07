import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EquipmentSchema, type Content, type EquipmentGuide } from '@aq/schema'
import { expect, test } from 'vitest'
import { categories, shownTypes, typeUses } from '../src/lib/equipment'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../src/lib/format'

const type = (id: string, match: string) => ({ id, name: id, match, desc: '', pick: '', buy: id })
const fish = (id: string, slots: { category: string; keywords: string[] }[]) => ({ id, photos: [], sections: [], productSlots: slots, t: { name: id, slug: id } })

test("a kind of kit lists its types in a keeper's order, while each shop search still goes to the type that matches it first", () => {
  // The chiller is matched first ("máy làm lạnh mini" is a chiller, not a small heater), but read after the heaters.
  const g = {
    category: 'suoi', name: 'Sưởi và làm mát',
    types: [type('lam-lanh', 'lạnh'), type('mini', 'mini'), type('chinh-nhiet', 'sưởi')],
    order: ['mini', 'chinh-nhiet', 'lam-lanh'],
  } as unknown as EquipmentGuide
  const c = { species: [fish('a', [{ category: 'suoi', keywords: ['máy làm lạnh mini', 'sưởi mini', 'sưởi 100w'] }])] } as unknown as Content
  expect(shownTypes(g).map(t => t.id)).toEqual(['mini', 'chinh-nhiet', 'lam-lanh'])
  const uses = typeUses('vi', c, g)
  expect(uses.map(t => t.id)).toEqual(['mini', 'chinh-nhiet', 'lam-lanh'])
  expect(Object.fromEntries(uses.map(t => [t.id, t.keywords]))).toEqual({ mini: ['sưởi mini'], 'chinh-nhiet': ['sưởi 100w'], 'lam-lanh': ['máy làm lạnh mini'] })
  // A guide with no order reads in its matching order; an id the order doesn't name keeps its place after the named ones.
  expect(shownTypes({ ...g, order: undefined }).map(t => t.id)).toEqual(['lam-lanh', 'mini', 'chinh-nhiet'])
  expect(shownTypes({ ...g, order: ['chinh-nhiet'] }).map(t => t.id)).toEqual(['chinh-nhiet', 'lam-lanh', 'mini'])
})

test("the kinds of kit read in a keeper's order (tank, filter, heater, light… food last), whatever order the fish suggest them in", () => {
  const c = {
    species: [fish('a', [{ category: 'thuc-an', keywords: ['cám'] }, { category: 'co2', keywords: ['co2'] }, { category: 'khac-moi', keywords: ['x'] }]), fish('b', [{ category: 'suoi', keywords: ['sưởi'] }, { category: 'be-ca', keywords: ['bể 60cm'] }, { category: 'den', keywords: ['đèn'] }, { category: 'loc', keywords: ['lọc thùng'] }])],
    plants: [],
  } as unknown as Content
  expect(categories(c).map(u => u.category)).toEqual(['be-ca', 'loc', 'suoi', 'den', 'co2', 'thuc-an', 'khac-moi'])
  expect(Object.keys(CATEGORY_LABELS).filter(k => !CATEGORY_ORDER.includes(k))).toEqual([])
})

test('every kind of kit the engine can file a shop search under has a label and a place in the order', () => {
  const prompt = readFileSync(new URL('../../../packages/engine/src/prompts/process.md', import.meta.url).pathname, 'utf8')
  const cats = prompt.match(/category is one of ([a-z0-9, -]+?) and keywords/)![1]!.split(/,\s*/)
  expect(cats.length).toBeGreaterThan(5)
  expect(cats.filter(c => !CATEGORY_LABELS[c] || !CATEGORY_ORDER.includes(c))).toEqual([])
})

// The real guides (content/equipment): a translation reads its types in the Vietnamese guide's order.
const dir = new URL('../../../content/equipment/', import.meta.url).pathname
const read = (f: string) => EquipmentSchema.parse(JSON.parse(readFileSync(f, 'utf8')))
test("each equipment guide's order names its own types, once each, in every language", () => {
  const files = readdirSync(dir).filter(f => f.endsWith('.json'))
  expect(files.length).toBeGreaterThan(5)
  for (const f of files) {
    const vi = read(join(dir, f))
    if (vi.order) expect([...vi.order].sort(), f).toEqual(vi.types.map(t => t.id).sort())
    for (const lang of readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
      const file = join(dir, lang, f)
      let t: EquipmentGuide
      try { t = read(file) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue; throw e }
      expect(shownTypes(t).map(x => x.id), `${lang}/${f}`).toEqual(shownTypes(vi).map(x => x.id))
    }
  }
  // What the council found (2026-11-06): the chiller led the heaters, the air pump and wave maker led the filters, the
  // salinity meter led the test kits, dry food came last.
  const first = (cat: string) => shownTypes(read(join(dir, `${cat}.json`)))[0]!.id
  expect([first('suoi'), first('loc'), first('test-nuoc'), first('thuc-an'), first('be-ca')]).toEqual(['mini', 'bot-bien', 'test', 'kho', 'nano'])
})
