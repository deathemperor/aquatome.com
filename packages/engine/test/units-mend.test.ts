import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { READY_TANKS, tankLengthFor } from '@aq/schema'
import { expect, test } from 'vitest'
import { fitKey, fitText, type FitFinding, type FitState } from '../src/fit'
import { loadPages } from '../src/pages'
import { amountsOutside } from '../src/for-reader'
import { givesDose, numberIn, TANK_RULE, US_TANKS, usTankOf, withTanks } from '../src/round'
import { reviewRewrite } from '../src/quality'
import { namesTwice, onlyFigures, unitsMend, UNITS_MEND_FROM } from '../src/units-mend'

const FIXTURE = new URL('../../../apps/site/test/fixture-content', import.meta.url).pathname
const GUIDE = 'content/guides/youtube-r53ZQW0m8VM/vi.json'
const after = () => new Date('2026-11-13T08:00:00+07:00')

test('a tank in US gallons has one size a keeper here names, and a figure converted another way maps back to it', () => {
  expect(Object.fromEntries(US_TANKS)).toMatchObject({ 5: 20, 10: 40, 20: 80, 25: 100, 29: 120, 30: 120, 55: 200, 125: 450, 180: 700 })
  // Every size within a tenth of the exact volume, and never more than a twentieth under it: a minimum mustn't drop.
  for (const [g, l] of US_TANKS) {
    const exact = g * 3.785411784
    expect(Math.abs(l - exact) / exact, `${g} gallons`).toBeLessThanOrEqual(0.1)
    expect((exact - l) / exact, `${g} gallons`).toBeLessThanOrEqual(0.05)
  }
  // The exact figure either way, with a decimal, or to the nearest 5 litres: what writers made of 30 gallons.
  for (const l of [113, 114, 113.6, 115]) expect(usTankOf(l)).toEqual([30, 120])
  // A figure in between (470 for 125 gallons), and one no listed tank gives (98, 1.325), map to none.
  for (const l of [470, 98, 1325, 60]) expect(usTankOf(l)).toBeUndefined()
  for (const [, l] of US_TANKS) expect(TANK_RULE.en).toContain(`${l} litres`)
  expect(TANK_RULE.vi).toContain('30 gallon 120 lít')
  expect(withTanks('Units: {{TANKS_EN}}. Đơn vị: {{TANKS_VI}}.')).toBe(`Units: ${TANK_RULE.en}. Đơn vị: ${TANK_RULE.vi}.`)
})

test('the sizes agree with the site\'s ready-made tank table: the same tank for a size as for its exact volume, but 25 gallons', () => {
  const differ = US_TANKS.filter(([g, l]) => tankLengthFor(g * 3.785411784) !== tankLengthFor(l)).map(([g]) => g)
  expect(differ).toEqual([25])
  // A volume the tool names for one of its own tanks is never taken for a converted one.
  const tool = READY_TANKS.map(([a, b, c]) => Math.round((a * b * c) / 1000))
  expect(tool.filter(l => usTankOf(l))).toEqual([])
})

test('the code\'s checks of a mend: only the figures change, each within a tenth, and no sentence names one volume twice', () => {
  expect(onlyFigures('<p>Cần khoảng 115 lít.</p>', '<p>Cần khoảng 120 lít.</p>', 'vi')).toBe(true)
  expect(onlyFigures('<p>Cần khoảng 115 lít.</p>', '<p>Cần ít nhất 120 lít.</p>', 'vi')).toBe(false)
  expect(onlyFigures('<p>Cần khoảng 115 lít.</p>', '<p>Cần khoảng 150 lít.</p>', 'vi')).toBe(false)
  expect(namesTwice('Bể 80 lít là khoảng 75 lít.', 'Bể 80 lít là khoảng 80 lít.', 'vi')).toBe(true)
  expect(namesTwice('Bể 75 lít. Bể kia 80 lít.', 'Bể 80 lít. Bể kia 80 lít.', 'vi')).toBe(false)
})

