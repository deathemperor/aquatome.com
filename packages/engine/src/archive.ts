import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parse } from 'node-html-parser'
import { isChallenge } from './outline'

/**
 * A source read through the Internet Archive's copies, for a site whose own pages sit behind a browser check the
 * engine does not try to pass (PlanetCatfish's Cloudflare challenge). Pages come from the latest archived copy;
 * pages on AquaTome still name and link the source's own URL. An archived challenge page counts as "no copy".
 */
export const WAYBACK = 'https://web.archive.org'
/**
 * Between two calls to the archive. Each is two requests, the redirect to a capture and the capture itself. At 5 s the
 * archive answered 429 and then refused the connection within a few pages (2Hr Aquarist, November 2026); this stays
 * under 15 requests a minute.
 */
export const ARCHIVE_POLITE = 10_000
/**
 * After the archive refuses this Mac (a 429 or a refused connection): no request for 12 hours, then one; refused again,
 * the wait doubles, to a day at most. Asking again each run kept the refusal going (November 2026).
 */
export const ARCHIVE_REST_MS = 12 * 3_600_000
export const ARCHIVE_REST_MAX_MS = 24 * 3_600_000
/** The archive has refused this Mac, just now or within the wait: stop reading it until `until`. */
export class ArchiveRefused extends Error {
  constructor(readonly until: string) { super(`the archive refused this Mac: no request before ${until}`) }
}
/**
 * The wait, and what the request that started it got (`got`: "HTTP 429", or the error's code, as "ECONNRESET (fetch
 * failed)" or "TimeoutError (…)") and when (`at`), so a dropped connection or a timeout can be told from a refusal (the
 * chief of staff, 2026-11-12). Each is logged in one line too, and so is the answer that ends a wait.
 */
type Rest = { until: string; waitMs: number; got?: string; at?: string }
/** A failed request's code: the network's (ECONNRESET, ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT…) or a timeout's name. */
export function errorGot(e: unknown): string {
  const x = e as { name?: string; message?: string; code?: unknown; cause?: { code?: unknown } }
  const text = (c: unknown) => (typeof c === 'string' ? c : undefined)
  // A DOMException's `code` is a number (23 for a timeout): its name says it.
  const code = (x.name === 'TimeoutError' || x.name === 'AbortError' ? x.name : undefined) ?? text(x.cause?.code) ?? text(x.code)
  return code ? `${code} (${x.message ?? ''})` : (x.message ?? String(e))
}
type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>

export class ArchiveFetcher {
  /** `restFile`: where the wait is kept, outside any checkout, since it's this Mac the archive refuses. */
  constructor(private d: { fetch: Fetch; now: () => Date; sleep: (ms: number) => Promise<void>; ua: string; restFile: string }) {}

  /** Latest copy: the Wayback Machine serves the capture nearest the stamp, and today is after every capture. */
  private today() { return this.d.now().toISOString().slice(0, 10).replace(/-/g, '') }

  private async refused(rest: Rest | null, got: string) {
    const waitMs = rest ? Math.min(rest.waitMs * 2, ARCHIVE_REST_MAX_MS) : ARCHIVE_REST_MS
    const at = this.d.now().toISOString()
    const until = new Date(this.d.now().getTime() + waitMs).toISOString()
    await mkdir(dirname(this.d.restFile), { recursive: true })
    await writeFile(this.d.restFile, `${JSON.stringify({ until, waitMs, got, at } satisfies Rest)}\n`)
    console.log(`archive: counted as refused at ${at}, it got ${got}: no request before ${until}`)
    return new ArchiveRefused(until)
  }

