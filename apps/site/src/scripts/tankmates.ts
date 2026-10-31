import type { Range } from '@aq/schema'
import type { SpeciesIndexItem } from './filter'
import type { T } from '../lib/i18n'
import { msg } from '../i18n/msg'

/** A fish can swallow tankmates far smaller than itself; 3× body length is the usual warning line. */
export const EAT_RATIO = 3

export const TEMPERAMENT_LABELS = { peaceful: msg('Hiền'), 'semi-aggressive': msg('Hơi dữ'), aggressive: msg('Hung dữ'), predator: msg('Săn mồi') } as const

/** A species in the tank-mates picker: the filter's index item, its photo, other names, and its place on the popular list. */
export type MateItem = SpeciesIndexItem & { img?: string; aka?: string[]; pop?: number }

export type ParamCheck = { field: 'tempC' | 'ph' | 'gh'; shared?: Range; missing: string[] }
/** `short`: the same point in a few words, for the verdict sentence (bad and warn notes). */
export type Note = { level: 'bad' | 'warn' | 'info'; text: string; short?: string }
export type TankmateReport = {
  params: ParamCheck[]
  eats: { big: string; bigCm: number; small: string; smallCm: number }[]
  notes: Note[]
  minTankCm?: number
}

function behaviour(fish: SpeciesIndexItem[], ct: T): Note[] {
  const notes: Note[] = []
  for (const f of fish) {
    const others = fish.filter(o => o !== f)
    if (f.temperament === 'aggressive') notes.push({ level: 'bad', text: ct('{name} hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài.', { name: f.name }), short: ct('{name} hung dữ', { name: f.name }) })
    if (f.temperament === 'predator') notes.push({ level: 'bad', text: ct('{name} là cá săn mồi: con nào vừa miệng đều có thể bị ăn.', { name: f.name }), short: ct('{name} là cá săn mồi', { name: f.name }) })
    if (f.temperament === 'semi-aggressive') {
      const meek = others.filter(o => o.temperament === 'peaceful').map(o => o.name)
      if (meek.length) notes.push({ level: 'warn', text: ct('{name} hơi dữ, có thể rượt đuổi {others}. Cần bể rộng, nhiều chỗ trốn.', { name: f.name, others: meek.join(', ') }), short: ct('{name} có thể rượt đuổi {others}', { name: f.name, others: meek.join(', ') }) })
    }
    if (f.finNipper) notes.push({ level: 'warn', text: ct('{name} hay cắn vây cá khác: tránh nuôi chung với cá vây dài, bơi chậm.', { name: f.name }), short: ct('{name} hay cắn vây', { name: f.name }) })
  }
  for (const f of fish) if (f.schoolMin) notes.push({ level: 'info', text: ct('Nuôi {name} theo đàn từ {n} con.', { name: f.name, n: f.schoolMin }) })
  return notes
}

/** Water overlap, size ratio, behaviour (from the profiles' own text) and the largest tank need for a set of species. */
export function checkTankmates(fish: SpeciesIndexItem[], ct: T): TankmateReport {
  const params = (['tempC', 'ph', 'gh'] as const).map(field => {
    const known = fish.filter(f => f[field])
    const missing = fish.filter(f => !f[field]).map(f => f.name)
    if (known.length === 0) return { field, missing }
    const min = Math.max(...known.map(f => f[field]!.min))
    const max = Math.min(...known.map(f => f[field]!.max))
    return { field, missing, ...(min <= max ? { shared: { min, max } } : {}) }
  })
  const sized = fish.filter(f => f.sizeCm).sort((a, b) => b.sizeCm! - a.sizeCm!)
  const eats = sized.flatMap((big, i) => sized.slice(i + 1).filter(s => big.sizeCm! >= EAT_RATIO * s.sizeCm!)
    .map(s => ({ big: big.name, bigCm: big.sizeCm!, small: s.name, smallCm: s.sizeCm! })))
  const tanks = fish.flatMap(f => (f.tankCm ? [f.tankCm] : []))
  return { params, eats, notes: behaviour(fish, ct), ...(tanks.length ? { minTankCm: Math.max(...tanks) } : {}) }
}

export type Verdict = {
  /** no: something rules it out; care: it can work with care; unsure: nothing clashes in the data there is; yes: all checked. */
  level: 'no' | 'care' | 'unsure' | 'yes'
  /** The answer in a few words ("Không nên nuôi chung"). */
  head: string
  /** Why, most serious first; joined with "; " after the head. */
  reasons: string[]
  /** What the check could not see: "chưa có độ cứng của Cá A". */
  gaps: string[]
}

