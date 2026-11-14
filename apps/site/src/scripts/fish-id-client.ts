import { JPEG_QUALITY, MAX_SIDE } from '../../worker/fishid/photo'
import { prefixedLang } from '@aq/schema/langs'
import { isViPage, withoutVi } from '../../worker/paths'
import { escapeHtml, loadTurnstile, type Turnstile } from './comments'
import { msg } from '../i18n/msg'
import type { T } from '../lib/i18n'
import { ct } from './ct'
import { sciBeside } from '../lib/sci'
import { shrink, type Region } from './reader-photos'

/**
 * The fish-ID tool's client, wherever a reader sends a photo from: the tool's page (fish-id.ts) and the fish-and-plant
 * editor of "Bể của tôi" (life-photo.ts). Ask the Worker whether it's on, shrink the photo, pass Turnstile, identify,
 * and say each state in a short line. How a guess is shown and what it leads to is the caller's.
 */

/** What /api/fish-id answers (worker/fishid/api.ts, match.ts). */
export type Linked = { id: string; kind?: 'species' | 'breed' | 'plant'; name: string; sci?: string; url?: string; img?: string }
export type Result = { scientificName: string; commonName: string; variety: string | null; confidence: number; reason: string; page?: Linked; species?: Linked; sameGenus?: Linked[] }
export type Answer = { verdict: 'fish' | 'plant' | 'other' | 'unclear'; results: Result[]; refused?: boolean }
type Status = { on: boolean; sitekey: string; resting: boolean; perIp: number }

// Claude's confidence in words a reader reads at a glance, not a number that looks more exact than it is.
const SURE: [number, string][] = [[0.8, msg('Gần như chắc chắn')], [0.55, msg('Khá giống')], [0.3, msg('Có thể')], [0, msg('Ít khả năng')]]
export const sure = (t: T, c: number) => t(SURE.find(([min]) => c >= min)![1])

const ERRORS: Record<string, string> = {
  rate: msg('Bạn đã dùng hết {n} lượt nhận diện hôm nay. Quay lại ngày mai nhé.'),
  busy: msg('Hôm nay công cụ đã hết lượt cho mọi người. Quay lại ngày mai nhé.'),
  resting: msg('Công cụ đang tạm nghỉ. Bạn quay lại sau vài giờ nhé.'),
  turnstile: msg('Chưa qua được bước kiểm tra chống spam. Thử lại nhé.'),
  'not an image': msg('Chỉ nhận ảnh JPEG, PNG hoặc WebP.'),
  'too large': msg('Ảnh quá lớn. Chọn ảnh khác nhé.'),
}
const TRY_LATER = msg('Chưa nhận diện được lúc này. Thử lại sau ít phút nhé.')
const UNCLEAR = msg('Chưa nhìn rõ để nhận diện. Thử chụp ngang thân, gần hơn, qua kính sạch và không bật flash.')
const NOT_FISH = msg('Ảnh này có vẻ không có cá, tép, ốc hay cây thủy sinh nào. Thử một ảnh khác nhé.')
const ONLY_A_GUESS = msg('Ảnh chưa rõ lắm, đây chỉ là phỏng đoán. Ảnh rõ hơn sẽ cho kết quả chắc hơn.')

/** The line for a failed identification: the Worker's error, the reader's limit when it gives none, else "try later". */
export function errorText(t: T, error: string | undefined, limit: number | undefined, perIp: number, off: string): string {
  if (error === 'fish_id_off') return off
  const m = error && Object.hasOwn(ERRORS, error) ? ERRORS[error] : undefined
  return m ? t(m, { n: limit ?? perIp }) : t(TRY_LATER)
}

/** What to say before the guesses, or instead of them: no fish in the photo, nothing to name, or only a guess. */
export function verdictLine(t: T, a: Answer): string {
  if (a.verdict === 'other') return t(NOT_FISH)
  if (!a.results.length) return t(UNCLEAR)
  return a.verdict === 'unclear' ? t(ONLY_A_GUESS) : ''
}
/** Whether there are guesses to show. */
export const hasGuesses = (a: Answer) => a.verdict !== 'other' && a.results.length > 0

