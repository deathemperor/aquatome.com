import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { isChallenge } from './outline'

/** A browser check that didn't clear on its own; a person has to pass it once in the engine's Chrome profile. */
export class ChallengeError extends Error {
  constructor(url: string) { super(`challenge at ${url}`) }
}

/** Real Chrome with a persistent profile. No stealth, proxies or challenge solving — a challenge page is returned as-is. */
export class ChromeFetcher {
  private ctx?: BrowserContext
  private page?: Page
  constructor(private opts: { profileDir: string; headless?: boolean; settleMs?: number }) {}

  async open(): Promise<void> {
    this.ctx = await chromium.launchPersistentContext(this.opts.profileDir, {
      channel: 'chrome', headless: this.opts.headless ?? false, locale: 'en-US', viewport: { width: 1280, height: 900 },
    })
    this.page = this.ctx.pages()[0] ?? (await this.ctx.newPage())
  }

  private need(): Page {
    if (!this.page) throw new Error('ChromeFetcher.open() not called')
    return this.page
  }

  /** Navigate and wait, like a person would, for an automatic browser check (interstitial) to finish; up to 25 s. */
  private async open_(url: string) {
    const p = this.need()
    let r = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await p.waitForTimeout(this.opts.settleMs ?? 2500)
    for (let i = 0; i < 25 && isChallenge(await p.title().catch(() => ''), p.url()); i++) {
      const next = await p.waitForNavigation({ timeout: 1000 }).catch(() => null)
      if (next) r = next
    }
    if (r && new URL(p.url()).pathname !== new URL(url).pathname && !isChallenge(await p.title(), p.url())) r = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    return { p, r }
  }

  async get(url: string): Promise<{ status: number; html: string; finalUrl: string }> {
    const { p, r } = await this.open_(url)
    return { status: r?.status() ?? 0, html: await p.content(), finalUrl: p.url() }
  }

  /** Raw text of a URL (sitemaps, robots) with the browser's cookies; falls back to the page when a browser check intercepts it. */
  async text(url: string): Promise<string> {
    const body = await (await this.ctx!.request.get(url, { timeout: 45_000 })).text()
    if (!isChallenge(body.match(/<title>([^<]*)/i)?.[1] ?? '', body)) return body
    const { p } = await this.open_(new URL('/', url).href)
    const text = await p.evaluate(async u => (await fetch(u, { credentials: 'include' })).text(), url)
    if (isChallenge(text.match(/<title>([^<]*)/i)?.[1] ?? '', text)) throw new ChallengeError(url)
    return text
  }

  /** Image bytes with the page as referer (some sites refuse hotlinks without it). */
  async bytes(url: string, referer: string): Promise<Uint8Array> {
    const r = await this.ctx!.request.get(url, { headers: { referer }, timeout: 45_000 })
    if (!r.ok()) throw new Error(`HTTP ${r.status()}`)
    return r.body()
  }

  async links(url: string, scope = 'body'): Promise<string[]> {
    const { p } = await this.open_(url)
    if (isChallenge(await p.title(), p.url())) throw new ChallengeError(url)
    return p.$$eval(`${scope} a[href]`, as => as.map(a => (a as HTMLAnchorElement).href))
  }

  async close(): Promise<void> {
    await this.ctx?.close()
  }
}