  /** One request, none during a refusal's wait, and one longer wait if the network fails. The request after a wait gets no second try. */
  private async call(url: string) {
    const rest = JSON.parse(await readFile(this.d.restFile, 'utf8').catch(() => 'null')) as Rest | null
    if (rest && this.d.now().getTime() < new Date(rest.until).getTime()) throw new ArchiveRefused(rest.until)
    for (let attempt = 0; ; attempt++) {
      let r
      try {
        r = await this.d.fetch(url, { headers: { 'user-agent': this.d.ua }, signal: AbortSignal.timeout(90_000) })
      } catch (e) {
        if (rest || (e as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') throw await this.refused(rest, errorGot(e))
        if (attempt > 0) throw new Error(`the archive isn't answering (${(e as Error).message})`)
        await this.d.sleep(60_000)
        continue
      }
      if (r.status === 429) throw await this.refused(rest, `HTTP ${r.status}`)
      if (rest) {
        console.log(`archive: answered after the wait, at ${this.d.now().toISOString()}, with HTTP ${r.status}: reading carries on`)
        await rm(this.d.restFile, { force: true })
      }
      return r
    }
  }

  /** `id_` is the page as it was captured, without the archive's toolbar or rewritten links. */
  private async capture(stamp: string, url: string) {
    const r = await this.call(`${WAYBACK}/web/${stamp}id_/${url}`)
    const html = await r.text()
    if (!r.ok) throw new Error(`no archived copy (HTTP ${r.status})`)
    const date = r.headers.get('memento-datetime')
    return { challenge: isChallenge(html.match(/<title>([^<]*)/i)?.[1]?.trim() ?? '', html), page: { status: r.status, html, finalUrl: url, ...(date ? { capturedAt: new Date(date).toISOString() } : {}) } }
  }

  /** The newest copy; if that is a browser check, the next newest of the last few that isn't. */
  async get(url: string): Promise<{ status: number; html: string; finalUrl: string; capturedAt?: string }> {
    const newest = await this.capture(this.today(), url)
    if (!newest.challenge) return newest.page
    await this.d.sleep(ARCHIVE_POLITE)
    const stamps = (await this.text(capturesQuery(url)).catch(e => { if (e instanceof ArchiveRefused) throw e; return '' })).split('\n').filter(Boolean).reverse()
    for (const stamp of stamps) {
      await this.d.sleep(ARCHIVE_POLITE)
      const older = await this.capture(stamp, url)
      if (!older.challenge) return older.page
    }
    throw new Error('no archived copy (the archive holds a browser-check page)')
  }

  /** Plain text from the archive itself (the capture index). */
  async text(url: string): Promise<string> {
    // The index is often briefly down: a 5xx, or a "Temporarily Offline" page served as 200. Three more tries, waiting longer each time.
    for (let attempt = 0; ; attempt++) {
      const r = await this.call(url)
      const body = r.ok ? await r.text() : ''
      if (r.ok && !/^\s*</.test(body)) return body
      if (r.status < 500 && !r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`)
      if (attempt >= 3) throw new Error(r.ok ? `the archive index is offline (${new URL(url).host})` : `HTTP ${r.status} from ${new URL(url).host}`)
      await this.d.sleep(30_000 * 2 ** attempt)
    }
  }

  async bytes(url: string): Promise<Uint8Array> {
    const r = await this.call(`${WAYBACK}/web/${this.today()}im_/${url}`)
    if (!r.ok) throw new Error(`no archived image (HTTP ${r.status})`)
    // PlanetCatfish answers image hotlinks with a page, and the archive kept that page.
    if (!/^image\//.test(r.headers.get('content-type') ?? '')) throw new Error(`no archived image (${r.headers.get('content-type')})`)
    return new Uint8Array(await r.arrayBuffer())
  }

  /** The links on the page's newest copy (`id_`, so they are the site's own). `scope`: the part of the page. */
  async links(url: string, scope = 'body'): Promise<string[]> {
    const { html } = await this.get(url)
    return parse(html).querySelectorAll(`${scope} a[href]`).flatMap(a => {
      try { return [new URL(a.getAttribute('href')!, url).href] } catch { return [] }
    })
  }
}

/** Capture-index query: every URL archived under `prefix` with a good capture, one row per URL. */
export const cdxQuery = (prefix: string) => `${WAYBACK}/cdx/search/cdx?${new URLSearchParams({ url: `${prefix}*`, fl: 'original', filter: 'statuscode:200', collapse: 'urlkey' })}`
/** Capture-index query: the last few good captures of one URL, oldest first. */
const capturesQuery = (url: string) => `${WAYBACK}/cdx/search/cdx?${new URLSearchParams({ url, fl: 'timestamp', filter: 'statuscode:200', limit: '-4' })}`
