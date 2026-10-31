import type { Device } from '@aq/schema'
import { MODE, clockDrift, hoursLit, levelAt, modelOf, setLevel, setMode, setSchedule, setTime, type Channel, type Model } from './chihiros'
import { ct } from './ct'
import { connect, type Bluetooth, type Light } from './light-ble'
import { css, curve, lit, mix, snap, toMin, toTime } from './light-view'
import * as store from './tank-store'

/**
 * The Chihiros page (pages/vi/cong-cu/den-chihiros.astro): the light card, the day's timeline, colour, writing the
 * schedule, and what this browser remembers of each light (tank-store.ts).
 */
type Plan = { on: string; off: string; ramp: number; levels: number[]; name?: string }
const DRAFT = 'aq.light.draft'
const RGB: Model = { name: '', channels: ['red', 'green', 'blue'] }
const NAME: Record<Channel, string> = { red: ct('Đỏ'), green: ct('Xanh lá'), blue: ct('Xanh dương'), white: ct('Trắng') }
const SWATCH: Record<Channel, string> = { red: '#d8452f', green: '#3c9a52', blue: '#3466d6', white: '#b9b2a2' }
const ICON = {
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9M8 12V6.5M16 12V7M7 14.5c0 3.6 2.2 6 5 6s5-2.4 5-6V12"/></svg>',
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const lang = document.documentElement.lang
const fmt = (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n)
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
const day = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'numeric', year: 'numeric' })
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const top = (p: Plan) => Math.max(0, ...p.levels)
const label = (p: Pick<Plan, 'on' | 'off' | 'levels'>) => `${p.on}–${p.off} · ${Math.max(...p.levels)}%`
const minutesLit = (p: Pick<Plan, 'on' | 'off'>) => (p.off === '00:00' ? 1440 : toMin(p.off)) - toMin(p.on)
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }
/** Levels for a light with `n` channels from levels for another (a white-only light takes the brightest). */
const fit = (levels: number[], n: number) => n === 1 ? [Math.max(0, ...levels)] : Array.from({ length: n }, (_, i) => levels[i] ?? Math.max(0, ...levels))

const bt = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth
let db = store.load()
let model: Model = RGB
let plan: Plan = { on: '12:00', off: '20:00', ramp: 30, levels: [70, 70, 70] }
let edited = false // touched since the page opened (a known light's schedule doesn't replace edits)
let light: Light | undefined
let device: Device | undefined
let lost = false
let state: 'unsupported' | 'idle' | 'busy' | 'ready' = bt ? 'idle' : 'unsupported'
let synced = false // the clock was set during this visit
let trying = false // the light shows the colour being edited (manual mode)
let playing: { stop: () => void } | undefined
let undo: Plan | undefined
let lastLight: Light | undefined // the light that dropped: connect again without the picker
let leaving = false // the page was hidden: no long writes
let keep: ReturnType<typeof setTimeout> | undefined // the draft is saved once an edit settles

// ---- What the reader is editing ----

function check(p: Plan): string | undefined {
  if (!/^\d\d:\d\d$/.test(p.on) || !/^\d\d:\d\d$/.test(p.off)) return ct('Nhập giờ bật và giờ tắt.')
  const m = minutesLit(p)
  if (m <= 0) return ct('Giờ tắt phải sau giờ bật, trong cùng một ngày.')
  if (p.ramp * 2 > m) return ct('Sáng dần, tối dần dài hơn nửa thời gian bật đèn.')
}
function change(next: Partial<Plan>, o: { keepName?: boolean } = {}) {
  plan = { ...plan, ...next, ...(o.keepName ? {} : { name: next.name }) }
  edited = true
  clearTimeout(keep)
  keep = setTimeout(keepDraft, 300)
  paint()
  if (trying) sendLevels(plan.levels)
}

function keepDraft() {
  clearTimeout(keep)
  try { localStorage.setItem(DRAFT, JSON.stringify(plan)) } catch { /* private mode: not kept */ }
}

function paint() {
  paintTimeline(); paintTank(); paintReadout(); paintColour(); paintWrite(); paintPresets(); fillFields()
}
/** The exact-time fields follow the timeline, except the one being typed in. */
function fillFields() {
  const form = $<HTMLFormElement>('ch-sched')
  for (const [n, v] of [['on', plan.on], ['off', plan.off], ['ramp', String(plan.ramp)]] as const) {
    const f = form.elements.namedItem(n) as HTMLInputElement
    if (document.activeElement !== f) f.value = v
  }
}

