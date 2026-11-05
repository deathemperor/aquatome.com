import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { careNeeds, NEED_ORDER, NEED_RULES, rangeSpan, type Need, type NeedKey, type NeedLevel, type Range, type Temperament, type TempWhy, type WaterWhy } from '@aq/schema'
import { FACTS, type AppIndex, type Facts } from '../src/lib/app-index'
import { guideLink, LEVEL_WORDS, NEED_LABELS, NEEDS_ANCHOR, TEMPERAMENT_WORDS, WHY_WORDS } from '../src/lib/card-guide'
import { fmt } from '../src/lib/format'
import { appPath, LANGS, localizePath, missing, OTHER_LANGS, translator, type Lang } from '../src/lib/i18n'
import { appPage, DIST } from './dist'

// Shared with the iOS app, which reads the "Vì sao?" panel's needs from a fish's index entry with its own port of
// careNeeds, and writes them in these words. Only the notes, the made-up entries and the `species` ids are written by
// hand: UPDATE_VECTORS=1 pnpm --filter site test rewrites the rest (a species' entry from the fixture build's app index,
// careNeeds' answer, the lines the panel shows, the words in each language).
const FILE = new URL('../../../protocols/care-needs-vectors.json', import.meta.url)
const FIXTURE = new URL('fixture-content/species/', import.meta.url)

type Words = {
  summary: string; lead: string; need: Record<NeedKey, string>; level: Record<NeedLevel, string>; why: Record<WaterWhy | TempWhy, string>
  temperament: Record<Temperament, string>; finNipper: string; tank: string; size: string; school: string; note: string; how: string; howPath: string
}
type Line = [label: string, level: string, figures: string]
type Case = { note: string; species?: string; entry: Facts; needs: Need[]; shown: Record<Lang, Line[]> }
type Vectors = { $comment: string; cases: Case[]; words: Record<Lang, Words> }

/** The panel's own strings in DataCard.astro, as t() takes them; the last test holds the component to this list. */
const PANEL = {
  summary: 'Vì sao?', lead: 'Điều làm loài này dễ hay khó nuôi, đọc từ bảng:', finNipper: 'hay cắn vây', tank: 'bể từ {cm}', size: 'cá dài {cm}',
  school: 'đàn từ {n} con', note: 'Độ khó {n}/8 là mức nguồn chấm. Nguồn có thể tính cả điều bảng không ghi, như thức ăn.', how: 'Cách tính các mức',
}

/** Each word as a page in `lang` writes it: through the site's t(), the temperament lower-cased as the panel does. */
function words(lang: Lang): Words {
  const t = translator(lang)
  const each = <K extends string>(o: Record<K, string>, f = (s: string) => s) => Object.fromEntries(Object.entries<string>(o).map(([k, v]) => [k, f(t(v))])) as Record<K, string>
  return {
    summary: t(PANEL.summary), lead: t(PANEL.lead), need: each(NEED_LABELS), level: each(LEVEL_WORDS), why: each(WHY_WORDS),
    temperament: each(TEMPERAMENT_WORDS, s => s.toLocaleLowerCase(lang)), finNipper: t(PANEL.finNipper),
    tank: t(PANEL.tank), size: t(PANEL.size), school: t(PANEL.school), note: t(PANEL.note), how: t(PANEL.how), howPath: appPath(lang, guideLink(NEEDS_ANCHOR)),
  }
}

/** The panel's line for each need, as DataCard.astro writes it (the built pages hold this to the component). */
function lines(needs: Need[], lang: Lang, w: Words): Line[] {
  const { num, range } = fmt(lang)
  const why = (codes: (WaterWhy | TempWhy)[]) => (codes.length ? `${codes.map(c => w.why[c]).join(', ')} · ` : '')
  const figures = (n: Need): string => {
    switch (n.key) {
      case 'space': return [n.tankCm !== undefined && w.tank.replace('{cm}', `${num(n.tankCm)} cm`), n.sizeCm !== undefined && w.size.replace('{cm}', `${num(n.sizeCm)} cm`)].filter(Boolean).join(', ')
      case 'water': return why(n.why) + [n.ph && `pH ${range(n.ph)}`, n.gh && `${range(n.gh)} dGH`].filter(Boolean).join(', ')
      case 'temperature': return `${why(n.why)}${range(n.tempC)}°C`
      case 'temperament': return [n.temperament && w.temperament[n.temperament], n.finNipper && w.finNipper].filter(Boolean).join(', ')
      case 'social': return w.school.replace('{n}', String(n.schoolMin))
    }
  }
  return needs.map(n => [w.need[n.key], w.level[n.level], figures(n)])
}

