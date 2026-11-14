import type { Photo } from '@aq/schema'
import { alterationNotice } from './gallery'
import { licenceLabel, translator, type Lang } from './i18n'
import { isUnsplash, unsplashParts, type CreditPart } from './unsplash'

// Sources as small marks instead of a credit line under every block or photo: a numbered mark for a text source (its
// number in the page's source list), © for a photo. Hovering, focusing or tapping one shows the source and its terms
// (scripts/glossary-tip.ts, the same card as glossary terms), with a link to the original.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }

/**
 * A text source's mark: its number, linking to the original page. `card`: what its card says when the source isn't a text
 * we translated (a review we summarize, our own test notes).
 */
export function citeMark(lang: Lang, n: number, name: string, url: string, card?: { tip: string; more: string }): string {
  const t = translator(lang)
  const tip = card?.tip ?? `${host(url)} · ${t('dịch từ nguồn')}`
  const more = card?.more ?? t('Mở bài gốc ↗')
  return `<a class="cite" href="${esc(url)}" rel="noopener" data-term="${esc(name)}" data-tip="${esc(tip)}" data-more="${esc(more)}" aria-label="${esc(t('Nguồn {n}: {name}', { n, name }))}">${n}</a>`
}

type Credited = Pick<Photo, 'author' | 'authorUrl' | 'licence' | 'sourceUrl' | 'generated' | 'altered'>

/** An Unsplash photo's line in the page's language (lib/unsplash.ts); `photo`: the photo's page, for the name without `authorUrl`. */
export const unsplashLine = (lang: Lang, p: Pick<Photo, 'author' | 'authorUrl'>, photo?: string) => unsplashParts(translator(lang)('Ảnh: {author} trên {site}'), p.author, { ...(p.authorUrl ? { authorUrl: p.authorUrl } : {}), ...(photo ? { photo } : {}) })
/** A line's pieces as HTML: its links open the photographer's page, Unsplash or the photo's. */
export const partsHtml = (parts: CreditPart[]) => parts.map(x => (x.href ? `<a${x.cls ? ` class="${x.cls}"` : ''} href="${esc(x.href)}" rel="noopener">${esc(x.text)}</a>` : esc(x.text))).join('')

/**
 * A photo's credit as the page shows it: "Ảnh: <author>", its licence (empty for a photo a source let us use), the
 * photo's page (the app's copy uses it too). An Unsplash photo's: "Ảnh: <author> trên Unsplash", with the photographer's page when the engine has it.
 */
export function photoCredit(lang: Lang, p: Credited): { text: string; licence: string; url: string; authorUrl?: string; author?: string } {
  const t = translator(lang)
  if (p.generated) return { text: t('Ảnh do AI tạo'), licence: '', url: p.sourceUrl }
  const notice = alterationNotice(p)
  if (notice) return { text: `${t('Ảnh:')} ${p.author} · ${t(notice)}`, licence: licenceLabel(p.licence), url: p.sourceUrl }
  if (isUnsplash(p.licence)) return { text: unsplashLine(lang, p).map(x => x.text).join(''), licence: licenceLabel(p.licence), url: p.sourceUrl, ...(p.authorUrl ? { authorUrl: p.authorUrl } : {}), author: p.author }
  return { text: `${t('Ảnh:')} ${p.author}`, licence: licenceLabel(p.licence), url: p.sourceUrl }
}

/**
 * A photo's mark: ©, linking to the photo's page, with its author and licence (no tip when it has none). An Unsplash photo's is its line instead,
 * in view: Unsplash asks for the photographer and Unsplash, linked, wherever a photo shows.
 */
export function photoMark(lang: Lang, p: Credited): string {
  const t = translator(lang)
  if (p.generated) return `<span class="pic-by ai-photo-label" data-credit-kind="generated" data-licence="" data-src="${esc(p.sourceUrl)}" data-author="AI"> ${esc(t('Ảnh do AI tạo'))}</span>`
  if (alterationNotice(p)) {
    const c = photoCredit(lang, p)
    return `<span class="pic-by" data-credit-kind="altered" data-licence="${esc(c.licence)}" data-src="${esc(c.url)}" data-author="${esc(p.author)}"> <a href="${esc(c.url)}" rel="noopener">${esc(c.text)}</a>${c.licence ? ` · ${esc(c.licence)}` : ''}</span>`
  }
  // After the caption's words on the same line, as the © (a space before it, which starts a line as nothing). The photo's
  // page for the app's copy (lib/page-blocks.ts), which reads the credit from here.
  if (isUnsplash(p.licence)) return `<span class="pic-by" data-src="${esc(p.sourceUrl)}" data-author="${esc(p.author)}"> ${partsHtml(unsplashLine(lang, p, p.sourceUrl))}</span>`
  const { text: who, licence: lic } = photoCredit(lang, p)
  return `<a class="cite pic" href="${esc(p.sourceUrl)}" rel="noopener" data-term="${esc(who)}"${lic ? ` data-tip="${esc(lic)}"` : ''} data-more="${esc(t('Xem ảnh gốc ↗'))}" aria-label="${esc(lic ? `${who}, ${lic}` : who)}">©</a>`
}

/** The mark at the end of a block's last sentence: inside its last paragraph or list item, else on a line of its own. */
export function withCite(html: string, mark: string): string {
  const s = html.trimEnd()
  for (const close of ['</p>', '</li>']) {
    const i = s.lastIndexOf(close)
    if (i >= 0 && s.slice(i + close.length).replace(/<\/(ul|ol)>/g, '').trim() === '') return s.slice(0, i) + mark + s.slice(i)
  }
  return `${s}<p class="cite-line">${mark}</p>`
}
