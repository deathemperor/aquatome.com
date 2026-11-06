import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { plainText, QUALITY_THRESHOLD, SECTION_ORDER, type PlantEntity, type Translation } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { logReviews, type Review } from './review-log'
import { sanitizeHtml } from './sanitize'
import { isShop, withoutShopTalk } from './species-sources'

const WRITE = readFileSync(new URL('./prompts/planting.md', import.meta.url), 'utf8')
const STYLE = readFileSync(new URL('./prompts/vi-style.md', import.meta.url), 'utf8')
const CHECK = `A short Vietnamese passage on where to place and how to plant an aquarium plant, for a hobbyists' handbook, and the INPUT it was written from (the plant's figures, its page's text, guides written from videos).
Score 0–1: 1.0 = every statement is in the INPUT (its "vị trí" figure counts), nothing added, natural Vietnamese a hobbyist would write; 0.75 = small wording issues, facts intact; below 0.75 = a planting method, number, caution or advice the INPUT doesn't give, a parent species' size or colour given as this plant's, a guide's or video's mention, or Vietnamese that reads as a translation.
notes: up to 6 short, concrete problems (in English), quoting the phrase. Empty if none.`
const WRITE_SCHEMA = { type: 'object', required: ['html'], properties: { html: { type: 'string' } } }
const CHECK_SCHEMA = { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } }
/** AquaTome's own text is credited to its about page, as its own photos are (own-photos.ts). */
export const ABOUT = 'https://aquatome.com/vi/gioi-thieu/'

/**
 * Words that say where or how a plant is planted ("vùi", "buộc lên lũa", "trồng xuống nền", "thả nổi"), in its
 * Vietnamese text: a plant page with one has its planting already.
 */
export const PLANTING = /(?<!\p{L})(?:vùi|buộc|gắn|cột|dán|cắm|thả nổi|ghim|kẹp|nhét|trồng (?:cây )?(?:xuống|vào|trên|trong|ở) (?:nền|sỏi|cát|đất)|trồng (?:lên|vào) (?:lũa|đá)|bám (?:lên|vào|trên) (?:lũa|đá))(?!\p{L})/iu

const PLACE: Record<PlantEntity['placement'][number], string> = { foreground: 'tiền cảnh', midground: 'trung cảnh', background: 'hậu cảnh', epiphyte: 'sống bám trên lũa, đá', floating: 'thả nổi' }
const LIGHT = { low: 'thấp', medium: 'vừa', high: 'cao' }
const CO2 = { none: 'không cần', optional: 'có thì tốt hơn', required: 'cần' }
const GROWTH = { slow: 'chậm', medium: 'vừa', fast: 'nhanh' }
const own = (t: Translation) => Object.entries(t.sections).filter(([k]) => !k.startsWith('references'))

type Plant = { id: string; e: PlantEntity; t: Translation; raw: { e: string; t: string } }
/**
 * Plants whose text says nothing on where or how to plant them and that have no AquaTome text yet, the thinnest first
 * (Anubias nana: its quick facts alone).
 */
export async function plantsWithoutPlanting(content: string): Promise<Plant[]> {
  const out: (Plant & { chars: number })[] = []
  for (const id of (await readdir(join(content, 'plants')).catch(() => [] as string[])).sort()) {
    const e = await readFile(join(content, 'plants', id, 'entity.json'), 'utf8').catch(() => null)
    const t = await readFile(join(content, 'plants', id, 'vi.json'), 'utf8').catch(() => null)
    if (!e || !t) continue
    const p = { id, e: JSON.parse(e) as PlantEntity, t: JSON.parse(t) as Translation, raw: { e, t } }
    const text = own(p.t).map(([, h]) => plainText(h)).join(' ')
    if (p.e.sections.some(s => s.source === 'aquatome') || PLANTING.test(text)) continue
    out.push({ ...p, chars: text.length })
  }
  return out.sort((a, b) => a.chars - b.chars || a.id.localeCompare(b.id))
}