const OTHERS = msg('Không phải? {n} loài {genus} khác trong cẩm nang')
const IN_BOOK = msg('{n} loài {genus} có trong cẩm nang')

/**
 * Under a guess, its genus's other pages (match.ts `sameGenus`), closed until opened: a photo often gets the genus right
 * and the species wrong. "Không phải? N loài <Genus> khác…" under a page, "N loài <Genus> có…" under a guess with none.
 * `item` draws each page: a link on the tool's page, a button in the tank's form.
 */
/** A page's scientific name after its name, in italics (`attrs`: the <i>'s), or nothing when its name says it. */
export const sciAfter = (l: Linked, attrs = '') => {
  const sci = l.sci && sciBeside(l.name, l.sci)
  return sci ? ` <i${attrs}>${escapeHtml(sci)}</i>` : ''
}

export function genusHtml(t: T, r: Result, item: (l: Linked, i: number) => string): string {
  const list = r.sameGenus ?? []
  if (!list.length) return ''
  // The page's genus, as the Worker picked the list by: a former name's page lists its own genus.
  const genus = (r.species?.sci ?? r.page?.sci ?? r.scientificName).trim().split(/\s+/)[0] ?? ''
  const label = escapeHtml(t(r.page ? OTHERS : IN_BOOK, { n: list.length })).replace('{genus}', `<i>${escapeHtml(genus)}</i>`)
  return `<details class="genus"><summary>${label}</summary><ul>${list.map((l, i) => `<li>${item(l, i)}</li>`).join('')}</ul></details>`
}

// Only this site's own pages and our media host's photos, whatever the answer holds. A page as this site links it: the
// answer gives Vietnamese pages in the apps' /vi/ form (lib/i18n appPath). What is left after /vi must still be a path
// here: "/vi//evil.test/" would leave "//evil.test/", another site.
export const own = (u?: string) => {
  const p = u && (/^\/vi\//.test(u) || prefixedLang(u) || isViPage(u)) ? withoutVi(u) : undefined
  return p && /^\/(?![/\\])/.test(p) ? p : undefined
}
const photoSrc = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined)

