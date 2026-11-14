import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { robotsTxt } from '../src/lib/seo'
import { createHash } from 'node:crypto'
import { DIST, page, sitemapText } from './dist'
import { missingAddresses } from '../scripts/check-addresses'
import { VI_SECTIONS } from '../worker/paths'
import { LANGS } from '@aq/schema/langs'
import { APP_PAGES, APP_STATE } from '../src/lib/app'

const htmlFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [] })
/** A language's built pages: Vietnamese ones are the home page and its sections, at the root. */
const langFiles = (l: string) => (l === 'vi' ? [join(DIST, 'index.html'), ...VI_SECTIONS.flatMap(s => (existsSync(join(DIST, s)) ? htmlFiles(join(DIST, s)) : []))] : existsSync(join(DIST, l)) ? htmlFiles(join(DIST, l)) : [])

test('every vi page has exactly one canonical and a vi hreflang', () => {
  const files = langFiles('vi')
  expect(files.length).toBeGreaterThan(50)
  for (const f of files) {
    const html = readFileSync(f, 'utf8')
    expect(html.match(/rel="canonical"/g)?.length, f).toBe(1)
    expect(html, f).toContain('hreflang="vi"')
  }
})
test('every page has one non-empty h1', () => {
  // Every language's pages (not the redirects: /go/…).
  const bad = LANGS.flatMap(langFiles).filter(f => {
    const h1 = readFileSync(f, 'utf8').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g) ?? []
    return h1.length !== 1 || !h1[0]!.replace(/<[^>]+>/g, '').trim()
  })
  expect(bad.map(f => f.slice(DIST.length))).toEqual([])
})

test('sitemap lists indexable pages and omits noindex ones', () => {
  const xml = sitemapText()
  expect(xml).toContain('/ca/ca-neon-vua/')
  expect(xml).not.toContain('/ca/ca-boraras-do/')
})
const sheet = (kind: string) => readFileSync(join(DIST, `sitemap-${kind}.xml`), 'utf8')
const dateIn = (xml: string, path: string) => new RegExp(`<loc>https?://[^/]+${path}</loc>(?:<lastmod>([^<]+)</lastmod>)?`).exec(xml)

test('/sitemap.xml is the index of one sitemap per kind of page, and a page is in one of them, once', () => {
  const index = readFileSync(join(DIST, 'sitemap.xml'), 'utf8')
  expect(index).toContain('<sitemapindex')
  expect(index).not.toContain('<urlset')
  const kinds = [...index.matchAll(/\/sitemap-([a-z-]+)\.xml<\/loc>/g)].map(m => m[1])
  expect(kinds).toEqual(expect.arrayContaining(['fish', 'fish-photos', 'plants', 'plant-photos', 'guides', 'videos', 'glossary', 'equipment', 'products', 'other']))
  const locs = [...sitemapText().matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
  expect(locs.length).toBeGreaterThan(30)
  expect(locs.filter((l, i) => locs.indexOf(l) !== i)).toEqual([])
  expect(sheet('videos')).toContain('/huong-dan/bon-phan-cho-cay-thuy-sinh/</loc>')
  expect(sheet('guides')).not.toContain('/huong-dan/bon-phan-cho-cay-thuy-sinh/</loc>')
  expect(sheet('guides')).toContain('/huong-dan/setup-be-thuy-sinh-dau-tien/</loc>')
})

// Live checks of 14 Nov: the sitemap listed a plant's photo page the build never made (test/photo-pages.test.ts). The
// build stops on it (scripts/check-addresses.ts); this holds the fixture build to it too.
test('every page a sitemap lists, and every redirect target, is a page the build wrote', () => {
  expect(sitemapText().match(/<loc>/g)!.length).toBeGreaterThan(30)
  expect(missingAddresses(DIST)).toEqual({ sitemap: [], redirects: [] })
})

// The dates are the fixture's page-dates.json, all in the past: a page's own files, the latest of them.
test('a page\'s last-changed date is the latest of its own files, never the build\'s; a page with no files of its own has none', () => {
  expect(dateIn(sheet('fish'), '/ca/ca-neon-vua/')?.[1], 'entity, vi and summary: the summary is the latest').toBe('2026-11-04')
  expect(dateIn(sheet('fish-photos'), '/ca/ca-neon-vua/anh/')?.[1], 'the gallery and the names, not the summary').toBe('2026-11-03')
  expect(dateIn(sheet('guides'), '/huong-dan/setup-be-thuy-sinh-dau-tien/')?.[1]).toBe('2026-10-31')
  const tools = dateIn(sheet('other'), '/cong-cu/')
  expect(tools, 'the tools page is listed').not.toBeNull()
  expect(tools?.[1], 'a fixed page').toBeUndefined()
  const dates = new Set([...sitemapText().matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]))
  expect([...dates].sort()).toEqual(['2026-10-31', '2026-11-03', '2026-11-04'])
})