function paintTimeline() {
  const bad = check(plan)
  const on = toMin(plan.on), off = plan.off === '00:00' ? 1440 : toMin(plan.off)
  $('tl-curve').setAttribute('d', bad ? '' : curve(on, off, plan.ramp, top(plan) / 100, 100))
  for (const [id, min, name] of [['tl-on', on, ct('Bật lúc {t}')], ['tl-off', off, ct('Tắt lúc {t}')]] as const) {
    const h = $(id)
    h.style.left = `${(min / 1440) * 100}%`
    h.setAttribute('aria-valuenow', String(min))
    h.setAttribute('aria-valuetext', name.replace('{t}', toTime(min)))
    h.querySelector('.tip')!.textContent = toTime(min)
  }
  $('tl-now').style.left = `${(nowMin() / 1440) * 100}%`
}

/** The tank at a minute of the day (default: the light at its brightest), and the caption saying what it is now. */
function paintTank(minute?: number) {
  const share = minute === undefined ? 1 : levelAt(plan, minute)
  const levels = plan.levels.map(l => l * share)
  const m = mix(model.channels, levels)
  // The eye sees light on a curve: 40% of the LEDs' power looks well over a third as bright.
  const light = { rgb: m.rgb, power: Math.sqrt(m.power) }
  // Both pictures of the tank (beside the light card; on a phone, again beside the colour controls) share the gradients.
  const all = (sel: string) => document.querySelectorAll<SVGElement>(`.scene ${sel}`)
  const svg = $('ch-tank')
  const fill = (sel: string, attr: string, rgb: [number, number, number]) => all(sel).forEach(e => e.setAttribute(attr, css(rgb)))
  fill('.lamp', 'fill', light.power ? light.rgb.map(v => Math.round(42 + (v - 42) * Math.min(1, light.power * 1.3))) as [number, number, number] : [42, 47, 44])
  svg.querySelector('#tk-cone stop')?.setAttribute('stop-color', css(light.rgb))
  all('.cone').forEach(e => { e.style.opacity = String(light.power) })
  const [w1, w2] = svg.querySelectorAll('#tk-water stop')
  w1?.setAttribute('stop-color', css(lit([120, 190, 190], light, 0.08)))
  w2?.setAttribute('stop-color', css(lit([40, 90, 90], light, 0.08)))
  fill('.p-stem', 'stroke', lit([70, 170, 80], light))
  fill('.p-red', 'stroke', lit([200, 70, 60], light))
  fill('.p-leaf', 'fill', lit([50, 140, 70], light))
  fill('.carpet', 'fill', lit([90, 180, 70], light))
  fill('.soil', 'fill', lit([90, 62, 40], light))
  fill('.fish', 'fill', lit([90, 160, 255], light))
  all('.off-note').forEach(e => e.setAttribute('visibility', m.power < 0.005 ? 'visible' : 'hidden'))

  const at = minute ?? nowMin()
  const now = levelAt(plan, at)
  const bad = check(plan)
  $('ch-now').textContent = bad ? '' : minute !== undefined
    ? ct('{t}: {state}', { t: toTime(at), state: now ? ct('sáng {p}%', { p: Math.round(top(plan) * now) }) : ct('đèn tắt') })
    : now === 0
      ? ct('Bây giờ {t}: đèn tắt, bật lại lúc {on}.', { t: toTime(at), on: plan.on })
      : now < 1
        ? ct('Bây giờ {t}: đèn đang {dir}, {p}%.', { t: toTime(at), dir: at < toMin(plan.on) + plan.ramp ? ct('sáng dần') : ct('tối dần'), p: Math.round(top(plan) * now) })
        : ct('Bây giờ {t}: đèn sáng {p}%.', { t: toTime(at), p: top(plan) })
}

function paintReadout() {
  const out = $('ch-hours')
  const bad = check(plan)
  out.classList.toggle('bad', !!bad)
  if (bad) { out.textContent = bad; return }
  const h = hoursLit(plan.on, plan.off)
  const full = Math.max(0, minutesLit(plan) - plan.ramp * 2) / 60
  const advice = h > 8 ? `<span class="warn">${ct('Trên 8 tiếng dễ lên rêu.')}</span>` : h < 5 ? ct('Dưới 5 tiếng, cây trồng lớn chậm.') : ct('6–8 tiếng là vừa cho bể thủy sinh.')
  out.innerHTML = `${ct('Đèn sáng {h} tiếng mỗi ngày', { h: fmt(h) })}${plan.ramp ? ct(', sáng hẳn {h} tiếng', { h: fmt(full) }) : ''}. ${advice}`
}

