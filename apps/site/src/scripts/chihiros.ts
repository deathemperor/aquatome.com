/**
 * Chihiros LED lights over Bluetooth: the frames the My Chihiros app sends, from the open protocol notes in
 * github.com/TheMicDiet/chihiros-led-control (docs/protocol.md, MIT). Pure functions here; the page does the Bluetooth.
 */
export const UART = { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' }

export type Channel = 'white' | 'red' | 'green' | 'blue'
/** A light model: its channels in channel-id order (red 0, green 1, blue 2, white 3; a white-only light uses 0). */
export type Model = { name: string; channels: Channel[] }
const WHITE: Channel[] = ['white']
const RGB: Channel[] = ['red', 'green', 'blue']
const WRGB: Channel[] = ['red', 'green', 'blue', 'white']
// Name prefix → model (registry.py). Lights with other channel layouts (X300, Z Light Tiny, Egg, Commander 1) are left out.
const MODELS: [string[], Model][] = [
  [['DYNA2', 'DYNA2N'], { name: 'A II', channels: WHITE }],
  [['DYA'], { name: 'A Series', channels: WHITE }],
  [['DYC', 'DYNC2'], { name: 'C', channels: WHITE }],
  [['DYNC2N'], { name: 'C II', channels: WHITE }],
  [['DYONE'], { name: 'Commander X', channels: WHITE }],
  [['DYARGB', 'DYRGBA+', 'DYRGBA', 'DYNARGB'], { name: 'RGB A Plus', channels: RGB }],
  [['DYREE', 'DYNVVD', 'DYNV'], { name: 'RGB VIVID', channels: RGB }],
  [['DYWRGB', 'DYNT90', 'DYNW30', 'DYNW45', 'DYNW60', 'DYNW90', 'DYNW12P', 'DYNWRGB'], { name: 'WRGB II', channels: RGB }],
  [['DYSILN', 'DYSL30', 'DYSL45', 'DYSL60', 'DYSL90', 'DYSL120', 'DYSL12'], { name: 'WRGB II Slim', channels: RGB }],
  [['DYNCRGP', 'DYNCRGB'], { name: 'C II RGB', channels: RGB }],
  [['DYWPRO30', 'DYWPRO45', 'DYWPRO60', 'DYWPRO80', 'DYWPRO90', 'DYWPR120'], { name: 'WRGB II Pro', channels: WRGB }],
  [['DYVVD3'], { name: 'WRGB VIVID III', channels: WRGB }],
  [['DYU550', 'DYU600', 'DYU700', 'DYU800', 'DYU920', 'DYU1000', 'DYU1200', 'DYU1500'], { name: 'Universal WRGB', channels: WRGB }],
  [['DYSEA'], { name: 'SEA', channels: WRGB }],
  [['DYLED', 'DYNLED'], { name: 'Commander 4', channels: WRGB }],
]
/** The supported lines, for the page's text. */
export const SUPPORTED = MODELS.map(([, m]) => m.name)
const BY_PREFIX = MODELS.flatMap(([ps, m]) => ps.map(p => [p, m] as const)).sort((a, b) => b[0].length - a[0].length)
/** The model a light's Bluetooth name belongs to (longest prefix: DYNA2N before DYNA2 before DYA), if supported. */
export const modelOf = (name: string): Model | undefined => BY_PREFIX.find(([p]) => name.startsWith(p))?.[1]
/** Names the browser's device picker lists: every Chihiros light starts with "DY". */
export const NAME_PREFIX = 'DY'

/** Message ids count up from 1, skipping 0x5a in either byte, and wrap after 0xffff. */
export function nextId(id: number): number {
  let n = id >= 0xffff ? 1 : id + 1
  while ((n >> 8) === 0x5a || (n & 0xff) === 0x5a) n = n >= 0xffff ? 1 : n + 1
  return n
}

/** `[cmd, 0x01, params + 5, id hi, id lo, mode, ...params, XOR of bytes 1..]`. */
export function frame(cmd: number, mode: number, params: number[], id: number): Uint8Array {
  const f = [cmd, 0x01, params.length + 5, id >> 8, id & 0xff, mode, ...params]
  let x = f[1]!
  for (const b of f.slice(2)) x ^= b
  return Uint8Array.from([...f, x & 0xff])
}

export const MODE = { manual: 11, scene: 18, sceneReset: 0x28 }
/** Switch the light's controller: manual, the sunrise/sunset scene, or clear the scenes. */
export const setMode = (mode: number, id: number) => frame(0x5a, 0x05, [mode, 255, 255], id)
/** One channel's manual level, 0–100. */
export const setLevel = (channel: number, level: number, id: number) => frame(0x5a, 0x07, [channel, clamp(level)], id)
/** The light's clock (its schedule runs on it; a power cut resets it). The third field is the ISO weekday. */
export const setTime = (d: Date, id: number) => frame(0x5a, 0x09, [d.getFullYear() - 2000, d.getMonth() + 1, d.getDay() || 7, d.getHours(), d.getMinutes(), d.getSeconds()], id)
/** Ask for the status reply (its byte 1 is the firmware version). */
export const askStatus = (id: number) => frame(0x5a, 0x04, [1], id)

export type Schedule = { on: string; off: string; ramp: number; levels: number[] }
/**
 * An everyday sunrise/sunset setting: `[on h, on m, off h, off m, ramp minutes, weekdays, levels by channel id, 255…]`,
 * 14 bytes. A white-only light takes `[white, 255, 255]`; a schedule ending at 00:00 is written as 23:59.
 */
export function scheduleParams(s: Schedule, channels: number): number[] {
  const [oh, om] = s.on.split(':').map(Number) as [number, number]
  let [fh, fm] = s.off.split(':').map(Number) as [number, number]
  if (fh === 0 && fm === 0) [fh, fm] = [23, 59]
  const levels = channels === 1 ? [clamp(s.levels[0] ?? 0), 255, 255] : s.levels.slice(0, channels).map(clamp)
  const p = [oh, om, fh, fm, Math.max(0, Math.min(150, Math.round(s.ramp))), 127, ...levels]
  return [...p, ...Array(14 - p.length).fill(255)]
}
export const setSchedule = (s: Schedule, channels: number, id: number) => frame(0xa5, 0x19, scheduleParams(s, channels), id)

/** The firmware version in a status reply (`5b <firmware> …`), if this is one. */
export const firmwareOf = (reply: Uint8Array): number | undefined => (reply.length >= 7 && reply[0] === 0x5b ? reply[1] : undefined)

function clamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))) }

