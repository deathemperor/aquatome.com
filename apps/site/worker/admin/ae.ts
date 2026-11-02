/** Analytics Engine's SQL API (the readers' beacon, the fish-ID log): rows as its JSON gives them, numbers often as strings. */
export async function aeSql<T>(accountId: string, token: string, query: string): Promise<T[]> {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: query })
  if (!r.ok) throw new Error(`analytics engine sql ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return ((await r.json()) as { data: T[] }).data
}
/** A number from a row: AE sends 64-bit counts as strings. */
export const num = (x: number | string | null | undefined) => Number(x) || 0