/** The fixture content with the guide held for units alone, its text `body` (and `name`), and a saved read quoting `quotes`. */
async function held(body: string, quotes: string[], o: { name?: string; checks?: string[]; stale?: boolean; also?: FitFinding[]; other?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'units-mend-'))
  await cp(FIXTURE, join(root, 'content'), { recursive: true })
  await mkdir(join(root, 'engine-state'))
  if (o.other) {
    const f = join(root, 'content/guides/youtube-vl1Lx9iWDYU/vi.json')
    await writeFile(f, JSON.stringify({ ...JSON.parse(await readFile(f, 'utf8')), name: o.other }, null, 2))
  }
  const t = JSON.parse(await readFile(join(root, GUIDE), 'utf8'))
  await writeFile(join(root, GUIDE), `${JSON.stringify({ ...t, body, summary: [], ...(o.name ? { name: o.name } : {}), held: { checks: o.checks ?? ['units'], at: '2026-11-09' } }, null, 2)}\n`)
  const p = (await loadPages(join(root, 'content'), ['vi'])).find(x => x.id === 'youtube-r53ZQW0m8VM')!
  const findings: FitFinding[] = [...quotes.map(quote => ({ check: 'units' as const, part: 'P1', quote, why: 'converted', by: 'model' as const })), ...(o.also ?? [])]
  const state: FitState = { [fitKey(p)]: { at: '2026-11-09', hash: o.stale ? 'old' : fitText(p).hash, model: 'm', products: [], findings, checklist: 3 } }
  await writeFile(join(root, 'engine-state/_fit.json'), `${JSON.stringify(state)}\n`)
  return root
}
const file = async (root: string) => JSON.parse(await readFile(join(root, GUIDE), 'utf8'))
const fixTitle = async (root: string) => { const f = join(root, GUIDE); await writeFile(f, JSON.stringify({ ...JSON.parse(await readFile(f, 'utf8')), nameFixed: true }, null, 2)) }

test('a page held for units alone has its converted tank written as a keeper\'s size, every place it gives it, and stays held for the gate', async () => {
  const root = await held('<p>Mỗi con cần ít nhất khoảng 115 lít nước.</p><p>Bể 115 lít là vừa.</p>', ['Mỗi con cần ít nhất khoảng 115 lít nước'], { name: 'Cá vàng trong bể 115 lít' })
  const r = await unitsMend(root, { now: after })
  expect(r.mended.map(m => `${m.key} ${m.figures.join(', ')}`)).toEqual(['vi/guides/youtube-r53ZQW0m8VM 115 lít -> 120 lít'])
  const t = await file(root)
  expect(t.body).toBe('<p>Mỗi con cần ít nhất khoảng 120 lít nước.</p><p>Bể 120 lít là vừa.</p>')
  expect(t.name).toBe('Cá vàng trong bể 120 lít')
  // The gate lets it out once it reads the new text and finds it passes.
  expect(t.held).toEqual({ checks: ['units'], at: '2026-11-09' })
})

test('a US figure in brackets after the litres goes with them', async () => {
  const root = await held('<p>Cá cho bể nhỏ.</p>', [], { name: 'Loài cá hợp nuôi trong bể 38 lít (10 gallon)' })
  const r = await unitsMend(root, { now: after })
  expect(r.mended[0]?.figures).toEqual(['38 lít (10 gallon) -> 40 lít'])
  expect((await file(root)).name).toBe('Loài cá hợp nuôi trong bể 40 lít')
})

test('a mend that would give a guide another guide\'s title leaves it held and listed', async () => {
  const root = await held('<p>Cá cho bể nhỏ.</p>', [], { name: 'Loài cá hợp nuôi trong bể 38 lít (10 gallon)', other: 'Loài cá hợp nuôi trong bể 40 lít' })
  const r = await unitsMend(root, { now: after })
  expect(r.mended).toEqual([])
  expect(r.left).toEqual([expect.stringContaining('its title would be another page\'s')])
  expect((await file(root)).name).toBe('Loài cá hợp nuôi trong bể 38 lít (10 gallon)')
})

