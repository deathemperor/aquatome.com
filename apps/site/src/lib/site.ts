/** Google AdSense publisher (not secret: it appears in every page and in ads.txt). */
export const ADSENSE_CLIENT = 'ca-pub-3032018142512489'
export const CONTACT_EMAIL = 'contact@aquatome.com'
export const adsTxt = (client: string) => `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`
/** RFC 9116 security.txt; Expires is a year after the build, so each deploy renews it. */
export const securityTxt = (site: string, built: Date) =>
  `Contact: mailto:${CONTACT_EMAIL}\nExpires: ${new Date(built.getTime() + 365 * 864e5).toISOString()}\nPreferred-Languages: vi, en\nCanonical: ${new URL('/.well-known/security.txt', site).href}\n`
