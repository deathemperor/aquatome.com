import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Wikimedia (Commons' API, its pictures and their thumbnails) refusing this Mac. On 12 Nov 2026 Commons answered "too many
 * requests" to every request from it, and the engine's steps asked again page after page and photo after photo: the album
 * step once a page, the large copies and the mirror once for each address of a photo. A refusal now puts every Wikimedia
 * read to rest, as the Internet Archive's does (archive.ts): for the time the refusal names (Retry-After), else 12 hours,
 * doubling to a day if the first request after the rest is refused too. Every request asks as the engine, under its own
 * name, whatever name the caller set.
 */
export const WIKIMEDIA_REST_MS = 12 * 3_600_000
export const WIKIMEDIA_REST_MAX_MS = 24 * 3_600_000
export const wikimedia = (host: string) => host === 'wikimedia.org' || host.endsWith('.wikimedia.org')

/** Wikimedia has refused this Mac, just now or within the rest: no request to it before `until`. */
export class WikimediaRefused extends Error {
  constructor(readonly until: string) { super(`Wikimedia refused this Mac: no request before ${until}`) }
}
type Rest = { until: string; waitMs: number }

/** Retry-After as seconds or as a date, in milliseconds from `now`; undefined when it names no wait. */
export function namedWait(value: string | null, now: Date): number | undefined {
  if (!value) return undefined
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - now.getTime())
}

/**
 * `fetch` for the engine's process: any other host passes through untouched. `restFile` is kept outside any checkout,
 * since it's this Mac that Wikimedia refuses.
 */
export function restingFetch(fetch: typeof globalThis.fetch, o: { restFile: string; now: () => Date; ua: string }): typeof globalThis.fetch {
  return async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!wikimedia(new URL(href).hostname)) return fetch(input, init)
    const rest = JSON.parse(await readFile(o.restFile, 'utf8').catch(() => 'null')) as Rest | null
    if (rest && o.now().getTime() < Date.parse(rest.until)) throw new WikimediaRefused(rest.until)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('user-agent', o.ua)
    const r = await fetch(input, { ...init, headers })
    if (r.status === 429) {
      const waitMs = namedWait(r.headers.get('retry-after'), o.now()) ?? (rest ? Math.min(rest.waitMs * 2, WIKIMEDIA_REST_MAX_MS) : WIKIMEDIA_REST_MS)
      const until = new Date(o.now().getTime() + waitMs).toISOString()
      await mkdir(dirname(o.restFile), { recursive: true })
      await writeFile(o.restFile, `${JSON.stringify({ until, waitMs })}\n`)
      throw new WikimediaRefused(until)
    }
    if (rest) await rm(o.restFile, { force: true })
    return r
  }
}
