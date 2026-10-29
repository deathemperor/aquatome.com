/** A licence's deed page, for structured data (Google Images shows "Licensable" with it). */
export function licenceUrl(licence: string): string | undefined {
  const l = licence.toLowerCase()
  if (/cc0/.test(l)) return 'https://creativecommons.org/publicdomain/zero/1.0/'
  if (/public domain/.test(l)) return 'https://creativecommons.org/publicdomain/mark/1.0/'
  const v = l.match(/\d\.\d/)?.[0] ?? '4.0'
  if (/by[- ]sa/.test(l)) return `https://creativecommons.org/licenses/by-sa/${v}/`
  if (/\bby\b/.test(l)) return `https://creativecommons.org/licenses/by/${v}/`
  return undefined
}
/** A gallery page needs enough photos to be worth a page of its own. */
export const GALLERY_MIN = 6
/** Photos shown in the strip on the species page. */
export const GALLERY_STRIP = 8
