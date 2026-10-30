import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { robotsTxt } from '../src/lib/seo'
import { createHash } from 'node:crypto'
import { DIST, page } from './dist'

const htmlFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [] })

test('every vi page has exactly one canonical and a vi hreflang', () => {
  for (const f of htmlFiles(join(DIST, 'vi'))) {
    const html = readFileSync(f, 'utf8')
    expect(html.match(/rel="canonical"/g)?.length, f).toBe(1)
    expect(html, f).toContain('hreflang="vi"')
  }
})
test('sitemap lists indexable pages and omits noindex ones', () => {
  const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8')
  expect(xml).toContain('/vi/ca/ca-neon-vua/')
  expect(xml).not.toContain('/vi/ca/ca-boraras-do/')
})
test('robots: production points to the sitemap, staging blocks everything', () => {
  expect(robotsTxt(false, 'https://example.com')).toBe('User-agent: *\nContent-Signal: ai-train=no, search=yes, ai-input=yes\nAllow: /\nDisallow: /go/\n\nSitemap: https://example.com/sitemap.xml\n')
  expect(robotsTxt(true, 'https://x.huuloc.com')).toBe('User-agent: *\nDisallow: /\n')
  expect(readFileSync(join(DIST, 'robots.txt'), 'utf8')).toContain('Sitemap:')
})
test('search index is built and pages carry an accent-free search alias', () => {
  expect(existsSync(join(DIST, 'pagefind', 'pagefind.js'))).toBe(true)
  const { dom } = page('/vi/ca/ca-dia/')
  expect(dom.querySelector('main[data-pagefind-body]')).not.toBeNull()
  expect(dom.querySelector('[data-pagefind-index-attrs="data-ascii"]')?.getAttribute('data-ascii')).toContain('ca dia')
  expect(() => page('/vi/tim-kiem/')).not.toThrow()
})
test('sitemap omits noindex glossary terms', () => {
  expect(readFileSync(join(DIST, 'sitemap.xml'), 'utf8')).not.toContain('/vi/thuat-ngu/gh/')
})
test('AdSense: ads.txt, account meta, and a loader that waits for the reader\'s first scroll, tap or key', () => {
  expect(readFileSync(join(DIST, 'ads.txt'), 'utf8')).toBe('google.com, pub-3032018142512489, DIRECT, f08c47fec0942fa0\n')
  const { dom } = page('/vi/ca/')
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
  const md = readFileSync(join(DIST, 'vi', 'ca', 'ca-dia', 'index.md'), 'utf8')
  expect(md).toMatch(/^---\ntitle: ".+"\ndescription: ".+"/)
  expect(md).toMatch(/^# .+/m)
  expect(md).toMatch(/^## .+/m)
  expect(md).toMatch(/^-\s+\*\*Nhiệt độ:\*\* \d/m)
  expect(md).not.toMatch(/<[a-z][^>]*>/)
  expect(md).not.toContain('Gửi bình luận')
  expect(md).not.toContain('/go/')
  expect(md).toMatch(/\]\(https?:\/\/[^)]+\)/) // links are absolute
  expect(htmlFiles(join(DIST, 'vi')).every(f => existsSync(f.replace(/\.html$/, '.md')))).toBe(true)
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
  const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8')
  for (const p of ['/vi/gioi-thieu/', '/vi/chinh-sach-bao-mat/', '/vi/lien-he/']) {
    expect(() => page(p)).not.toThrow()
    expect(page('/vi/').dom.querySelector(`footer a[href="${p}"]`), p).not.toBeNull()
    expect(xml).toContain(p)
  }
  const privacy = page('/vi/chinh-sach-bao-mat/')
  expect(privacy.dom.querySelector('#english[lang="en"]')).not.toBeNull()
  expect(privacy.html).toContain('adssettings.google.com')
  expect(privacy.html).toContain('contact@aquatome.com')
})
test('titles and descriptions match search phrasing; pages carry share previews', () => {
  const sp = page('/vi/ca/ca-neon-vua/').dom
  expect(sp.querySelector('title')?.text).toBe('Cách nuôi cá neon vua (Paracheirodon axelrodi): bể, nước, nuôi chung')
  expect(sp.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(/^Cá neon vua \(Paracheirodon axelrodi\): nhiệt độ .+°C, pH .+\. Cách nuôi, thức ăn, nuôi chung với cá gì, sinh sản\.$/)
  expect(sp.querySelector('meta[property="og:image"]')?.getAttribute('content')).toMatch(/^https?:\/\//)
  expect(sp.querySelector('meta[property="og:title"]')?.getAttribute('content')).toContain('Cách nuôi cá neon vua')
  expect(page('/vi/thuat-ngu/').dom.querySelector('meta[property="og:image"]')?.getAttribute('content')).toContain('/logo.png')
})
test('glossary title asks the question; its description is the definition', () => {
  const g = page('/vi/thuat-ngu/chu-trinh-nito/').dom
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
