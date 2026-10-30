import type { Range } from '@aq/schema'
import type { SpeciesIndexItem } from './filter'
import type { T } from '../lib/i18n'
import { msg } from '../i18n/msg'

/** A fish can swallow tankmates far smaller than itself; 3× body length is the usual warning line. */
export const EAT_RATIO = 3

export const TEMPERAMENT_LABELS = { peaceful: msg('Hiền'), 'semi-aggressive': msg('Hơi dữ'), aggressive: msg('Hung dữ'), predator: msg('Săn mồi') } as const

export type ParamCheck = { field: 'tempC' | 'ph' | 'gh'; shared?: Range; missing: string[] }
export type Note = { level: 'bad' | 'warn' | 'info'; text: string }
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
    if (f.temperament === 'aggressive') notes.push({ level: 'bad', text: ct('{name} hung dữ, thường phải nuôi riêng hoặc bể chỉ một loài.', { name: f.name }) })
    if (f.temperament === 'predator') notes.push({ level: 'bad', text: ct('{name} là cá săn mồi: con nào vừa miệng đều có thể bị ăn.', { name: f.name }) })
    if (f.temperament === 'semi-aggressive') {
      const meek = others.filter(o => o.temperament === 'peaceful').map(o => o.name)
      if (meek.length) notes.push({ level: 'warn', text: ct('{name} hơi dữ, có thể rượt đuổi {others}. Cần bể rộng, nhiều chỗ trốn.', { name: f.name, others: meek.join(', ') }) })
    }
    if (f.finNipper) notes.push({ level: 'warn', text: ct('{name} hay cắn vây cá khác: tránh nuôi chung với cá vây dài, bơi chậm.', { name: f.name }) })
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
