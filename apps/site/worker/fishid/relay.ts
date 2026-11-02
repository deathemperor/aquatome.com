/**
 * Claude calls leave Cloudflare from the eastern US, not from the reader's nearest location. Readers in Vietnam reach
 * Cloudflare's Hong Kong location, and Anthropic refuses requests from there (403 "Request not allowed", for every key):
 * the fish-ID tool's calls go through this Durable Object, created in eastern North America (`locationHint`), so its
 * requests to the API go out from there.
 *
 * It forwards to api.anthropic.com only, and only what the Worker hands it (a Durable Object has no public address).
 * The classic Durable Object form (no `cloudflare:workers` import), so the Worker's tests still load in Node.
 */
export const API_HOST = 'api.anthropic.com'
const ID = 'claude-us'

export class FishIdRelay {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (url.protocol !== 'https:' || url.host !== API_HOST) return new Response('not the Claude API', { status: 400 })
    return fetch(new Request(url, req))
  }
}

/** The SDK's fetch, through the relay in the eastern US. */
export function relayFetch(ns: DurableObjectNamespace): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => ns.get(ns.idFromName(ID), { locationHint: 'enam' }).fetch(new Request(input, init))) as typeof fetch
}
