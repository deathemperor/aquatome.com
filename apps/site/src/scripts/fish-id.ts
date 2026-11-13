import { escapeHtml } from './comments'
import { msg } from '../i18n/msg'
import { ct } from './ct'
import { genusHtml, guessHtml, sciAfter, hasGuesses, own, photoId, verdictLine, type Answer, type Linked, type Result } from './fish-id-client'

const OFF = msg('Công cụ nhận diện tạm thời chưa dùng được. Bạn tìm cá theo tên trong danh sách cá nhé.')

const name = (l: Linked) => escapeHtml(l.name)
const link = (l: Linked) => (own(l.url) ? `<a href="${escapeHtml(own(l.url)!)}">${name(l)}</a>` : name(l))

/**
 * One guess: our page's name and link when the handbook has it; otherwise Claude's name, said plainly. Under it, the
 * genus's other pages, each with its scientific name.
 */
function card(r: Result): string {
  const genus = genusHtml(ct, r, l => `${link(l)}${sciAfter(l, ' class="sci"')}`)
  if (r.page) {
    const species = r.species ? `<p class="also">${escapeHtml(ct('Một dòng của'))} ${link(r.species)}</p>` : ''
    const open = own(r.page.url) ? `<a class="open" href="${escapeHtml(own(r.page.url)!)}">${escapeHtml(ct('Xem hồ sơ'))} →</a>` : ''
    return guessHtml(ct, r, link(r.page), `${species}${open}${genus}`)
  }
  return guessHtml(ct, r, escapeHtml(r.commonName || r.scientificName), `<p class="add">${escapeHtml(ct('Chưa có trong cẩm nang.'))}</p>${genus}`)
}

function answerHtml(a: Answer): string {
  const line = verdictLine(ct, a)
  if (!hasGuesses(a)) return `<p class="lead">${escapeHtml(line)}</p>`
  return `<h2>${escapeHtml(ct('Có thể là'))}</h2>${line ? `<p class="lead">${escapeHtml(line)}</p>` : ''}<ol>${a.results.map(card).join('')}</ol>`
}

/** The tool's page: photo → shrink → Turnstile → identify (fish-id-client.ts) → the guesses with their pages. */
export function mountFishId(root: HTMLElement) {
  const out = root.querySelector<HTMLElement>('[data-out]')!
  return photoId(root, { from: 'page', off: ct(OFF), show: a => { out.innerHTML = answerHtml(a) }, clear: () => { out.innerHTML = '' } })
}
