// The owner's report from a page: words, a screenshot and what they were looking at, sent to /api/feedback
// (protocols/owner-feedback.openapi.json). The sheet opens at once so the keyboard comes up in the same tap, dictation
// key and all; the screenshot is taken behind it, and the library that takes it loads only then (capture.ts).
declare const __BUILD__: string

const MAX_SIDE = 2000
const CAPTURE_LIMIT_MS = 20_000

/** Fields the Worker checks one by one; none of them holds text read from the page. */
export function where() {
  const root = document.documentElement
  const third = innerHeight / 3
  let section: string | undefined
  for (const h of document.querySelectorAll<HTMLElement>('main h2[id], main h3[id]')) {
    if (h.getBoundingClientRect().top > third) break
    section = h.id
  }
  return {
    source: 'web',
    url: location.href,
    section,
    item: document.querySelector<HTMLElement>('[data-entity]')?.dataset.entity,
    lang: root.lang.slice(0, 2),
    version: __BUILD__,
    theme: root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
    textSize: `${Math.round((parseFloat(getComputedStyle(root).fontSize) / 16) * 100)}%`,
    device: navigator.userAgent.slice(0, 160),
    viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}x`,
  }
}

/** A picked or pasted picture, as a JPEG no bigger than it needs to be: no metadata, and any format the browser reads. */
async function asJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((ok, no) => canvas.toBlob(b => (b ? ok(b) : no(new Error('toBlob'))), 'image/jpeg', 0.85))
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = '') => {
  const e = document.createElement(tag)
  e.style.cssText = css
  if (text) e.textContent = text
  return e
}
const BUTTON = 'min-height:44px;padding:10px 16px;border-radius:8px;border:1px solid #1e2a25;background:#fff;color:#1e2a25;font:600 15px system-ui,sans-serif;cursor:pointer'

let open = false

export function openReport() {
  if (open) return
  open = true
  const at = where() // now, before the sheet takes the focus or the page moves
  let image: Blob | null = null
  let capturing: Promise<void> | null = null
  let picked = false

  const sheet = el('dialog', 'margin:12px auto auto;width:calc(100vw - 24px);max-width:480px;box-sizing:border-box;padding:14px;border:0;border-radius:14px;background:#fff;color:#1e2a25;font:15px/1.4 system-ui,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.4)')
  sheet.setAttribute('data-owner-report', '')
  sheet.setAttribute('aria-label', 'Báo lỗi')
  const title = el('strong', 'display:block;font-size:16px;margin-bottom:2px', 'Báo lỗi trang này')
  const address = el('div', 'color:#59645e;font-size:13px;overflow-wrap:anywhere;margin-bottom:8px', location.pathname)
  const words = el('textarea', 'display:block;width:100%;box-sizing:border-box;min-height:88px;padding:10px;border:1px solid #8b958f;border-radius:8px;font:16px/1.4 system-ui,sans-serif;background:#fff;color:#1e2a25')
  words.placeholder = 'Nói hoặc gõ: chỗ nào sai?'
  words.setAttribute('aria-label', 'Chỗ nào sai')
  const row = el('div', 'display:flex;gap:10px;align-items:center;margin:10px 0')
  const thumb = el('img', 'display:none;height:96px;max-width:96px;object-fit:contain;border:1px solid #d5dbd7;border-radius:6px;flex:none')
  thumb.alt = 'Ảnh sẽ gửi kèm'
  const side = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;align-items:flex-start')
  const shotNote = el('div', 'font-size:13px;color:#59645e', 'Đang chụp màn hình…')
  shotNote.setAttribute('data-owner-report-shot', '')
  const pick = el('label', `${BUTTON};display:inline-flex;align-items:center;font-weight:500;font-size:14px`, 'Chọn ảnh khác')
  const file = el('input', 'position:absolute;opacity:0;width:1px;height:1px')
  file.type = 'file'
  file.accept = 'image/*'
  pick.append(file)
  side.append(shotNote, pick)
  row.append(thumb, side)
  const note = el('div', 'min-height:20px;font-size:14px;color:#a3221b;margin-bottom:6px')
  note.setAttribute('role', 'status')
  const actions = el('div', 'display:flex;gap:8px;justify-content:flex-end')
  const cancel = el('button', BUTTON, 'Đóng')
  cancel.type = 'button'
  const send = el('button', `${BUTTON};background:#2f6b4f;border-color:#2f6b4f;color:#fff`, 'Gửi')
  send.type = 'button'
  actions.append(cancel, send)
  sheet.append(title, address, words, row, note, actions)
  document.body.append(sheet)
  sheet.showModal()
  words.focus()

  const close = () => {
    open = false
    sheet.close()
    sheet.remove()
    if (thumb.src) URL.revokeObjectURL(thumb.src)
  }
  sheet.addEventListener('cancel', () => close())

  const show = (blob: Blob, what: string) => {
    image = blob
    if (thumb.src) URL.revokeObjectURL(thumb.src)
    thumb.src = URL.createObjectURL(blob)
    thumb.style.display = 'block'
    shotNote.textContent = what
  }
  const take = async (blob: Blob) => {
    picked = true
    try {
      show(await asJpeg(blob), 'Ảnh bạn chọn')
      note.textContent = ''
    } catch {
      note.textContent = 'Không đọc được ảnh này. Chọn ảnh khác nhé.'
    }
  }
  file.addEventListener('change', () => { if (file.files?.[0]) void take(file.files[0]) })
  sheet.addEventListener('paste', e => {
    const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'))?.getAsFile()
    if (item) { e.preventDefault(); void take(item) }
  })

  const failedShot = 'Không chụp được. Chọn ảnh vừa chụp nhé.'
  capturing = Promise.race([
    import('./capture').then(m => m.captureViewport()),
    new Promise<null>(ok => setTimeout(() => ok(null), CAPTURE_LIMIT_MS)),
  ]).then(blob => {
    if (picked) return
    if (blob) show(blob, 'Đã chụp màn hình')
    else shotNote.textContent = failedShot
  }).catch(() => { if (!picked) shotNote.textContent = failedShot })

  cancel.onclick = close

  send.onclick = async () => {
    send.disabled = true
    note.textContent = ''
    if (!image && capturing) {
      send.textContent = 'Đang chụp…'
      await capturing
    }
    if (!words.value.trim() && !image) {
      note.textContent = 'Nói vài chữ hoặc chọn một ảnh đã.'
      send.disabled = false
      send.textContent = 'Gửi'
      return
    }
    send.textContent = 'Đang gửi…'
    const form = new FormData()
    form.set('report', JSON.stringify({ words: words.value, where: at }))
    if (image) form.set('image', image, 'screenshot.jpg')
    let status = 0
    let waiting = 1
    try {
      const r = await fetch('/api/feedback', { method: 'POST', body: form })
      status = r.status
      if (r.ok) waiting = ((await r.json()) as { waiting: number }).waiting
    } catch { /* offline: status stays 0, and the sheet keeps everything */ }
    if (status === 201) {
      note.style.color = '#1b6b4a'
      note.textContent = waiting > 1 ? `Đã gửi. ${waiting} báo lỗi đang chờ máy Mac nhận.` : 'Đã gửi.'
      send.textContent = 'Đã gửi'
      setTimeout(close, waiting > 1 ? 2500 : 900)
      return
    }
    note.textContent =
      status === 401 ? 'Cần đăng nhập tài khoản chủ trang: mở /dang-nhap/ để đăng nhập rồi thử lại.'
        : status === 404 ? 'Tài khoản này không gửi được báo lỗi. Đăng nhập tài khoản chủ trang rồi thử lại.'
          : status === 429 ? 'Đã gửi quá nhiều trong một giờ. Lời và ảnh vẫn còn đây, lát nữa thử lại nhé.'
            : status === 413 ? 'Ảnh quá lớn. Chọn ảnh khác nhé.'
              : 'Chưa gửi được. Lời và ảnh vẫn còn đây, thử lại nhé.'
    send.disabled = false
    send.textContent = 'Gửi lại'
  }
}