/** One sentence that answers "can these share a tank?", from the report: the size gap, water with no overlap, temperament. */
export function verdictOf(fish: SpeciesIndexItem[], r: TankmateReport, ct: T): Verdict {
  const eaters = [...new Set(r.eats.map(e => e.big))]
  const no = [
    ...eaters.map(big => ct('{big} có thể ăn {small}', { big, small: r.eats.filter(e => e.big === big).map(e => e.small).join(', ') })),
    ...r.params.filter(p => !p.shared && fish.length - p.missing.length >= 2).map(p => ct(CLASH[p.field])),
    ...r.notes.filter(n => n.level === 'bad').map(n => n.short ?? n.text),
  ]
  const care = r.notes.filter(n => n.level === 'warn').map(n => n.short ?? n.text)
  const gaps = fish.flatMap(f => {
    const lack = GAP_FIELDS.filter(k => f[k] === undefined).map(k => ct(GAP_LABEL[k]))
    return lack.length ? [ct('chưa có {fields} của {name}', { fields: lack.join(', '), name: f.name })] : []
  })
  if (no.length) return { level: 'no', head: ct('Không nên nuôi chung'), reasons: no, gaps }
  // Missing data never reads as "can share": with warnings and gaps both, neither half alone is the answer.
  if (care.length && gaps.length) return { level: 'unsure', head: ct('Cần để ý, và chưa đủ dữ liệu để chắc'), reasons: [...care, ...gaps], gaps }
  if (care.length) return { level: 'care', head: ct('Nuôi chung được, nhưng cần để ý'), reasons: care, gaps }
  if (gaps.length) return { level: 'unsure', head: ct('Chưa thấy điểm xung khắc, nhưng chưa đủ dữ liệu để chắc'), reasons: gaps, gaps }
  return { level: 'yes', head: ct('Nuôi chung được'), reasons: [ct('nước có khoảng chung, kích thước và tính cách hợp nhau')], gaps }
}
const CLASH = { tempC: msg('nhiệt độ không có khoảng chung'), ph: msg('pH không có khoảng chung'), gh: msg('độ cứng không có khoảng chung') } as const
const GAP_FIELDS = ['tempC', 'ph', 'gh', 'sizeCm', 'temperament'] as const
const GAP_LABEL = { tempC: msg('nhiệt độ'), ph: 'pH', gh: msg('độ cứng'), sizeCm: msg('kích thước'), temperament: msg('tính cách') } as const

/** Lower case, accents off (đ → d), anything not a letter or digit → one space: "Cá Neon-vua" → "ca neon vua". Thai keeps its marks. */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()
/** The word a common name starts with for the kind of animal ("Cá", "Tép", "Ikan", "ปลา"): "neon" is a prefix of "Cá neon vua". */
const KIND = /^(?:(?:ca|tep|tom|oc|cua|ikan|udang|siput|keong) |ปลา|กุ้ง|หอย)/
/** 0 exact, 1 prefix, 2 a word starts with it, 3 anywhere inside, 4 no match. */
const tier = (name: string, q: string) => (name === q ? 0 : name.startsWith(q) ? 1 : name.includes(` ${q}`) ? 2 : name.includes(q) ? 3 : 4)

/**
 * Suggestions for what was typed, best first: exact, then prefix, then the start of a word, then anywhere; within a step a
 * match on the main or scientific name before one on another name, then the more popular fish, then A–Z.
 */
export function rankMatches<I extends MateItem>(query: string, items: I[], limit = 6): I[] {
  const q = fold(query)
  if (!q) return []
  const score = (i: I) => {
    const own = [i.name, i.scientificName].map(fold)
    const best = (names: string[]) => Math.min(4, ...names.flatMap(n => [tier(n, q), tier(n.replace(KIND, ''), q)]))
    const a = best(own), b = best((i.aka ?? []).map(fold))
    return a <= b ? a * 2 : b * 2 + 1
  }
  return items.map(i => ({ i, s: score(i) })).filter(x => x.s < 8)
    .sort((x, y) => x.s - y.s || (x.i.pop ?? Infinity) - (y.i.pop ?? Infinity) || x.i.name.localeCompare(y.i.name))
    .slice(0, limit).map(x => x.i)
}

/** The one species whose whole name (Vietnamese, scientific, then another name) is what was typed: safe to add without a pick. */
export function exactMatch<I extends MateItem>(query: string, items: I[]): I | undefined {
  const q = fold(query)
  if (!q) return undefined
  const own = items.filter(i => fold(i.name) === q || fold(i.scientificName) === q)
  const hits = own.length ? own : items.filter(i => (i.aka ?? []).some(a => fold(a) === q))
  return hits.length === 1 ? hits[0] : undefined
}
