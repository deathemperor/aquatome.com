import { accessOk } from './access'
import { hostPath, innerPath } from './admin/shell'
import { adminRoute, type AdminEnv } from './dashboard'
import { SITE_HOST } from './paths'

/**
 * The owner's dashboard on its own host, dashboard.aquatome.com, behind Cloudflare Access (access.ts). Every request needs
 * Access's token first; without it 403, and nothing below runs. Inside, the pages are the same /_ab/<key>/ code
 * (dashboard.ts): / is the overview and /<key>/ a page (with the pages under it and its .json), by the dashboard's own
 * list of its pages (shell.ts WEB_PAGES), so a page added there is here too.
 * The rest of /_ab/ (the pages' forms, images and fonts) keeps its address. Nothing else of the site answers here, and
 * the machine endpoints stay on the site, where Access can't stand in their way. Files that skip the Worker
 * (run_worker_first in wrangler.jsonc) get noindex from public/_headers.
 */
const plain = (status: number, text: string, type = 'text/plain') => new Response(text, { status, headers: { 'content-type': `${type}; charset=utf-8` } })
const ROBOTS = 'User-agent: *\nDisallow: /\n'
const reads = (req: Request) => req.method === 'GET' || req.method === 'HEAD'

async function answer(req: Request, url: URL, env: AdminEnv, now: Date): Promise<Response> {
  if (!(await accessOk(req, env))) return plain(403, 'Forbidden')
  // Access's cookie isn't ours to mark SameSite, and the pages' forms need to come from the pages. Only Sec-Fetch-Site says
  // so: these pages' no-referrer makes a browser send "Origin: null". No machine posts here, so no header is no.
  if (!reads(req) && req.headers.get('sec-fetch-site') !== 'same-origin') return plain(403, 'Forbidden')
  const path = url.pathname
  if (path === '/robots.txt') return plain(200, ROBOTS)
  const inner = innerPath(path)
  if (inner) {
    const mapped = new URL(url)
    mapped.pathname = inner
    return adminRoute(req, mapped, env, now, true)
  }
  if (path === '/_ab' || path.startsWith('/_ab/')) {
    // An address from before the move: the same page here ("/_ab" and "/_ab/<key>" with the slash pages have; an image
    // or a form's address under a page isn't one).
    const page = /^\/_ab(?:\/[a-z0-9-]+)?$/.test(path) ? `${path}/` : path
    if (reads(req) && hostPath(page) !== page) return new Response(null, { status: 301, headers: { location: `${hostPath(page)}${url.search}` } })
    return adminRoute(req, url, env, now, true)
  }
  return plain(404, 'Not found')
}

/** Link attributes with an address on this host, as our templates write them (user text is escaped: its quotes aren't quotes). */
const LINK = /\b(href|src|action)="(\/(?!\/)[^"]*)"/g
const SIGN_OUT = '<a class="out" href="/cdn-cgi/access/logout">Sign out</a>'
/**
 * A page's links as this host reads them, in one place, so the app's JSON and each new page need nothing: a dashboard
 * page's by its address here, the site's pages (a hidden page, a read page) back on the site, where they are.
 */
const forThisHost = (html: string) => html
  .replace(LINK, (_, attr: string, path: string) => `${attr}="${path.startsWith('/_ab/') ? hostPath(path) : `https://${SITE_HOST}${path}`}"`)
  .replace('</header>', `${SIGN_OUT}</header>`)

/** Every answer on this host: noindex and never stored (a font stays cacheable, public and the same for everyone), and links and redirects that lead around this host. */
export async function dashboardHostRoute(req: Request, url: URL, env: AdminEnv, now = new Date()): Promise<Response> {
  const res = await answer(req, url, env, now)
  const headers = new Headers(res.headers)
  headers.set('x-robots-tag', 'noindex, nofollow')
  if (!(res.ok && url.pathname.startsWith('/_ab/fonts/'))) headers.set('cache-control', 'no-store')
  const to = headers.get('location')
  if (to) headers.set('location', hostPath(to))
  const html = res.body && res.ok && headers.get('content-type')?.includes('text/html')
  return new Response(html ? forThisHost(await res.text()) : res.body, { status: res.status, headers })
}
