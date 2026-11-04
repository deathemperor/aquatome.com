/**
 * Vietnamese pages live at the root (/ca/ca-neon-vua/), Indonesian and Thai ones under /id/ and /th/. Until November 2026
 * the Vietnamese ones were under /vi/: those addresses answer a 301 to the same path without /vi (worker/index.ts), and
 * paths kept from then (the hidden-pages list, the beacon's page views) read as the new ones through `withoutVi`.
 * A plain module: the site (src/lib/i18n.ts) and the Worker both import it.
 */

/** The first segment of every Vietnamese page's address (the folders of src/pages/). The Worker runs first on each (wrangler.jsonc). */
export const VI_SECTIONS = [
  'ca', 'cay', 'chinh-sach-bao-mat', 'cong-cu', 'dang-nhap', 'gioi-thieu', 'huong-dan', 'kham-pha', 'lien-he', 'moi-cap-nhat',
  'nguon-goc', 'nhom', 'phan-loai', 'san-pham', 'thiet-bi', 'thuat-ngu', 'tim-kiem', 'video',
] as const

/** "/vi/ca/x/?q=1" → "/ca/x/?q=1"; "/vi/" and "/vi" → "/". Any other path stays as it is. */
export const withoutVi = (path: string) => (/^\/vi(?=[/?#]|$)/.test(path) ? path.slice(3).replace(/^(?=[?#]|$)/, '/') : path)

/** A Vietnamese page's address (the home page, or one under a Vietnamese section), the query and hash aside. */
export const isViPage = (path: string) => {
  const p = path.replace(/[?#].*$/, '')
  return p === '/' || (VI_SECTIONS as readonly string[]).includes(p.split('/')[1]!)
}

/**
 * Apple's return address for the web's sign-in, in each language: a URL its Services ID lists (the tanks page). The
 * Vietnamese one is listed by its old address, and Apple's popup only checks that the address is listed, so it stays
 * until https://aquatome.com/cong-cu/be-cua-toi/ is added there too.
 */
export const APPLE_RETURN = { vi: '/vi/cong-cu/be-cua-toi/', id: '/id/alat/akuarium-saya/', th: '/th/tools/my-tanks/' } as const
