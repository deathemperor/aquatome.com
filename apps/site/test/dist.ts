import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse, type HTMLElement } from 'node-html-parser'
import { appPath, langOf, toVi } from '../src/lib/i18n'
import { withoutVi } from '../worker/paths'

export const DIST = fileURLToPath(new URL('../dist', import.meta.url))
export const page = (path: string): { html: string; dom: HTMLElement } => {
  const clean = path.replace(/^\/|\/$/g, '')
  const file = clean === '404' ? `${DIST}/404.html` : `${DIST}/${clean}/index.html`.replace('//index', '/index')
  if (!existsSync(file)) throw new Error(`missing page ${path} (${file})`)
  const html = readFileSync(file, 'utf8')
  return { html, dom: parse(html) }
}

/** Every sitemap the build wrote, as one text: /sitemap.xml is only the index of them, one per kind of page. */
export const sitemapText = (dist = DIST) =>
  [...readFileSync(`${dist}/sitemap.xml`, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => readFileSync(`${dist}${new URL(m[1]!).pathname}`, 'utf8')).join('\n')

/** A page the apps name (lib/i18n appPath: a Vietnamese one by its /vi/ form, while APP_VI_ROOT is off), as the site built it. */
export const appPage = (path: string) => page(withoutVi(path))
/** A link on a built page ("/ca/x/", "/id/ikan/x/"), as the apps name its page; a link elsewhere as it is. */
export const appHref = (href: string) => (/^\/(?!\/)/.test(href) ? appPath(langOf(href), toVi(href)) : href)
