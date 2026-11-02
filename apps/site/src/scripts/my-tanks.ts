import type { Device, SavedSchedule, Tank, UnlistedEntry } from '@aq/schema'
import { tankLitres } from '@aq/schema/tank-rules'
import { pageMatcher } from '@aq/schema/unlisted'
import { modelOf, type Channel } from './chihiros'
import { css, curve, mix, toMin } from './light-view'
import { msg } from '../i18n/msg'
import type { T } from '../lib/i18n'

/** "Bể của tôi": how a saved tank and its lights read on the page. Pure: the page script does the DOM. */

/** Substrates a tank can have (KNOWN.substrate in the schema), as the form lists them. */
export const SUBSTRATE_LABELS: Record<string, string> = {
  soil: msg('Phân nền (aqua soil)'), sand: msg('Cát'), gravel: msg('Sỏi'), lava: msg('Đá nham thạch'), bare: msg('Không trải nền'), other: msg('Nền khác'),
}

export const esc = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)

/** The line under a tank's name: size, litres, substrate (what it has of them). */
export function facts(t: Pick<Tank, 'dims' | 'litres' | 'substrate'>, ct: T, num: (n: number, digits?: number) => string): string[] {
  const out: string[] = []
  if (t.dims) out.push(`${num(t.dims.l)} × ${num(t.dims.w)} × ${num(t.dims.h)} cm`)
  const l = tankLitres(t)
  if (l !== undefined) out.push(ct('{n} lít', { n: num(l, l < 100 ? 1 : 0) }))
  if (t.substrate) out.push(SUBSTRATE_LABELS[t.substrate] ? ct(SUBSTRATE_LABELS[t.substrate]!) : t.substrate)
  return out
}

/** A light's channels: its model's, from the Bluetooth name (Chihiros); else as many as its saved levels. */
export function channelsOf(d: Device): Channel[] {
  const m = d.bleName ? modelOf(d.bleName) : undefined
  if (m) return m.channels
  const n = d.schedules?.[0]?.levels.length ?? d.manual?.levels.length ?? 3
  return (['red', 'green', 'blue', 'white'] as Channel[]).slice(0, n)
}

/** The day's light for a saved schedule: the SVG path (1440 × h) and the colour its channels mix to. */
export function dayPicture(s: Pick<SavedSchedule, 'on' | 'off' | 'ramp' | 'levels'>, channels: Channel[], h = 48) {
  const on = toMin(s.on)
  const off = s.off === '00:00' ? 1440 : toMin(s.off)
  const light = mix(channels, s.levels)
  return { path: curve(on, off, s.ramp, Math.max(0.15, light.power), h), colour: css(light.rgb), hours: (off - on) / 60 }
}

/** An item of the handbook's index (/app/<lang>.json, lib/app-index.ts) as this page reads it. */
export type IndexItem = { kind: string; id?: string; name: string; sub?: string; aka?: string[]; path: string; schoolMin?: number }
type Page = IndexItem & { id: string; kind: 'fish' | 'plant' }
/** A plant's other names hold its former scientific names (lib/app-index.ts): those that read like one. */
const LATIN = /^[A-Z][a-z]+ [a-z]/

/**
 * The index's fish and plants, and the page an entry without a page is shown as (@aq/schema/unlisted: the page with its
 * scientific name, or a plant's former one). Only what is shown: the tank keeps the entry as the reader wrote it.
 */
export function handbook(items: IndexItem[]) {
  const pages = items.filter((i): i is Page => !!i.id && (i.kind === 'fish' || i.kind === 'plant'))
  const find = pageMatcher(pages.map(p => ({ ...p, sci: p.sub, synonyms: p.kind === 'plant' ? p.aka?.filter(a => LATIN.test(a)) : undefined })))
  return { pages, match: (e: Pick<UnlistedEntry, 'kind' | 'sci'>) => find(e.kind, e.sci) }
}

/** Which of a tank's entries without a page go with its fish (anything that isn't a plant, a kind from a newer app too). */
export const unlistedOf = (t: Pick<Tank, 'unlisted'>, plants: boolean) => (t.unlisted ?? []).filter(u => (u.kind === 'plant') === plants)

