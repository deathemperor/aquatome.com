import { expect, test } from 'vitest'
import { checkTankmates, exactMatch, rankMatches, verdictOf, type MateItem } from '../src/scripts/tankmates'
import { heaterWatts, tankVolume } from '../src/scripts/calc'
import type { SpeciesIndexItem } from '../src/scripts/filter'
import { translator } from '../src/lib/i18n'

const f = (name: string, o: Partial<SpeciesIndexItem>): SpeciesIndexItem => ({ slug: name, name, scientificName: name, group: 'x', ...o })

test('tankmates: shared water range, missing data listed, biggest tank wins', () => {
  const r = checkTankmates([f('neon', { tempC: { min: 20, max: 26 }, ph: { min: 5, max: 7 }, tankCm: 60 }), f('galaxy', { tempC: { min: 22, max: 25 }, tankCm: 45 })], translator('vi'))
  expect(r.params.find(p => p.field === 'tempC')).toEqual({ field: 'tempC', missing: [], shared: { min: 22, max: 25 } })
  expect(r.params.find(p => p.field === 'ph')).toEqual({ field: 'ph', missing: ['galaxy'], shared: { min: 5, max: 7 } })
  expect(r.params.find(p => p.field === 'gh')).toEqual({ field: 'gh', missing: ['neon', 'galaxy'] })
  expect(r.minTankCm).toBe(60)
})
test('tankmates: no overlap → no shared range', () => {
  const r = checkTankmates([f('a', { tempC: { min: 15, max: 21 } }), f('b', { tempC: { min: 26, max: 30 } })], translator('vi'))
  expect(r.params[0]!.shared).toBeUndefined()
})
test('tankmates: big fish ≥ 3× a small one is flagged, in size order', () => {
  const r = checkTankmates([f('neon', { sizeCm: 3 }), f('oscar', { sizeCm: 30 }), f('rasbora', { sizeCm: 9 })], translator('vi'))
  expect(r.eats.map(e => `${e.big}>${e.small}`)).toEqual(['oscar>rasbora', 'oscar>neon', 'rasbora>neon'])
})
test('volume: 60×30×36 cm', () => {
  const v = tankVolume(60, 30, 36)
  expect(v.litres).toBeCloseTo(64.8)
  expect(v.water).toBeCloseTo(55.08)
})
test('heater: 60×30×36 cm from 16 °C to 26 °C → 75 W; warm room → none', () => {
  expect(heaterWatts(60, 30, 36, 26, 16)).toEqual({ watts: expect.closeTo(70.56, 1), heater: 75 })
  expect(heaterWatts(60, 30, 36, 26, 28)).toEqual({ watts: 0, heater: 0 })
  expect(heaterWatts(300, 100, 100, 28, 10).heater).toBeNull()
})