test('what it can\'t mend exactly stays held, as it is, and is listed; before 13 Nov 08:00 it only waits', async () => {
  const cases: [string, string, string][] = [
    ['<p>Bể cho chúng từ 75–110 lít trở lên.</p>', 'từ 75–110 lít', 'a range'],
    ['<p>Hai cái chạy trong bể khoảng 470 lít.</p>', 'khoảng 470 lít', 'no US tank size'],
    ['<p>Phủ khoảng 2,5 cm cát.</p>', 'khoảng 2,5 cm cát', 'a length or a temperature'],
    ['<p>Bể 80 lít là khoảng 75 lít.</p>', 'khoảng 75 lít', 'name one volume twice'],
    ['<p>Dùng 5 ml cho mỗi 38 lít nước.</p>', 'cho mỗi 38 lít', 'a dose'],
  ]
  for (const [body, quote, why] of cases) {
    const root = await held(body, [quote])
    const r = await unitsMend(root, { now: after })
    expect(r.mended).toEqual([])
    expect(r.left).toEqual([expect.stringContaining(why)])
    expect((await file(root)).body).toBe(body)
  }
  // A saved read of older text, or another fault beside the units: the gate's to read or hold.
  const stale = await held('<p>Cần khoảng 115 lít.</p>', ['khoảng 115 lít'], { stale: true })
  expect((await unitsMend(stale, { now: after })).left).toEqual([expect.stringContaining('no saved read of its text')])
  const shop = await held('<p>Cần khoảng 115 lít.</p>', ['khoảng 115 lít'], { checks: ['shop', 'units'], also: [{ check: 'shop', part: 'P1', quote: 'Petco', why: 'a US shop', by: 'model' }] })
  expect((await unitsMend(shop, { now: after })).mended).toEqual([])

  const early = await held('<p>Cần khoảng 115 lít.</p>', ['khoảng 115 lít'])
  expect(await unitsMend(early, { now: () => new Date(Date.parse(UNITS_MEND_FROM) - 1) })).toEqual({ mended: [], left: [], waiting: UNITS_MEND_FROM })
  // A dry run says what it would change, whatever the day, and writes nothing.
  const dry = await unitsMend(early, { dryRun: true, now: () => new Date('2026-11-11T21:00:00+07:00') })
  expect(dry.mended[0]?.changes).toEqual([{ field: 'body', old: '<p>Cần khoảng 115 lít.</p>', now: '<p>Cần khoảng 120 lít.</p>' }])
  expect((await file(early)).body).toBe('<p>Cần khoảng 115 lít.</p>')
})

test('every writer and reviewer converting a tank gets the one table: no prompt rounds to the nearest 5 litres, and each placeholder is filled', async () => {
  const { readdir } = await import('node:fs/promises')
  const dir = new URL('../src/prompts/', import.meta.url).pathname, src = new URL('../src/', import.meta.url).pathname
  const code = await Promise.all((await readdir(src)).filter(f => f.endsWith('.ts')).map(async f => readFile(join(src, f), 'utf8')))
  const withTable: string[] = []
  for (const f of await readdir(dir)) {
    const text = await readFile(join(dir, f), 'utf8')
    expect(text, f).not.toMatch(/nearest 5 litres|tới 5 lít/)
    if (!text.includes('{{TANKS_')) continue
    withTable.push(f)
    const loads = code.flatMap(c => c.split('\n')).filter(l => l.includes(`prompts/${f}'`))
    expect(loads.length, f).toBeGreaterThan(0)
    for (const l of loads) expect(l, f).toContain('withTanks(')
  }
  // The video guide's writer had no rule at all, and wrote "115 lít" for 30 gallons (8 to 11 Nov 2026).
  expect(withTable).toEqual(expect.arrayContaining(['video-guide.md', 'video-review.md', 'vi-rewrite.md', 'localize.md', 'localize-review.md', 'review.md', 'process.md', 'guide-write.md', 'breed.md', 'breed-intl.md', 'species.md', 'species-video.md', 'topic.md']))
  // Every prompt with a rule on units has the table, but those that write no tank of their own: the checkers (the video
  // editor's reviewer, told units are left for code), the fact finder, and the writers told to keep each figure as their
  // record gives it.
  const KEEP_FIGURES = ['fit.md', 'reader.md', 'guide-facts.md', 'summary.md', 'review-write.md', 'video-mend-review.md']
  for (const f of await readdir(dir)) {
    const text = await readFile(join(dir, f), 'utf8')
    if (/hệ mét|metric|gallon|°F|\binch|imperial|đổi đơn vị/i.test(text) && !KEEP_FIGURES.includes(f)) expect(withTable, f).toContain(f)
  }
})