function paintColour() {
  const one = model.channels.length === 1
  $('ch-looks').hidden = one
  $('ch-each').hidden = one
  const t = top(plan)
  const master = $<HTMLInputElement>('ch-master')
  if (document.activeElement !== master) master.value = String(t)
  $('ch-master-out').textContent = `${t}%`
  const box = $('ch-levels')
  if (box.dataset.for !== model.channels.join()) {
    box.dataset.for = model.channels.join()
    box.innerHTML = model.channels.map((c, i) => `<label style="--swatch:${SWATCH[c]}"><span>${NAME[c]}</span><input type="range" min="0" max="100" step="1" data-ch="${i}" aria-label="${esc(NAME[c])}" /><output class="num"></output></label>`).join('')
  }
  box.querySelectorAll<HTMLInputElement>('input').forEach(r => {
    const v = plan.levels[Number(r.dataset.ch)] ?? 0
    if (document.activeElement !== r) r.value = String(v)
    ;(r.nextElementSibling as HTMLOutputElement).textContent = `${v}%`
  })
  for (const b of document.querySelectorAll<HTMLButtonElement>('.look')) {
    const want = shares(b).map(s => Math.round(s * t))
    b.setAttribute('aria-pressed', String(t > 0 && want.every((v, i) => Math.abs(v - (plan.levels[i] ?? 0)) <= 1)))
    const m = mix(model.channels, shares(b).map(s => s * 100))
    ;(b.querySelector('.dot') as HTMLElement).style.background = css(m.rgb)
  }
  $('ch-try-row').hidden = state !== 'ready'
  $('ch-try').setAttribute('aria-pressed', String(trying))
  $('ch-try').textContent = trying ? ct('Thôi thử, chạy theo lịch') : ct('Thử màu trên đèn')
}
/** A look's shares of the brightest channel, for this light's channels. */
const shares = (b: HTMLElement) => { const m = b.dataset.mix!.split(',').map(Number); return model.channels.map(c => m[['red', 'green', 'blue', 'white'].indexOf(c)]!) }

function paintPresets() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.preset')) b.setAttribute('aria-pressed', String(b.dataset.on === plan.on && b.dataset.off === plan.off && Number(b.dataset.level) === top(plan)))
}

function paintWrite() {
  const bad = check(plan)
  const active = device && store.activeSchedule(device)
  const same = !!active && active.on === plan.on && active.off === plan.off && active.ramp === plan.ramp && active.levels.join() === plan.levels.join()
  const old = light?.firmware !== undefined && light.firmware < 20
  $('ch-summary').textContent = bad ? '' : `${label(plan)} · ${ct('{h} tiếng', { h: fmt(hoursLit(plan.on, plan.off)) })}`
  const btn = $<HTMLButtonElement>('ch-write')
  btn.disabled = !light || !!bad || old || same || !!playing
  btn.textContent = same ? ct('Đèn đang dùng lịch này') : ct('Ghi lịch vào đèn')
  $('ch-write-note').textContent = state === 'unsupported' ? ct('Mở trang trên Chrome hoặc Edge để ghi vào đèn. Lịch này được nhớ trên máy.')
    : !light ? ct('Kết nối đèn để ghi lịch. Lịch này được nhớ trên máy.')
    : old ? ct('Firmware {fw} chưa hẹn giờ được từ trang: cập nhật firmware bằng ứng dụng My Chihiros.', { fw: light.firmware! })
    : ''
}

// ---- The light card ----

function show(s: typeof state) {
  state = s
  for (const [id, on] of [['ch-unsupported', s === 'unsupported'], ['ch-idle', s === 'idle'], ['ch-busy', s === 'busy'], ['ch-ready', s === 'ready']] as const) $(id).hidden = !on
  $('ch-light').dataset.state = s
  $('ch-play').textContent = playing ? ct('Dừng') : playLabel()
  paintCard(); paintWrite(); paintColour(); paintSaved()
}
function say(text: string, o: { bad?: boolean; action?: [string, () => void] } = {}) {
  const el = $('ch-status')
  el.textContent = text
  el.classList.toggle('bad', !!o.bad)
  if (o.action) {
    const b = document.createElement('button')
    b.type = 'button'; b.className = 'quiet'; b.textContent = o.action[0]
    b.addEventListener('click', o.action[1], { once: true })
    el.append(' ', b)
  }
}

