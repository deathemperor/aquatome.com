import { chromium, type BrowserContext, type Page } from 'playwright-core'

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

  async get(url: string): Promise<{ status: number; html: string; finalUrl: string }> {
    const p = this.need()
    const r = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await p.waitForTimeout(this.opts.settleMs ?? 2500)
    return { status: r?.status() ?? 0, html: await p.content(), finalUrl: p.url() }
  }

  /** Raw text of a URL (sitemaps, robots), fetched with the browser's cookies. */
  async text(url: string): Promise<string> {
    const r = await this.ctx!.request.get(url, { timeout: 45_000 })
    return r.text()
  }

  /** Image bytes with the page as referer (some sites refuse hotlinks without it). */
  async bytes(url: string, referer: string): Promise<Uint8Array> {
    const r = await this.ctx!.request.get(url, { headers: { referer }, timeout: 45_000 })
    if (!r.ok()) throw new Error(`HTTP ${r.status()}`)
    return r.body()
  }

  async links(url: string): Promise<string[]> {
    const p = this.need()
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await p.waitForTimeout(this.opts.settleMs ?? 2500)
    return p.$$eval('a[href]', as => as.map(a => (a as HTMLAnchorElement).href))
  }

  async close(): Promise<void> {
    await this.ctx?.close()
  }
}
