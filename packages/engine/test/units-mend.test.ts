import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { READY_TANKS, tankLengthFor } from '@aq/schema'
import { expect, test } from 'vitest'
import { fitKey, fitText, type FitFinding, type FitState } from '../src/fit'
import { loadPages } from '../src/pages'
import { TANK_RULE, US_TANKS, usTankOf, withTanks } from '../src/round'
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
  expect(withTable).toEqual(expect.arrayContaining(['video-guide.md', 'video-review.md', 'vi-rewrite.md', 'localize.md', 'localize-review.md', 'review.md', 'process.md']))
})

test('a fish page is mended only where its English gives the tank in gallons: a figure the English gives in litres stays', async () => {
  const fish = async (en: string, vi: string) => {
    const root = await mkdtemp(join(tmpdir(), 'units-mend-fish-'))
    await cp(FIXTURE, join(root, 'content'), { recursive: true })
    await mkdir(join(root, 'engine-state'))
    const dir = join(root, 'content/species/danio-margaritatus')
    const sources = JSON.parse(await readFile(join(root, 'content/sources.json'), 'utf8'))
    sources.seriouslyfish = { ...sources.seriouslyfish, publish: true, permission: { date: '2026-10-29', file: 'noted', scope: ['translation'] } }
    await writeFile(join(root, 'content/sources.json'), JSON.stringify(sources, null, 2))
    const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
    e.sections.find((s: { key: string; source: string }) => s.key === 'habitat' && s.source === 'seriouslyfish').html = en
    await writeFile(join(dir, 'entity.json'), JSON.stringify(e, null, 2))
    const t = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8'))
    t.sections['habitat:seriouslyfish'] = vi
    t.held = { checks: ['units'], at: '2026-11-10' }
    await writeFile(join(dir, 'vi.json'), JSON.stringify(t, null, 2))
    const p = (await loadPages(join(root, 'content'), ['vi'])).find(x => x.id === 'danio-margaritatus')!
    const part = fitText(p).parts.find(x => x.field === 'sections.habitat:seriouslyfish')!.id
    const quote = vi.replace(/<[^>]+>/g, '').replace(/\.$/, '')
    await writeFile(join(root, 'engine-state/_fit.json'), JSON.stringify({ [fitKey(p)]: { at: '2026-11-10', hash: fitText(p).hash, model: 'm', products: [], checklist: 3, findings: [{ check: 'units', part, quote, why: 'converted', by: 'model' }] } }))
    const r = await unitsMend(root, { now: after })
    return { r, text: JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')).sections['habitat:seriouslyfish'] }
  }
  const gallons = await fish('<p>A standard 20 gallon US is the minimum for a pair.</p>', '<p>Một cặp cần tối thiểu bể tiêu chuẩn 75 lít.</p>')
  expect(gallons.text).toBe('<p>Một cặp cần tối thiểu bể tiêu chuẩn 80 lít.</p>')
  // The English's own "about 108 litres", rounded by a translator to 110, isn't the 29-gallon tank 110 maps back to.
  const litres = await fish('<p>A tank of 120 × 30 cm should be the smallest considered (about 108 litres).</p>', '<p>Bể nhỏ nhất nên dùng là khoảng 110 lít.</p>')
  expect(litres.r.left).toEqual([expect.stringContaining('gives no 29 gallons')])
  expect(litres.text).toBe('<p>Bể nhỏ nhất nên dùng là khoảng 110 lít.</p>')
})
