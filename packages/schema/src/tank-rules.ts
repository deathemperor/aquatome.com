/**
 * The rules of saved tanks that need no schema: merging, stamping, tombstones, litres. No zod here, so a browser page
 * that only edits its store doesn't load the validator. Re-exported by ./tanks.ts; contract: docs/my-tanks-sync.md.
 */

type Rec = { id: string; updatedAt: string; deletedAt?: unknown }
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
/** Minutes a schedule keeps the light on; an off time of 00:00 is midnight at the end of the day. */
export const minutesLit = (on: string, off: string) => (off === '00:00' ? 1440 : minutes(off)) - minutes(on)

export type Tombstone = { id: string; updatedAt: string; deletedAt: string; [k: string]: unknown }
export const isTombstone = (r: Rec): r is Rec & Tombstone => typeof r.deletedAt === 'string'
export function live<R extends Rec>(r: R): r is Exclude<R, Tombstone> { return !isTombstone(r) }

/** Litres of a tank: its own figure, else the box of its dimensions; undefined when it has neither. */
export function tankLitres(t: { dims?: { l: number; w: number; h: number }; litres?: number }): number | undefined {
  if (t.litres !== undefined) return t.litres
  return t.dims ? (t.dims.l * t.dims.w * t.dims.h) / 1000 : undefined
}

/**
 * The `updatedAt` of a change made at `now` to a record whose copy here says `prev`: now, or 1 ms after `prev` when this
 * device's clock is behind it. A change made after seeing a copy must win over that copy, whatever this clock says.
 */
export function stamp(now: Date, prev?: string): string {
  return new Date(Math.max(now.getTime(), prev ? Date.parse(prev) + 1 : -Infinity)).toISOString()
}

/** The tombstone that replaces a record deleted at `now` (stamped after the copy it deletes). */
export function tombstone(prev: { id: string; updatedAt: string }, now: Date): Tombstone {
  const at = stamp(now, prev.updatedAt)
  return { id: prev.id, updatedAt: at, deletedAt: at }
}

/**
 * The copy of one record to keep. `kept` is the copy already held (on the server: the account's), `incoming` the one
 * arriving. The later `updatedAt` wins; on the same `updatedAt` a tombstone wins over a live copy, else the copy already
 * held stays.
 */
export function newer<R extends Rec>(kept: R, incoming: R): R {
  if (incoming.updatedAt > kept.updatedAt) return incoming
  if (incoming.updatedAt === kept.updatedAt && isTombstone(incoming) && !isTombstone(kept)) return incoming
  return kept
}

/**
 * Both lists' records, one per id, sorted by id. Every copy of an id goes through `newer` in order (all of `kept`, then all
 * of `incoming`), so a list holding an id twice gives the same result on every platform.
 */
export function mergeRecords<R extends Rec>(kept: readonly R[], incoming: readonly R[]): R[] {
  const out = new Map<string, R>()
  for (const r of [...kept, ...incoming]) { const k = out.get(r.id); out.set(r.id, k ? newer(k, r) : r) }
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
