import { escapeHtml } from './comments'
import { ct } from './ct'
import { genusHtml, guessHtml, sciAfter, hasGuesses, own, photoId, verdictLine, type Answer, type Linked, type Result } from './fish-id-client'

/**
 * "Bể của tôi": a photo names a fish or plant for the tank's form (life-edit.ts), through the fish-ID tool
 * (fish-id-client.ts). Loaded when the reader opens "Chụp ảnh nhận diện". Each guess offers one action: its page, or an
 * entry without a page filled in from the guess. Under it, its genus's other pages, each added as a guess's page is.
 */

/** A guess's page as the form keeps it: a fish (a species or a breed) or a plant, with this site's address for it, if any. */
export type GuessPage = { id: string; kind: 'fish' | 'plant'; name: string; path: string }
/** What the reader picked: a page, or what a guess without one fills in the "Thêm …" form. */
export type Guessed = { page: GuessPage } | { entry: ReturnType<typeof guessEntry> }
const pageOf = (l: Linked): GuessPage => ({ id: l.id, kind: l.kind === 'plant' ? 'plant' : 'fish', name: l.name, path: own(l.url) ?? '' })

/** What a guess without a page fills in the "Thêm …" form: fish (a plant when the photo is of one), its names. */
export function guessEntry(r: Pick<Result, 'commonName' | 'scientificName'>, verdict: Answer['verdict']): { kind: 'fish' | 'plant'; name: string; sci: string } {
  // The form's fields hold 80 and 120 characters (packages/schema/src/tanks.ts); a value set from a script isn't cut by maxlength.
  return { kind: verdict === 'plant' ? 'plant' : 'fish', name: (r.commonName || r.scientificName).trim().slice(0, 80), sci: r.scientificName.trim().slice(0, 120) }
}

export function initPhoto(panel: HTMLElement, o: {
  /** What the panel says when the tool is off: the typed search still works. */
  off: string
  /** Whether a guess's page is on the tank already. */
  has: (page: GuessPage) => boolean
  /** The reader picked a guess. */
  add: (g: Guessed) => void
}) {
  const out = panel.querySelector<HTMLElement>('[data-out]')!
  let answer: Answer | undefined

  function card(r: Result, i: number): string {
    const p = r.page
    const there = !!p && o.has(pageOf(p))
    const label = p?.name ?? guessEntry(r, answer!.verdict).name
    const species = p && r.species ? `<p class="also">${escapeHtml(ct('Một dòng của'))} ${escapeHtml(r.species.name)}</p>` : ''
    const none = p ? '' : `<p class="add">${escapeHtml(ct('Chưa có trong cẩm nang.'))}</p>`
    const act = `<p class="act"><button type="button" class="quiet" data-ev="tank" data-guess="${i}"${there ? ' disabled' : ''} aria-label="${escapeHtml(there ? ct('Đã có: {name}', { name: label }) : ct('Thêm vào bể: {name}', { name: label }))}">${escapeHtml(there ? ct('Đã có') : ct('Thêm vào bể'))}</button></p>`
    const genus = genusHtml(ct, r, (l, j) => {
      const on = o.has(pageOf(l))
      return `<button type="button" class="sib" data-ev="tank" data-sib="${i}:${j}"${on ? ' disabled' : ''} aria-label="${escapeHtml(on ? ct('Đã có: {name}', { name: l.name }) : ct('Thêm vào bể: {name}', { name: l.name }))}"><span class="nm">${escapeHtml(l.name)}${sciAfter(l)}</span><span class="tag" aria-hidden="true">${escapeHtml(on ? ct('Đã có') : ct('Thêm'))}</span></button>`
    })
    // The name as text, not a link: the form isn't saved yet.
    return guessHtml(ct, r, escapeHtml(label), `${species}${none}${act}${genus}`)
  }
  function draw() {
    if (!answer) { out.innerHTML = ''; return }
    const line = verdictLine(ct, answer)
    out.innerHTML = `${line ? `<p class="lead">${escapeHtml(line)}</p>` : ''}${hasGuesses(answer) ? `<ol>${answer.results.map(card).join('')}</ol>` : ''}`
  }
  const tool = photoId(panel, { from: 'tank', off: o.off, show: a => { answer = a; draw() }, clear: () => { answer = undefined; draw() } })

  out.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-guess], [data-sib]')
    if (!b || b.disabled) return
    if (b.dataset.sib) {
      const [i, j] = b.dataset.sib.split(':').map(Number)
      const l = answer?.results[i!]?.sameGenus?.[j!]
      if (l) o.add({ page: pageOf(l) })
      return
    }
    const r = answer?.results[Number(b.dataset.guess)]
    if (r) o.add(r.page ? { page: pageOf(r.page) } : { entry: guessEntry(r, answer!.verdict) })
  })
  return {
    /** Back to its first state, for the next photo: no photo, no guesses. */
    reset: tool.reset,
  }
}
