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
/** Who may say yes, two of them on every yes, and never the one who proposed the photo. */
export const YES_APPROVERS = ['the chief of staff', 'Curation', 'the owner'] as const
/** Yeses a week (Monday to Sunday, by `on`): any past these, earliest first, don't count. */
export const YES_PER_WEEK = 5
/** Words a mark naming lettering would use. A mark on a fish's body needs none of them. */
const LETTERING = /\b(letter(s|ing)?|words?|text|written|writing|signs?|signature|watermark|logo|credit|caption)\b|[©"“”]/i

type Raw = Record<string, Record<string, Partial<PersonYes>>>

/**
 * The entries that count: every field given, a mark that names no lettering, two different people who may say yes and
 * neither of them the proposer, at most YES_PER_WEEK a week.
 */
export function countedYes(raw: Raw): Record<string, Record<string, PersonYes>> {
  const word = (x: unknown) => typeof x === 'string' && x.trim().length > 0
  const monday = (d: string) => { const t = Date.parse(`${d}T00:00:00Z`); return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10) }
  const two = (y: Partial<PersonYes>) => Array.isArray(y.approvers) && y.approvers.length === 2 && y.approvers[0] !== y.approvers[1]
    && y.approvers.every(a => (YES_APPROVERS as readonly string[]).includes(a) && a !== y.proposer)
  const valid = Object.entries(raw).flatMap(([url, pages]) => Object.entries(pages ?? {}).map(([page, y]) => ({ url, page, y })))
    .filter(({ y }) => word(y.proposer) && word(y.lookAlike) && word(y.mark) && !LETTERING.test(y.mark!) && two(y)
      && typeof y.on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(y.on) && !Number.isNaN(Date.parse(y.on)))
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
  const raw = JSON.parse(await readFile(join(root, 'engine-state', '_photo-person-yes.json'), 'utf8').catch(() => 'null')) as Raw | null ?? {}
  return { raw, counted: countedYes(raw) }
}

/**
 * Whether a head pick (`kind/id` → photo) still counts. One whose photo has a person's yes for that page lapses with
 * the yes (Curation, 2026-11-12): once the yes doesn't count, or the check says anything but "can't tell" for it there,
 * the pick stops counting in the same pass, so a pick never outlives its yes. Any other pick always counts.
 */
export function pickStands(ref: string, url: string, subjects: Record<string, Record<string, PhotoVerdict>>, yes: PersonYesRecord): boolean {
  const page = ref.split('/')[1] ?? ''
  if (!yes.raw[url]?.[page]) return true
  const v = subjects[url]?.[page]
  return !!yes.counted[url]?.[page] && !!v && !v.guide && v.ok === 'unsure'
}
