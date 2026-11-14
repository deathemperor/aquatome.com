import { denied } from './piece-admission'
import { readFileSync } from 'node:fs'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { dueFields, extractTraits, readTraits, RULES, cardSchool, schoolFromSeriouslyFish, sfSchool } from '../src/traits'

async function content() {
  const root = join(await mkdtemp(join(tmpdir(), 'tr-')), 'content')
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), root, { recursive: true })
  await rm(join(root, 'traits'), { recursive: true, force: true })
  return root
}
const now = () => new Date('2026-10-29T00:00:00Z')

test('extracts traits up to the limit, then only for species without them', async () => {
  const root = await content()
  let calls = 0
  const llm = async <T,>() => { calls++; return { temperament: 'peaceful', finNipper: false, schoolMin: 8 } as T }
  const a = await extractTraits(root, llm, { limit: 3, now, publicBuild: false })
  expect(a.done.length).toBe(3)
  const b = await extractTraits(root, llm, { limit: 100, now, publicBuild: false })
  expect(b.done.some(id => a.done.includes(id))).toBe(false)
  expect((await readTraits(root)).length).toBe(a.done.length + b.done.length)
  expect(await extractTraits(root, llm, { limit: 100, now, publicBuild: false })).toEqual({ done: [], failed: [] })
  expect(calls).toBe(a.done.length + b.done.length)
})
test('invalid output is reported, not written', async () => {
  const root = await content()
  const r = await extractTraits(root, async <T,>() => ({ temperament: 'grumpy', finNipper: false, schoolMin: null }) as T, { limit: 1, now, publicBuild: false })
  expect(r.done).toEqual([])
  expect(r.failed.length).toBe(1)
  expect(await readTraits(root)).toEqual([])
})

// 2026-11-07, a design lab: the angelfish's school size was 6, from "if you intend to breed, start with a group of six
// juveniles; from this a pair is sure to form", so the tank-mates tool started it at six fish and advised six in a full
// tank. The rule says a number only about breeding, a pair or a harem is no school, and traits read with an older
// prompt are read again, after the pages that changed.
test('the school-size rule leaves out breeding groups, pairs and harems', () => {
  const rule = readFileSync(new URL('../src/prompts/traits.md', import.meta.url), 'utf8').split('\n').find(l => l.startsWith('- `schoolMin`'))!
  for (const words of ['a pair forms', 'harem', 'spawning tank', 'in a pair', 'small group" with no number is null']) expect(rule, words).toContain(words)
})

test('a field read with an older rule is read again after the changed pages, and only that field takes the new answer', async () => {
  const root = await content()
  const llm = async <T,>() => ({ temperament: 'peaceful', finNipper: false, schoolMin: null }) as T
  await extractTraits(root, llm, { limit: 100, now, publicBuild: false })
  const all = await readTraits(root)
  expect(all.every(t => JSON.stringify(t.rules) === JSON.stringify(RULES))).toBe(true)
  const [older, moved, before, noSchool] = all
  const put = (t: Record<string, unknown> & { id: string }) => writeFile(join(root, 'traits', `${t.id}.json`), JSON.stringify(t))
  // Its school size read with an older school rule; a temperament the same rule reads still stands.
  await put({ ...older!, temperament: 'aggressive', schoolMin: 6, rules: { ...RULES, schoolMin: 'older' } })
  // Its page changed since: every field read again.
  await put({ ...moved!, temperament: 'aggressive', speciesUpdatedAt: '2000-01-01' })
  // Read before rules were recorded: its school size again when it has one; none, nothing to read.
  const { rules: _a, ...b } = before!
  await put({ ...b, temperament: 'aggressive', schoolMin: 6 })
  const { rules: _b, ...n } = noSchool!
  await put({ ...n, temperament: 'aggressive', schoolMin: null })
  const r = await extractTraits(root, llm, { limit: 100, now, publicBuild: false })
  expect(r.done[0]).toBe(moved!.id)
  expect(new Set(r.done)).toEqual(new Set([moved!.id, older!.id, before!.id]))
  const now2 = new Map((await readTraits(root)).map(t => [t.id, t]))
  expect(now2.get(older!.id)).toMatchObject({ temperament: 'aggressive', schoolMin: null, rules: RULES })
  expect(now2.get(moved!.id)).toMatchObject({ temperament: 'peaceful', schoolMin: null })
  expect(now2.get(before!.id)).toMatchObject({ temperament: 'aggressive', schoolMin: null, rules: RULES })
  expect(dueFields(now2.get(noSchool!.id)!)).toEqual([])
  expect((await extractTraits(root, llm, { limit: 100, now, publicBuild: false })).done).toEqual([])
  // --only: its fields due, or all when none is.
  expect((await extractTraits(root, llm, { limit: 100, now, publicBuild: false, only: [older!.id] })).done).toEqual([older!.id])
  expect((await readTraits(root)).find(t => t.id === older!.id)).toMatchObject({ temperament: 'peaceful' })
})