/** The fixture's danio-margaritatus held for units alone: its seriouslyfish sections' English and Vietnamese, and a saved read quoting `quote` in the habitat. */
async function fish(sections: Record<string, [en: string, vi: string]>, quote: string, o: { name?: string; nameFixed?: boolean; aquatome?: { key: string; vi: string; facts?: string[] }; at?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'units-mend-fish-'))
  await cp(FIXTURE, join(root, 'content'), { recursive: true })
  await mkdir(join(root, 'engine-state'))
  const dir = join(root, 'content/species/danio-margaritatus')
  const sources = JSON.parse(await readFile(join(root, 'content/sources.json'), 'utf8'))
  sources.seriouslyfish = { ...sources.seriouslyfish, publish: true, permission: { date: '2026-10-29', file: 'noted', scope: ['translation'] } }
  await writeFile(join(root, 'content/sources.json'), JSON.stringify(sources, null, 2))
  const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
  const t = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8'))
  for (const [key, [en, vi]] of Object.entries(sections)) {
    e.sections.find((s: { key: string; source: string }) => s.key === key && s.source === 'seriouslyfish').html = en
    t.sections[`${key}:seriouslyfish`] = vi
  }
  // A section AquaTome wrote from research facts: its facts in engine-state, if any.
  if (o.aquatome) {
    e.sections.push({ key: o.aquatome.key, source: 'aquatome', sourceUrl: 'https://aquatome.com/vi/gioi-thieu/', html: o.aquatome.vi })
    t.sections[`${o.aquatome.key}:aquatome`] = o.aquatome.vi
    if (o.aquatome.facts) {
      await mkdir(join(root, 'engine-state/species-research'), { recursive: true })
      await writeFile(join(root, 'engine-state/species-research/danio-margaritatus.json'), JSON.stringify({ facts: o.aquatome.facts.map(fact => ({ fact })) }))
    }
  }
  await writeFile(join(dir, 'entity.json'), JSON.stringify(e, null, 2))
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ ...t, ...(o.name ? { name: o.name } : {}), ...(o.nameFixed ? { nameFixed: true } : {}), held: { checks: ['units'], at: '2026-11-10' } }, null, 2))
  const p = (await loadPages(join(root, 'content'), ['vi'])).find(x => x.id === 'danio-margaritatus')!
  const part = fitText(p).parts.find(x => x.field === (o.at ?? 'sections.habitat:seriouslyfish'))!.id
  await writeFile(join(root, 'engine-state/_fit.json'), JSON.stringify({ [fitKey(p)]: { at: '2026-11-10', hash: fitText(p).hash, model: 'm', products: [], checklist: 3, findings: [{ check: 'units', part, quote, why: 'converted', by: 'model' }] } }))
  const r = await unitsMend(root, { now: after })
  return { r, t: JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')) }
}