function paintCard() {
  if (state === 'idle') {
    const known = store.liveDevices(db).filter(d => d.kind === 'light')
    const list = $('ch-known')
    list.hidden = !known.length
    $('ch-howto').hidden = !!known.length && !lost
    $('ch-idle-title').textContent = lost && device ? ct('Mất kết nối với {name}', { name: device.nickname ?? device.model ?? '' }) : known.length ? ct('Đèn đã lưu trên máy này') : ct('Kết nối đèn của bạn')
    list.innerHTML = known.map(d => {
      const a = store.activeSchedule(d)
      return `<li><span class="name">${esc(d.nickname ?? d.model ?? d.bleName ?? '')}</span><span class="meta">${esc(d.model ?? '')}${a ? ` · ${ct('lịch')} <span class="num">${label(a)}</span>` : ''}</span><button type="button" class="link forget" data-forget="${d.id}">${ct('Quên đèn này')}</button><button type="button" class="${lost && d.id === device?.id ? 'primary' : 'quiet'} go" data-go="${d.id}">${lost && d.id === device?.id ? ct('Kết nối lại') : ct('Kết nối')}</button></li>`
    }).join('')
    const main = $<HTMLButtonElement>('ch-connect')
    main.textContent = known.length ? ct('Kết nối đèn khác') : ct('Kết nối đèn')
    main.className = known.length ? 'quiet' : 'primary'
    return
  }
  if (state !== 'ready' || !light) return
  const d = device!
  const active = store.activeSchedule(d)
  const fresh = !d.activeScheduleId
  const c = light.clock
  const drift = c ? clockDrift(c.clock, c.at) : undefined
  const clockOk = synced || (drift !== undefined && Math.abs(drift) <= 1)
  const clock = synced || clockOk
    ? `<div class="fact ok">${ICON.ok}<div>${ct('Đồng hồ đèn đúng giờ.')}</div></div>`
    : `<div class="fact warn">${ICON.clock}<div>${!c ? ct('Chưa đọc được giờ của đèn.') : drift === undefined ? ct('Đèn mất giờ, có thể do mất điện: lịch sẽ chạy sai giờ.') : ct('Đồng hồ đèn {dir} {n}: lịch sẽ chạy lệch.', { dir: drift > 0 ? ct('nhanh') : ct('chậm'), n: span(Math.abs(drift)) })}<br><button type="button" class="quiet" data-q="clock">${ct('Chỉnh giờ đèn theo máy này')}</button></div></div>`
  const sched = active
    ? `<div class="fact">${ICON.cal}<div>${ct('Lịch')} <strong class="num">${label(active)}</strong>, ${ct('sáng dần {n} phút', { n: active.ramp })}<br><span class="soft">${ct('Ghi từ trang này ngày {d}.', { d: day(active.savedAt) })}</span></div></div>`
    : `<div class="fact">${ICON.cal}<div>${ct('Chưa ghi lịch nào từ trang này.')}<br><span class="soft">${ct('Lịch đặt bằng ứng dụng My Chihiros (nếu có) vẫn chạy; đèn không cho đọc lại lịch đó.')}</span></div></div>`
  const hand = d.manual
    ? `<div class="fact warn">${ICON.hand}<div>${d.manual.levels.every(l => l === 0) ? ct('Đèn đang tắt bằng tay, không chạy theo lịch.') : ct('Đèn đang chỉnh tay ({p}%), không chạy theo lịch.', { p: Math.max(...d.manual.levels) })}</div></div>`
    : ''
  const steps = fresh ? `<ol class="steps" aria-label="${ct('Cài đèn mới')}">${[
    [true, ct('Kết nối đèn')],
    [clockOk, ct('Chỉnh giờ đèn')],
    [edited, ct('Chọn lịch và màu')],
    [false, ct('Ghi lịch vào đèn')],
  ].map(([done, text]) => `<li class="${done ? 'done' : ''}">${done ? ICON.ok : '<span class="dot" aria-hidden="true"></span>'}${text}${done ? `<span class="visually-hidden"> ${ct('(xong)')}</span>` : ''}</li>`).join('')}</ol>` : ''
  $('ch-ready').innerHTML = `${steps}
    <div class="lhead"><input class="nick" id="ch-nick" value="${esc(d.nickname ?? light.model.name)}" aria-label="${ct('Tên đèn')}" maxlength="80" /><span class="soft">${[d.nickname ? esc(light.model.name) : ct('Bấm vào tên để đổi'), light.firmware !== undefined ? `firmware ${light.firmware}` : ''].filter(Boolean).join(' · ')}</span></div>
    <div class="facts">${clock}${hand}${sched}</div>
    <div class="quick" role="group" aria-label="${ct('Bật tắt nhanh')}">
      <button type="button" class="quiet" data-q="off">${ct('Tắt đèn')}</button>
      <button type="button" class="quiet" data-q="full">${ct('Sáng hết')}</button>
      <button type="button" class="quiet" data-q="auto" ${d.manual || trying ? '' : 'disabled'}>${ct('Theo lịch')}</button>
    </div>
    <div class="lfoot"><button type="button" class="link" data-q="drop">${ct('Ngắt kết nối')}</button></div>`
}
const span = (m: number) => (m < 60 ? ct('{n} phút', { n: m }) : ct('{n} tiếng', { n: fmt(Math.round(m / 6) / 10) }))

