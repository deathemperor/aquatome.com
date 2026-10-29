import { escapeHtml, loadTurnstile } from './comments'

export type ShownPhoto = { id: string; name: string; url: string; thumb: string; width: number; height: number; createdAt: string }
const MAX_BYTES = 8 * 1024 * 1024
const MAX_SIDE = 2000

/** One gallery tile: the thumb links to the full photo; the reader's name as credit. Every user string escaped. */
export function photoHtml(p: ShownPhoto): string {
  return `<li><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(p.thumb)}" width="${p.width}" height="${p.height}" alt="Ảnh của ${escapeHtml(p.name)}" loading="lazy"></a><span>${escapeHtml(p.name)}</span></li>`
}

/**
 * Re-encode on the phone before upload: at most 2000 px, JPEG. The photo uploads faster, and its EXIF (GPS position,
 * phone model) never leaves the device. Falls back to the original file if the browser can't decode it.
 */
export async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    const out = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.88))
    return out ?? file
  } catch {
    return file
  }
}

const ERRORS: Record<string, string> = {
  turnstile: 'Không qua được kiểm tra chống spam, vui lòng thử lại.',
  rate: 'Bạn đã gửi đủ 5 ảnh hôm nay. Hãy quay lại ngày mai.',
  'not an image': 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.',
  'too large': 'Ảnh quá lớn (tối đa 8 MB).',
  'bad name': 'Tên chỉ gồm chữ, 1–40 ký tự, không chứa đường link.',
  consent: 'Vui lòng xác nhận ảnh do bạn chụp.',
}

/** Gallery + form; hidden unless the API answers (no buckets / no JS → nothing dead on the page). */
export async function mountReaderPhotos(section: HTMLElement) {
  const entity = section.dataset.entity!
  const res = await fetch(`/_p?e=${encodeURIComponent(entity)}`).catch(() => null)
  if (!res?.ok) return
  const data = (await res.json()) as { photos: ShownPhoto[]; sitekey: string; verification: 'none' | 'phone' }
  const list = section.querySelector<HTMLUListElement>('[data-list]')!
  const empty = section.querySelector<HTMLElement>('[data-empty]')!
  const form = section.querySelector<HTMLFormElement>('[data-form]')!
  const msg = section.querySelector<HTMLElement>('[data-msg]')!
  list.innerHTML = data.photos.map(photoHtml).join('')
  empty.hidden = data.photos.length > 0
  section.hidden = false
  if (data.verification === 'phone') return
  const ts = await loadTurnstile().catch(() => null)
  if (!ts) return
  form.hidden = false
  let token = ''
  const widget = ts.render(section.querySelector<HTMLElement>('[data-turnstile]')!, { sitekey: data.sitekey, language: 'vi', callback: t => (token = t), 'expired-callback': () => (token = '') })

  form.addEventListener('submit', async e => {
    e.preventDefault()
    const f = new FormData(form)
    const file = f.get('file')
    if (!(file instanceof File) || !file.size) { msg.textContent = 'Chọn một ảnh trước đã.'; return }
    if (!token) { msg.textContent = 'Vui lòng đợi kiểm tra chống spam hoàn tất rồi gửi lại.'; return }
    const button = form.querySelector('button')!
    button.disabled = true
    msg.textContent = 'Đang chuẩn bị ảnh…'
    const blob = await shrink(file)
    if (blob.size > MAX_BYTES) { msg.textContent = ERRORS['too large']!; button.disabled = false; return }
    const body = new FormData()
    body.set('e', entity)
    body.set('name', String(f.get('name') ?? ''))
    body.set('consent', f.get('consent') ? '1' : '')
    body.set('token', token)
    body.set('file', blob, 'photo.jpg')
    msg.textContent = 'Đang gửi…'
    const r = await fetch('/_p', { method: 'POST', body }).catch(() => null)
    const out = (await r?.json().catch(() => null)) as { deleteUrl?: string; error?: string } | null
    button.disabled = false
    token = ''
    ts.reset(widget)
    if (r?.status === 201 && out?.deleteUrl) {
      form.reset()
      const link = new URL(out.deleteUrl, location.origin).href
      msg.innerHTML = `Đã nhận ảnh, cảm ơn bạn! Ảnh sẽ hiện ở đây sau khi được duyệt, thường trong vòng một ngày.<br>Muốn gỡ ảnh sau này? Lưu link riêng này (chỉ hiện một lần): <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`
    } else {
      msg.textContent = ERRORS[out?.error ?? ''] ?? 'Không gửi được ảnh, vui lòng thử lại.'
    }
  })
}