test('a fish page is mended only where its English gives the tank in gallons: a figure the English gives in litres stays', async () => {
  const gallons = await fish({ habitat: ['<p>A standard 20 gallon US is the minimum for a pair.</p>', '<p>Một cặp cần tối thiểu bể tiêu chuẩn 75 lít.</p>'] }, 'Một cặp cần tối thiểu bể tiêu chuẩn 75 lít')
  expect(gallons.t.sections['habitat:seriouslyfish']).toBe('<p>Một cặp cần tối thiểu bể tiêu chuẩn 80 lít.</p>')
  // The English's own "about 108 litres", rounded by a translator to 110, isn't the 29-gallon tank 110 maps back to.
  const litres = await fish({ habitat: ['<p>A tank of 120 × 30 cm should be the smallest considered (about 108 litres).</p>', '<p>Bể nhỏ nhất nên dùng là khoảng 110 lít.</p>'] }, 'Bể nhỏ nhất nên dùng là khoảng 110 lít')
  expect(litres.r.left).toEqual([expect.stringContaining('gives no 29 gallons')])
  expect(litres.t.sections['habitat:seriouslyfish']).toBe('<p>Bể nhỏ nhất nên dùng là khoảng 110 lít.</p>')
  // The same number in another section whose English gives it in litres stays; a name a person fixed stays.
  const other = await fish({
    habitat: ['<p>A standard 20 gallon tank.</p>', '<p>Cần bể 75 lít.</p>'],
    quickFacts: ['<p>Raise the fry in 75 litres.</p>', '<p>Nuôi cá bột trong 75 lít.</p>'],
  }, 'Cần bể 75 lít', { name: 'Cá galaxy bể 75 lít', nameFixed: true })
  expect(other.t.sections['habitat:seriouslyfish']).toBe('<p>Cần bể 80 lít.</p>')
  expect(other.t.sections['quickFacts:seriouslyfish']).toBe('<p>Nuôi cá bột trong 75 lít.</p>')
  expect(other.t.name).toBe('Cá galaxy bể 75 lít')
})

test('a range\'s far end with its own unit, a dose\'s water and a flow keep their figures; a decimal is read as one', async () => {
  for (const [body, quote] of [['<p>Bể từ 70 lít đến 76 lít.</p>', '76 lít'], ['<p>Bể 75 lít – 115 lít.</p>', '115 lít']] as [string, string][]) {
    const root = await held(body, [quote])
    expect((await unitsMend(root, { now: after })).mended).toEqual([])
    expect((await file(root)).body).toBe(body)
  }
  const flow = await held('<p>Bể 115 lít.</p><p>Máy bơm 115 lít mỗi giờ.</p>', ['Bể 115 lít'])
  await unitsMend(flow, { now: after })
  expect((await file(flow)).body).toBe('<p>Bể 120 lít.</p><p>Máy bơm 115 lít mỗi giờ.</p>')
  // A part that gives a dose keeps its tank as it is too: held for a writer.
  const beside = await held('<p>Bể 115 lít.</p><p>Pha 5 ml vào 115 lít nước.</p>', ['Bể 115 lít'])
  await unitsMend(beside, { now: after })
  expect((await file(beside)).body).toBe('<p>Bể 115 lít.</p><p>Pha 5 ml vào 115 lít nước.</p>')
  const dose = await held('<p>Pha 5 ml vào 115 lít nước.</p>', ['Pha 5 ml vào 115 lít nước'])
  expect((await unitsMend(dose, { now: after })).left).toEqual([expect.stringContaining('a dose\'s water or a flow')])
  // "75.7" is 75.7 litres, 20 gallons, in any language, never 757; "1.325" is still a thousand and more.
  expect([numberIn('75.7', 'vi'), numberIn('75,7', 'th'), numberIn('2,5', 'vi'), numberIn('1.325', 'vi'), numberIn('1,325', 'th')]).toEqual([75.7, 75.7, 2.5, 1325, 1325])
  const decimal = await held('<p>Cần 75.7 lít.</p>', ['Cần 75.7 lít'])
  await unitsMend(decimal, { now: after })
  expect((await file(decimal)).body).toBe('<p>Cần 80 lít.</p>')
})

