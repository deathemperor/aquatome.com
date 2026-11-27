/** The plain HTML counterpart of the machine-readable sitemap. */
export const CATALOGUE_PATH = '/kham-pha/muc-luc/'
export const CATALOGUE_PAGE_SIZE = 120
export const cataloguePagePath = (page: number) => page === 1 ? CATALOGUE_PATH : `${CATALOGUE_PATH}${page}/`
