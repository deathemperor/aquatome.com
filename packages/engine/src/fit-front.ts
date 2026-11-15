/**
 * The front list (fit-front.json) for the reader-fit read and the rewrite that follows it. The list's order is the
 * ruled one: pages kept off the Explore tab's top cards, then pages kept off the Today card, then the staples.
 */

/** The same key fitKey writes (`<lang>/<kind>/<id>`). Kept here so ordering doesn't load the reader-fit rules. */
const keyOf = (p: { lang: string; kind: string; id: string }) => `${p.lang}/${p.kind}/${p.id}`

/**
 * Before `first`, nothing on the front list is read or rewritten: the reader-fit work starts then. A date that can't be
 * read waits too.
 */
export const frontEarly = (list: { first: string }, now: Date) => !(now.getTime() >= Date.parse(list.first))

/**
 * What the last rewrite on file did, as its command printed it (engine-state/_fit-front.json). Its own file: the
 * rewrite's record of tries (_fit-rewrite.json) goes back to what was committed for a page the gate couldn't read
 * (writer-records.ts), and the hold must outlast that.
 */
export type FirstRun = { at: string; rewritten: string[]; notKept: string[]; skipped: string[]; failed: string[]; stopped?: string }

/**
 * The first run's record, or nothing when the run got no page as far as an outcome (a usage limit before its first):
 * the next cycle's is then still the first.
 */
export function firstRun(r: { rewritten: string[]; notKept: string[]; skipped: string[]; failed: string[]; stopped?: string }, at: string): FirstRun | undefined {
  if (!r.rewritten.length && !r.notKept.length && !r.skipped.length && !r.failed.length) return
  return { at, rewritten: r.rewritten, notKept: r.notKept, skipped: r.skipped, failed: r.failed, ...(r.stopped ? { stopped: r.stopped } : {}) }
}

/**
 * Whether a `--front` rewrite's front-list and live pages wait (one-shot, the chief of staff, 14 Nov 2026): a run on file
 * holds them until `cleared` names that run's `at`, set once the chief has read its pages. The run that goes writes its
 * own record, so the one after waits again by itself, however its cycle was started. A flag set back by hand was how the
 * night of 13 Nov stalled. False, true or any other value holds.
 */
export const frontHeld = (list: { cleared: boolean | string }, last: FirstRun | undefined) => !!last && list.cleared !== last.at

/** A page's mark from the gate (gate.ts Held): the checks it was held for, and the day. */
export type HeldMark = { checks: readonly string[]; at: string }

/** 2hraquarist's gallery posts of others' tanks: to go off, not be rewritten (the chief of staff, 14 Nov 2026). */
const GALLERY = /^2hraquarist-blogs-aquascaping-ideas-/

/**
 * The lane (the chief of staff, 14 Nov 2026): pages the gate held new, which no reader has seen, rewritten first, newest
 * first, whatever the hold on the front list; each comes out only when the gate passes it. A video guide goes to its own
 * editor instead (video-mend.ts), a page held for harm, a kit or a dose waits for a person, and a gallery post isn't paid
 * for.
 */
export function laneFirst<P extends { lang: string; kind: string; id: string }>(pages: readonly P[], held: ReadonlyMap<string, HeldMark>): P[] {
  const ours = pages.filter(p => {
    const h = held.get(keyOf(p))
    return !!h && !(p.kind === 'guides' && (p.id.startsWith('youtube-') || GALLERY.test(p.id))) && !h.checks.some(c => ['harm', 'kit', 'dose'].includes(c))
  })
  // Newest first; a day's pages in the order given (sort is stable).
  return [...new Map(ours.map(p => [keyOf(p), p])).values()].sort((a, b) => held.get(keyOf(b))!.at.localeCompare(held.get(keyOf(a))!.at))
}

/**
 * What a `--front` rewrite runs (the chief of staff, 14 Nov 2026: "The hold covers the front list's pages only"): with the
 * lane open, its pages first, then the front list's in their order unless it's held, then the rest; with it shut, as before
 * the lane, nothing while held. With `products` on, the pages `product` names (a foreign product or medicine on them, the
 * owner's complaint) share the front with the lane, one for one, ahead of every other page (the chief of staff, 14 Nov
 * 2026). `lane`: the lane's keys, whose outcomes never make a run the one on file; `mend`: the pages mended sentence by
 * sentence, a guide too (fit-rewrite.ts): the lane's and those.
 */
export function frontPlan<P extends { lang: string; kind: string; id: string }>(list: { cleared: boolean | string; lane: boolean; products?: boolean; front: readonly string[] }, last: FirstRun | undefined, ranked: readonly P[], held: ReadonlyMap<string, HeldMark>, product: (p: P) => boolean = () => false) {
  const isHeld = frontHeld(list, last)
  const lane = list.lane ? laneFirst(ranked, held) : []
  const inLane = new Set(lane.map(keyOf))
  const front = new Set(list.front)
  const waits = (p: P) => isHeld && front.has(keyOf(p))
  const products = list.lane && list.products ? ranked.filter(p => product(p) && !inLane.has(keyOf(p)) && !waits(p)) : []
  const first = new Set([...inLane, ...products.map(keyOf)])
  const shared = Array.from({ length: Math.max(lane.length, products.length) }, (_, i) => [lane[i], products[i]]).flat().filter((p): p is P => !!p)
  const rest = isHeld && !list.lane ? [] : orderFront(list, ranked).filter(p => !first.has(keyOf(p)) && !waits(p))
  return { held: isHeld, order: [...shared, ...rest], lane: inLane, mend: first }
}

/** The run's outcomes without the lane's pages: what goes on file as the run the hold waits on. */
export const offLane = (r: { rewritten: string[]; notKept: string[]; skipped: string[]; failed: string[]; stopped?: string }, lane: ReadonlySet<string>) => {
  const ours = (x: string) => !lane.has(x.split(' ')[0]!.replace(/:$/, ''))
  return { rewritten: r.rewritten.filter(ours), notKept: r.notKept.filter(ours), skipped: r.skipped.filter(ours), failed: r.failed.filter(ours), ...(r.stopped ? { stopped: r.stopped } : {}) }
}

/**
 * The front list's pages first, in the list's order, then every other page in the order given. A listed key with no
 * page is skipped, and a page is kept once.
 */
export function orderFront<P extends { lang: string; kind: string; id: string }>(list: { front: readonly string[] }, pages: readonly P[]): P[] {
  const by = new Map<string, P>()
  for (const p of pages) {
    const k = keyOf(p)
    if (!by.has(k)) by.set(k, p)
  }
  const used = new Set<string>()
  const head: P[] = []
  for (const k of list.front) {
    if (used.has(k)) continue
    const p = by.get(k)
    if (!p) continue
    used.add(k)
    head.push(p)
  }
  const rest: P[] = []
  for (const p of pages) {
    const k = keyOf(p)
    if (used.has(k)) continue
    used.add(k)
    rest.push(p)
  }
  return [...head, ...rest]
}
