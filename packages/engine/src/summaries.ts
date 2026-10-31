import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { loadAll, POPULAR, resolveDataCard, slugify, STAPLE_SPECIES, SummarySchema, type DataCardField, type Localized, type Range, type SpeciesEntity, type Summary } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { nativeTo } from './localize'
import { shopIds } from './shops'

const TEMPLATE = readFileSync(new URL('./prompts/summary.md', import.meta.url), 'utf8')
const CHECK = readFileSync(new URL('./prompts/summary-check.md', import.meta.url), 'utf8')
const Output = z.object({ summary: z.string().min(20), mistakes: z.array(z.string().min(10)).max(3) })
type Draft = z.infer<typeof Output>
const jsonSchema = (o: z.ZodType) => {
  const s = z.toJSONSchema(o, { target: 'draft-07' }) as Record<string, unknown>
  delete s.$schema
  return s
}
const SCHEMA = jsonSchema(Output)
const Verdict = z.object({ pass: z.boolean(), problems: z.array(z.string()) })
const VERDICT_SCHEMA = jsonSchema(Verdict)

const dir = (contentRoot: string) => join(contentRoot, 'summaries')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

export async function readSummaries(contentRoot: string): Promise<Summary[]> {
  const files = await readdir(dir(contentRoot)).catch(() => [] as string[])
  return Promise.all(files.filter(f => f.endsWith('.json')).map(async f => SummarySchema.parse(JSON.parse(await readFile(join(dir(contentRoot), f), 'utf8')))))
}
const save = async (contentRoot: string, s: Summary) => {
  await mkdir(dir(contentRoot), { recursive: true })
  await writeFile(join(dir(contentRoot), `${s.id}.json`), `${JSON.stringify(s, null, 2)}\n`)
}

export function profile(s: Localized<SpeciesEntity>): string {
  const sections = Object.entries(s.t.sections).map(([k, html]) => `## ${k.split(':')[0]}\n${text(html)}`).join('\n\n')
  return `# ${s.t.name} (${s.scientificName})\n\n${sections}`.slice(0, 24_000)
}

/** The data card as every page shows it: one resolved value per field. */
export type Card = Partial<Record<DataCardField, Range | number>>
export const cardOf = (s: SpeciesEntity): Card =>
  Object.fromEntries(Object.entries(s.dataCard).flatMap(([k, v]) => { const r = resolveDataCard(v ?? []); return r ? [[k, r.value]] : [] }))

const vn = (n: number) => String(n).replace('.', ',')
const span = (v: Range | number) => (typeof v === 'number' ? vn(v) : v.min === v.max ? vn(v.min) : `${vn(v.min)}–${vn(v.max)}`)
const CARD_LINES: [DataCardField, string, string][] = [
  ['tempC', 'Nhiệt độ', ' °C'], ['ph', 'pH', ''], ['gh', 'Độ cứng', ' dGH'], ['sizeCm', 'Kích thước trưởng thành', ' cm'], ['tankCm', 'Bể tối thiểu (chiều dài)', ' cm'], ['difficulty', 'Độ khó', '/8 (1–3 dễ, 4–5 vừa, 6–8 khó)'],
]
export function cardBlock(card: Card): string {
  const lines = CARD_LINES.flatMap(([f, label, unit]) => (card[f] === undefined ? [] : [`- ${label}: ${span(card[f]!)}${unit}`]))
  return `THẺ DỮ LIỆU (số chuẩn của trang):\n${lines.length ? lines.join('\n') : '- (trống)'}`
}

/** What a page says, for checking numbers: its text without the reference lists (years and page numbers). */
export const pageText = (s: Localized<SpeciesEntity>) =>
  [s.t.name, s.scientificName, ...s.t.altNames, s.lNumber ?? '', ...Object.entries(s.t.sections).filter(([k]) => !k.startsWith('references')).map(([, html]) => text(html))].join('\n')

