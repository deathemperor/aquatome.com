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
 * Whether a `--front` rewrite waits. The first scheduled run is looked at before another one runs: while `cleared` is
 * false, any try at or after `first` holds the command. A try from before `first` (the page tried by hand) does not.
 */
export function frontHeld(list: { cleared: boolean; first: string }, tried: Record<string, { at: string } | undefined>): boolean {
  if (list.cleared) return false
  const start = Date.parse(list.first)
  if (Number.isNaN(start)) return false
  return Object.values(tried).some(e => {
    const at = e ? Date.parse(e.at) : Number.NaN
    return !Number.isNaN(at) && at >= start
  })
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
