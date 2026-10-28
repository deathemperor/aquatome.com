/** Staging builds (e.g. a huuloc.com subdomain) must never be indexed. */
export const isStaging = () => process.env.STAGING === '1'

export function robotsTxt(staging: boolean, site: string): string {
  return staging
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', site).href}\n`
}
