import type { Photo } from '@aq/schema'
import { licenceLabel, translator, type Lang } from './i18n'

// Sources as small marks instead of a credit line under every block or photo: a numbered mark for a text source (its
// number in the page's source list), © for a photo. Hovering, focusing or tapping one shows the source and its terms
// (scripts/glossary-tip.ts, the same card as glossary terms), with a link to the original.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }

/** A text source's mark: its number, linking to the original page. */
export function citeMark(lang: Lang, n: number, name: string, url: string): string {
  const t = translator(lang)
  return `<a class="cite" href="${esc(url)}" rel="noopener" data-term="${esc(name)}" data-tip="${esc(`${host(url)} · ${t('dịch với sự cho phép của nguồn')}`)}" data-more="${esc(t('Mở bài gốc ↗'))}" aria-label="${esc(t('Nguồn {n}: {name}', { n, name }))}">${n}</a>`
}

/** A photo's credit as the page shows it: "Ảnh: <author>", its licence, the photo's page (the app's copy uses it too). */
export function photoCredit(lang: Lang, p: Pick<Photo, 'author' | 'licence' | 'sourceUrl'>): { text: string; licence: string; url: string } {
  const t = translator(lang)
  return { text: `${t('Ảnh:')} ${p.author}`, licence: licenceLabel(t, p.licence), url: p.sourceUrl }
}

/** A photo's mark: ©, linking to the photo's page, with its author and licence. */
export function photoMark(lang: Lang, p: Pick<Photo, 'author' | 'licence' | 'sourceUrl'>): string {
  const t = translator(lang)
  const { text: who, licence: lic } = photoCredit(lang, p)
  return `<a class="cite pic" href="${esc(p.sourceUrl)}" rel="noopener" data-term="${esc(who)}" data-tip="${esc(lic)}" data-more="${esc(t('Xem ảnh gốc ↗'))}" aria-label="${esc(`${who}, ${lic}`)}">©</a>`
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
