/**
 * A live load's document headers, for the log of a load that misses a budget (lighthouse.spec.ts). On 14 Nov a few live
 * loads read best-practices 96 on issues the site doesn't make (watch runs 43558404985 and 43564278975: every script file
 * and request breaking a policy the site doesn't send), and the saved reports keep no headers to tell what the edge added
 * to that response. The check itself doesn't read them.
 */
type Event = { method: string; params?: unknown }
type Params = {
  requestId?: string; type?: string; statusCode?: number
  response?: { url?: string; status?: number; headers?: Record<string, string> }; headers?: Record<string, string>
}

const lower = (h: Record<string, string> = {}) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))

/**
 * The main document's response headers, names lower-cased, from Lighthouse's protocol log (`artifacts.DevtoolsLog`): the
 * response to `url` of type Document (a frame's own document, as a Turnstile widget's, is another URL), with the headers
 * the network sent beside it (`responseReceivedExtraInfo`). A redirect keeps its request's id and logs its own headers
 * under it, so only the ones with the final response's status are read, the last of them. Two documents at that URL:
 * nothing.
 */
export function documentHeaders(log: readonly Event[], url: string): Record<string, string> {
  const of = (e: Event) => (e.params ?? {}) as Params
  const docs = log.filter(e => e.method === 'Network.responseReceived' && of(e).type === 'Document' && of(e).response?.url === url)
  if (docs.length !== 1) return {}
  const doc = of(docs[0]!)
  const extra = log.filter(e => e.method === 'Network.responseReceivedExtraInfo' && of(e).requestId === doc.requestId && of(e).statusCode === doc.response?.status).at(-1)
  return { ...lower(doc.response?.headers), ...(extra ? lower(of(extra).headers) : {}) }
}

/**
 * The headers as log lines, sorted: a cookie's value withheld, and every address's query cut up to the next space (a
 * report address's query is the zone's, and a comma or a semicolon in it would end a shorter cut early).
 */
export function headerLines(headers: Record<string, string>): string[] {
  return Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${k}: ${k === 'set-cookie' ? '(withheld)' : v.replace(/\?\S*/g, '?…')}`)
}