test('the guide writer\'s figure check takes a US tank only as the size the table names', () => {
  expect(amountsOutside('Mỗi con cần khoảng 115 lít.', 'Give them at least 30 gallons of water per fish.')).toEqual(['115 l'])
  expect(amountsOutside('Mỗi con cần khoảng 120 lít.', 'Give them at least 30 gallons of water per fish.')).toEqual([])
})

test('a part mends only from what it was written from: a research fact read as it is, a part with no source keeps its figures', async () => {
  // The research says 38 L itself: the breeder's first tank stays as the fact gives it.
  const facts = ['One breeder started with a 10-gallon (about 38 L) tank and later kept a colony in a 55-gallon (about 208 L) tank.']
  const researched = await fish({}, 'Một người bắt đầu với bể khoảng 38 lít', { aquatome: { key: 'notes', vi: '<p>Một người bắt đầu với bể khoảng 38 lít.</p>', facts }, at: 'sections.notes:aquatome' })
  expect(researched.t.sections['notes:aquatome']).toBe('<p>Một người bắt đầu với bể khoảng 38 lít.</p>')
  // A section with no English, and one of ours with no research file: nothing to mend from, so their 75 stays.
  const bare = await fish({ habitat: ['<p>A standard 20 gallon tank.</p>', '<p>Cần bể 75 lít.</p>'], quickFacts: ['', '<p>Nuôi cá bột trong 75 lít.</p>'] }, 'Cần bể 75 lít', { aquatome: { key: 'notes', vi: '<p>Bể 75 lít cho một đàn.</p>' } })
  expect(bare.t.sections['habitat:seriouslyfish']).toBe('<p>Cần bể 80 lít.</p>')
  expect(bare.t.sections['quickFacts:seriouslyfish']).toBe('<p>Nuôi cá bột trong 75 lít.</p>')
  expect(bare.t.sections['notes:aquatome']).toBe('<p>Bể 75 lít cho một đàn.</p>')
})

test('a guide\'s title a person fixed stays; a tank per something is a tank\'s litres, and a time or a pellet beside a tank holds it', async () => {
  const fixed = await held('<p>Bể 115 lít là vừa.</p>', ['Bể 115 lít là vừa'], { name: 'Cá bể 115 lít' })
  await fixTitle(fixed)
  await unitsMend(fixed, { now: after })
  expect((await file(fixed)).name).toBe('Cá bể 115 lít')
  for (const [body, quote, mended] of [['<p>Bể 115 lít/hồ là đủ.</p>', 'Bể 115 lít/hồ là đủ', true], ['<p>Thả vào bể 115 lít một giờ sau.</p>', 'Thả vào bể 115 lít một giờ sau', false], ['<p>Cho ăn 1 viên trong bể 115 lít.</p>', 'Cho ăn 1 viên trong bể 115 lít', false]] as [string, string, boolean][]) {
    const root = await held(body, [quote])
    await unitsMend(root, { now: after })
    expect((await file(root)).body, body).toBe(mended ? body.replace('115', '120') : body)
  }
})

test('the guide writer\'s figure check lets the water a dose goes into keep its exact conversion, and only that', () => {
  expect(amountsOutside('Pha 5 ml vào 38 lít nước.', 'Add 5 ml per 10 gallons of water.')).toEqual([])
  expect(amountsOutside('Pha 5 ml vào 114 lít nước.', 'Add 5 ml to 30 gallons of water.')).toEqual([])
  expect(amountsOutside('Bể 38 lít là đủ.', 'A 10 gallon tank is enough.')).toEqual(['38 l'])
  expect(amountsOutside('Bể 115 lít, pha 5 ml vào 120 lít nước.', 'A 30 gallon tank; add 5 ml to 30 gallons.')).toEqual(['115 l'])
})

test("the style rewrite's reviewer has the tank table its writer has", async () => {
  let asked = ''
  await reviewRewrite((async (r: { system?: string; prompt: string }) => { asked = `${r.system ?? ''}\n${r.prompt}`; return { score: 1, notes: [] } }) as never, [{ before: 'Bể 115 lít.', after: 'Bể 120 lít.' }])
  expect(asked).toContain(TANK_RULE.en)
})

