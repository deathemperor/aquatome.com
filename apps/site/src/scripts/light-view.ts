import type { Channel } from './chihiros'

/** Pictures of a light setting on screen: the colour the channels mix to, a tank lit by it, the day's curve. */
type Rgb = [number, number, number]
// Roughly the colour each kind of LED gives; the screen can only hint at the real light.
const LED: Record<Channel, Rgb> = { red: [255, 48, 40], green: [40, 230, 80], blue: [50, 80, 255], white: [255, 240, 220] }
// Brightest the sum gets with red, green and blue all at 100 (a white channel can go past it: capped).
const FULL = 375

/** The colour the channels mix to (brightest component at 255) and how bright it is overall, 0–1. */
export function mix(channels: Channel[], levels: number[]): { rgb: Rgb; power: number } {
  const sum: Rgb = [0, 0, 0]
  channels.forEach((c, i) => { for (let k = 0; k < 3; k++) sum[k]! += (LED[c][k]! * (levels[i] ?? 0)) / 100 })
  const top = Math.max(...sum)
  if (top === 0) return { rgb: [0, 0, 0], power: 0 }
  return { rgb: sum.map(v => Math.round((v / top) * 255)) as Rgb, power: Math.min(1, top / FULL) }
}

/** A surface of colour `base` under that light: the light's colour filters it, its power brightens it. */
export function lit(base: Rgb, light: { rgb: Rgb; power: number }, ambient = 0.12): Rgb {
  const p = ambient + (1 - ambient) * light.power
  return base.map((b, k) => Math.round(b * (ambient + (1 - ambient) * (light.rgb[k]! / 255)) * p)) as Rgb
}
export const css = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`

/** Minutes of the day ↔ "HH:MM" (1440, the end of the day, is "00:00"). */
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
export const toTime = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/** A minute dragged to on the timeline, to the nearest `step`, within the day. */
export const snap = (m: number, step = 15) => Math.max(0, Math.min(1440, Math.round(m / step) * step))

/**
 * The day's light as an SVG path over a 1440 × `h` box: off, rising over the ramp from `on`, full at `top` (0–1 of the
 * height), falling over the ramp to off at `off`.
 */
export function curve(on: number, off: number, ramp: number, top: number, h: number): string {
  const y = (h * (1 - top)).toFixed(1)
  const r = Math.min(ramp, (off - on) / 2)
  return `M0 ${h} L${on} ${h} L${on + r} ${y} L${off - r} ${y} L${off} ${h} L1440 ${h} Z`
}