function paintSaved() {
  const list = device?.schedules?.slice(0, 6) ?? []
  $('ch-saved').hidden = state !== 'ready' || list.length < 1
  $('ch-saved-list').innerHTML = list.map(s => `<li><span class="what"><strong class="num">${label(s)}</strong><span class="when">${s.name ? `${esc(s.name)} · ` : ''}${ct('sáng dần {n} phút', { n: s.ramp })} · ${day(s.savedAt)}</span></span>${s.id === device!.activeScheduleId ? `<span class="badge">${ct('Đang dùng')}</span>` : `<button type="button" class="quiet" data-use="${s.id}">${ct('Dùng lại')}</button>`}</li>`).join('')
}

// ---- Talking to the light ----

async function open(name?: string) {
  if (!bt) return
  stopPlay()
  const before = state
  show('busy')
  $('ch-busy-text').textContent = ct('Chọn đèn trong danh sách của trình duyệt…')
  say('')
  const r = await connect(bt, { name, onGone: gone })
  if ('error' in r) {
    show(before === 'busy' ? 'idle' : before)
    if (r.error === 'unsupported') say(ct('Đèn {name} chưa được hỗ trợ trên trang này.', { name: r.name }), { bad: true })
    else if (r.error === 'connect') say(ct('Không kết nối được: {why}. Đóng ứng dụng My Chihiros trên các máy khác, lại gần đèn rồi thử lại.', { why: r.why }), { bad: true })
    else if (r.error === 'bluetooth') say(ct('Không mở được Bluetooth: {why}', { why: r.why }), { bad: true })
    return
  }
  await ready(r)
}
async function ready(l: Light) {
  light = l; lost = false; synced = false; trying = false; undo = undefined
  db = store.load()
  const known = store.deviceByBleName(db, l.name)
  const tank = store.ensureTank(db, ct('Bể của tôi'))
  device = store.putDevice(db, { ...known, tankId: known?.tankId ?? tank.id, kind: 'light', brand: 'chihiros', model: l.model.name, bleName: l.name })
  store.save(db)
  model = l.model
  const active = store.activeSchedule(device)
  if (active && !edited) plan = { on: active.on, off: active.off, ramp: active.ramp, levels: fit(active.levels, model.channels.length), name: active.name }
  else plan = { ...plan, levels: fit(plan.levels, model.channels.length) }
  show('ready')
  paint()
  say(known ? ct('Đã kết nối {name}.', { name: device.nickname ?? l.model.name }) : ct('Đã kết nối {model}. Đèn mới: làm theo các bước trong khung này.', { model: l.model.name }))
}
function gone() {
  const was = light
  light = undefined; trying = false; stopPlay()
  if (!was) return
  lost = true
  show('idle')
  say(ct('Mất kết nối với đèn. Lại gần đèn rồi bấm “Kết nối lại”.'), { bad: true })
  lastLight = was
}

async function reconnect() {
  const l = lastLight
  if (!l) return open(device?.bleName)
  show('busy')
  $('ch-busy-text').textContent = ct('Đang kết nối lại…')
  try { await l.reconnect(); await l.status(); await ready(l) } catch { lastLight = undefined; show('idle'); await open(device?.bleName) }
}