const UNESC: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' }
/** What HTML from escapeHtml reads as: its tags gone and its entities back ("Alternanthera reineckii &#39;Mini&#39;"). */
const textOf = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&(?:lt|gt|quot|#39|amp);/g, e => UNESC[e]!)

/**
 * One guess, as both places show it: our page's photo when the handbook has the page, how sure, the name, the scientific
 * name and variety, why. `name` (HTML) and `more` (HTML under it: links, or the action) are the caller's.
 */
export function guessHtml(t: T, r: Result, name: string, more: string): string {
  const src = r.page && photoSrc(r.page.img)
  const img = src ? `<img src="${escapeHtml(src)}" width="120" height="90" alt="" loading="lazy">` : ''
  // The scientific name only when the name doesn't say it (lib/sci.ts): a handbook name that holds it, or the scientific
  // name itself when there's no other.
  const said = sciBeside(textOf(name), r.scientificName)
  const sci = [said && `<i>${escapeHtml(said)}</i>`, r.variety && escapeHtml(r.variety)].filter(Boolean).join(' · ')
  const why = r.reason ? `<p class="why">${escapeHtml(r.reason)}</p>` : ''
  return `<li class="${r.page ? 'hit' : 'miss'}">${img}<div><span class="sure">${escapeHtml(sure(t, r.confidence))}</span><h3>${name}</h3>${sci ? `<p class="sci">${sci}</p>` : ''}${why}${more}</div></li>`
}

/**
 * The photo, Turnstile and the request, in `root`: its file inputs (camera and photos), `[data-preview]` (the photo in
 * `[data-frame]`, with `[data-crop]`, `[data-whole]` and `[data-crop-say]`), `[data-turnstile]`, `[data-note]` (why it
 * can't be used), `[data-go]` and `[data-msg]` (what it is doing). Asks the Worker first: off (`off`, the caller's words)
 * or resting, the photo can't be picked. `show` gets each answer. `from` tells the Worker's log where the photo was sent
 * from.
 */
export function photoId(root: HTMLElement, o: { from: 'page' | 'tank'; off: string; show: (a: Answer) => void; clear: () => void }) {
  const inputs = [...root.querySelectorAll<HTMLInputElement>('input[type=file]')]
  const preview = root.querySelector<HTMLElement>('[data-preview]')!
  const frame = root.querySelector<HTMLElement>('[data-frame]')!
  const cropBtn = root.querySelector<HTMLButtonElement>('[data-crop]')!
  const wholeBtn = root.querySelector<HTMLButtonElement>('[data-whole]')!
  const cropSay = root.querySelector<HTMLElement>('[data-crop-say]')!
  const note = root.querySelector<HTMLElement>('[data-note]')!
  const go = root.querySelector<HTMLButtonElement>('[data-go]')!
  const say = root.querySelector<HTMLElement>('[data-msg]')!
  const disable = (text: string) => {
    note.textContent = text
    for (const i of inputs) { i.disabled = true; i.closest('label')!.setAttribute('aria-disabled', 'true') }
    go.disabled = true
  }

  let status: Status | null = null
  /** What "Nhận diện" sends: the whole photo shrunk, or the part the reader boxed. */
  let photo: Blob | null = null
  /** The photo as picked, full size, and shrunk whole. */
  let file: Blob | null = null
  let whole: Blob | null = null
  let token = ''
  let busy = false
  /** Counts resets: an answer to a photo from before one isn't shown. */
  let round = 0
  /** Counts photos and boxes: a slower shrink of an older one isn't kept. */
  let cut = 0
  let ts: Turnstile | null = null
  let widget: string | undefined
  const ready = () => { go.disabled = busy || !photo || !token }

  // "Khoanh một con cá": a box dragged on the photo (finger or mouse) sends only that part, cut from the full-size photo
  // and shrunk as the whole one is. Optional: without it the whole photo goes, as before. Only while boxing does the
  // photo take the drag, so a phone still scrolls past it otherwise.
  const box = document.createElement('div')
  box.className = 'box'
  box.hidden = true
  let start: { x: number; y: number } | null = null
  let drawn: Region | null = null
  function setCropping(on: boolean) {
    frame.classList.toggle('cropping', on)
    cropBtn.hidden = on
    wholeBtn.hidden = !on
    cropSay.textContent = on ? ct('Kéo một khung quanh con cá trên ảnh.') : ''
    box.hidden = true
    start = drawn = null
    if (!on && whole && photo !== whole) { cut++; photo = whole; ready() }
  }
  const at = (e: PointerEvent) => {
    const r = frame.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const show = (g: Region) => {
    Object.assign(box.style, { left: `${g.x * 100}%`, top: `${g.y * 100}%`, width: `${g.w * 100}%`, height: `${g.h * 100}%` })
    box.hidden = false
  }
  frame.addEventListener('pointerdown', e => {
    if (!frame.classList.contains('cropping') || !file || e.button > 0) return
    e.preventDefault()
    frame.setPointerCapture(e.pointerId)
    start = at(e)
  })
  frame.addEventListener('pointermove', e => {
    if (!start) return
    const p = at(e)
    show({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) })
  })
  const end = async (e: PointerEvent) => {
    if (!start || !file) return
    const p = at(e)
    const g = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }
    start = null
    const r = frame.getBoundingClientRect()
    // A tap, or a box too small to hold a fish: the box before it stays.
    if (g.w * r.width < 16 || g.h * r.height < 16) { if (drawn) show(drawn); else box.hidden = true; return }
    drawn = g
    show(g)
    const mine = ++cut
    photo = null
    ready()
    cropSay.textContent = ct('Đang thu nhỏ ảnh…')
    const part = await shrink(file, MAX_SIDE, JPEG_QUALITY, g)
    if (mine !== cut) return
    photo = part ?? whole
    cropSay.textContent = part ? ct('Sẽ gửi phần trong khung. Kéo lại để khoanh chỗ khác.') : ct('Trình duyệt không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.')
    ready()
  }
  frame.addEventListener('pointerup', e => void end(e))
  frame.addEventListener('pointercancel', () => { start = null; if (drawn) show(drawn); else box.hidden = true })
  cropBtn.addEventListener('click', () => { setCropping(true); wholeBtn.focus() })
  wholeBtn.addEventListener('click', () => { setCropping(false); cropBtn.focus() })

  // Listening from the start: a photo picked while the Worker is still being asked isn't lost.
  for (const input of inputs) input.addEventListener('change', async () => {
    const picked = input.files?.[0]
    input.value = ''
    if (!picked) return
    o.clear()
    setCropping(false)
    const mine = ++cut
    // Nothing to send or box until the new photo is ready.
    photo = file = whole = null
    say.textContent = ct('Đang thu nhỏ ảnh…')
    ready()
    const shrunk = await shrink(picked, MAX_SIDE, JPEG_QUALITY)
    if (mine !== cut) return
    file = shrunk ? picked : null
    photo = whole = shrunk
    if (!shrunk) { preview.hidden = true; say.textContent = ct('Trình duyệt không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.'); ready(); return }
    const img = new Image()
    img.src = URL.createObjectURL(shrunk)
    img.alt = ct('Ảnh bạn chọn')
    img.onload = () => { img.width = img.naturalWidth; img.height = img.naturalHeight }
    img.draggable = false
    frame.replaceChildren(img, box)
    preview.hidden = false
    say.textContent = token || !ts ? '' : ct('Đợi bước kiểm tra chống spam xong là bấm được “Nhận diện”.')
    ready()
  })

  // A click, not a form's submit: the editor's panel sits inside the tank's form. On the tool's page this is its form's
  // submit button, so pressing Enter clicks it too.
  go.addEventListener('click', async e => {
    e.preventDefault()
    if (!photo || !token || busy) return
    busy = true
    ready()
    say.textContent = ct('Đang nhận diện… thường mất vài giây.')
    o.clear()
    const mine = round
    const body = new FormData()
    body.set('file', photo, 'photo.jpg')
    body.set('token', token)
    body.set('lang', document.documentElement.lang.slice(0, 2))
    body.set('from', o.from)
    const r = await fetch('/api/fish-id', { method: 'POST', body }).catch(() => null)
    const data = (await r?.json().catch(() => null)) as (Answer & { error?: string; limit?: number }) | null
    // A Turnstile token is good for one request.
    token = ''
    if (ts && widget) ts.reset(widget)
    busy = false
    ready()
    if (mine !== round) return
    if (r?.ok && data?.results) {
      say.textContent = ''
      o.show(data)
      return
    }
    say.textContent = errorText(ct, data?.error, data?.limit, status?.perIp ?? 0, o.off)
  })

  void (async () => {
    const res = await fetch('/api/fish-id').catch(() => null)
    const s = res?.ok ? ((await res.json().catch(() => null)) as Status | null) : null
    status = s
    if (!s?.on) return disable(o.off)
    if (s.resting) return disable(ct(ERRORS.resting!))
    ts = await loadTurnstile().catch(() => null)
    if (!ts) note.textContent = ct('Không tải được bước kiểm tra chống spam. Tải lại trang rồi thử lại nhé.')
    else widget = ts.render(root.querySelector<HTMLElement>('[data-turnstile]')!, { sitekey: s.sitekey, language: document.documentElement.lang, callback: t => { token = t; ready() }, 'expired-callback': () => { token = ''; ready() } })
  })()

  return {
    /** No photo and no answer, as before the first: the Turnstile widget and its token stay. */
    reset() {
      round++
      setCropping(false)
      cut++
      photo = file = whole = null
      preview.hidden = true
      frame.replaceChildren()
      say.textContent = ''
      o.clear()
      ready()
    },
  }
}
