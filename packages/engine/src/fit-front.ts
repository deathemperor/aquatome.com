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
 * What the first scheduled rewrite did, as its command printed it (engine-state/_fit-front.json). Its own file: the
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
 * Whether a `--front` rewrite waits: the first scheduled run is looked at before another one runs, so while `cleared`
 * is false, a first run on file holds the command.
 */
export const frontHeld = (list: { cleared: boolean }, first: FirstRun | undefined) => !list.cleared && !!first

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