const NUM = /\d+(?:[.,]\d+)*/g
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9
/** A number as Vietnamese writes it: dots group thousands (24.000), a comma marks decimals (6,5); an English 6.5 reads as 6.5. */
const vnNum = (t: string) => (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(',', '.')))
/** The page text may also keep a source's English 24,000: both readings count as written there. */
const numberSet = (s: string) => (s.match(NUM) ?? []).flatMap(t => [vnNum(t), Number(t.replace(/,/g, ''))])
const N = String.raw`(\d+(?:[.,]\d+)?)`
const TO = String.raw`\s*(?:[–—-]|đến|tới)\s*`
/** Figures with a unit only one card field uses, and that field. */
const UNIT_FIELDS: [RegExp, DataCardField][] = [
  [new RegExp(`${N}(?:${TO}${N})?\\s*(?:°\\s*C|℃|độ\\s*C)`, 'g'), 'tempC'],
  [new RegExp(`\\bpH\\s*(?::\\s*|khoảng\\s+|từ\\s+)?${N}(?:${TO}${N})?`, 'gi'), 'ph'],
  [new RegExp(`${N}(?:${TO}${N})?\\s*dGH|\\bGH\\s*(?::\\s*|khoảng\\s+|từ\\s+)?${N}(?:${TO}${N})?`, 'g'), 'gh'],
]
const LABEL: Record<DataCardField, string> = { tempC: 'temperature', ph: 'pH', gh: 'hardness', sizeCm: 'adult size', tankCm: 'minimum tank', difficulty: 'difficulty' }
/** A length: "3,5 cm", "35 mm", "4–5 cm", or a tank's dimensions "60 × 30 cm" (its first figure is the length). */
const LENGTH = new RegExp(`${N}((?:\\s*[×x]\\s*\\d+(?:[.,]\\d+)?)+)?(?:${TO}${N})?\\s*(cm|mm)(?!\\p{L})`, 'gu')
const TANK_WORD = /(?<!\p{L})bể(?!\p{L})/gu
const SIZE_WORD = /(?<!\p{L})(?:(?<!bể\s)cá|cỡ|lớn|kích thước|đạt|trưởng thành|SL|TL)(?!\p{L})/gu
/** What a length is about, from the nearest word before it in its clause: the tank, the fish, or not said. */
function lengthOf(before: string): 'tankCm' | 'sizeCm' | undefined {
  const clause = before.slice(Math.max(...[',', ';', '.', ':', '!', '?', '(', ')', '\n'].map(c => before.lastIndexOf(c))) + 1)
  const last = (re: RegExp) => Math.max(-1, ...[...clause.matchAll(re)].map(m => m.index))
  const tank = last(TANK_WORD)
  const size = last(SIZE_WORD)
  return tank < 0 && size < 0 ? undefined : tank > size ? 'tankCm' : 'sizeCm'
}

/**
 * The check no model can talk its way past. A figure for a card field (temperature, pH, hardness, adult size, minimum
 * tank, "N/8" difficulty) must be the card's: a range the card's range, one value inside it; a field the card doesn't
 * have gets no figure. A length is the tank's after "bể" (or as dimensions, "60 × 30 cm"), the fish's after "cá" or a
 * size word ("lớn tới", "cỡ"), whichever is nearer; with neither, it must be one of the two. Every other number must be the card's or written in the page
 * text. Returns the problems found, in English, quoting the summary.
 */
