import { isChallenge } from './outline'

/**
 * A source read through the Internet Archive's copies, for a site whose own pages sit behind a browser check the
 * engine does not try to pass (PlanetCatfish's Cloudflare challenge). Pages come from the latest archived copy;
 * pages on AquaTome still name and link the source's own URL. An archived challenge page counts as "no copy".
 */
export const WAYBACK = 'https://web.archive.org'
type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>

export class ArchiveFetcher {
  constructor(private d: { fetch: Fetch; now: () => Date; sleep: (ms: number) => Promise<void>; ua: string }) {}

  /** Latest copy: the Wayback Machine serves the capture nearest the stamp, and today is after every capture. */
  private stamp(kind: 'id_' | 'im_') { return `${this.d.now().toISOString().slice(0, 10).replace(/-/g, '')}${kind}` }

  /** One request, with one longer wait when the archive says too many requests. */
  private async call(url: string) {
    for (let attempt = 0; ; attempt++) {
      const r = await this.d.fetch(url, { headers: { 'user-agent': this.d.ua }, signal: AbortSignal.timeout(90_000) })
      if (r.status !== 429 || attempt > 0) return r
      await this.d.sleep(60_000)
    }
  }

  async get(url: string): Promise<{ status: number; html: string; finalUrl: string }> {
    const r = await this.call(`${WAYBACK}/web/${this.stamp('id_')}/${url}`)
    const html = await r.text()
    if (!r.ok) throw new Error(`no archived copy (HTTP ${r.status})`)
    if (isChallenge(html.match(/<title>([^<]*)/i)?.[1]?.trim() ?? '', html)) throw new Error('no archived copy (the archive holds a browser-check page)')
    return { status: r.status, html, finalUrl: url }
  }

  /** Plain text from the archive itself (the capture index). */
  async text(url: string): Promise<string> {
    // While the index is down the archive answers with a "Temporarily Offline" page, not an error; it often
    // comes back within seconds, so one retry after a pause.
    for (let attempt = 0; ; attempt++) {
      const r = await this.call(url)
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`)
      const body = await r.text()
      if (!/^\s*</.test(body)) return body
      if (attempt > 0) throw new Error(`the archive index is offline (${new URL(url).host})`)
      await this.d.sleep(30_000)
    }
  }

  async bytes(url: string): Promise<Uint8Array> {
    const r = await this.call(`${WAYBACK}/web/${this.stamp('im_')}/${url}`)
    if (!r.ok) throw new Error(`no archived image (HTTP ${r.status})`)
    // PlanetCatfish answers image hotlinks with a page, and the archive kept that page.
    if (!/^image\//.test(r.headers.get('content-type') ?? '')) throw new Error(`no archived image (${r.headers.get('content-type')})`)
    return new Uint8Array(await r.arrayBuffer())
  }

  async links(): Promise<string[]> { throw new Error('archive sources are discovered from the capture index') }
}

/** Capture-index query: every URL archived under `prefix` with a good capture, one row per URL. */
export const cdxQuery = (prefix: string) => `${WAYBACK}/cdx/search/cdx?${new URLSearchParams({ url: `${prefix}*`, fl: 'original', filter: 'statuscode:200', collapse: 'urlkey' })}`