// The independent reader's rounds 4 to 7, 2026-11-11 and 12: every narrower reading of a dose's water (a clause, a
// sentence, a sentence back) had an edge a dose crossed. So a part that gives a dose anywhere keeps every volume in it,
// and a volume with a time after it stays: a tank held is a writer's to mend, a dose's water rounded misdoses fish.
test("a part that gives a dose anywhere keeps every volume in it as it is, and a time after a volume keeps it; a fish's weight is no dose", async () => {
  const doses = ['Cho 5 ml dung dịch Easy Life Profito vào 115 lít nước.', 'Pha 5 ml. vào 115 lít nước.', '1 gam muối vào 115 lít nước.', 'Đổ 115 lít nước đã pha 5 ml vào bể.', 'Pha 5 ml thuốc. Khuấy đều. Cho vào 115 lít nước.', 'Pha 5 cc vào 115 lít nước.', 'Lấy 10 mililít vào 115 lít nước.', 'Teteskan 5 tetes ke dalam 115 liter air.', 'Tambahkan 1 sdt ke 115 liter air.', 'ใช้ 5 มก. ในน้ำ 115 ลิตร', '5 มล. ต่อน้ำ 115 ลิตร', 'ใส่ 1 ช้อนชาต่อน้ำ 115 ลิตร', 'Khoảng 1 cốc muối cho 75 lít.', 'Masukkan 2 sudu garam ke dalam 115 liter air.', 'cho vào bể 115 lít nước đã pha 5 ml']
  for (const d of doses) expect(givesDose(d), d).toBe(true)
  for (const w of ['Cá nặng tới 5 gam trong 115 lít.', 'Ikan beratnya 5 gram dalam 115 liter.', 'Bể 115 lít.']) expect(givesDose(w), w).toBe(false)
  // Across paragraphs and tags.
  const part = '<p>Pha <b>5 ml</b> thuốc.</p><p>Cho vào 115 lít nước.</p><p>Bể 115 lít là đủ.</p>'
  const root = await held(part, ['Bể 115 lít là đủ'])
  await unitsMend(root, { now: after })
  expect((await file(root)).body).toBe(part)
  const times = ['Máy bơm 115 lít một tiếng.', 'Máy bơm 115 lít một tiếng đồng hồ.', 'Bơm 115 lít mỗi giờ sau khi thay nước.', 'Pompa 115 liter setiap jam.', 'Máy bơm 115 lít/phút.', 'Thả vào bể 115 lít trong một tiếng sau.']
  const timed = await held(`<p>Bể 115 lít.</p>${times.map(t => `<p>${t}</p>`).join('')}`, ['Bể 115 lít'])
  await unitsMend(timed, { now: after })
  expect((await file(timed)).body).toBe(`<p>Bể 120 lít.</p>${times.map(t => `<p>${t}</p>`).join('')}`)
  const weight = await held('<p>Cá nặng tới 5 gam trong 115 lít.</p>', ['Cá nặng tới 5 gam trong 115 lít'])
  await unitsMend(weight, { now: after })
  expect((await file(weight)).body).toBe('<p>Cá nặng tới 5 gam trong 120 lít.</p>')
  // The writer check: a dose's exact water passes wherever the guide gives a dose; with none, a tank's exact one doesn't.
  for (const s of ['Pha 5 ml. Cho vào 38 lít nước.', 'Đổ 38 lít nước đã pha 5 ml vào bể.', '<p>Pha 5 ml thuốc.</p><p>Cho vào 38 lít nước.</p>'])
    expect(amountsOutside(s, 'Add 5 ml to 10 gallons of water.'), s).toEqual([])
  expect(amountsOutside('Cá nặng tới 5 gam trong 38 lít.', 'A 5 gram fish in a 10 gallon tank.')).toEqual(['38 l'])
})