export function checkNumbers(d: Draft, card: Card, source: string): string[] {
  const problems: string[] = []
  // "60 cm x 30 cm" reads as the dimensions "60 x 30 cm".
  const all = [d.summary, ...d.mistakes].join('\n').replace(/(\d)\s*cm(\s*[×x]\s*\d)/g, '$1$2')
  const range = (v: Range | number) => (typeof v === 'number' ? { min: v, max: v } : v)
  const fits = (c: Range | number, a: number, b?: number) => { const { min, max } = range(c); return b === undefined ? a >= min - 1e-9 && a <= max + 1e-9 : same(a, min) && same(b, max) }
  const judged: [number, number][] = [] // figures already settled against the card: not looked up in the text again
  const unit = (f: DataCardField) => (f === 'tempC' ? ' °C' : f === 'gh' ? ' dGH' : f === 'sizeCm' || f === 'tankCm' ? ' cm' : f === 'difficulty' ? '/8' : '')
  const judge = (fig: string, f: DataCardField, a: number, b?: number) => {
    const c = card[f]
    if (c === undefined) problems.push(`"${fig}": the card gives no ${LABEL[f]}`)
    else if (!fits(c, a, b)) problems.push(`"${fig}" is not the card's ${LABEL[f]} (${span(c)}${unit(f)})`)
  }
  for (const [re, field] of UNIT_FIELDS) {
    for (const m of all.matchAll(re)) {
      const [a, b] = m.slice(1).filter(Boolean).map(t => Number(t.replace(',', '.'))) as [number, number?]
      // One value inside the card's range must still be written on the page.
      if (b === undefined && card[field] !== undefined && fits(card[field]!, a)) continue
      judge(m[0].trim(), field, a, b)
      judged.push([m.index, m.index + m[0].length])
    }
  }
  for (const m of all.matchAll(LENGTH)) {
    const cm = (t: string) => Number(t.replace(',', '.')) / (m[4] === 'mm' ? 10 : 1)
    const fig = m[0].trim()
    if (m[2]) { // dimensions: the first is the tank's length, the others must be on the page
      judge(fig, 'tankCm', cm(m[1]!))
      judged.push([m.index, m.index + m[1]!.length])
      continue
    }
    const [a, b] = [cm(m[1]!), m[3] ? cm(m[3]) : undefined]
    const field = lengthOf(all.slice(0, m.index))
    if (field) judge(fig, field, a, b)
    else if (!(['sizeCm', 'tankCm'] as const).some(f => card[f] !== undefined && fits(card[f]!, a, b))) {
      problems.push(`"${fig}" is neither the card's adult size (${card.sizeCm === undefined ? 'none' : `${span(card.sizeCm)} cm`}) nor its minimum tank (${card.tankCm === undefined ? 'none' : `${span(card.tankCm)} cm`})`)
    }
    judged.push([m.index, m.index + m[0].length])
  }
  for (const m of all.matchAll(/(\d+)\s*\/\s*8\b/g)) {
    judge(m[0], 'difficulty', Number(m[1]))
    judged.push([m.index, m.index + m[0].length])
  }
  const rest = judged.reduce((t, [a, b]) => t.slice(0, a) + ' '.repeat(b - a) + t.slice(b), all)
  const known = [...numberSet(source), ...Object.values(card).flatMap(v => { const { min, max } = range(v); return [min, max] })]
  for (const tok of new Set(rest.match(NUM) ?? [])) {
    if (!known.some(k => same(vnNum(tok), k))) problems.push(`the number "${tok}" is in neither the page text nor the data card`)
  }
  return problems
}

/**
 * Species in the order summaries are written: those Vietnamese readers look for first (the staples the home page leads
 * with, what Vietnam's fish shops sell, the most-kept fish, Vietnam's own fish), then the best-written pages.
 */
export async function summaryOrder(root: string, species: Localized<SpeciesEntity>[]): Promise<Localized<SpeciesEntity>[]> {
  const first = [...new Set([...STAPLE_SPECIES, ...await shopIds(root, ['vi']), ...POPULAR.map(slugify), ...await nativeTo(root, 'vietnam')])]
  const rank = (s: Localized<SpeciesEntity>) => { const i = first.indexOf(s.id); return i < 0 ? first.length : i }
  return [...species].sort((a, b) => rank(a) - rank(b) || b.t.quality.score - a.t.quality.score || a.id.localeCompare(b.id))
}

export type SummaryReport = { approved: string[]; pending: { id: string; problems: string[] }[]; failed: string[]; stopped: string }

/**
 * Summaries for every published species that has none, or whose page changed since. Each draft is checked against the
 * page: the numbers by `checkNumbers`, then every claim by a second model call. A draft with problems is written once
 * more with them as notes and checked again. Passing drafts are approved (the site shows them); the rest stay pending
 * with their problems, for a person. At most `top` species a run, `jobs` at a time; a failed model call (usage limit)
 * stops the run, and species it didn't finish are done next time. `only`: just these species, done again whatever their
 * state (a card fixed without the page changing).
 */
