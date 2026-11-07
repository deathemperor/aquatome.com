import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TranslationSchema, type Translation } from '@aq/schema'
import { doseProblems, guideText, mentions, PRODUCTS, PROBLEMS, REMEDIES, type Cited, type Ref } from './market'

/**
 * Notes for local readers, written from the market table by code: no model writes one. Treatments only: a fertilizer or
 * mineral named in passing doesn't earn a note first in the guide, and the content rule keeps listing those. For the same
 * reason a treatment has to be named `MIN_MENTIONS` times.
 */
export const MIN_MENTIONS = 2

const TREATMENTS = PRODUCTS.filter(p => p.kind === 'treatment' && p.market.vi?.status === 'hard')
const count = (re: RegExp, text: string) => text.match(new RegExp(re.source, re.flags))?.length ?? 0
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} và ${xs.at(-1)}`)

/** The treatments a guide names enough to need a note, and how often. */
const named = (text: string) => {
  const found = TREATMENTS.map(p => ({ p, n: mentions(p, text) })).filter(x => x.n > 0)
  return found.some(x => x.n >= MIN_MENTIONS) ? found : []
}

export type BuiltNote = { html: string; refs: Ref[]; cited: Cited[] }

/**
 * A guide's note, from its text (`guideText`), or null when it needs none. Each remedy shows only for a problem the guide
 * is about and its source names; a guide with a remedy's dose already gets a line saying so. `titleOf`: a guide's title.
 */
export function buildNote(text: string, titleOf: (id: string) => string | undefined): BuiltNote | null {
  const products = named(text)
  if (!products.length) return null
  const wanted = new Set(products.flatMap(({ p }) => p.problems ?? []).filter(id => count(PROBLEMS[id].names, text) >= PROBLEMS[id].min))
  const shown = (REMEDIES.vi ?? []).map(r => ({ r, uses: r.uses.filter(u => wanted.has(u.problem)) })).filter(x => x.uses.length)
  const names = products.map(({ p }) => p.name)

  const only = shown.length === 1 && shown[0]!.uses.length === 1 ? shown[0]! : undefined
  const heading = only ? `${PROBLEMS[only.uses[0]!.problem].heading} bằng ${only.r.name}`
    : shown.length ? `có thể dùng ${list(shown.map(x => x.r.name))}`
    : `${list(names)} là thuốc gì`
  const hasIngredient = products.some(({ p }) => p.market.vi?.ingredient)
  const parts = [
    `<h3>Ở Việt Nam: ${heading}</h3>`,
    `<p>Bài này dựa trên nguồn dành cho người chơi ở nước ngoài nên phần dưới nhắc tới thuốc ${list(names)}. Mục này do AquaTome thêm cho bạn đọc ở Việt Nam, không có trong nguồn đó. Hoạt chất, liều và cách làm lấy từ các nguồn ở cuối bài.</p>`,
    `<p>${products.map(({ p }) => p.market.vi?.says).join(' ')}${hasIngredient ? ' Mục này không ghi liều cho các chất trên và không khuyên mua riêng hay dùng thuốc của người.' : ''}</p>`,
  ]
  const cited: Cited[] = []
  const refs: Ref[] = products.flatMap(({ p }) => [p.ingredient.ref])
  if (products.some(({ p }) => p.name === 'Maracyn')) refs.push(PRODUCTS.find(p => p.name === 'Maracyn 2')!.ingredient.ref)
  for (const { r, uses } of shown) {
    const lead = `<strong>${r.name[0]!.toUpperCase()}${r.name.slice(1)}.</strong> ${r.lead.text}`
    refs.push(...r.lead.refs)
    if (r.carried.test(text)) {
      parts.push(`<p>${lead} Liều, cách làm và rủi ro có ở phần dưới của bài.</p>`)
      continue
    }
    cited.push(...uses, ...(r.how ? [r.how] : []))
    refs.push(...r.refs, ...uses.flatMap(u => u.refs ?? []))
    parts.push(`<p>${lead}</p>`, uses.length > 1 ? `<ul>${uses.map(u => `<li>${u.text}</li>`).join('')}</ul>` : `<p>${uses[0]!.text}</p>`)
    const title = r.more ? titleOf(r.more) : undefined
    const how = [r.how?.text, title ? `Các mức muối khác và cách rút muối ra khỏi bể có trong bài "${escape(title)}".` : undefined].filter(Boolean).join(' ')
    if (how) parts.push(`<p>${how}</p>`)
    if (r.risks) parts.push(`<p><strong>Rủi ro.</strong> ${r.risks}</p>`)
  }
  return { html: parts.join(''), refs: [...new Map(refs.map(x => [x.url, x])).values()], cited }
}

/** The sentences of a note with a figure the table doesn't hold to a source or a shop's page. */
export function figuresOutsideTable(html: string): string[] {
  const held = (REMEDIES.vi ?? []).flatMap(r => [...r.lead.figures, ...r.uses.flatMap(u => u.words), ...(r.how?.words ?? [])]).map(w => w.toLowerCase()).sort((a, b) => b.length - a.length)
  const plain = held.reduce((s, w) => s.replaceAll(w, ''), html.replace(/<[^>]+>/g, ' ').toLowerCase())
  return plain.match(/[^.]*\d[^.]*/g)?.map(s => s.trim()) ?? []
}

/**
 * A note on `limit` guides that lack one, the guides that name these products most first. Only `localNote` changes in a
 * guide's file. A guide whose note needs a figure its source no longer carries (a rewrite changed the words) is left, and
 * said: the content rule keeps listing it. The guides' changes are the cycle's to publish.
 */
export async function localNotes(root: string, o: { limit: number }): Promise<{ written: string[]; skipped: { id: string; why: string }[] }> {
  const dir = join(root, 'content/guides')
  const ids = (await readdir(dir).catch(() => [] as string[])).sort()
  const titles = new Map<string, string>()
  const due: { id: string; file: string; raw: string; t: Translation; text: string; n: number }[] = []
  for (const id of ids) {
    const file = join(dir, id, 'vi.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw) continue
    const t = JSON.parse(raw) as Translation
    titles.set(id, t.name)
    if (t.localNote) continue
    const text = guideText(t)
    const found = named(text)
    if (found.length) due.push({ id, file, raw, t, text, n: found.reduce((sum, x) => sum + x.n, 0) })
  }
  due.sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))
  const gone = await doseProblems(root)
  const written: string[] = []
  const skipped: { id: string; why: string }[] = []
  for (const g of due) {
    if (written.length >= o.limit) break
    const note = buildNote(g.text, id => titles.get(id))
    if (!note) continue
    const problems = gone.filter(p => note.cited.some(c => c.text === p.text))
    if (problems.length) { skipped.push({ id: g.id, why: problems.map(p => p.problem).join('; ') }); continue }
    const next = { ...g.t, localNote: { html: note.html, refs: note.refs } }
    TranslationSchema.parse(next)
    await writeFile(g.file, `${JSON.stringify(next, null, g.raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
    written.push(g.id)
  }
  return { written, skipped }
}