test('tools page: nav link, a card for every tool, sitemap; the checker\'s species index; species pages link to the checker', async () => {
  const { page, DIST } = await import('./dist')
  const { readFileSync } = await import('node:fs')
  const { dom } = page('/vi/cong-cu/')
  expect(dom.querySelector('nav a[href="/vi/cong-cu/"]')).not.toBeNull()
  // Pages of their own, and the calculators below by anchor (each anchor has its section).
  const cards = dom.querySelectorAll('.tools a').map(a => a.getAttribute('href')!)
  expect(cards).toEqual(['/vi/cong-cu/nuoi-chung/', '/vi/cong-cu/the-tich-be/', '#nen', '#suoi', '#phan-bon', '/vi/cong-cu/den-chihiros/'])
  for (const h of cards.filter(h => h.startsWith('#'))) expect(dom.querySelector(h), h).not.toBeNull()
  expect(dom.querySelector('#species-index')).toBeNull()
  // The other languages' cards keep their links (a link to a page a language lacks loses its href).
  expect(page('/th/tools/').dom.querySelector('.tools a[href="/th/tools/tank-mates/"]')).not.toBeNull()
  expect(page('/id/alat/').dom.querySelector('script:not([src])')?.text ?? '').not.toContain('/vi/')
  const idx = JSON.parse(page('/vi/cong-cu/nuoi-chung/').dom.querySelector('#species-index')!.text) as { slug: string; sizeCm?: number; temperament?: string; schoolMin?: number; img?: string; aka?: string[]; pop?: number }[]
  expect(idx.some(i => i.sizeCm !== undefined)).toBe(true)
  expect(idx.find(i => i.slug === 'ca-neon-vua')).toMatchObject({ temperament: 'peaceful', schoolMin: 8, aka: ['Cardinal tetra'], pop: 3 })
  expect(idx.find(i => i.slug === 'ca-neon-vua')?.img).toMatch(/^https:\/\//)
  const sitemap = readFileSync(`${DIST}/sitemap.xml`, 'utf8')
  for (const p of ['/vi/cong-cu/', '/vi/cong-cu/nuoi-chung/', '/id/alat/kecocokan-ikan/', '/th/tools/tank-mates/']) expect(sitemap).toContain(p)
  expect(page('/vi/ca/ca-neon-vua/').dom.querySelector('a[href="/vi/cong-cu/nuoi-chung/?ca=ca-neon-vua:8"]')).not.toBeNull()
})

test('tankmates: behaviour notes from traits', () => {
  const r = checkTankmates([
    f('neon', { temperament: 'peaceful', schoolMin: 8 }),
    f('barb', { temperament: 'semi-aggressive', finNipper: true }),
    f('oscar', { temperament: 'predator' }),
  ], translator('vi'))
  expect(r.notes.map(n => n.level)).toEqual(['warn', 'warn', 'bad', 'info'])
  expect(r.notes[0]!.text).toContain('barb hơi dữ, có thể rượt đuổi neon')
  expect(r.notes[3]!.text).toBe('Nuôi neon theo đàn từ 8 con.')
})

const m = (name: string, scientificName: string, o: Partial<MateItem> = {}): MateItem => ({ slug: scientificName, name, scientificName, group: 'x', ...o })
const PICK = [
  m('Cá bống neon', 'Stiphodon atropurpureus', { aka: ['Neon Goby'] }),
  m('Cá neon hoàng đế tím', 'Inpaichthys kerri'),
  m('Cá neon vua', 'Paracheirodon axelrodi', { pop: 3 }),
  m('Cá neon xanh', 'Paracheirodon innesi', { aka: ['Cá neon', 'Neon tetra'], pop: 2 }),
  m('Cá cầu vồng neon lùn', 'Melanotaenia praecox', { aka: ['Neon dwarf rainbowfish'] }),
  m('Cá đĩa', 'Symphysodon aequifasciatus', { pop: 5 }),
  m('ปลานีออน', 'Paracheirodon innesi th'),
]
test('tank-mates picker: exact > prefix > word > anywhere; own names before other names; then the popular fish', () => {
  const names = (q: string) => rankMatches(q, PICK).map(i => i.name)
  // "Cá neon" is the neon tetra's other name; the goby is only a neon by its English name and further in.
  expect(names('neon')).toEqual(['Cá neon xanh', 'Cá neon vua', 'Cá neon hoàng đế tím', 'Cá bống neon', 'Cá cầu vồng neon lùn'])
  expect(names('ca neon vua')[0]).toBe('Cá neon vua')
  expect(names('paracheirodon').slice(0, 2)).toEqual(['Cá neon xanh', 'Cá neon vua'])
  expect(names('dia')).toEqual(['Cá đĩa'])
  expect(names('นีออน')).toEqual(['ปลานีออน'])
  expect(names('xyzq')).toEqual([])
  expect(names('  ')).toEqual([])
  expect(rankMatches('a', PICK, 2)).toHaveLength(2)
})
test('tank-mates picker: only a whole name adds without a pick, and only when one species has it', () => {
  expect(exactMatch('neon', PICK)).toBeUndefined()
  expect(exactMatch('ca neon vua', PICK)?.name).toBe('Cá neon vua')
  expect(exactMatch('Paracheirodon innesi', PICK)?.name).toBe('Cá neon xanh')
  expect(exactMatch('neon tetra', PICK)?.name).toBe('Cá neon xanh')
  expect(exactMatch('neon v', PICK)).toBeUndefined()
})
test('tank-mates verdict: no, with care, not enough data, yes', () => {
  const ct = translator('vi')
  const full = { tempC: { min: 22, max: 26 }, ph: { min: 6, max: 7 }, gh: { min: 2, max: 10 }, sizeCm: 4, temperament: 'peaceful' as const }
  const v = (fish: SpeciesIndexItem[]) => verdictOf(fish, checkTankmates(fish, ct), ct)
  const no = v([f('Cá đĩa', { ...full, sizeCm: 15, tempC: { min: 28, max: 31 } }), f('Cá galaxy', { ...full, sizeCm: 2.5, tempC: { min: 20, max: 25 } }), f('Cá neon vua', { ...full, sizeCm: 5 })])
  expect(no).toMatchObject({ level: 'no', head: 'Không nên nuôi chung', reasons: ['Cá đĩa có thể ăn Cá neon vua, Cá galaxy', 'nhiệt độ không có khoảng chung'] })
  expect(v([f('a', full), f('b', { ...full, temperament: 'semi-aggressive', finNipper: true })])).toMatchObject({ level: 'care', reasons: ['b có thể rượt đuổi a', 'b hay cắn vây'] })
  expect(v([f('a', full), f('b', { ...full, gh: undefined, temperament: undefined })])).toMatchObject({ level: 'unsure', reasons: ['chưa có độ cứng, tính cách của b'] })
  expect(v([f('a', full), f('b', full)])).toMatchObject({ level: 'yes', head: 'Nuôi chung được', gaps: [] })
  // A predator rules it out even when the water fits.
  expect(v([f('a', full), f('b', { ...full, temperament: 'predator' })]).reasons).toEqual(['b là cá săn mồi'])
})
