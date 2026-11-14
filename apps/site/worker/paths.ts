/**
 * Vietnamese pages live at the root (/ca/ca-neon-vua/), Indonesian and Thai ones under /id/ and /th/. Until November 2026
 * the Vietnamese ones were under /vi/: those addresses answer a 301 to the same path without /vi (worker/index.ts), and
 * paths kept from then (the hidden-pages list, the beacon's page views) read as the new ones through `withoutVi`.
 * A plain module: the site (src/lib/i18n.ts) and the Worker both import it.
 */
import type { Lang } from '@aq/schema/langs'

/** The first segment of every Vietnamese page's address (the folders of src/pages/). The Worker runs first on each (wrangler.jsonc). */
export const VI_SECTIONS = [
  'ca', 'cay', 'chinh-sach-bao-mat', 'cong-cu', 'dang-nhap', 'gioi-thieu', 'huong-dan', 'kham-pha', 'lien-he', 'moi-cap-nhat',
  'nguon-goc', 'nhom', 'phan-loai', 'san-pham', 'thiet-bi', 'thuat-ngu', 'tim-kiem', 'ung-dung', 'vat-lieu', 'video',
] as const

/** "/vi/ca/x/?q=1" → "/ca/x/?q=1"; "/vi/" and "/vi" → "/". Any other path stays as it is. */
export const withoutVi = (path: string) => (/^\/vi(?=[/?#]|$)/.test(path) ? path.slice(3).replace(/^(?=[?#]|$)/, '/') : path)

/** A Vietnamese page's address (the home page, or one under a Vietnamese section), the query and hash aside. */
export const isViPage = (path: string) => {
  const p = path.replace(/[?#].*$/, '')
  return p === '/' || (VI_SECTIONS as readonly string[]).includes(p.split('/')[1]!)
}

/**
 * A fish's or plant's photo page the build didn't make (its album a picture short of six) forwards to its page, in every
 * language (test/photo-pages.test.ts holds each served one, and its line in wrangler.jsonc's run_worker_first).
 */
export const galleryParent = (path: string) => {
  const match = /^(\/(?:ca|cay)\/[^/]+\/)anh\/?$|^(\/(?:id|ms)\/(?:ikan|tanaman|tumbuhan)\/[^/]+\/)foto\/?$|^(\/th\/(?:fish|plants)\/[^/]+\/)photos\/?$/.exec(path)
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

/**
 * Apple's return address for the web's sign-in, in each language: the tanks page, as its Services ID (com.aquatome.web)
 * lists it. Apple refuses an address it doesn't list.
 */
export const APPLE_RETURN = { vi: '/cong-cu/be-cua-toi/', id: '/id/alat/akuarium-saya/', th: '/th/tools/my-tanks/', ms: '/ms/alat/tangki-saya/' } as const satisfies Record<Lang, string>

/** The site's own host, and the owner's dashboard's (dashboard-host.ts). */
export const SITE_HOST = 'aquatome.com'
export const DASHBOARD_HOST = `dashboard.${SITE_HOST}`
/**
 * A dashboard page's address for a link from outside the dashboard (mail, reports, JSON, docs): "/_ab/doc-gia/#x" →
 * "https://aquatome.com/_ab/doc-gia/#x". It is the page itself, or once Cloudflare Access guards the dashboard's own host,
 * a 301 to it (dashboard.ts), so a link sent before the move still opens. Every printed dashboard address comes from here.
 */
export const dashboardUrl = (path = '/_ab/') => `https://${SITE_HOST}${path}`
