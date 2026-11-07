import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GuideEntity, Translation } from '@aq/schema'

/** Whole words only: JavaScript's \b counts "ả" as a break, so "ph" would match "phải". */
const words = (ws: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${ws.join('|')})(?![\\p{L}\\p{N}])`, 'giu')
const MEDICINE = words(['thuốc', 'liều', 'liều lượng', 'điều trị', 'chữa bệnh', 'chữa trị', 'trị bệnh', 'bệnh', 'kháng sinh', 'ký sinh', 'nấm bệnh', 'cá bị nấm', 'hóa chất', 'formalin', 'xanh methylen', 'methylene blue', 'malachite', 'praziquantel', 'metronidazole?', 'kanamycin', 'levamisole?', 'fenbendazole?', 'oxy già', 'hydrogen peroxide', 'h2o2', 'glutaraldehyde', 'thuốc tím', 'kmno4', 'đồng sunfat', 'medication', 'medicine', 'treatment', 'dose', 'dosing', 'disease'])
const WATER = words(['ph', 'amoni', 'amoniac', 'ammonia', 'nh3', 'nh4', 'nitrit', 'nitrite', 'no2', 'nitrat', 'nitrate', 'no3', 'kh', 'gh', 'độ cứng', 'co2', 'clo', 'chlorine', 'chloramine', 'thay nước', 'water change', 'nhiệt độ', 'temperature', '°c', 'chu trình nitơ', 'cycling', 'thông số nước', 'tds'])

/**
 * How much a video guide can hurt a fish when it is wrong, so the riskiest are checked again first (video-recheck.sh):
 * 1 medicine, doses, chemicals and treatments; 2 water (pH, ammonia, nitrite, nitrate, KH/GH, CO2, chlorine, water
 * changes, temperature); 3 the rest. A guide is in a group when its title (the guide's or the video's) names one of the
 * group's words, or its text does often: 4 times for medicine, 6 for water. 2026-11-07: 70, 170 and 256 of 496 guides.
 */
export function guideRisk(title: string, text: string): 1 | 2 | 3 {
  const n = (re: RegExp, s: string) => s.match(re)?.length ?? 0
  if (n(MEDICINE, title) || n(MEDICINE, text) >= 4) return 1
  if (n(WATER, title) || n(WATER, text) >= 6) return 2
  return 3
}

/** Before any other (2026-11-07): the chat repeats this guide's unhedged "90% of hair algae is from too little CO2". */
export const RECHECK_FIRST = ['youtube-5uUPuLt0j2s']

const json = async <T>(f: string): Promise<T | undefined> => { try { return JSON.parse(await readFile(f, 'utf8')) as T } catch { return undefined } }

/**
 * Each video guide's place when guides are checked again, by its id (`youtube-<id>`), to compare with byRank: the ones in
 * RECHECK_FIRST, then by risk (guideRisk), then by traffic: the guide's most popular species in `popular` (the engine's
 * popularityOrder), a guide about none of them after those.
 */
export async function guideRank(root: string, popular: string[]): Promise<(id: string) => number[]> {
  const at = new Map(popular.map((id, i) => [id, i]))
  const ranks = new Map<string, number[]>()
  const dir = join(root, 'content/guides')
  for (const id of (await readdir(dir).catch(() => [] as string[])).filter(d => d.startsWith('youtube-'))) {
    const e = await json<GuideEntity>(join(dir, id, 'entity.json'))
    const vi = await json<Translation>(join(dir, id, 'vi.json'))
    if (!e || !vi) continue
    const text = [vi.body ?? '', ...(vi.summary ?? []), ...(vi.faq ?? []).flatMap(f => [f.q, f.a])].join(' ').replace(/<[^>]+>/g, ' ')
    ranks.set(id, [RECHECK_FIRST.includes(id) ? 0 : 1, guideRisk(`${vi.name} ${e.video?.title ?? ''}`, text), Math.min(...(e.mentions ?? []).map(m => at.get(m) ?? Infinity))])
  }
  return id => ranks.get(id) ?? [1, 3, Infinity]
}

/** Two ranks, first place first. */
export function byRank(a: number[], b: number[]): number {
  for (const [i, x] of a.entries()) if (x !== b[i]) return x - b[i]! || 0
  return 0
}
