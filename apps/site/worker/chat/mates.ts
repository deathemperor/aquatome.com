import { pageMatcher } from '@aq/schema/unlisted'
import { oneFishEach, tankCheck, type TankCheck, type TankFish } from '../../src/scripts/tank-check'
import { checkTankmates, verdictOf, type Verdict } from '../../src/scripts/tankmates'
import { matesOf, MAX_FISH } from './answer'
import { factsOf, isBreed, type Handbook, type Item, type Lang } from './handbook'
import STRINGS from './tank-check-strings.json'
import type { Tank } from './tools'

/**
 * Fish checked together as the tank-mates tool checks them: the site's own code (src/scripts/tank-check.ts), which the
 * tool's page and the app run too, on the fish a tank-mates block's link names (answer.ts `matesOf`), in the reader's
 * language (its strings: tank-check-strings.json, which apps/site/scripts/app-tank-check.mjs writes with the app's).
 * Claude is told it before it writes, and the block carries it whole (what the app's tank check draws: the verdict, the
 * warnings, how full the tank would be), so the answer and the block say the same.
 */
export type MatesCheck = TankCheck & {
  /** Each fish as checked: its species' id, name and page, how many. */
  fish: { id: string; name: string; path: string; count: number }[]
  /** The tank's inside size it was checked in (cm), or null: a block's check is of the same fish, counts and tank. */
  tank: { l: number; w: number; h: number } | null
  /** The reader's saved tank it was checked in (read_tanks' id): its fish and size are the tank's, `fish` those added. */
  tankId?: string
  /** That tank, as a block names it: its name and size, its fish as saved, and the fish added (not saved). */
  mine?: Mine
  /** With the reader's tank: every kind checked as the tool's link names them (a breed as its species, counts summed),
   *  or undefined when the tool's page couldn't check the same (`linkable`). */
  kinds?: { path: string; count: number }[]
  /** The verdict's parts, as the tool words them (two fish or more), for Claude: its text opens with the head. */
  answer?: Pick<Verdict, 'level' | 'head' | 'reasons'>
}

/** The reader's tank a check was of, as its block names it (protocols/chat.openapi.json, the tank-mates Tool's `tank`). */
export type Mine = {
  id: string
  name: string
  dims?: { l: number; w: number; h: number }
  litres?: number
  fish: { name: string; count?: number }[]
  added: { name: string; count: number }[]
}

/** A check as a block carries it: what the app's tank check draws, without what only Claude and the Worker read. */
export const drawnOf = ({ fish: _f, tank: _t, tankId: _i, mine: _m, kinds: _k, answer: _a, ...c }: MatesCheck): TankCheck => c

const dicts = STRINGS as Record<string, Record<string, string>>
const translator = (lang: Lang) => (s: string, vars?: Record<string, string | number>) => {
  const t = lang === 'vi' ? s : dicts[lang]?.[s] ?? s
  return vars ? t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : t
}
const formats = new Map<string, Intl.NumberFormat>()
const formatter = (lang: Lang) => (n: number, d = 1) =>
  (formats.get(lang + d) ?? formats.set(lang + d, new Intl.NumberFormat(lang, { maximumFractionDigits: d })).get(lang + d)!).format(n)

export function checkMates(fish: readonly { id: string; count: number }[], tank: { l: number; w: number; h: number } | null, hb: Handbook, mine?: Tank): MatesCheck {
  if (mine) return checkMine(fish, mine, hb)
  const ct = translator(hb.lang)
  const mates = matesOf(fish, hb)
  // The tool's checks read the app index's facts (factsOf): the same figures a species card shows.
  const rows = mates.map(({ item, count }) => ({ name: item.name, count, key: item.id ?? item.path, ...factsOf(item) }) as TankFish)
  const dims = tank && tank.l > 0 && tank.w > 0 && tank.h > 0 ? tank : undefined
  const check = tankCheck(rows, dims ? { dims } : {}, ct, formatter(hb.lang))
  // Its verdict in parts, as tankCheck makes it (the same fish, the same report) before it joins them in a sentence.
  const one = oneFishEach(rows) as Parameters<typeof checkTankmates>[0]
  const v = one.length >= 2 ? verdictOf(one, checkTankmates(one, ct), ct) : undefined
  return {
    fish: mates.map(m => ({ id: m.item.id ?? '', name: m.item.name, path: m.item.path, count: m.count })),
    tank: dims ?? null,
    ...check,
    ...(v ? { answer: { level: v.level, head: v.head, reasons: v.reasons } } : {}),
  }
}

/** The fish Claude adds to a tank, as they're put on it: each id once, at most six, counts as the tool takes them. */
export const addedOf = (fish: readonly { id: string; count: number }[]) =>
  [...new Map(fish.map(f => [f.id, f])).values()].slice(0, MAX_FISH).map(f => ({ id: f.id, count: Math.min(200, Math.max(1, Math.round(f.count))) }))

