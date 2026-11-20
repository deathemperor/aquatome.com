import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toneKey } from '@aq/schema'
import { expect, test } from 'vitest'
import { givenAsName } from '../src/glossary-other-names'

// A glossary term's "Tên khác" holds only what a keeper calls the thing; the phrases other pages link to it from
// ("sống theo đàn" for Cá đàn) are its `linkNames`, never printed (the chief of staff, 18 Nov 2026: about ten terms on
// main printed a link phrase as a name). Every other name is one the chief of staff's read kept, the term's English name,
// or one the term's facts give as its name: the rule the glossary step keeps a writer's name by.
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** The other names the chief of staff's read of every term kept, 18 Nov 2026 (the Glossary lead's sort, 88 phrases). */
const KEPT: Record<string, string[]> = {
  amoniac: ['NH3'],
  'ap-trung-bang-mieng': ['ấp miệng', 'ngậm trứng'],
  artemia: ['ấu trùng artemia', 'Brine shrimp'],
  'be-cong-dong': ['bể cá cộng đồng'],
  biotope: ['biotope', 'bể sinh cảnh'],
  'bo-bo': ['daphnia', 'moina'],
  'ca-dan': ['cá bầy đàn'],
  'ca-hoang-da': ['cá bắt tự nhiên', 'cá tự nhiên'],
  'chieu-dai-chuan': ['SL'],
  'chu-trinh-nito': ['chu trình nitrogen', 'chu kỳ Nitơ', 'Nitrogen cycle'],
  co2: ['CO₂'],
  'dac-huu': ['loài đặc hữu'],
  'de-con': ['cá đẻ con'],
  'de-trung-rai-rac': ['đẻ trứng rải'],
  'do-dan-dien': ['độ dẫn'],
  'dom-trang': ['đốm trắng'],
  'dong-chay': ['dòng nước'],
  'dong-danh': ['đồng danh'],
  gh: ['độ cứng tổng', 'độ cứng chung', 'General Hardness', 'Total hardness'],
  kh: ['dKH', 'độ cứng cacbonat'],
  'la-bang': ['lá bàng khô', 'catappa leaves'],
  lua: ['lũa gỗ', 'lũa thủy sinh', 'gỗ lũa', 'gỗ lũa thủy sinh'],
  'luu-vuc': ['lưu vực sông'],
  'mang-sinh-hoc': ['biofilm', 'màng vi sinh'],
  nitrat: ['NO3'],
  nitrit: ['NO2'],
  'nuoc-den': ['blackwater'],
  ph: ['độ pH'],
  'suc-khi': ['sủi khí'],
  tanin: ['tannin'],
  tao: ['rêu hại'],
  tds: ['tổng chất rắn hòa tan'],
  'thuc-an-dong-lanh': ['Frozen food'],
  'thuc-an-kho': ['cám', 'Dry food'],
  'trung-chi': ['giun ống'],
  'trung-co': ['infusoria'],
  'trung-huyet': ['giun đỏ', 'bloodworm'],
  'vi-khuan-co-loi': ['vi sinh có lợi'],
}

const json = (f: string) => JSON.parse(readFileSync(f, 'utf8'))
const terms = (dir: string) => readdirSync(dir).filter(id => existsSync(join(dir, id, 'vi.json'))).sort()
const facts = (id: string): string[] => {
  const f = join(ROOT, 'engine-state/glossary', `${id}.json`)
  return existsSync(f) ? (json(f).facts as { fact: string }[]).map(x => x.fact) : []
}
/** Each term's other names that are neither kept by the read nor given as a name by its facts. */
const unmarked = (dir: string) => terms(dir).flatMap(id => {
  const kept = new Set([...(KEPT[id] ?? []), json(join(dir, id, 'entity.json')).en as string].map(n => n.toLowerCase()))
  const own = facts(id)
  return (json(join(dir, id, 'vi.json')).altNames as string[]).filter(n => !kept.has(n.toLowerCase()) && !givenAsName(n, own)).map(n => `${id}: ${n}`)
})
/** A phrase that is both a term's other name and its link phrase, in any language. */
const both = (dir: string) => terms(dir).flatMap(id => readdirSync(join(dir, id)).filter(f => f !== 'entity.json' && f.endsWith('.json')).flatMap(f => {
  const t = json(join(dir, id, f)) as { altNames?: string[]; linkNames?: string[] }
  const links = new Set((t.linkNames ?? []).map(n => n.toLowerCase()))
  return (t.altNames ?? []).filter(n => links.has(n.toLowerCase())).map(n => `${id}/${f}: ${n}`)
}))

