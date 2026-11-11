/**
 * The watermark screen's record of one photo (engine-state/_photo-watermarks.json, by URL): the text macOS Vision read on
 * it, then the model's verdict once it has looked.
 */
export type PhotoScreenEntry = { ocr: { t: string; c: number }[]; watermark?: boolean }

const MARK = /©|\(c\)|copyright|www\.|https?:|\.(com|net|org|de|co|vn|th|id|uk)\b/i

/**
 * The intake rule: text on a photo worth a model's look. A credit sign or a web address always; otherwise a line Vision
 * is sure of with at least 3 letters or digits (fish scales and plant stems read as stray "I", "ll" or "W").
 */
export function ocrHit(lines: { t: string; c: number }[]): boolean {
  return lines.some(l => MARK.test(l.t) || (l.c >= 0.5 && (l.t.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 3))
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
