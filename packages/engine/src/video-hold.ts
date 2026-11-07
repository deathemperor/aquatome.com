import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WRITTEN_LANGS } from '@aq/schema/langs'
import { guideRisks } from './video-order'

/**
 * A video guide held out of the chat (its search and read_page; the site's build reads the mark) until it passes the
 * stricter reviewer: `quality.chat: false` in each of the guide's language files, absent when the guide is fine. Every
 * writer of these files keeps it. `pnpm engine video-hold` sets it on a class of guides (guideRisk's groups, or all) or
 * clears it. It goes by itself when the version on the site gets a review at or above the bar: a recheck of the guide as
 * it is (review-backfill.ts), or the review of a version the video writer wrote (youtube.ts: the redo, or the video job's
 * retry of a failed one). A new version still under the bar stays held.
 */
export const HOLD_CLASSES = ['risk1', 'risk2', 'risk3', 'all'] as const
export type HoldClass = (typeof HOLD_CLASSES)[number]

/** Holds a guide (`youtube-<id>`) or lets it back, in every language file it has. Whether a file changed. */
export async function setHold(contentRoot: string, id: string, held: boolean): Promise<boolean> {
  let changed = false
  for (const lang of WRITTEN_LANGS) {
    const file = join(contentRoot, 'guides', id, `${lang}.json`)
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw) continue
    const t = JSON.parse(raw) as { quality?: { chat?: false } }
    if (!t.quality || (t.quality.chat === false) === held) continue
    const { chat: _, ...rest } = t.quality
    t.quality = held ? { ...rest, chat: false } : rest
    await writeFile(file, `${JSON.stringify(t, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
    changed = true
  }
  return changed
}

/** Holds every guide of a class (or lets them back): the guides that changed. */
export async function holdGuides(root: string, cls: HoldClass, clear = false): Promise<string[]> {
  const out: string[] = []
  for (const g of await guideRisks(root)) if ((cls === 'all' || cls === `risk${g.risk}`) && await setHold(join(root, 'content'), g.id, !clear)) out.push(g.id)
  return out
}