/**
 * A phrase two terms hold, as a name, an other name or a link phrase, in either tone placing (toneKey), in one language:
 * a page that writes it links one of them, and a keeper can't tell which was meant.
 */
const shared = (dir: string) => {
  const ids = terms(dir)
  const langs = [...new Set(ids.flatMap(id => readdirSync(join(dir, id)).filter(f => f !== 'entity.json' && f.endsWith('.json'))))]
  return langs.flatMap(f => {
    const owners = new Map<string, Set<string>>()
    for (const id of ids) {
      if (!existsSync(join(dir, id, f))) continue
      const t = json(join(dir, id, f)) as { name?: string; altNames?: string[]; linkNames?: string[] }
      for (const n of [t.name, ...(t.altNames ?? []), ...(t.linkNames ?? [])].map(n => n?.trim()).filter(Boolean) as string[]) {
        const k = toneKey(n)
        owners.set(k, (owners.get(k) ?? new Set()).add(id))
      }
    }
    return [...owners].filter(([, s]) => s.size > 1).map(([k, s]) => `${f}: "${k}" on ${[...s].join(', ')}`)
  })
}
/** A link phrase a term keeps that its own notes take off (`notNames`), in either tone placing. */
const linkedOff = (dir: string, asks: Record<string, { notNames?: string[] }>) => terms(dir).flatMap(id => {
  const off = new Set((asks[id]?.notNames ?? []).map(toneKey))
  return ((json(join(dir, id, 'vi.json')) as { linkNames?: string[] }).linkNames ?? []).filter(n => off.has(toneKey(n))).map(n => `${id}: ${n}`)
})

test('a fact gives a phrase as a name only when it says it names the thing and quotes the phrase whole', () => {
  expect(givenAsName('Dorsal fin', ['English name for the term: "Dorsal Fin" (heading: "Dorsal Fin (Vây lưng) – “Bánh lái” phía trên").'])).toBe(true)
  expect(givenAsName('Biofilm', ['A Vietnamese shop article names the term "Màng sinh học (Biofilm)".'])).toBe(true)
  expect(givenAsName('cám', ['A Vietnamese shop writes the term as "cám (thức ăn khô) cho cá cảnh", using "cám" for dry fish food.'])).toBe(true)
  expect(givenAsName('độ cứng chung', ['Vietnamese name: "độ cứng chung" (written as "GH hoặc độ cứng chung").'])).toBe(true)
  // Inside a longer name, a phrase is not given: "đông lạnh" is a link phrase of Thức ăn đông lạnh.
  expect(givenAsName('đông lạnh', ['Name for the term on a Vietnamese shop\'s site: "Thức Ăn Đông Lạnh" (a product category).'])).toBe(false)
  expect(givenAsName('Brine shrimp', ['English name used for the shell-free eggs: "Decapsulated Brine Shrimp Eggs".'])).toBe(false)
  expect(givenAsName('lũa thủy sinh', ['Name for the term: "lũa thủy sinh".'])).toBe(true)
  // Quoted, but not as the term's name: a phrase in a sentence, a spelling, the kinds' names, another thing's term, a quote
  // in what a fact adds after its bracket (facts saved on main, 18 Nov 2026).
  expect(givenAsName('dòng chảy mạnh', ['A shop says "dòng chảy mạnh" tires small fish.'])).toBe(false)
  expect(givenAsName('Chu trình Nito', ['Variant Vietnamese spelling for the term: "Chu trình Nito".'])).toBe(false)
  expect(givenAsName('Tubifex worms', ['English names used for the kinds: "Bloodworms", "Tubifex worms", "Brine shrimp", "Daphnia", "Baby brine shrimp" and "Mysis shrimp".'])).toBe(false)
  expect(givenAsName('spider wood', ['Lũa đỗ quyên: English-language shops sell the same azalea or rhododendron root as "spider wood". Gensou also calls it "azalea root" or "rhododendron root".'])).toBe(false)
  expect(givenAsName('Lưu lượng', ['Vietnamese term for flow rate: "Lưu lượng", given in "L/h" or as "lần/giờ" (times per hour).'])).toBe(false)
  expect(givenAsName('trong dung dịch', ['Vietnamese name: "độ pH" ("Độ pH là chỉ số đo hoạt động của các ion (H+) trong dung dịch").'])).toBe(false)
  expect(givenAsName('Artemia sấy khô', ['Vietnamese name for the dried form: "Artemia sấy khô".'])).toBe(false)
  expect(givenAsName('', ['Name for the term: "".'])).toBe(false)
})

