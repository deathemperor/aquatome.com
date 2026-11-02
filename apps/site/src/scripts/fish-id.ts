import { JPEG_QUALITY, MAX_SIDE } from '../../worker/fishid/photo'
import { escapeHtml, loadTurnstile, type Turnstile } from './comments'
import { msg } from '../i18n/msg'
import { ct } from './ct'
import { shrink } from './reader-photos'

/** What /api/fish-id answers (worker/fishid/api.ts, match.ts). */
type Linked = { id: string; name: string; sci?: string; url?: string; img?: string }
type Result = { scientificName: string; commonName: string; variety: string | null; confidence: number; reason: string; page?: Linked; species?: Linked; sameGenus?: Linked[] }
type Answer = { verdict: 'fish' | 'plant' | 'other' | 'unclear'; results: Result[]; refused?: boolean }

// Claude's confidence in words a reader reads at a glance, not a number that looks more exact than it is.
const SURE: [number, string][] = [[0.8, msg('Gần như chắc chắn')], [0.55, msg('Khá giống')], [0.3, msg('Có thể')], [0, msg('Ít khả năng')]]
const sure = (c: number) => ct(SURE.find(([min]) => c >= min)![1])

const ERRORS: Record<string, string> = {
  rate: msg('Bạn đã dùng hết {n} lượt nhận diện hôm nay. Quay lại ngày mai nhé.'),
  busy: msg('Hôm nay công cụ đã hết lượt cho mọi người. Quay lại ngày mai nhé.'),
  resting: msg('Công cụ đang tạm nghỉ. Bạn quay lại sau vài giờ nhé.'),
  turnstile: msg('Chưa qua được bước kiểm tra chống spam. Thử lại nhé.'),
  'not an image': msg('Chỉ nhận ảnh JPEG, PNG hoặc WebP.'),
  'too large': msg('Ảnh quá lớn. Chọn ảnh khác nhé.'),
}
const OFF = msg('Công cụ nhận diện tạm thời chưa dùng được. Bạn tìm cá theo tên trong danh sách cá nhé.')
const TRY_LATER = msg('Chưa nhận diện được lúc này. Thử lại sau ít phút nhé.')
const UNCLEAR = msg('Chưa nhìn rõ để nhận diện. Thử chụp ngang thân, gần hơn, qua kính sạch và không bật flash.')

const name = (l: Linked) => escapeHtml(l.name)
// Only this site's own pages and our media host's photos, whatever the answer holds.
const own = (u?: string) => (u && /^\/(vi|id|th)\//.test(u) ? u : undefined)
const photoSrc = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined)
const link = (l: Linked) => (own(l.url) ? `<a href="${escapeHtml(own(l.url)!)}">${name(l)}</a>` : name(l))

/** One guess: our page's photo, name and link when the handbook has it; otherwise Claude's name, said plainly. */
function card(r: Result): string {
  const sci = `<i>${escapeHtml(r.scientificName)}</i>${r.variety ? ` · ${escapeHtml(r.variety)}` : ''}`
  const head = `<span class="sure">${escapeHtml(sure(r.confidence))}</span>`
  const why = r.reason ? `<p class="why">${escapeHtml(r.reason)}</p>` : ''
  if (r.page) {
    const img = photoSrc(r.page.img) ? `<img src="${escapeHtml(photoSrc(r.page.img)!)}" width="120" height="90" alt="" loading="lazy">` : ''
    const species = r.species ? `<p class="also">${escapeHtml(ct('Một dòng của'))} ${link(r.species)}</p>` : ''
    const open = own(r.page.url) ? `<a class="open" href="${escapeHtml(own(r.page.url)!)}">${escapeHtml(ct('Xem hồ sơ'))} →</a>` : ''
    return `<li class="hit">${img}<div>${head}<h3>${link(r.page)}</h3><p class="sci">${sci}</p>${why}${species}${open}</div></li>`
  }
  const genus = r.sameGenus?.length ? `<p class="also">${escapeHtml(ct('Cùng chi, có trong cẩm nang:'))} ${r.sameGenus.map(link).join(', ')}</p>` : ''
  return `<li class="miss"><div>${head}<h3>${escapeHtml(r.commonName || r.scientificName)}</h3><p class="sci">${sci}</p>${why}<p class="add">${escapeHtml(ct('Chưa có trong cẩm nang.'))}</p>${genus}</div></li>`
}