// The chief of staff, 2026-11-11: the card's school size follows Seriously Fish first, like its other figures. The
// cardinal tetra's card said 6, from The Spruce Pets' "at least six", where Seriously Fish says 8-10.
const sf = (html: string) => [{ key: 'behaviour', source: 'seriouslyfish', html }]
test("Seriously Fish's group size, in its own words; not a breeding group, the wild, or what a fish only can be kept in", () => {
  expect(sfSchool(sf('<p>Try to buy a mixed-sex group of at least 8-10 specimens, include other schooling fishes.</p>'))).toBe(8)
  expect(sfSchool(sf('<p>A group of at least 6 individuals is suggested.</p>'))).toBe(6)
  expect(sfSchool(sf('<p>Should be maintained in groups of at least 5 or 6 specimens, preferably 10 or more.</p>'))).toBe(5)
  expect(sfSchool(sf('<p>Keep it in a mixed sex group comprising at least half a dozen specimens.</p>'))).toBe(6)
  expect(sfSchool(sf('<p>It should be kept in a group of half a dozen specimens.</p>'))).toBe(6)
  expect(sfSchool(sf('<p>It can be kept in groups of 3 or more individuals but a large tank is needed.</p>'))).toBeNull()
  expect(sfSchool(sf('<p>It was observed in close-knit groups of 10-20 individuals.</p>'))).toBeNull()
  expect(sfSchool(sf('<p>For breeding, a group of 6 juveniles will form a pair.</p>'))).toBeNull()
  expect(sfSchool([{ key: 'behaviour', source: 'sprucepets', html: '<p>Keep a group of at least 6 specimens.</p>' }])).toBeNull()
  expect(sfSchool([{ key: 'reproduction', source: 'seriouslyfish', html: '<p>Use a group of 8 specimens.</p>' }])).toBeNull()
})

test("a card whose school size isn't Seriously Fish's takes it, with no model call; one it gives none for keeps its own", async () => {
  const root = await content()
  await extractTraits(root, async <T,>() => ({ temperament: 'peaceful', finNipper: false, schoolMin: 6 }) as T, { limit: 100, now, publicBuild: false })
  const [a, b] = (await readTraits(root)).map(t => t.id)
  const say = async (id: string, html: string) => {
    const f = join(root, 'species', id, 'entity.json')
    const e = JSON.parse(await readFile(f, 'utf8')) as { sections: object[] }
    await writeFile(f, JSON.stringify({ ...e, sections: [...e.sections, { key: 'behaviour', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/species/x', html }] }))
  }
  await say(a!, '<p>Try to buy a mixed-sex group of at least 8-10 specimens.</p>')
  await say(b!, '<p>It can be kept in groups of 3 or more individuals.</p>')
  expect(await schoolFromSeriouslyFish(root)).toEqual([a])
  const t = new Map((await readTraits(root)).map(x => [x.id, x]))
  expect(t.get(a!)!.schoolMin).toBe(8)
  expect(t.get(b!)!.schoolMin).toBe(6)
  expect(await schoolFromSeriouslyFish(root)).toEqual([])
})

// The chief of staff, 2026-11-11: Seriously Fish first, never below the page's own text. Microrasbora rubescens: Seriously
// Fish 8-10, Glaser "groups of 10 specimens or more", so 10; Corydoras hastatus: only Seriously Fish's 4-6, so 4.
test("the card never goes below the minimum another source on the page tells the reader; where the text agrees, it moves", () => {
  const all = () => true
  const sfSays = { key: 'behaviour', source: 'seriouslyfish', html: '<p>It is a shoaling species by nature and a group of at least 8-10 specimens should be purchased.</p>' }
  expect(cardSchool([sfSays, { key: 'behaviour', source: 'glaser', html: '<p>They should be kept in groups of 10 specimens or more in well-planted aquaria.</p>' }], all)).toBe(10)
  expect(cardSchool([sfSays, { key: 'behaviour', source: 'glaser', html: '<p>They should never be kept in groups of fewer than 10–12 individuals.</p>' }], all)).toBe(10)
  expect(cardSchool([sfSays, { key: 'aquariumSize', source: 'sprucepets', html: '<p>Keep a school of at least six; if you have a large aquarium, you can keep a bigger school.</p>' }], all)).toBe(8)
  expect(cardSchool([{ key: 'behaviour', source: 'seriouslyfish', html: '<p>Should be maintained in a group of at least 4-6 individuals, ideally 10 or more.</p>' }], all)).toBe(4)
  expect(cardSchool([sfSays, { key: 'behaviour', source: 'glaser', html: '<p>Keep them in groups of 12 specimens or more.</p>' }], s => s !== 'glaser')).toBe(8)
  expect(cardSchool([{ key: 'behaviour', source: 'glaser', html: '<p>Keep them in groups of 12 specimens or more.</p>' }], all)).toBeNull()
  // A source's own minimum, not the most it hopes for; the wild is no school to keep.
  expect(cardSchool([sfSays, { key: 'behaviour', source: 'aquariumcoop', html: '<p>Keep at least 6 fish, ideally in groups of 12 or more.</p>' }], all)).toBe(8)
  expect(cardSchool([sfSays, { key: 'habitat', source: 'glaser', html: '<p>It lives in schools of 30 fish in slow streams.</p>' }], all)).toBe(8)
  expect(cardSchool([{ key: 'habitat', source: 'seriouslyfish', html: '<p>Large shoals of at least 30 specimens gather in pools.</p>' }], all)).toBeNull()
})

test('item admission stops without model calls or content changes', async () => {
  const c = await content()
  await denied('traits', join(c, '..'), async () => {
    const r = await extractTraits(c, async () => { throw new Error('called') }, { limit: 5, now, publicBuild: false })
    expect(r.stopped).toContain('not started')
    expect(r.failed).toEqual([])
  })
})
