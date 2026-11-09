/** Analytics Engine's SQL API (the readers' beacon, the fish-ID log): rows as its JSON gives them, numbers often as strings. */
export async function aeSql<T>(accountId: string, token: string, query: string): Promise<T[]> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: query })
  if (!r.ok) throw new Error(`analytics engine sql ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return ((await r.json()) as { data: T[] }).data
}
/** The readers' beacon (binding EVENTS). It wrote to thuysinh_events until the move to aquatome_events on 2026-11-04. */
export const EVENTS = 'aquatome_events'
/**
 * Readers count from this moment (UTC). The owner reset the count on 2026-11-05: the rows before it were the site's own
 * checks, the owner and the owner's agents, from before the beacon left them out. The old dataset has nothing after it.
 */
export const READERS_FROM = '2026-11-05T03:10:00Z'
/**
 * Our own runs from before our network was marked (us.ts, from 8 Nov 2026 11:11 UTC): checks on this Mac opened these tabs
 * from Vietnam, and they were counted as readers'. Left out of every count as the reset was (decided 2026-11-08), each with
 * the tabs it held, which the readers page lists so the dip can be explained. Every tab in them began and ended inside.
 */
export const OUR_RUNS = [
  { cc: 'VN', from: '2026-11-07T20:40:00Z', to: '2026-11-07T21:24:00Z', tabs: 56 },
  { cc: 'VN', from: '2026-11-08T00:28:00Z', to: '2026-11-08T00:44:00Z', tabs: 23 },
] as const
const dt = (iso: string) => `toDateTime('${iso.slice(0, 19).replace('T', ' ')}')`
/** No row from before the reset, nor from our runs before the mark (OUR_RUNS). */
export const SINCE_RESET = `timestamp >= ${dt(READERS_FROM)}${OUR_RUNS.map(r => ` AND NOT (blob6 = '${r.cc}' AND timestamp >= ${dt(r.from)} AND timestamp < ${dt(r.to)})`).join('')}`
/** A row-level beacon query's condition: no row from before the reset, and none of ours (blob1, worker/us.ts). */
export const COUNTED = `${SINCE_RESET} AND blob1 = ''`
/** The marks (us.ts), weakest first: a tab's mark is the strongest any of its events carries, 0 for a reader's. */
export const WHO = ['', 'app', 'net', 'team', 'owner'] as const
/**
 * A query grouped by tab returns its mark as `who` (WHO's index, as AE can't take the max of a string), and drops the
 * tab when it isn't 0: one marked event makes the whole tab ours, so no tab is half a reader's and half ours.
 */
export const WHO_RANK = `MAX(${WHO.slice(1).reduceRight((rest, w, i) => `IF(blob1 = '${w}', ${i + 1}, ${rest})`, '0')}) AS who`

/** The beacon's rows for a query (`sql` names its table). */
export const eventsSql = <T>(accountId: string, token: string, sql: (table: string) => string) => aeSql<T>(accountId, token, sql(EVENTS))

/** A number from a row: AE sends 64-bit counts as strings. */
export const num = (x: number | string | null | undefined) => Number(x) || 0
