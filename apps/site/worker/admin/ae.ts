/** Analytics Engine's SQL API (the readers' beacon, the fish-ID log): rows as its JSON gives them, numbers often as strings. */
export async function aeSql<T>(accountId: string, token: string, query: string): Promise<T[]> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: query })
  if (!r.ok) throw new Error(`analytics engine sql ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return ((await r.json()) as { data: T[] }).data
}
/**
 * The readers' beacon (binding EVENTS). It wrote to thuysinh_events until the move to aquatome_events on 2026-11-04;
 * Analytics Engine keeps three months, so until OLD_EVENTS_UNTIL a query reads both.
 */
export const EVENTS = 'aquatome_events'
const OLD_EVENTS = 'thuysinh_events'
const OLD_EVENTS_UNTIL = Date.parse('2027-02-05T00:00:00Z')

/** The beacon's rows for a query (`sql` names its table): the dataset's, then the old one's while it still has any. */
export async function eventsSql<T>(accountId: string, token: string, sql: (table: string) => string, now = Date.now()): Promise<T[]> {
  const tables = now < OLD_EVENTS_UNTIL ? [EVENTS, OLD_EVENTS] : [EVENTS]
  return (await Promise.all(tables.map(t => aeSql<T>(accountId, token, sql(t))))).flat()
}

/** A number from a row: AE sends 64-bit counts as strings. */
export const num = (x: number | string | null | undefined) => Number(x) || 0
