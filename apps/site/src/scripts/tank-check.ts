import { msg } from '../i18n/msg'
import type { T } from '../lib/i18n'
import { tankVolume, WATER_SHARE } from './calc'
import type { SpeciesIndexItem } from './filter'
import { stocking, type Level } from './stocking'
import { checkTankmates, verdictOf, type TankmateReport, type Verdict } from './tankmates'

/**
 * A saved tank checked as the tank-mates tool (/vi/cong-cu/nuoi-chung/) checks the fish chosen there: the same verdict,
 * warnings and stocking meter, from the tool's own functions, in the words its page uses: the tool's page writes them
 * with the builders below too. The iOS app runs this file (bundled by scripts/app-tank-check.mjs) on the reader's
 * tanks; protocols/tankmates-vectors.json holds both to it.
 */

/** A fish on the tank: its name and tank-mates figures (the app index's facts), and how many, when the tank says. */
export type TankFish = Pick<SpeciesIndexItem, 'name' | 'tempC' | 'ph' | 'gh' | 'sizeCm' | 'tankCm' | 'temperament' | 'finNipper' | 'schoolMin'> & { count?: number }
/** The tank's inside size (cm) and its own litres figure, either or both when known. */
export type TankSize = { dims?: { l: number; w: number; h: number }; litres?: number }

export type TankCheck = {
  /** Whether the fish can share a tank, as the tool's sentence says it (two fish or more). */
  verdict?: { level: Verdict['level']; text: string }
  /** The tool's warnings under the verdict: who may eat whom, temperaments. */
  warnings: string[]
  /** How full the tank is with fish, as the tool's meter reads it, and its notes (schools, a tank too short). */
  stocking?: { percent: number; level: Level; text: string; notes: string[] }
  /** With no length to check against (no size, or only litres): the longest tank any of them needs. */
  minTank?: string
  /** No fish with a size: nothing to fill the tank with, so no meter; the fish it couldn't count. */
  unsized?: string
}

type Esc = (s: string) => string
const same: Esc = s => s

/** The tool's sentence for a verdict: "Không nên nuôi chung: Cá đĩa có thể ăn Cá neon." (`strong` marks the head). */
export const verdictSentence = (v: Pick<Verdict, 'head' | 'reasons'>, esc: Esc = same, strong: Esc = same) => `${strong(esc(v.head))}: ${v.reasons.map(esc).join('; ')}.`

/** The tool's warnings under its verdict: who may eat whom, then the temperament notes that aren't only information. */
export const warningsOf = (r: TankmateReport, ct: T, fmt: (n: number, d?: number) => string, esc: Esc = same) => [
  ...r.eats.map(e => ct('{big} ({bigCm} cm) có thể ăn {small} ({smallCm} cm).', { big: esc(e.big), bigCm: fmt(e.bigCm), small: esc(e.small), smallCm: fmt(e.smallCm) })),
  ...r.notes.filter(n => n.level !== 'info').map(n => esc(n.text)),
]

/** The meter's notes: schools too small, a tank too short for a fish, fish of unknown size. */
export const stockingNotes = (s: ReturnType<typeof stocking>, ct: T, fmt: (n: number, d?: number) => string, esc: Esc = same) => [
  ...s.school.map(x => ct('{name} sống theo đàn: nên nuôi từ {min} con (đang chọn {count}).', { name: esc(x.name), min: x.min, count: x.count })),
  ...s.tooShort.map(x => ct('{name} cần bể dài từ {n} cm.', { name: esc(x.name), n: fmt(x.tankCm) })),
  ...(s.unknown.length ? [unsizedNote(s.unknown, ct, esc)] : []),
]
const unsizedNote = (names: string[], ct: T, esc: Esc = same) => ct('Chưa có kích thước của {names}: chưa tính vào mật độ.', { names: names.map(esc).join(', ') })

/** `fmt`: numbers as the page writes them in its language (Intl.NumberFormat, at most `d` decimals). */
export function tankCheck(fish: TankFish[], size: TankSize, ct: T, fmt: (n: number, d?: number) => string): TankCheck {
  // The tool's checks read only these fields.
  const mates = fish as SpeciesIndexItem[]
  const r = checkTankmates(mates, ct)
  const out: TankCheck = { warnings: [] }
  if (fish.length >= 2) {
    const v = verdictOf(mates, r, ct)
    out.verdict = { level: v.level, text: verdictSentence(v) }
    out.warnings = warningsOf(r, ct, fmt)
  }
  // The tank's own litres when it has them (what the reader gave), else its box; the length for "too short".
  const water = size.litres ? size.litres * WATER_SHARE : size.dims ? tankVolume(size.dims.l, size.dims.w, size.dims.h).water : undefined
  const counted = fish.map(f => ({ name: f.name, count: f.count ?? f.schoolMin ?? 1, sizeCm: f.sizeCm, schoolMin: f.schoolMin, tankCm: f.tankCm }))
  if (fish.length && !fish.some(f => f.sizeCm)) {
    // A meter at 0% would say there's room, when nothing was counted.
    out.unsized = unsizedNote(fish.map(f => f.name), ct)
  } else if (fish.length && water) {
    const s = stocking(counted, water, { tankCm: size.dims?.l })
    const [label, advice] = LEVEL[s.level]
    out.stocking = { percent: Math.round(s.percent), level: s.level, text: `${fmt(s.percent, 0)}% · ${ct(label)}: ${ct(advice)}`, notes: stockingNotes(s, ct, fmt) }
  }
  // No length to check the fish against (no size, or only litres, as the volume tool saves a round tank).
  if (!size.dims && r.minTankCm) {
    out.minTank = ct('Bể dài tối thiểu cho cả nhóm: <strong>{n} cm</strong>.', { n: fmt(r.minTankCm) }).replace(/<\/?strong>/g, '')
  }
  return out
}

/** The tool's meter labels and advice, by level (its page shows them too). */
export const LEVEL = {
  light: [msg('Còn thưa'), msg('thả thêm được.')], ok: [msg('Vừa phải'), msg('bể ổn định với lọc và thay nước thường lệ.')],
  full: [msg('Đã đầy'), msg('cần lọc tốt và thay nước đều mỗi tuần.')], over: [msg('Quá tải'), msg('bớt cá hoặc dùng bể lớn hơn.')],
} as const