/** The video guides that cover a plant, or the species it is a form of (anubias-barteri for anubias-barteri-nana): exact ones first. */
async function videoGuides(content: string, id: string, max = 3): Promise<{ name: string; text: string }[]> {
  const found: { exact: boolean; name: string; text: string }[] = []
  for (const g of (await readdir(join(content, 'guides')).catch(() => [] as string[])).sort()) {
    const e = JSON.parse(await readFile(join(content, 'guides', g, 'entity.json'), 'utf8').catch(() => '{}')) as { source?: string; mentions?: string[] }
    const m = e.source === 'youtube' ? e.mentions?.find(x => x === id || id.startsWith(`${x}-`)) : undefined
    if (!m) continue
    const t = JSON.parse(await readFile(join(content, 'guides', g, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string; body?: string }
    if (t.body) found.push({ exact: m === id, name: t.name ?? g, text: plainText(t.body).slice(0, 6000) })
  }
  return found.sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, max)
}

function input(p: Plant, guides: { name: string; text: string }[]): string {
  const { e, t } = p
  return [
    `CÂY: ${t.name} (${e.scientificName})`,
    `THÔNG SỐ: vị trí: ${e.placement.map(x => PLACE[x]).join(', ') || 'không ghi'}; ánh sáng: ${LIGHT[e.light]}; CO2: ${CO2[e.co2]}; tốc độ mọc: ${GROWTH[e.growth]}`,
    // A shop's own talk ("chuẩn bị sẵn môi trường sống trước khi mua") isn't for the writer, though the sweep hasn't taken it off yet.
    'CHỮ TRÊN TRANG:', ...own(t).map(([k, h]) => {
      const s = e.sections.find(x => `${x.key}:${x.source}` === k)
      return `[${k}] ${plainText(s && isShop(s.source) ? withoutShopTalk(s.html, { vi: h }).tr.vi : h)}`
    }),
    ...(guides.length ? ['BÀI HƯỚNG DẪN TỪ VIDEO:', ...guides.map(g => `[${g.name}] ${g.text}`)] : []),
  ].join('\n')
}

export type PlantingReport = { written: string[]; none: string[]; low: string[]; failed: string[]; stopped: string }
type Tried = Record<string, { at: string; score?: number; kept: boolean; notes?: string[] }>

/**
 * A short "where it goes and how to plant it" for plant pages without one (plantsWithoutPlanting), `limit` plants a run:
 * written from the page's own figures and text and the video guides that cover the plant (prompts/planting.md, in the
 * style of prompts/vi-style.md), reviewed against them, written once more with the notes when under the bar, and kept
 * only at the bar. It joins "Chăm sóc ra sao?" first, as AquaTome's own text (in Indonesian and Thai through the
 * localize step, as the plant's date changes). Each plant is tried once (engine-state/_planting.json; `redo` again).
 */
export async function writePlanting(root: string, llm: Llm, o: { limit?: number; only?: string[]; redo?: boolean; model?: string; now?: () => Date } = {}): Promise<PlantingReport> {
  const content = join(root, 'content')
  const triedFile = join(root, 'engine-state', '_planting.json')
  const tried = JSON.parse(await readFile(triedFile, 'utf8').catch(() => '{}')) as Tried
  const today = (o.now?.() ?? new Date()).toISOString().slice(0, 10)
  const report: PlantingReport = { written: [], none: [], low: [], failed: [], stopped: '' }
  const todo = (await plantsWithoutPlanting(content)).filter(p => (o.only ? o.only.includes(p.id) : o.redo || !tried[p.id])).slice(0, o.limit ?? 5)
  const write = (p: Plant, src: string, notes: string[]) => llm<{ html: string }>({
    system: 'You write Vietnamese for an aquarium handbook. Reply only with JSON.', schema: WRITE_SCHEMA, model: o.model,
    prompt: [WRITE, STYLE, ...(notes.length ? [`Bản trước bị người duyệt chấm thấp. Sửa theo các ghi chú sau:\n${notes.map(n => `- ${n}`).join('\n')}`] : []), `--- ĐẦU VÀO ---\n${src}`].join('\n\n'),
  // A draft that says nothing on how it's planted (its place and height alone, which the data card has) is none.
  }).then(r => sanitizeHtml(r.html ?? '').trim()).then(h => (PLANTING.test(plainText(h)) ? h : ''))
  const check = async (src: string, html: string): Promise<Review> => {
    const r = await llm<Review>({ system: 'You check a passage against its input. Reply only with JSON.', schema: CHECK_SCHEMA, model: o.model, prompt: `${CHECK}\n\nINPUT:\n${src}\n\nPASSAGE:\n${html}` })
    return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: (r.notes ?? []).slice(0, 6) }
  }
  for (const p of todo) {
    try {
      const src = input(p, await videoGuides(content, p.id))
      const drafts: string[] = []
      const tries: Review[] = []
      drafts.push(await write(p, src, []))
      if (!plainText(drafts[0]!)) { report.none.push(p.id); tried[p.id] = { at: today, kept: false }; continue }
      tries.push(await check(src, drafts[0]!))
      if (tries[0]!.score < QUALITY_THRESHOLD) {
        const again = await write(p, src, tries[0]!.notes)
        if (plainText(again)) { drafts.push(again); tries.push(await check(src, again)) }
      }
      const best = tries.reduce((b, r, i) => (r.score > tries[b]!.score ? i : b), 0)
      const kept = tries[best]!.score >= QUALITY_THRESHOLD
      await logReviews(root, 'planting', { id: `plants/${p.id}`, lang: 'vi' }, tries, kept ? tries[best] : undefined, { model: o.model, ...(o.now ? { now: o.now() } : {}) })
      tried[p.id] = { at: today, score: tries[best]!.score, kept, ...(kept ? {} : { notes: tries[best]!.notes }) }
      if (!kept) { report.low.push(`${p.id} (${tries[best]!.score.toFixed(2)}): ${tries[best]!.notes.slice(0, 2).join('; ')}`); continue }
      // First under "Chăm sóc ra sao?", before the sources' care text.
      const at = p.e.sections.findIndex(s => SECTION_ORDER.indexOf(s.key) >= SECTION_ORDER.indexOf('maintenance'))
      const sections = [...p.e.sections]
      sections.splice(at < 0 ? sections.length : at, 0, { key: 'maintenance', source: 'aquatome', sourceUrl: ABOUT, html: drafts[best]! })
      const indent = (raw: string) => raw.match(/^\{\n( +)/)?.[1]?.length ?? 2
      await writeFile(join(content, 'plants', p.id, 'entity.json'), `${JSON.stringify({ ...p.e, sections, updatedAt: today }, null, indent(p.raw.e))}\n`)
      await writeFile(join(content, 'plants', p.id, 'vi.json'), `${JSON.stringify({ ...p.t, sections: { ...p.t.sections, 'maintenance:aquatome': drafts[best]! } }, null, indent(p.raw.t))}\n`)
      report.written.push(`${p.id} (${tries[best]!.score.toFixed(2)})`)
    } catch (e) {
      if (e instanceof LlmError) { report.stopped = `${p.id}: ${e.message}`; break }
      report.failed.push(`${p.id}: ${(e as Error).message.slice(0, 200)}`)
    } finally {
      await mkdir(join(root, 'engine-state'), { recursive: true })
      await writeFile(triedFile, `${JSON.stringify(Object.fromEntries(Object.entries(tried).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
    }
  }
  return report
}