export async function draftSummaries(contentRoot: string, llm: Llm, opts: { top: number; now: () => Date; publicBuild?: boolean; jobs?: number; only?: string[] }): Promise<SummaryReport> {
  const c = await loadAll({ root: contentRoot, lang: 'vi', publicBuild: opts.publicBuild ?? true })
  const have = new Map((await readSummaries(contentRoot)).map(s => [s.id, s]))
  const stale = (s: Localized<SpeciesEntity>) => { const h = have.get(s.id); return !h || h.speciesUpdatedAt !== s.updatedAt || (h.review === 'pending' && !h.problems) }
  const todo = (await summaryOrder(dirname(contentRoot), c.species)).filter(s => (opts.only ? opts.only.includes(s.id) : stale(s))).slice(0, opts.top)
  const report: SummaryReport = { approved: [], pending: [], failed: [], stopped: '' }

  const one = async (s: Localized<SpeciesEntity>) => {
    const card = cardOf(s)
    const input = `${cardBlock(card)}\n\n${profile(s)}`
    const write = async (notes?: { draft: Draft; problems: string[] }) => {
      const redo = notes ? `\n\n---\n\nBẢN TRƯỚC (bị trả lại):\n${JSON.stringify(notes.draft)}\n\nLỗi phải sửa:\n${notes.problems.map(p => `- ${p}`).join('\n')}\n\nViết lại: sửa hoặc bỏ từng chỗ sai, không thêm gì mới.` : ''
      return Output.parse(await llm({ system: 'Reply only with JSON.', prompt: `${TEMPLATE}\n\n---\n\n${input}${redo}`, schema: SCHEMA }))
    }
    const check = async (d: Draft) => {
      const numbers = checkNumbers(d, card, pageText(s))
      if (numbers.length) return numbers // no claim check for a draft that is going back anyway
      const v = Verdict.parse(await llm({ system: 'You are a strict fact checker. Reply only with JSON.', prompt: `${CHECK}\n\n---\n\nDATA CARD AND PAGE TEXT:\n${input}\n\n---\n\nSUMMARY:\n${JSON.stringify(d, null, 2)}`, schema: VERDICT_SCHEMA }))
      return v.pass && !v.problems.length ? [] : v.problems.length ? v.problems : ['the checker failed it without saying why']
    }
    let draft = await write()
    let problems = await check(draft)
    if (problems.length) { draft = await write({ draft, problems }); problems = await check(draft) }
    const base = { id: s.id, ...draft, speciesUpdatedAt: s.updatedAt, generatedAt: opts.now().toISOString() }
    if (problems.length) { await save(contentRoot, { ...base, review: 'pending', problems }); report.pending.push({ id: s.id, problems }) }
    else { await save(contentRoot, { ...base, review: 'approved' }); report.approved.push(s.id) }
  }

  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, opts.jobs ?? 1) }, async () => {
    while (next < todo.length && !report.stopped) {
      const s = todo[next++]!
      try { await one(s) } catch (e) {
        if (e instanceof LlmError) report.stopped = `${s.id}: ${e.message}`
        else { report.failed.push(s.id); console.warn(`summary failed: ${s.id}: ${(e as Error).message.slice(0, 200)}`) }
      }
    }
  }))
  return report
}

/** Markdown for the owner: every summary the check left pending, with its problems, to correct and approve in chat. */
export async function reviewDoc(contentRoot: string, publicBuild = true): Promise<string> {
  const c = await loadAll({ root: contentRoot, lang: 'vi', publicBuild })
  const name = new Map(c.species.map(s => [s.id, `${s.t.name} (${s.scientificName})`]))
  const pending = (await readSummaries(contentRoot)).filter(s => s.review === 'pending').sort((a, b) => a.id.localeCompare(b.id))
  return [`# Tóm tắt chờ duyệt (${pending.length})`, '', 'Bản qua kiểm tra tự động (số khớp thẻ dữ liệu, mọi ý có trong hồ sơ) đã được duyệt. Dưới đây là bản chưa qua, kèm lỗi kiểm tra tìm thấy.', '',
    'Duyệt: `pnpm engine summaries approve <id,id|all>`. Sửa: chỉnh `content/summaries/<id>.json` rồi duyệt.', '',
    ...pending.flatMap(s => [`## ${name.get(s.id) ?? s.id}`, `id: \`${s.id}\``, '', s.summary, '', ...s.mistakes.map(m => `- ${m}`), '',
      ...(s.problems?.length ? ['Kiểm tra:', ...s.problems.map(p => `- ${p}`), ''] : [])])].join('\n')
}

/** Approve pending summaries by hand (the owner's corrections); the check's problems go with the pending state. */
export async function approveSummaries(contentRoot: string, ids: string[] | 'all'): Promise<string[]> {
  const done: string[] = []
  for (const { problems: _, ...s } of await readSummaries(contentRoot)) {
    if (s.review === 'pending' && (ids === 'all' || ids.includes(s.id))) { await save(contentRoot, { ...s, review: 'approved' }); done.push(s.id) }
  }
  return done
}
