/**
 * The public screen record keeps measurements and a fingerprint, never the lettering itself.
 * Legacy lines are readable during the engine-owned migration, but are never written again.
 */
export type OcrSummary = { c: number; at?: string; alnum: number; mark: boolean; hash: string }
export type LegacyOcrLine = { t: string; c: number; at?: string }
export type PhotoScreenEntry = { ocr: (OcrSummary | LegacyOcrLine)[]; watermark?: boolean }

const MARK = /©|\(c\)|copyright|www\.|https?:|\.(com|net|org|de|co|vn|th|id|uk)\b/i

/**
 * The intake rule: text on a photo worth a model's look. A credit sign or a web address always; otherwise a line Vision
 * is sure of with at least 3 letters or digits (fish scales and plant stems read as stray "I", "ll" or "W").
 */
export const validOcrSummary = (x: unknown): x is OcrSummary => {
  const l=x as OcrSummary|undefined
  return !!l && Number.isFinite(l.c) && l.c>=0 && l.c<=1 && Number.isSafeInteger(l.alnum) && l.alnum>=0
    && typeof l.mark==='boolean' && typeof l.hash==='string' && /^[a-f0-9]{64}$/.test(l.hash)
    && (l.at===undefined || /^(?:(?:top|middle|bottom) (?:left|centre|right)|unknown)$/.test(l.at))
}
export function ocrHit(lines: (OcrSummary | LegacyOcrLine)[]): boolean {
  if(!Array.isArray(lines))return true
  return lines.some(l => {
    if(l && 't' in l && typeof l.t==='string')return MARK.test(l.t) || (l.c>=0.5 && (l.t.match(/[\p{L}\p{N}]/gu)?.length??0)>=3)
    return !validOcrSummary(l) || l.mark || (l.c>=0.5 && l.alnum>=3)
  })
}

/**
 * R2 folders (sources) whose photos all go to the model, text read or not: the 2026-10-31 scan found marks on 15–96% of
 * their photos, some a logo with no letters or a signature too faint for Vision.
 */
export const LOGO_FOLDERS = ['glaser', 'seriouslyfish', 'bwaquatics', 'scotcat', 'panitvong']
export const logoFolder = (url: string) => LOGO_FOLDERS.some(f => url.includes(`/${f}/`))

/**
 * Whether the watermark screen still owes this photo a look: Vision has not read it, or it has text on it or comes from
 * a logo source and the model has not judged it. Such a photo waits: a public build does not show it (load.ts), and it
 * shows by itself once the screen has judged it clean. Until 2026-11-11 it showed while it waited, and on that day the
 * model ran out of quota: 36 photos reached pages with no look, 24 of them with text the reader had found (the chief of
 * staff).
 */
export const awaitsScreen = (url: string, entry: PhotoScreenEntry | undefined): boolean =>
  !entry || (entry.watermark === undefined && (ocrHit(entry.ocr) || logoFolder(url)))
