import { oneFishEach, tankCheck, type TankCheck, type TankFish } from '../../src/scripts/tank-check'
import { checkTankmates, verdictOf, type Verdict } from '../../src/scripts/tankmates'
import { matesOf } from './answer'
import { factsOf, type Handbook, type Lang } from './handbook'
import STRINGS from './tank-check-strings.json'

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
  /** The verdict's parts, as the tool words them (two fish or more), for Claude: its text opens with the head. */
  answer?: Pick<Verdict, 'level' | 'head' | 'reasons'>
}

const dicts = STRINGS as Record<string, Record<string, string>>
const translator = (lang: Lang) => (s: string, vars?: Record<string, string | number>) => {
  const t = lang === 'vi' ? s : dicts[lang]?.[s] ?? s
  return vars ? t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : t
}
const formats = new Map<string, Intl.NumberFormat>()
const formatter = (lang: Lang) => (n: number, d = 1) =>
  (formats.get(lang + d) ?? formats.set(lang + d, new Intl.NumberFormat(lang, { maximumFractionDigits: d })).get(lang + d)!).format(n)

export function checkMates(fish: readonly { id: string; count: number }[], tank: { l: number; w: number; h: number } | null, hb: Handbook): MatesCheck {
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