test('every term\'s other names, on main and in the fixture, are names: kept by the read, its English name, or given by a fact', () => {
  expect(unmarked(join(ROOT, 'content/glossary'))).toEqual([])
  expect(unmarked(join(ROOT, 'apps/site/test/fixture-content/glossary'))).toEqual([])
})

test('no term holds a phrase both as an other name and as a link phrase, in any language', () => {
  expect(both(join(ROOT, 'content/glossary'))).toEqual([])
  expect(both(join(ROOT, 'apps/site/test/fixture-content/glossary'))).toEqual([])
})

// The chief of staff, 19 Nov 2026: a check that removes nothing, so the day a notes line takes off a name a term still
// keeps as a link phrase, or a new term's name meets an old one, the build says so.
test('no phrase belongs to two terms, in either tone placing, in any language; no term links from a name its notes take off', () => {
  expect(shared(join(ROOT, 'content/glossary'))).toEqual([])
  expect(shared(join(ROOT, 'apps/site/test/fixture-content/glossary'))).toEqual([])
  expect(linkedOff(join(ROOT, 'content/glossary'), json(join(ROOT, 'packages/engine/src/glossary-asks.json')))).toEqual([])
})

test('the names check names a phrase two terms hold, in either tone placing, and a link phrase the notes take off', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-names-'))
  const put = (id: string, f: string, t: object) => { mkdirSync(join(dir, id), { recursive: true }); writeFileSync(join(dir, id, f), JSON.stringify(t)) }
  put('oxy-hoa-tan', 'vi.json', { name: 'Oxy hòa tan', altNames: [], linkNames: ['Oxy hoà tan'] })
  put('ph', 'vi.json', { name: 'pH', altNames: ['độ pH'], linkNames: [] })
  put('ph', 'id.json', { name: 'pH', altNames: [], linkNames: [] })
  put('kh', 'vi.json', { name: 'KH', altNames: ['Độ pH'], linkNames: [] })
  put('kh', 'id.json', { name: 'KH', altNames: ['ph'], linkNames: [] })
  put('thuy-sinh', 'vi.json', { name: 'Bể thủy sinh', altNames: [], linkNames: [] })
  put('cay-thuy-sinh', 'vi.json', { name: 'Cây thủy sinh', altNames: [], linkNames: ['bể thuỷ sinh'] })
  expect(shared(dir)).toEqual(['vi.json: "bể thuỷ sinh" on cay-thuy-sinh, thuy-sinh', 'vi.json: "độ ph" on kh, ph', 'id.json: "ph" on kh, ph'])
  expect(linkedOff(dir, { 'oxy-hoa-tan': { notNames: ['OXY HÒA TAN'] } })).toEqual(['oxy-hoa-tan: Oxy hoà tan'])
  expect(linkedOff(dir, { 'oxy-hoa-tan': { notNames: ['oxy'] } })).toEqual([])
  rmSync(dir, { recursive: true })
})