/** Fish added, by species (a breed's counted as its species', summed): what a tank's check and its block match on. */
export function summed(added: readonly { id: string; count: number }[], hb: Handbook): MatesCheck['fish'] {
  const out = new Map<string, MatesCheck['fish'][number]>()
  for (const f of added) {
    const i = hb.byId(f.id)
    const s = (i?.of ? hb.byId(i.of) : i) ?? i
    if (!s) continue
    const was = out.get(s.path)
    out.set(s.path, { id: s.id ?? '', name: s.name, path: s.path, count: (was?.count ?? 0) + f.count })
  }
  return [...out.values()]
}

const matchers = new WeakMap<Handbook, ReturnType<typeof pageMatcher<Item & { kind: string; id: string }>>>()
/** The handbook's page for a tank's entry without one, as the app finds it (PageMatcher.swift's `init(index:)`). */
function matcherOf(hb: Handbook) {
  let m = matchers.get(hb)
  if (!m) {
    const pages = hb.items.flatMap(i => ((i.kind === 'fish' || i.kind === 'plant') && i.id ? [{ ...i, id: i.id, sci: i.sub, synonyms: i.kind === 'plant' ? (i.aka ?? []).filter(a => /^[A-Z][a-z]+ [a-z]/.test(a)) : [] }] : []))
    matchers.set(hb, (m = pageMatcher(pages)))
  }
  return m
}

/**
 * Fish checked in the reader's saved tank, as the app's tank page checks it (TankCheckView.swift `check`): the tank's
 * fish, a breed under its species' key with its own name, an entry without a page by its scientific name or else among
 * those not checked, plants left out; then the fish added, as if put on the tank; in the tank's own size.
 */
function checkMine(fish: readonly { id: string; count: number }[], t: Tank, hb: Handbook): MatesCheck {
  const ct = translator(hb.lang)
  const row = (page: Item | undefined, id: string, count: number | undefined): TankFish => {
    const species = page?.of ? hb.byId(page.of) : undefined
    const n = count === undefined ? {} : { count }
    return (page && species
      ? { name: page.name, ...factsOf(species), ...n, key: page.of, species: species.name }
      : { name: page?.name ?? id, ...(page ? factsOf(page) : {}), ...n, key: id }) as TankFish
  }
  const rows = t.species.map(s => row(hb.byId(s.id), s.id, s.count))
  const unlisted: string[] = []
  const saved = t.species.map(s => ({ name: hb.byId(s.id)?.name ?? s.id, ...(s.count ? { count: s.count } : {}) }))
  for (const e of t.unlisted.filter(e => e.kind !== 'plant')) {
    // One matched is shown as its page, by the page's name (as the app's tank page shows it).
    const page = matcherOf(hb)(e.kind, e.sci)
    if (page) rows.push(row(page, page.id, e.count))
    else unlisted.push(e.name)
    saved.push({ name: page?.name ?? e.name, ...(e.count ? { count: e.count } : {}) })
  }
  const added = addedOf(fish)
  for (const f of added) rows.push(row(hb.byId(f.id), f.id, f.count))
  const check = tankCheck(rows, { ...(t.dims ? { dims: t.dims } : {}), ...(t.litres ? { litres: t.litres } : {}) }, ct, formatter(hb.lang), unlisted)
  const one = oneFishEach(rows)
  const v = one.length >= 2 ? verdictOf(one as Parameters<typeof checkTankmates>[0], checkTankmates(one as Parameters<typeof checkTankmates>[0], ct), ct) : undefined
  // The tool's link names species, one each with its count (oneFishEach's, as the tool would count it), in the order the
  // check grouped them: only when its page would check the same, every kind one of its species, up to 200 of each, in a
  // tank of known sides (its page reads no litres).
  const keys = [...new Map(rows.map((r, i) => [r.key ?? i, true])).keys()]
  const linked = keys.map((k, i) => {
    const item = typeof k === 'string' ? hb.byId(k) : undefined
    const count = Math.round(one[i]!.count ?? one[i]!.schoolMin ?? 1)
    return item && !isBreed(item) && count <= 200 ? { path: item.path, count } : undefined
  })
  const linkable = !!t.dims && linked.every(Boolean)
  return {
    fish: summed(added, hb),
    tank: null,
    tankId: t.id,
    mine: {
      id: t.id, name: t.name, ...(t.dims ? { dims: t.dims } : {}), ...(t.litres ? { litres: t.litres } : {}),
      fish: saved, added: added.map(f => ({ name: hb.byId(f.id)?.name ?? f.id, count: f.count })),
    },
    ...(linkable ? { kinds: linked as { path: string; count: number }[] } : {}),
    ...check,
    ...(v ? { answer: { level: v.level, head: v.head, reasons: v.reasons } } : {}),
  }
}