function answerHtml(a: Answer): string {
  if (a.verdict === 'other') return `<p class="lead">${escapeHtml(ct('Ảnh này có vẻ không có cá, tép, ốc hay cây thủy sinh nào. Thử một ảnh khác nhé.'))}</p>`
  if (!a.results.length) return `<p class="lead">${escapeHtml(ct(UNCLEAR))}</p>`
  const lead = a.verdict === 'unclear' ? `<p class="lead">${escapeHtml(ct('Ảnh chưa rõ lắm, đây chỉ là phỏng đoán. Ảnh rõ hơn sẽ cho kết quả chắc hơn.'))}</p>` : ''
  return `<h2>${escapeHtml(ct('Có thể là'))}</h2>${lead}<ol>${a.results.map(card).join('')}</ol>`
}

/** The tool: ask the Worker whether it's on, then photo → shrink → Turnstile → identify → results. */
export async function mountFishId(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-form]')!
  const inputs = [...form.querySelectorAll<HTMLInputElement>('input[type=file]')]
  const preview = root.querySelector<HTMLElement>('[data-preview]')!
  const note = root.querySelector<HTMLElement>('[data-note]')!
  const go = root.querySelector<HTMLButtonElement>('[data-go]')!
  const say = root.querySelector<HTMLElement>('[data-msg]')!
  const out = root.querySelector<HTMLElement>('[data-out]')!
  const disable = (text: string) => {
    note.textContent = text
    for (const i of inputs) { i.disabled = true; i.closest('label')!.setAttribute('aria-disabled', 'true') }
    go.disabled = true
  }

  let photo: Blob | null = null
  let token = ''
  let busy = false
  let ts: Turnstile | null = null
  let widget: string | undefined
  const ready = () => { go.disabled = busy || !photo || !token }

  // Listening from the start: a photo picked while the page still asks the Worker isn't lost.
  for (const input of inputs) input.addEventListener('change', async () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    out.innerHTML = ''
    say.textContent = ct('Đang thu nhỏ ảnh…')
    photo = await shrink(file, MAX_SIDE, JPEG_QUALITY)
    if (!photo) { preview.hidden = true; say.textContent = ct('Trình duyệt không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.'); ready(); return }
    const img = new Image()
    img.src = URL.createObjectURL(photo)
    img.alt = ct('Ảnh bạn chọn')
    img.onload = () => { img.width = img.naturalWidth; img.height = img.naturalHeight }
    preview.replaceChildren(img)
    preview.hidden = false
    say.textContent = token || !ts ? '' : ct('Đợi bước kiểm tra chống spam xong là bấm được “Nhận diện”.')
    ready()
  })

  const res = await fetch('/api/fish-id').catch(() => null)
  const status = res?.ok ? ((await res.json().catch(() => null)) as { on: boolean; sitekey: string; resting: boolean; perIp: number } | null) : null
  if (!status?.on) return disable(ct(OFF))
  if (status.resting) return disable(ct(ERRORS.resting!))
  ts = await loadTurnstile().catch(() => null)
  if (!ts) note.textContent = ct('Không tải được bước kiểm tra chống spam. Tải lại trang rồi thử lại nhé.')
  else widget = ts.render(root.querySelector<HTMLElement>('[data-turnstile]')!, { sitekey: status.sitekey, language: document.documentElement.lang, callback: t => { token = t; ready() }, 'expired-callback': () => { token = ''; ready() } })

  form.addEventListener('submit', async e => {
    e.preventDefault()
    if (!photo || !token || busy) return
    busy = true
    ready()
    say.textContent = ct('Đang nhận diện… thường mất vài giây.')
    out.innerHTML = ''
    const body = new FormData()
    body.set('file', photo, 'photo.jpg')
    body.set('token', token)
    body.set('lang', document.documentElement.lang.slice(0, 2))
    const r = await fetch('/api/fish-id', { method: 'POST', body }).catch(() => null)
    const data = (await r?.json().catch(() => null)) as (Answer & { error?: string; limit?: number }) | null
    // A Turnstile token is good for one request.
    token = ''
    if (ts && widget) ts.reset(widget)
    busy = false
    ready()
    if (r?.ok && data?.results) {
      say.textContent = ''
      out.innerHTML = answerHtml(data)
      return
    }
    const error = data?.error ?? ''
    say.textContent = error === 'fish_id_off' ? ct(OFF) : ERRORS[error] ? ct(ERRORS[error]!, { n: data?.limit ?? status.perIp }) : ct(TRY_LATER)
  })
}