/** Hours of light between on and off ("08:00"–"16:00" → 8). */
export function hoursLit(on: string, off: string): number {
  const m = (t: string) => { const [h, mm] = t.split(':').map(Number) as [number, number]; return h * 60 + mm }
  const d = (m(off) - m(on) + 1440) % 1440
  return Math.round((d / 60) * 10) / 10
}

/** The light's clock: ISO weekday (1 Monday … 7 Sunday; 0 after a power cut reset it), hour, minute. */
export type Clock = { weekday: number; hour: number; minute: number }
/**
 * The light's clock from its long status reply (`5b <firmware> <len> <id> fe <weekday> <hour> <minute> …`), if this is
 * one. The time the light was last given comes back here (captured on a WRGB II Slim, firmware 24); after a power cut
 * it counts up from weekday 0, 00:00. The reply carries no sunrise/sunset setting and no manual levels: what was
 * written is only known to whoever wrote it.
 */
export function clockOf(reply: Uint8Array): Clock | undefined {
  if (reply.length < 9 || reply[0] !== 0x5b || reply[5] !== 0xfe) return undefined
  const [weekday, hour, minute] = [reply[6]!, reply[7]!, reply[8]!]
  return weekday <= 7 && hour < 24 && minute < 60 ? { weekday, hour, minute } : undefined
}
/**
 * Minutes the light's clock is ahead of `now` (negative: behind), over a week; undefined when the clock was reset by a
 * power cut (weekday 0), since then it isn't any real time.
 */
export function clockDrift(c: Clock, now: Date): number | undefined {
  if (c.weekday === 0) return undefined
  const week = 7 * 1440
  const light = (c.weekday - 1) * 1440 + c.hour * 60 + c.minute
  const here = ((now.getDay() || 7) - 1) * 1440 + now.getHours() * 60 + now.getMinutes()
  const d = (((light - here) % week) + week) % week
  return d > week / 2 ? d - week : d
}

/**
 * How bright a sunrise/sunset setting has the light at a minute of the day, 0–1 of its levels: off before `on`, rising
 * over `ramp` minutes from `on`, full, falling over the last `ramp` minutes to off at `off` (00:00: midnight).
 */
export function levelAt(s: Pick<Schedule, 'on' | 'off' | 'ramp'>, minute: number): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const on = m(s.on)
  const off = s.off === '00:00' ? 1440 : m(s.off)
  if (minute < on || minute >= off) return 0
  if (s.ramp > 0 && minute < on + s.ramp) return (minute - on) / s.ramp
  if (s.ramp > 0 && minute > off - s.ramp) return (off - minute) / s.ramp
  return 1
}
