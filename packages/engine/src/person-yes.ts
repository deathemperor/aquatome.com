import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PhotoVerdict } from './photo-check'

/**
 * A person's yes for a card (the chief of staff, 2026-11-12, for the spotted snakehead):
 * engine-state/_photo-person-yes.json, photo → page → who proposed it, the two who said yes, the day, the look-alike the
 * check named and the mark on the fish's body that rules it out. A body mark only: no lettering read off the photo goes
 * into the record or its pull request (Curation, 2026-11-12). It is changed only by a pull request, with the sheet the two
 * looked at, never by the engine. It counts as the check's "the right fish" for a card over a "can't tell" only, and only
 * while the check still says that: a later "another fish" or any firm no stands (curation.ts `cardWorthy`). The check's
 * "typical", person and logo answers still hold. The head pick that goes with it (_photo-head-picks.json) lapses with it
 * (`pickStands`).
 */
export type PersonYes = { proposer: string; approvers: string[]; on: string; lookAlike: string; mark: string }
/**
 * Who may say yes: two of them on every yes, never the one who proposed the photo. The owner's yes counts alone ("the
 * owner may always", the approved rule). Names compare trimmed and in any case, so "Curation " is Curation.
 */
export const YES_APPROVERS = ['the chief of staff', 'Curation', 'the owner'] as const
/** Yeses a week (Monday to Sunday, by `on`): any past these, earliest first, don't count. */
export const YES_PER_WEEK = 5
/** Words a mark naming lettering would use. A mark on a fish's body needs none of them. */
const LETTERING = /\b(letter(s|ing)?|words?|text|written|writing|signs?|signature|watermark|logo|credit|caption)\b|[©"“”]/i

type Raw = Record<string, Record<string, Partial<PersonYes>>>

const object = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const who = (x: string) => x.trim().toLowerCase()
const OWNER = who('the owner')

/** A day as written in the calendar: 2026-02-30 is no day. */
const day = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
  && !Number.isNaN(Date.parse(`${x}T00:00:00Z`)) && new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x

/** Whether the people named may say this yes: the owner alone, or two others who may, neither the proposer. */
function said(proposer: string, approvers: unknown): boolean {
  if (!Array.isArray(approvers) || !approvers.length || !approvers.every(a => typeof a === 'string')) return false
  const names = approvers.map(who)
  if (new Set(names).size !== names.length || !names.every(a => YES_APPROVERS.some(b => who(b) === a))) return false
  return names.includes(OWNER) || names.filter(a => a !== who(proposer)).length >= 2
}

/**
 * The entries that count: every field given, a mark that names no lettering, a real day, the people `said` names, at
 * most YES_PER_WEEK a week. An entry of any other shape doesn't count and stops nothing.
 */
export function countedYes(raw: unknown): Record<string, Record<string, PersonYes>> {
  const word = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0
  const monday = (d: string) => { const t = Date.parse(`${d}T00:00:00Z`); return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10) }
  const valid = (object(raw) ? Object.entries(raw) : [])
    .flatMap(([url, pages]) => (object(pages) ? Object.entries(pages) : []).map(([page, y]) => ({ url, page, y })))
    .filter((e): e is { url: string; page: string; y: Partial<PersonYes> } => object(e.y))
    .filter(({ y }) => word(y.proposer) && word(y.lookAlike) && word(y.mark) && !LETTERING.test(y.mark) && day(y.on)
      && said(y.proposer, y.approvers))
    .sort((a, b) => a.y.on!.localeCompare(b.y.on!) || a.url.localeCompare(b.url) || a.page.localeCompare(b.page))
  const week = new Map<string, number>()
  const out: Record<string, Record<string, PersonYes>> = {}
  for (const { url, page, y } of valid) {
    const k = monday(y.on!)
    if ((week.get(k) ?? 0) >= YES_PER_WEEK) continue
    week.set(k, (week.get(k) ?? 0) + 1)
    ;(out[url] ??= {})[page] = y as PersonYes
  }
  return out
}

export type PersonYesRecord = { raw: Raw; counted: Record<string, Record<string, PersonYes>> }

/** The record as written, and the entries of it that count. The engine only reads it. */
export async function readPersonYes(root: string): Promise<PersonYesRecord> {
  const read = JSON.parse(await readFile(join(root, 'engine-state', '_photo-person-yes.json'), 'utf8').catch(() => 'null')) as unknown
  // Only well-formed pages: `pickStands` asks the record whether a yes was written for a photo and page.
  const raw: Raw = Object.fromEntries((object(read) ? Object.entries(read) : []).filter(([, pages]) => object(pages))) as Raw
  return { raw, counted: countedYes(raw) }
}

/**
 * Whether a head pick (`kind/id` → photo) still counts. One whose photo has a person's yes for that page lapses with
 * the yes (Curation, 2026-11-12): once the yes doesn't count, or the check says anything but "can't tell" for it there,
 * the pick stops counting in the same pass, so a pick never outlives its yes. Any other pick always counts.
 */
export function pickStands(ref: string, url: string, subjects: Record<string, Record<string, PhotoVerdict>>, yes: PersonYesRecord): boolean {
  const page = ref.split('/')[1] ?? ''
  // Any entry written for the photo and page, well formed or not: one that doesn't count takes the pick with it.
  if (!Object.hasOwn(yes.raw[url] ?? {}, page)) return true
  const v = subjects[url]?.[page]
  return !!yes.counted[url]?.[page] && !!v && !v.guide && v.ok === 'unsure'
}
