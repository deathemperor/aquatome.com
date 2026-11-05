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
/** Every beacon query's condition: no row from before the reset. */
export const COUNTED = `timestamp >= toDateTime('${READERS_FROM.slice(0, 19).replace('T', ' ')}')`

/** The beacon's rows for a query (`sql` names its table). */
export const eventsSql = <T>(accountId: string, token: string, sql: (table: string) => string) => aeSql<T>(accountId, token, sql(EVENTS))

/** A number from a row: AE sends 64-bit counts as strings. */
export const num = (x: number | string | null | undefined) => Number(x) || 0
