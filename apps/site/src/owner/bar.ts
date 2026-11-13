// The owner bar (worker/owner.ts): only a browser with the owner's flag ever loads this file. The flag grants nothing;
// what the bar's buttons reach checks who it is itself.
import { OWNER_HOME, OWNER_PAGE } from '../../worker/owner'
import { openReport } from './report'

const PILL = 'padding:10px 14px;min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center;border:0;border-radius:8px;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer;text-decoration:none;font:inherit;'

function hideButton(path: string) {
  const gone = document.documentElement.dataset.gone === '1'
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = gone ? 'Hiện lại trang này' : 'Ẩn trang này'
  b.style.cssText = `${PILL}background:${gone ? '#1b6b4a' : '#b3261e'}`
  b.onclick = () => {
    let note: string | null = ''
    if (!gone) {
      note = prompt('Ẩn trang này khỏi AquaTome? Lý do (tuỳ chọn):', '')
      if (note === null) return
    }
    b.disabled = true
    fetch('/_ab/hidden', { method: 'POST', body: new URLSearchParams({ url: path, action: gone ? 'unhide' : 'hide', note }), redirect: 'manual' }).then(r => {
      if (r.type === 'opaqueredirect' || r.ok) {
        b.textContent = gone ? 'Đã hiện lại' : 'Đã ẩn, có hiệu lực trong khoảng 1 phút'
        setTimeout(() => location.reload(), 1500)
      } else if (r.status === 404) {
        alert('Cần đăng nhập tài khoản chủ trang: mở /dang-nhap/ để đăng nhập rồi thử lại.')
        b.disabled = false
      } else {
        r.text().then(t => { alert(t); b.disabled = false })
      }
    })
  }
  return b
}

function showBar() {
  const path = location.pathname
  if (!new RegExp(OWNER_PAGE).test(path)) return
  const bar = document.createElement('div')
  bar.setAttribute('data-owner-bar', '')
  bar.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100vw - 32px);gap:8px;align-items:center;font:600 14px system-ui,sans-serif'
  for (const [name, href] of [['Quản trị', '/_ab/'], ['Người đọc', '/_ab/doc-gia/']] as const) {
    const a = document.createElement('a')
    a.href = href
    a.textContent = name
    a.style.cssText = `${PILL}background:#10241f`
    bar.append(a)
  }
  if (!new RegExp(OWNER_HOME).test(path)) bar.append(hideButton(path))
  const report = document.createElement('button')
  report.type = 'button'
  report.setAttribute('data-owner-report-open', '')
  report.textContent = 'Báo lỗi'
  report.style.cssText = `${PILL}background:#2f6b4f`
  report.onclick = openReport
  bar.append(report)
  document.body.append(bar)
}

// The module may load before or after the page's end: the bar waits for a body.
if (document.body) showBar()
else addEventListener('DOMContentLoaded', showBar, { once: true })