function save(patch: Partial<Device>) {
  db = store.load()
  device = store.putDevice(db, { ...device!, ...patch })
  store.save(db)
}
function failed() { say(ct('Không gửi được lệnh tới đèn. Lại gần đèn rồi thử lại.'), { bad: true }) }

async function syncClock() {
  try {
    await light!.send(i => setTime(new Date(), i))
    synced = true
    save({ clockSyncedAt: new Date().toISOString() })
    paintCard()
    say(ct('Đã chỉnh giờ đèn: {t}.', { t: toTime(nowMin()) }))
  } catch { failed() }
}

// Manual levels: while a write is under way, only each channel's latest level waits to go next.
const pending = new Map<number, number>()
let flushing = false
let manual = false
function sendLevels(levels: number[]) {
  levels.forEach((l, c) => pending.set(c, Math.round(l)))
  void flush()
}
async function flush() {
  if (flushing || !light) return
  flushing = true
  try {
    while (pending.size && light) {
      if (!manual) { await light.send(i => setMode(MODE.manual, i)); manual = true }
      const batch = [...pending]
      pending.clear()
      for (const [c, l] of batch) await light.send(i => setLevel(c, l, i))
    }
  } catch { failed() } finally { flushing = false }
}
/**
 * Back to the schedule after levels set by hand (a test colour, the day preview, Tắt đèn). A schedule this page wrote is
 * written again as it was, so it surely runs; one set by the My Chihiros app can't be (it can't be read), so the light is
 * only switched back to its sunrise/sunset mode, which keeps its settings (chihiros-led-control: switchToScene).
 */
async function toSchedule() {
  pending.clear()
  while (flushing) await wait(50)
  manual = false
  if (!light) return
  const known = device && store.activeSchedule(device)
  if (!known) return light.send(i => setMode(MODE.scene, i), 200)
  await light.send(i => setTime(new Date(), i), 300)
  await light.send(i => setMode(MODE.sceneReset, i), 300)
  await light.send(i => setMode(MODE.scene, i), 300)
  await light.send(i => setSchedule(known, model.channels.length, i), 300)
}

async function quick(q: string) {
  if (!light) return
  stopPlay()
  try {
    if (q === 'off' || q === 'full') {
      trying = false
      const levels = model.channels.map(() => (q === 'off' ? 0 : 100))
      sendLevels(levels)
      while (flushing || pending.size) await wait(50)
      save({ manual: { levels, at: new Date().toISOString() } })
      say(q === 'off' ? ct('Đã tắt đèn. Đèn bỏ qua lịch cho tới khi bấm “Theo lịch”.') : ct('Đèn sáng hết. Đèn bỏ qua lịch cho tới khi bấm “Theo lịch”.'))
    } else if (q === 'auto') {
      trying = false
      await toSchedule()
      save({ manual: undefined })
      say(ct('Đèn chạy lại theo lịch.'))
    }
  } catch { failed() }
  paintCard(); paintColour()
}

async function write(p: Plan, o: { undoing?: boolean } = {}) {
  if (!light || check(p)) return
  const prev = device && store.activeSchedule(device)
  if (!prev && !o.undoing && !confirm(ct('Lịch đang lưu trên đèn, kể cả lịch đặt bằng ứng dụng My Chihiros, sẽ bị thay bằng lịch này. Ghi lịch?'))) return
  stopPlay()
  trying = false
  const btn = $<HTMLButtonElement>('ch-write')
  btn.disabled = true
  btn.textContent = ct('Đang ghi…')
  try {
    // Clock first (the schedule runs on it), clear the old scenes, switch to the schedule, then the new setting.
    pending.clear(); manual = false
    await light.send(i => setTime(new Date(), i), 300)
    await light.send(i => setMode(MODE.sceneReset, i), 300)
    await light.send(i => setMode(MODE.scene, i), 300)
    await light.send(i => setSchedule(p, model.channels.length, i), 300)
    synced = true
    db = store.load()
    // Written: the light runs its schedule again, so the levels last set by hand no longer hold.
    device = store.wroteSchedule(db, { ...(store.deviceByBleName(db, light.name) ?? device!), manual: undefined, clockSyncedAt: new Date().toISOString() }, p)
    store.save(db)
    undo = o.undoing ? undefined : prev ? { on: prev.on, off: prev.off, ramp: prev.ramp, levels: prev.levels, name: prev.name } : undefined
    const done = ct('Đã ghi: bật {on}, tắt {off}. Đèn chạy theo lịch từ bây giờ.', { on: p.on, off: p.off })
    const back = undo
    say(done, back ? { action: [ct('Hoàn tác'), () => { plan = { ...back }; paint(); void write(back, { undoing: true }) }] } : {})
  } catch { failed() }
  paintCard(); paintWrite(); paintSaved(); paintColour()
}

