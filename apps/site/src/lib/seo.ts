/** Staging builds (e.g. a huuloc.com subdomain) must never be indexed. */
export const isStaging = () => process.env.STAGING === '1'

/** contentsignals.org: search and AI answers that cite us are welcome (traffic); model training is not (much of the content is licensed from third parties). */
export const CONTENT_SIGNAL = 'ai-train=no, search=yes, ai-input=yes'

export function robotsTxt(staging: boolean, site: string): string {
  return staging
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nContent-Signal: ${CONTENT_SIGNAL}\nAllow: /\nDisallow: /go/\n\nSitemap: ${new URL('/sitemap.xml', site).href}\n`
}
