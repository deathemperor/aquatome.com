import { POPULAR, slugify, STAPLE_SPECIES, type Content, type Localized, type SpeciesEntity } from '@aq/schema'
import type { SpeciesIndexItem } from '../scripts/filter'
import { checkTankmates } from '../scripts/tankmates'
import { richest } from './home'
import type { Lang } from './i18n'
import { toIndexItem } from './species-index'
import { getTraits } from './traits'

/** Why a species is in the "tránh" list, worst first: the tank-mates tool's own clashes, as they affect this species. */
export const AVOID_REASONS = ['eatsIt', 'eatenByIt', 'predator', 'aggressive', 'semiAggressive', 'finNipper'] as const
export type AvoidReason = (typeof AVOID_REASONS)[number]
export type Verdict = { kind: 'good' } | { kind: 'avoid'; reason: AvoidReason }

/** A shared range this narrow is a technicality, not water both can live in: a suggestion needs some room. */
const ROOM = { tempC: 2, ph: 0.5 } as const

/**
 * The tank-mates tool's verdict on `other` beside `self` (checkTankmates, the same rules and data). Only for water they
 * both have figures for and share: a species with no figures, or one that lives in other water, is neither.
 * - good: every column of the tool's table would read "Ổn", with data on both sides (temperaments and sizes known)
 * - avoid: the tool flags a clash that hurts this species, or one this species would eat
 */
export function judge(self: SpeciesIndexItem, other: SpeciesIndexItem): Verdict | null {
  const r = checkTankmates([self, other], s => s) // only the verdicts are read, not the notes' text
  const water = r.params.filter(p => p.field !== 'gh')
  if (water.some(p => p.missing.length > 0 || !p.shared)) return null
  if (r.eats.length) return { kind: 'avoid', reason: other.sizeCm! > self.sizeCm! ? 'eatsIt' : 'eatenByIt' }
  if (other.temperament === 'predator') return { kind: 'avoid', reason: 'predator' }
  if (other.temperament === 'aggressive') return { kind: 'avoid', reason: 'aggressive' }
  if (other.temperament === 'semi-aggressive' && self.temperament === 'peaceful') return { kind: 'avoid', reason: 'semiAggressive' }
  if (other.finNipper) return { kind: 'avoid', reason: 'finNipper' }
  const gh = r.params.find(p => p.field === 'gh')!
  const good = !!(self.temperament && other.temperament && self.sizeCm && other.sizeCm)
    && !r.notes.some(n => n.level !== 'info')
    && (gh.missing.length > 0 || !!gh.shared)
    && water.every(p => p.shared!.max - p.shared!.min >= ROOM[p.field as keyof typeof ROOM])
  return good ? { kind: 'good' } : null
}

/** Up to n, at most one per group on the first pass (five tetras say less than a tetra, a rasbora, a cory…). */
function varied<T extends { item: SpeciesIndexItem }>(ranked: T[], n: number): T[] {
  const first = ranked.filter((x, i) => ranked.findIndex(y => y.item.group === x.item.group) === i).slice(0, n)
  return [...first, ...ranked.filter(x => !first.includes(x))].slice(0, n)
}

/**
 * Fish a reader would put together are of one size class: minimum tanks at most 2,5× apart (60 and 150 cm), adult sizes
 * at most 5× apart. An arowana's 2 m tank is no home for neon tetras, so "it eats them" is nothing a reader needs.
 */
export const TANK_SPREAD = 2.5
export const SIZE_SPREAD = 5
/** Same size class, by each figure both have: a figure one of them lacks rules nothing out. */
export function sameClass(a: SpeciesIndexItem, b: SpeciesIndexItem): boolean {
  const within = (x: number | undefined, y: number | undefined, spread: number) => !x || !y || Math.max(x, y) / Math.min(x, y) <= spread
  return within(a.tankCm, b.tankCm, TANK_SPREAD) && within(a.sizeCm, b.sizeCm, SIZE_SPREAD)
}

/**
 * From candidates in reading order (best known first, `pop` their place among the fish shops keep most): up to 5 to
 * keep with `self`, and up to 3 to keep away, the ones a reader is likeliest to put with it first. Those are fish of
 * its size class, shop fish first, then the closest in size; how bad the clash is only breaks ties.
 */
export function pickCompanions<T extends { item: SpeciesIndexItem; pop?: number }>(self: SpeciesIndexItem, ranked: T[]) {
  const judged = ranked.map((x, i) => ({ ...x, i })).filter(x => x.item.slug !== self.slug).map(x => ({ ...x, v: judge(self, x.item) }))
  const good = judged.filter(x => x.v?.kind === 'good')
  const gap = (x: SpeciesIndexItem) => (self.sizeCm && x.sizeCm ? Math.abs(Math.log(x.sizeCm / self.sizeCm)) : Infinity)
  const avoid = judged.flatMap(x => (x.v?.kind === 'avoid' && sameClass(self, x.item) ? [{ ...x, reason: x.v.reason }] : []))
    .sort((a, b) => (a.pop ?? Infinity) - (b.pop ?? Infinity) || gap(a.item) - gap(b.item)
      || AVOID_REASONS.indexOf(a.reason) - AVOID_REASONS.indexOf(b.reason) || a.i - b.i)
  return { good: varied(good, 5), avoid: varied(avoid, 3) }
}

type Ranked = { s: Localized<SpeciesEntity>; item: SpeciesIndexItem; pop?: number }
const cache = new Map<Lang, Promise<Ranked[]>>()

/** Every species of this language with its tank-mates data, the ones readers know first (as the home page orders them). */
function rankedSpecies(lang: Lang, c: Content): Promise<Ranked[]> {
  let p = cache.get(lang)
  if (!p) {
    p = getTraits().then(traits => {
      const known = [...STAPLE_SPECIES, ...POPULAR.map(slugify)]
      const rank = (s: Localized<SpeciesEntity>) => (known.includes(s.id) ? known.indexOf(s.id) : known.length)
      return [...c.species]
        .sort((a, b) => rank(a) - rank(b) || Number(b.t.quality.indexable) - Number(a.t.quality.indexable) || richest(lang)(a, b))
        .map(s => ({ s, item: toIndexItem(s, traits.get(s.id)), ...(known.includes(s.id) ? { pop: rank(s) } : {}) }))
    })
    cache.set(lang, p)
  }
  return p
}

/** A species page's "Nuôi chung" block: its own tank-mates data and the species to keep with it or away from it. */
export async function companionsOf(lang: Lang, c: Content, id: string) {
  const all = await rankedSpecies(lang, c)
  const self = all.find(x => x.s.id === id)!.item
  return { self, ...pickCompanions(self, all) }
}