// ---- A day in ten seconds ----

function stopPlay() { playing?.stop() }
function play() {
  if (playing) return stopPlay()
  if (check(plan)) return
  const btn = $<HTMLButtonElement>('ch-play')
  const mark = $('tl-play')
  const onLight = !!light
  const t0 = performance.now(), length = 10_000
  let frame = 0
  let last = -1
  const end = () => {
    cancelAnimationFrame(frame)
    playing = undefined
    mark.hidden = true
    btn.textContent = playLabel()
    paintTank(); paintWrite()
    if (onLight && light && !leaving) void toSchedule().then(() => say(ct('Xong. Đèn chạy lại theo lịch.')), failed)
  }
  playing = { stop: end }
  btn.textContent = ct('Dừng')
  mark.hidden = false
  paintWrite()
  const step = (t: number) => {
    const minute = Math.min(1440, ((t - t0) / length) * 1440)
    mark.style.left = `${(minute / 1440) * 100}%`
    paintTank(minute)
    if (onLight && light) {
      const share = levelAt(plan, minute)
      const pct = Math.round(share * 100)
      if (Math.abs(pct - last) >= 4 || (pct === 0) !== (last === 0)) { last = pct; sendLevels(plan.levels.map(l => l * share)) }
    }
    if (minute >= 1440) return end()
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}
const playLabel = () => (light ? ct('Xem thử cả ngày trên đèn') : ct('Xem thử cả ngày'))

// ---- Wiring ----

export function start() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) ?? 'null') as Plan | null
    if (d && Array.isArray(d.levels) && typeof d.on === 'string' && typeof d.off === 'string' && Number.isFinite(d.ramp)) plan = d
  } catch { /* no draft */ }
  // Before connecting, the editor takes the channels of the light last used here.
  const last = store.liveDevices(db).find(d => d.bleName && modelOf(d.bleName))
  model = (last && modelOf(last.bleName!)) ?? RGB
  plan.levels = fit(plan.levels, model.channels.length)

  // The second tank: the same drawing without its gradients (it uses the first one's) and ids.
  $('ch-tank-mini').innerHTML = $('ch-tank').innerHTML.replace(/<defs>[\s\S]*?<\/defs>/, '').replace(/ id="[^"]*"/g, '')
  const form = $<HTMLFormElement>('ch-sched')
  if (!bt) $<HTMLButtonElement>('ch-connect').disabled = true
  show(state)
  paint()

  $('ch-connect').addEventListener('click', () => void open())
  $('ch-known').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b) return
    if (b.dataset.forget) {
      db = store.load(); store.forget(db, b.dataset.forget); store.save(db)
      if (device?.id === b.dataset.forget) { device = undefined; lost = false }
      paintCard()
      return say(ct('Đã quên đèn trên máy này.'))
    }
    const d = store.liveDevices(db).find(x => x.id === b.dataset.go)
    if (lost && d?.id === device?.id) void reconnect()
    else void open(d?.bleName)
  })
  $('ch-ready').addEventListener('click', e => {
    const q = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.q
    if (q === 'clock') void syncClock()
    else if (q === 'drop') { stopPlay(); const l = light; lastLight = undefined; light = undefined; lost = false; show('idle'); l?.disconnect(); say(ct('Đã ngắt kết nối.')) }
    else if (q) void quick(q)
  })
  $('ch-ready').addEventListener('change', e => {
    const t = e.target as HTMLInputElement
    if (t.id === 'ch-nick' && device) { save({ nickname: t.value.trim() || undefined }); say(ct('Đã đổi tên đèn.')) }
  })
  $('ch-saved-list').addEventListener('click', e => {
    const id = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.use
    const s = device?.schedules?.find(x => x.id === id)
    if (!s) return
    change({ on: s.on, off: s.off, ramp: s.ramp, levels: fit(s.levels, model.channels.length), name: s.name })
    say(ct('Đã mở lịch {l}. Bấm “Ghi lịch vào đèn” để dùng.', { l: label(s) }))
  })

  form.addEventListener('input', e => {
    const t = e.target as HTMLInputElement
    if (t.name === 'on' || t.name === 'off') change({ [t.name]: t.value })
    else if (t.name === 'ramp') change({ ramp: Number(t.value) })
  })
  form.addEventListener('submit', e => { e.preventDefault(); void write(plan) })

  for (const b of document.querySelectorAll<HTMLButtonElement>('.preset')) b.addEventListener('click', () => {
    const level = Number(b.dataset.level)
    const t = top(plan) || 1
    change({ on: b.dataset.on!, off: b.dataset.off!, levels: plan.levels.map(l => Math.round((l / t) * level)), name: b.dataset.name })
  })
  for (const b of document.querySelectorAll<HTMLButtonElement>('.look')) b.addEventListener('click', () => {
    const t = top(plan) || 70
    change({ levels: shares(b).map(s => Math.round(s * t)) }, { keepName: true })
  })
  $('ch-master').addEventListener('input', e => {
    const v = Number((e.target as HTMLInputElement).value)
    const t = top(plan)
    change({ levels: t ? plan.levels.map(l => Math.round((l / t) * v)) : plan.levels.map(() => v) }, { keepName: true })
  })
  $('ch-levels').addEventListener('input', e => {
    const r = e.target as HTMLInputElement
    const levels = [...plan.levels]
    levels[Number(r.dataset.ch)] = Number(r.value)
    change({ levels }, { keepName: true })
  })
  $('ch-try').addEventListener('click', async () => {
    if (!light) return
    stopPlay()
    trying = !trying
    paintColour()
    try {
      if (trying) { sendLevels(plan.levels); say(ct('Đèn đang hiện màu thử.')) } else { await toSchedule(); say(ct('Đèn chạy lại theo lịch.')) }
    } catch { failed() }
    paintCard()
  })
  $('ch-play').addEventListener('click', play)

  // The timeline's handles: drag, or arrow keys (15 minutes; Page Up/Down an hour).
  const tl = $('ch-tl')
  const limits = (which: 'on' | 'off') => {
    const on = toMin(plan.on), off = plan.off === '00:00' ? 1440 : toMin(plan.off)
    const gap = Math.max(30, plan.ramp * 2)
    return which === 'on' ? [0, off - gap] : [on + gap, 1440]
  }
  const setHandle = (which: 'on' | 'off', m: number) => {
    const [lo, hi] = limits(which)
    const v = Math.max(lo!, Math.min(hi!, snap(m)))
    change({ [which]: toTime(v) } as Partial<Plan>)
  }
  for (const which of ['on', 'off'] as const) {
    const h = $(`tl-${which}`)
    h.addEventListener('pointerdown', e => {
      h.setPointerCapture(e.pointerId)
      h.classList.add('drag')
      const move = (ev: PointerEvent) => { const r = tl.getBoundingClientRect(); setHandle(which, ((ev.clientX - r.left) / r.width) * 1440) }
      const up = () => { h.classList.remove('drag'); h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up) }
      h.addEventListener('pointermove', move)
      h.addEventListener('pointerup', up)
      h.addEventListener('pointercancel', up)
    })
    h.addEventListener('keydown', e => {
      const step = { ArrowLeft: -15, ArrowDown: -15, ArrowRight: 15, ArrowUp: 15, PageDown: -60, PageUp: 60 }[e.key]
      const cur = Number(h.getAttribute('aria-valuenow'))
      if (step) setHandle(which, cur + step)
      else if (e.key === 'Home') setHandle(which, limits(which)[0]!)
      else if (e.key === 'End') setHandle(which, limits(which)[1]!)
      else return
      e.preventDefault()
    })
  }

  // Leaving the page while the light shows a test colour or the day preview: put it back on its schedule.
  // One frame only: the page may be stopped any moment after it is hidden, and a rewrite cut off between clearing the
  // scenes and writing the new one would leave the light with no schedule at all.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !light || !(trying || playing || manual) || device?.manual) return
    leaving = true
    stopPlay(); trying = false; pending.clear(); manual = false
    void light.send(i => setMode(MODE.scene, i))
  })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') leaving = false })
  window.addEventListener('pagehide', keepDraft)
  // Another tab changed the saved lights.
  window.addEventListener('storage', e => { if (e.key === store.KEY) { db = store.load(); if (state === 'idle') paintCard() } })
  // The "now" mark moves with the clock.
  setInterval(() => { if (!playing) { paintTimeline(); paintTank() } }, 60_000)
}