test('robots: production points to the sitemap, staging blocks everything', () => {
  expect(robotsTxt(false, 'https://example.com')).toBe('User-agent: *\nContent-Signal: ai-train=no, search=yes, ai-input=yes\nAllow: /\nDisallow: /go/\n\nSitemap: https://example.com/sitemap.xml\n')
  expect(robotsTxt(true, 'https://x.huuloc.com')).toBe('User-agent: *\nDisallow: /\n')
  expect(readFileSync(join(DIST, 'robots.txt'), 'utf8')).toContain('Sitemap:')
})
test('search index is built and pages carry an accent-free search alias', () => {
  expect(existsSync(join(DIST, 'pagefind', 'pagefind.js'))).toBe(true)
  const { dom } = page('/ca/ca-dia/')
  expect(dom.querySelector('main[data-pagefind-body]')).not.toBeNull()
  // Searched (Pagefind metadata), never shown in a result's excerpt.
  expect(dom.querySelector('h1[data-pagefind-meta="aka[data-aka]"]')?.getAttribute('data-aka')).toContain('ca dia')
  expect(() => page('/tim-kiem/')).not.toThrow()
})
test('search leaves out photo galleries, reference lists, old names and other names lists', () => {
  expect(page('/ca/ca-neon-vua/anh/').dom.querySelector('[data-pagefind-body]')).toBeNull()
  const { dom } = page('/ca/ca-neon-xanh/')
  for (const sel of ['section[data-section="references"]', 'section.refs', 'p.alt']) expect(dom.querySelector(sel)?.closest('[data-pagefind-ignore]'), sel).not.toBeNull()
  expect(page('/ca/ca-neon-vua/').dom.querySelector('p.redirected')?.hasAttribute('data-pagefind-ignore')).toBe(true)
})
test('sitemap omits noindex glossary terms', () => {
  expect(sitemapText()).not.toContain('/thuat-ngu/gh/')
})
test('AdSense: ads.txt, account meta, and a loader that waits for the reader\'s first scroll, tap or key', () => {
  expect(readFileSync(join(DIST, 'ads.txt'), 'utf8')).toBe('google.com, pub-3032018142512489, DIRECT, f08c47fec0942fa0\n')
  const { dom } = page('/ca/')
  expect(dom.querySelector('meta[name="google-adsense-account"]')?.getAttribute('content')).toBe('ca-pub-3032018142512489')
  // Not fetched with the page (Google's test cookie is a third-party cookie)…
  expect(dom.querySelector('script[src*="googlesyndication"]')).toBeNull()
  // …but on the first interaction.
  const loader = dom.querySelector('script[data-ads]')?.text ?? ''
  expect(loader).toContain('adsbygoogle.js?client=ca-pub-3032018142512489')
  for (const e of ['scroll', 'pointerdown', 'keydown']) expect(loader).toContain(`'${e}'`)
  // Only the page's own scroll counts: a strip that scrolls itself while loading (scroll-snap) must not load ads.
  const on: { type: string; capture: boolean; fn: () => void }[] = [], off: typeof on = [], head: unknown[] = []
  const capture = (o: unknown) => typeof o === 'boolean' ? o : !!(o as { capture?: boolean })?.capture
  new Function('addEventListener', 'removeEventListener', 'document', loader)(
    (type: string, fn: () => void, o: unknown) => on.push({ type, fn, capture: capture(o) }),
    (type: string, fn: () => void, o: unknown) => off.push({ type, fn, capture: capture(o) }),
    { createElement: () => ({}), head: { appendChild: (s: unknown) => head.push(s) } })
  expect(on.find(l => l.type === 'scroll')?.capture).toBe(false)
  on[0]!.fn()
  expect(head).toHaveLength(1)
  expect(off.map(l => `${l.type}:${l.capture}`).sort()).toEqual(on.map(l => `${l.type}:${l.capture}`).sort())
})
test('security.txt: contact, a future Expires and its canonical URL', () => {
  const txt = readFileSync(join(DIST, '.well-known', 'security.txt'), 'utf8')
  expect(txt).toContain('Contact: mailto:contact@aquatome.com\n')
  expect(txt).toMatch(/\nCanonical: https?:\/\/[^/]+\/\.well-known\/security\.txt\n/)
  expect(Date.parse(txt.match(/Expires: (\S+)/)![1]) - Date.now()).toBeGreaterThan(300 * 864e5)
})
test('markdown for agents: every page has index.md — front matter, headings, fact lines, no HTML or page chrome', () => {
  const md = readFileSync(join(DIST, 'ca', 'ca-dia', 'index.md'), 'utf8')
  expect(md).toMatch(/^---\ntitle: ".+"\ndescription: ".+"/)
  expect(md).toMatch(/^# .+/m)
  expect(md).toMatch(/^## .+/m)
  expect(md).toMatch(/^-\s+\*\*Nhiệt độ:\*\* \d/m)
  expect(md).not.toMatch(/<[a-z][^>]*>/)
  expect(md).not.toContain('Gửi bình luận')
  // Readers' photos load live: neither the fish's copy nor its gallery's has their section.
  expect(md).not.toContain('Ảnh bạn đọc')
  const gallery = readFileSync(join(DIST, 'ca', 'ca-neon-vua', 'anh', 'index.md'), 'utf8')
  expect(gallery).not.toContain('Ảnh bạn đọc')
  expect(gallery).not.toContain('#rp-h') // the link down to them, empty until the page says how many
  expect(md).not.toContain('/go/')
  expect(md).toMatch(/\]\(https?:\/\/[^)]+\)/) // links are absolute
  // The app page has none while it's the owner's (worker/app-switch.ts).
  const owners = APP_STATE === 'owner' ? APP_PAGES.map(p => join(DIST, p, 'index.html')) : []
  expect(langFiles('vi').filter(f => !owners.includes(f)).every(f => existsSync(f.replace(/\.html$/, '.md')))).toBe(true)
})
test('agent discovery files: llms.txt, OpenAPI, skills index whose digest matches the SKILL.md bytes', () => {
  expect(readFileSync(join(DIST, 'llms.txt'), 'utf8')).toMatch(/^# AquaTome\n\n> /)
  expect(JSON.parse(readFileSync(join(DIST, 'openapi.json'), 'utf8')).openapi).toBe('3.1.0')
  const index = JSON.parse(readFileSync(join(DIST, '.well-known', 'agent-skills', 'index.json'), 'utf8'))
  expect(index.$schema).toBe('https://schemas.agentskills.io/discovery/0.2.0/schema.json')
  const [skill] = index.skills
  expect(skill).toMatchObject({ name: 'aquatome-species', type: 'skill-md' })
  const md = readFileSync(join(DIST, '.well-known', 'agent-skills', 'aquatome-species', 'SKILL.md'))
  expect(skill.digest).toBe(`sha256:${createHash('sha256').update(md).digest('hex')}`)
  expect(skill.url).toMatch(/\/\.well-known\/agent-skills\/aquatome-species\/SKILL\.md$/)
})
test('about, privacy and contact pages exist, are linked from the footer and listed in the sitemap', () => {
  const xml = sitemapText()
  for (const p of ['/gioi-thieu/', '/chinh-sach-bao-mat/', '/lien-he/']) {
    expect(() => page(p)).not.toThrow()
    expect(page('/').dom.querySelector(`footer a[href="${p}"]`), p).not.toBeNull()
    expect(xml).toContain(p)
  }
  const privacy = page('/chinh-sach-bao-mat/')
  expect(privacy.dom.querySelector('#english[lang="en"]')).not.toBeNull()
  expect(privacy.html).toContain('adssettings.google.com')
  expect(privacy.html).toContain('contact@aquatome.com')
})
test('titles and descriptions match search phrasing; pages carry share previews', () => {
  const sp = page('/ca/ca-neon-vua/').dom
  expect(sp.querySelector('title')?.text).toBe('Cách nuôi cá neon vua (Paracheirodon axelrodi): bể, nước, nuôi chung')
  expect(sp.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(/^Cá neon vua \(Paracheirodon axelrodi\): nhiệt độ .+°C, pH .+\. Cách nuôi, thức ăn, nuôi chung với cá gì, sinh sản\.$/)
  expect(sp.querySelector('meta[property="og:image"]')?.getAttribute('content')).toMatch(/^https?:\/\//)
  expect(sp.querySelector('meta[property="og:title"]')?.getAttribute('content')).toContain('Cách nuôi cá neon vua')
  expect(page('/thuat-ngu/').dom.querySelector('meta[property="og:image"]')?.getAttribute('content')).toContain('/logo.png')
})
test('glossary title asks the question; its description is the definition', () => {
  const g = page('/thuat-ngu/chu-trinh-nito/').dom
  expect(g.querySelector('title')?.text).toMatch(/ là gì\? — AquaTome$/)
  expect(g.querySelector('meta[name="description"]')?.getAttribute('content')?.length).toBeGreaterThan(20)
})
test('excerpt skips captions and credits, cuts at a word', async () => {
  const { excerpt } = await import('../src/lib/meta')
  const html = '<figure><figcaption>Ảnh © Ai đó</figcaption></figure><p>Ngắn.</p><p>Ảnh © Nonn Panitvong, dạng vây đỏ của loài cá chạch này rất hiếm gặp</p><p>Từng bị xem nhẹ như đội dọn dẹp của bể cộng đồng, nhóm cá này thật ra có tập tính xã hội phức tạp và thú vị hơn nhiều người nghĩ, đặc biệt khi nuôi theo đàn lớn.</p>'
  const e = excerpt(html, 80)
  expect(e.startsWith('Từng bị xem nhẹ')).toBe(true)
  expect(e.endsWith('…')).toBe(true)
  expect(e.length).toBeLessThanOrEqual(81)
})