/** A fish's entry in the fixture build's app index: the fields careNeeds reads, as the app gets them. */
const index: AppIndex = JSON.parse(readFileSync(`${DIST}/app/vi.json`, 'utf8'))
function entryOf(id: string): Facts {
  const item = index.items.find(i => i.kind === 'fish' && i.id === id)
  if (!item) throw new Error(`${id}: no fish of that id in the fixture build's app index`)
  return Object.fromEntries(FACTS.filter(k => item[k] !== undefined).map(k => [k, item[k]])) as Facts
}

/** The file as the site would write it now, from the hand-written notes, entries and species ids of `kept`. */
function regenerate(kept: Vectors): Vectors {
  const w = Object.fromEntries(LANGS.map(l => [l, words(l)])) as Record<Lang, Words>
  const cases = kept.cases.map((c): Case => {
    const entry = c.species ? entryOf(c.species) : c.entry
    const needs = careNeeds(entry)
    return { note: c.note, ...(c.species ? { species: c.species } : {}), entry, needs, shown: Object.fromEntries(LANGS.map(l => [l, lines(needs, l, w[l])])) as Record<Lang, Line[]> }
  })
  return { $comment: kept.$comment, cases, words: w }
}

/** JSON with two spaces, anything that fits in 120 columns on one line. */
const flat = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(flat).join(', ')}]` : v && typeof v === 'object' ? `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${flat(x)}`).join(', ')}}` : JSON.stringify(v)
function json(v: unknown, indent = '', lead = 0): string {
  const one = flat(v)
  if (!v || typeof v !== 'object' || indent.length + lead + one.length <= 120) return one
  const inner = `${indent}  `
  const body = Array.isArray(v) ? v.map(x => inner + json(x, inner)) : Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${json(x, inner, k.length + 4)}`)
  return Array.isArray(v) ? `[\n${body.join(',\n')}\n${indent}]` : `{\n${body.join(',\n')}\n${indent}}`
}

const kept: Vectors = JSON.parse(readFileSync(FILE, 'utf8'))
const norm = (s: string | undefined) => s?.replace(/\s+/g, ' ').trim()

test('protocols/care-needs-vectors.json is careNeeds\' answers, the panel\'s lines and its words, as the site has them now', () => {
  const next = `${json(regenerate(kept))}\n`
  if (process.env.UPDATE_VECTORS === '1') writeFileSync(FILE, next)
  expect(readFileSync(FILE, 'utf8'), 'run UPDATE_VECTORS=1 pnpm --filter site test').toBe(next)
  // Every Indonesian and Thai word is the site's translation, none the Vietnamese left in its place.
  for (const lang of OTHER_LANGS) expect([...(missing.get(lang) ?? [])], lang).toEqual([])
})

test('careNeeds gives each case\'s needs, in NEED_ORDER, from the entry as the app index has it', () => {
  expect(kept.cases.length).toBeGreaterThan(50)
  for (const c of kept.cases) {
    expect(careNeeds(c.entry), c.note).toEqual(c.needs)
    const at = c.needs.map(n => NEED_ORDER.indexOf(n.key))
    expect(at, c.note).toEqual([...at].sort((a, b) => a - b))
    // The index's own shape (toIndexItem, then clean): its fact fields only, a field with no figure left out, finNipper
    // only when true and schoolMin only when there is one.
    for (const [k, v] of Object.entries(c.entry)) {
      expect(FACTS, `${c.note}: ${k}`).toContain(k)
      expect(v, `${c.note}: ${k}`).not.toBeNull()
    }
    if ('finNipper' in c.entry) expect(c.entry.finNipper, c.note).toBe(true)
    if ('schoolMin' in c.entry) expect(c.entry.schoolMin, c.note).toBeGreaterThan(0)
  }
})

test('the cases sit on every threshold of NEED_RULES and just past it, and give every level, why code and temperament', () => {
  const R = NEED_RULES
  const span = (r?: Range) => (r ? rangeSpan(r) : undefined)
  const entries = kept.cases.map(c => c.entry)
  // [the threshold, the figure it reads, its value, the step past it to the next level]
  const edges: [string, (e: Facts) => number | undefined, number, number][] = [
    ['tank easy', e => e.tankCm, R.tankCm.easy, 1], ['tank mid', e => e.tankCm, R.tankCm.mid, 1],
    ['size easy', e => e.sizeCm, R.sizeCm.easy, 1], ['size mid', e => e.sizeCm, R.sizeCm.mid, 1],
    ['pH acidHard', e => e.ph?.max, R.ph.acidHard, 0.1], ['pH neutral', e => e.ph?.max, R.ph.neutral, -0.1],
    ['pH alkaline', e => e.ph?.min, R.ph.alkaline, -0.1], ['pH narrow', e => span(e.ph), R.ph.narrow, -0.1],
    ['GH soft', e => e.gh?.max, R.gh.soft, 1], ['GH veryHard', e => e.gh?.min, R.gh.veryHard, -1], ['GH narrow', e => span(e.gh), R.gh.narrow, -1],
    ['temperature warmHard', e => e.tempC?.min, R.tempC.warmHard, -1], ['temperature coolHard', e => e.tempC?.max, R.tempC.coolHard, 1],
    ['temperature warm', e => e.tempC?.min, R.tempC.warm, -1], ['temperature cool', e => e.tempC?.max, R.tempC.cool, 1],
    ['temperature narrow', e => span(e.tempC), R.tempC.narrow, -1],
    ['school easy', e => e.schoolMin, R.schoolMin.easy, 1], ['school mid', e => e.schoolMin, R.schoolMin.mid, 1],
  ]
  const on = (x: number | undefined, v: number) => x !== undefined && Math.abs(x - v) < 1e-9
  for (const [what, figure, v, step] of edges) {
    expect(entries.some(e => on(figure(e), v)), `${what}: a case at ${v}`).toBe(true)
    expect(entries.some(e => on(figure(e), v + step)), `${what}: a case at ${v + step}`).toBe(true)
  }
  const needs = kept.cases.flatMap(c => c.needs)
  for (const key of NEED_ORDER) for (const level of ['easy', 'mid', 'hard']) expect(needs.some(n => n.key === key && n.level === level), `${key} ${level}`).toBe(true)
  const codes = new Set(needs.flatMap(n => ('why' in n ? n.why : [])))
  expect([...codes].sort()).toEqual(Object.keys(WHY_WORDS).sort())
  const temperaments = new Set(needs.flatMap(n => (n.key === 'temperament' && n.temperament ? [n.temperament] : [])))
  expect([...temperaments].sort()).toEqual(Object.keys(TEMPERAMENT_WORDS).sort())
  expect(needs.some(n => n.key === 'temperament' && n.finNipper && !n.temperament), 'a fin nipper with no temperament').toBe(true)
  expect(entries.some(e => Object.keys(e).length === 0), 'an empty entry').toBe(true)
})

test('each fixture fish\'s built page shows these lines in these words, from its app index entry, and no panel without a difficulty', () => {
  const w = kept.words.vi
  const fish = readdirSync(FIXTURE)
  expect(fish.length).toBeGreaterThan(5)
  for (const id of fish) {
    const entry = entryOf(id)
    const needs = careNeeds(entry)
    const item = index.items.find(i => i.id === id)!
    const why = appPage(item.path).dom.querySelector('.card [data-field="difficulty"] details.why')
    expect(why !== null, `${id}: a panel`).toBe(entry.difficulty !== undefined && needs.length > 0)
    if (!why) continue
    const listed = kept.cases.find(c => c.species === id)?.shown.vi ?? lines(needs, 'vi', w)
    const li = why.querySelectorAll('li')
    expect(li.map(n => [n.getAttribute('data-need'), n.getAttribute('data-level')]), id).toEqual(needs.map(n => [n.key, n.level]))
    expect(li.map(n => [norm(n.querySelector('.nm')?.text), norm(n.querySelector('.lv')?.text), norm(n.querySelector('.fx')?.text)]), id).toEqual(listed)
    expect(norm(why.querySelector('summary .n')?.text), id).toBe(`${entry.difficulty}/8`)
    expect(norm(why.querySelector('summary .q')?.text), id).toBe(w.summary)
    expect(norm(why.querySelector('.lead')?.text), id).toBe(w.lead)
    expect(norm(why.querySelector('.note')?.text), id).toBe(`${w.note.replace('{n}', String(entry.difficulty))} ${w.how}`)
    expect(why.querySelector('.note a')?.getAttribute('href'), id).toBe(localizePath('vi', guideLink(NEEDS_ANCHOR)))
  }
  expect(kept.cases.filter(c => c.species).length).toBeGreaterThanOrEqual(2)
})

test('the panel writes only these strings and maps through t(), so the Indonesian and Thai words are what its pages show', () => {
  // The fixture has no Indonesian or Thai fish page: the panel's words in those languages are its strings through the
  // same t() and dictionaries, which the first test holds the file to.
  const src = readFileSync(new URL('../src/components/DataCard.astro', import.meta.url), 'utf8')
  const block = src.slice(src.indexOf('<details class="why">'), src.indexOf('</details>', src.indexOf('<details class="why">')))
  expect(block.length).toBeGreaterThan(100)
  const literals = [...block.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map(m => m[1]!.replace(/\\'/g, "'"))
  const maps = [...block.matchAll(/\bt\(([A-Z_]+)\[/g)].map(m => m[1])
  expect(literals.length + maps.length, 'every t() in the panel is a string or one of the maps').toBe([...block.matchAll(/\bt\(/g)].length)
  expect(new Set(literals)).toEqual(new Set(Object.values(PANEL)))
  expect(new Set(maps)).toEqual(new Set(['NEED_LABELS', 'LEVEL_WORDS', 'WHY_WORDS', 'TEMPERAMENT_WORDS']))
  expect(block).toContain('t(TEMPERAMENT_WORDS[n.temperament]).toLocaleLowerCase(lang)')
})
