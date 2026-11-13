import { LANG, type WrittenLang } from '@aq/schema/langs'
import { parse } from 'node-html-parser'
import { fitKey, fitText, type FitState } from './fit'
import type { Page } from './pages'

/**
 * The seasons a reader's country has, by the languages table's country codes (packages/schema/src/langs.ts). On 13 Nov 2026
 * eight of AquaTome's guides had copies that told readers in Indonesia, Thailand and Malaysia about seasons they don't have
 * (a summer, koi fed by spring, autumn and winter), written from research gathered for Vietnam and from sources abroad.
 * The chief of staff's rule: a season that isn't the reader's goes, whoever's it was, and the condition stays ("when the
 * water is above 28 °C"); the copy writes nothing about the reader's own seasons that its research doesn't hold.
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'hot' | 'cool' | 'rainy' | 'dry'
const HAS: Record<string, readonly Season[]> = {
  // The North's four seasons, the South's rainy and dry.
  VN: ['spring', 'summer', 'autumn', 'winter', 'hot', 'cool', 'rainy', 'dry'],
  ID: ['rainy', 'dry'],
  // Hot, rainy and cool (ฤดูร้อน, ฤดูฝน, ฤดูหนาว): Thailand's own cool season is ฤดูหนาว, which is not a winter of snow.
  TH: ['hot', 'rainy', 'cool'],
  MY: ['rainy', 'dry'],
  BN: ['rainy', 'dry'],
}
/** How a copy in each language names a season none of its reader's countries may have. */
const NAMED: Partial<Record<WrittenLang, Partial<Record<Season, RegExp>>>> = {
  id: { spring: /musim semi/giu, summer: /musim panas/giu, autumn: /musim gugur/giu, winter: /musim (?:dingin|salju|sejuk)/giu },
  ms: { spring: /musim bunga/giu, summer: /musim panas/giu, autumn: /musim luruh/giu, winter: /musim (?:dingin|sejuk|salji)/giu },
  th: { spring: /ฤดูใบไม้ผลิ/gu, autumn: /ฤดูใบไม้ร่วง/gu, winter: /ฤดูหิมะ|หิมะตก/gu },
}

/** The countries a language's readers are in, from the languages table, as the copy's writer is told them. */
export function readerCountries(lang: WrittenLang): string {
  const names = new Intl.DisplayNames(['en'], { type: 'region' })
  const all = LANG[lang].countries.map(c => names.of(c) ?? c)
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all.at(-1)}` : all[0]!
}

const SAID: Record<Season, string> = { spring: 'spring', summer: 'summer', autumn: 'autumn', winter: 'winter', hot: 'hot', cool: 'cool', rainy: 'rainy', dry: 'dry' }
/** The seasons a language's readers have, as the copy's writer is told them: "a rainy and a dry season". */
export function readerSeasons(lang: WrittenLang): string {
  const has = [...new Set(LANG[lang].countries.flatMap(c => HAS[c] ?? []))].map(s => SAID[s])
  return has.length > 1 ? `a ${has.slice(0, -1).join(', a ')} and a ${has.at(-1)} season` : `a ${has[0]} season`
}

/**
 * A text as its reader sees it: tags gone (a block's as a space), entities read, each run of spaces one. A season split
 * by markup ("musim <strong>panas</strong>"), a line break or an entity ("musim&#32;panas") is still named (Astra's read).
 */
const rendered = (text: string) => parse(text.replace(/<\/?(?:p|li|ul|ol|h[1-6]|div|br|tr|td|th|table|blockquote)\b[^>]*>/gi, ' ')).text.replace(/\s+/g, ' ')

/** The seasons a text names that none of its language's reader's countries has, as the text gives them, each once. */
export function foreignSeasons(text: string, lang: WrittenLang): string[] {
  const has = new Set(LANG[lang].countries.flatMap(c => HAS[c] ?? []))
  const seen = rendered(text)
  const found = Object.entries(NAMED[lang] ?? {}).filter(([s]) => !has.has(s as Season)).flatMap(([, re]) => [...seen.matchAll(re!)].map(m => m[0].toLowerCase()))
  return [...new Set(found)]
}

/** A guide's copy written again first (localize-guides), at most REDO_TRIES times: `<lang>/<id>` → when, and how often. */
export type Redone = Record<string, { at: string; n: number }>
export const REDO_TRIES = 2

/**
 * The copies to write again, in order, up to `limit`. Every try counts against the limit and the copy's REDO_TRIES, one
 * that failed or still names a season too, so a copy its writer can't mend is tried twice and then waits for a person
 * (Astra's read: a failed try counted for neither, and every listed copy could be tried, every run). A usage limit
 * (`stop`) ends the run, and that try isn't counted.
 */
export async function redoCopies(ids: readonly string[], lang: WrittenLang, redone: Redone, o: { limit: number; write: (id: string) => Promise<object>; save: (r: Redone) => Promise<void>; stop: (e: unknown) => boolean; log?: (line: object) => void; now?: () => Date }): Promise<{ made: number; stopped?: string }> {
  let made = 0
  for (const id of ids) {
    if (made >= o.limit) break
    let r: object
    try {
      r = await o.write(id)
    } catch (e) {
      const message = (e as Error).message.slice(0, 200)
      if (o.stop(e)) { o.log?.({ id, stopped: message, again: true }); return { made, stopped: message } }
      r = { id, failed: message }
    }
    o.log?.({ ...r, again: true })
    made++
    const key = `${lang}/${id}`
    redone[key] = { at: (o.now?.() ?? new Date()).toISOString(), n: (redone[key]?.n ?? 0) + 1 }
    await o.save(redone)
  }
  return { made }
}

/**
 * The copies in `lang` to write again before any new one: those that name a season their readers don't have, and those
 * whose reader-fit reading of the text they have now finds advice for a reader elsewhere. Each at most REDO_TRIES times
 * (engine-state/_guide-copy-redo.json), so a copy its writer can't mend waits for a person.
 */
export function copiesToRedo(pages: readonly Page[], lang: WrittenLang, fit: FitState, redone: Redone): string[] {
  return pages
    .filter(p => p.kind === 'guides' && p.lang === lang && (redone[`${lang}/${p.id}`]?.n ?? 0) < REDO_TRIES)
    .filter(p => {
      const text = [p.title, ...p.fields.map(f => f.html), ...p.lines.map(l => l.text)].join('\n')
      if (foreignSeasons(text, lang).length) return true
      const e = fit[fitKey(p)]
      return !!e && e.hash === fitText(p).hash && e.findings.some(f => f.check === 'elsewhere')
    })
    .map(p => p.id)
    .sort()
}
