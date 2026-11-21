/**
 * The pass over the open pages no read covers (the chief of staff, 21 Nov 2026): a page out on the site whose text no
 * saved read is of waits for nothing, since the gate reads a page only when its cycle changes it (fit.ts openUnread, 1,054
 * on 21 Nov). The pass reads each once and records what it finds (engine-state/_fit.json, each record marked `pass`). It
 * holds nothing itself: the gate after it holds a page whose read found harm, in every language, as it holds any page whose
 * saved read of its text did, and a kit found by the pass holds none (gate.ts). The rest is in the records, for the site
 * lead's morning report. On its nights alone (fit-pass.json), in the Mac's photos part, on the Mac's second sign-in, on
 * its own line in ceilings.json ("fit-pass").
 */
import { retiredTo, type Lang } from '@aq/schema'
import { fitKey, fitText, type FitState } from './fit'
import type { Page } from './pages'

export type PassList = { nights: readonly string[]; hours: readonly number[]; again: Readonly<Record<string, string>> }

/** The order of languages (the site lead's, 21 Nov 2026): Vietnamese, where most readers are, then Indonesian, Thai, Malay. */
export const PASS_LANGS: readonly Lang[] = ['vi', 'id', 'th', 'ms']
/** And in each, the kinds where harm is likeliest first: a guide's treatments and doses, then the fish pages. */
export const PASS_KINDS = ['guides', 'species', 'plants', 'breeds', 'products', 'equipment']

/** Whether the pass runs at `now`: on one of its nights (a Vietnamese day), from its first hour there to before its last. */
export function passTonight(list: Pick<PassList, 'nights' | 'hours'>, now: Date): boolean {
  const vn = new Date(now.getTime() + 7 * 3600_000)
  const hour = vn.getUTCHours()
  return list.nights.includes(vn.toISOString().slice(0, 10)) && hour >= list.hours[0]! && hour < list.hours[1]!
}

const fileOf = (p: Pick<Page, 'kind' | 'id' | 'lang'>) => `content/${p.kind}/${p.id}/${p.lang}.json`

/**
 * What the pass reads, in its order. First the pages on `again`, read against a source that has changed since their read's
 * day: once more, unless the pass has read one already or a read since that day has. Then every open page whose text no
 * saved read is of, language by language (PASS_LANGS), guides first (PASS_KINDS). A held page is the gate's, and a guide
 * off the site for good is no page, so neither is read.
 */
export function passOrder(pages: readonly Page[], state: FitState, held: ReadonlyMap<string, unknown>, list: Pick<PassList, 'again'>): Page[] {
  const open = (p: Page) => !held.has(fileOf(p)) && !(p.kind === 'guides' && retiredTo(p.id))
  const byKey = new Map(pages.map(p => [fitKey(p), p]))
  const again = Object.entries(list.again).flatMap(([key, day]) => {
    const p = byKey.get(key), e = state[key]
    return p && open(p) && !e?.pass && !(e && e.at.slice(0, 10) > day) ? [p] : []
  })
  const first = new Set(again.map(fitKey))
  const rank = (p: Page) => [PASS_LANGS.indexOf(p.lang), PASS_KINDS.indexOf(p.kind)] as const
  const unread = pages
    .filter(p => !first.has(fitKey(p)) && open(p) && PASS_LANGS.includes(p.lang) && state[fitKey(p)]?.hash !== fitText(p).hash)
    .sort((a, b) => { const [la, ka] = rank(a), [lb, kb] = rank(b); return la - lb || ka - kb || a.id.localeCompare(b.id) })
  return [...again, ...unread]
}
