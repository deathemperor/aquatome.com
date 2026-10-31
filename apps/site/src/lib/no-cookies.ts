/**
 * Wikimedia's image hosts set cookies (WMF-Uniq, NetworkProbeLimit, GeoIP) with every picture: third-party cookies on
 * our pages, which Lighthouse's best practices count against them and Chrome logs as an issue (#276). They answer CORS
 * (`Access-Control-Allow-Origin: *`), so a picture asked for without credentials (crossorigin="anonymous") loads the
 * same, with no cookies sent or kept. The engine copies Commons photos to our bucket (`pnpm engine mirror-photos`); this
 * covers the ones not copied yet. Our own media host sends no CORS headers: its pictures must stay as they are.
 */
export const noCookies = (src: string) => /^https:\/\/[a-z.]+\.wikimedia\.org\//.test(src)

/**
 * Every Wikimedia `<img>` in a page's HTML, asked for without cookies. The attribute goes last, where the browser's
 * `setAttribute` puts it on a card it builds (scripts/species-card.ts), so the two cards stay the same. Read attribute by
 * attribute (values in double quotes, as Astro writes them): an alt text may hold a `>`.
 */
export const noCookiesHtml = (html: string) => html.replace(/<img((?:\s+[\w:-]+(?:="[^"]*")?)*)(\s*\/?)>/g, (tag, attrs: string, end: string) =>
  /\ssrc="https:\/\/[a-z.]+\.wikimedia\.org\//.test(attrs) && !/\scrossorigin[\s=]/.test(attrs) ? `<img${attrs} crossorigin="anonymous"${end}>` : tag)
