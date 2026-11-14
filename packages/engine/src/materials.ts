import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MATERIAL_SECTION_ORDER, MaterialSchema, metricPage, QUALITY_THRESHOLD, TranslationSchema, type MaterialEntity } from '@aq/schema'
import { TextNode } from 'node-html-parser'
import type { Llm } from './claude'
import { VI_STYLE as STYLE } from './phrases'
import { steadyRead } from './quality'
import { isMarketplace } from './marketplaces'
import { piece } from './pieces'
import { logReviews, type Review } from './review-log'
import { sanitizeHtml } from './sanitize'

/**
 * A hobby material's page (content/materials/<id>/: lũa, đá, nền, lá khô), written in Vietnamese from web research and
 * checked against it, as a topic guide is (topics.ts). Its id, address, name, other names and kind are given here, never a
 * model's choice: a name is one a source writes (the Writing Lead's naming rule), and the writer is told to use them.
 */
export type MaterialAsk = {
  id: string; kind: MaterialEntity['kind']; parent?: string; slug: string; name: string
  /** Names Vietnamese shops and keepers write, most-written first: the page's other names, two at most on its card. */
  altNames: string[]
  /** Names in other languages a source ties to it (the entity's `names`). */
  names: string[]
  /** What to research, in English. */
  ask: string
  /** Pages that sell or describe it, for the research to start from. */
  leads?: string[]
}

/** The pilot's two pages (the Site Lead's materials kind, 13 Nov 2026): the driftwood overview and one kind of it. */
export const MATERIALS: MaterialAsk[] = [
  {
    id: 'lua', kind: 'wood', slug: 'lua', name: 'Lũa', altNames: [], names: ['Driftwood'],
    ask: 'driftwood for aquariums in general (Vietnamese "lũa"): what it is, the kinds Vietnamese aquarium shops sell, what it does to the water, how to prepare it before it goes in a tank, which tanks, fish, shrimp and plants it suits, common mistakes, where Vietnamese keepers buy it and what to check when buying it',
  },
  {
    id: 'lua-sa-tung', kind: 'wood', parent: 'lua', slug: 'lua-sa-tung', name: 'Lũa sa tùng', altNames: ['Lũa kim sa tùng', 'Kim sa tùng'], names: [],
    ask: 'the aquarium driftwood Vietnamese shops sell as "lũa kim sa tùng" or "lũa sa tùng": what it looks like, what it does to the water, how to prepare it, which tanks it suits, common mistakes, where Vietnamese keepers buy it and what to check when buying it. What tree or wood it is only if a page says so',
    leads: ['zenaquarius.com/lua-kim-sa-tung', 'thuysinhtim.vn/lua-re-kim-sa-tung', 'thuysinhtim.vn/lua-sa-tung-1kg', 'aquamart.vn/lua-kim-sa-tung', 'bongvang.vn', 'becathuysinhmini.com', 'aquabest.vn'],
  },
]

const SECTIONS = MATERIAL_SECTION_ORDER
type Key = (typeof SECTIONS)[number]
const KINDS = ['shop', 'article', 'forum', 'video', 'paper', 'other'] as const
type Kind = (typeof KINDS)[number]

/** What research found about one material: facts in the researcher's own words, each with its source's index (from 0). */
export type MaterialFacts = {
  found: boolean
  facts: { section: Key; fact: string; source: number }[]
  sources: { url: string; title: string; kind: Kind }[]
  /** The day the research ran: each source's `at` on the page. */
  at?: string
}
const FACTS_SCHEMA = {
  type: 'object', required: ['found', 'facts', 'sources'],
  properties: {
    found: { type: 'boolean' },
    facts: { type: 'array', items: { type: 'object', required: ['section', 'fact', 'source'], properties: { section: { type: 'string', enum: SECTIONS }, fact: { type: 'string' }, source: { type: 'number' } } } },
    sources: { type: 'array', items: { type: 'object', required: ['url', 'title', 'kind'], properties: { url: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: KINDS } } } },
  },
}

export const researchPrompt = (a: MaterialAsk) => `Research this aquarium material for a Vietnamese aquarium handbook: ${a.ask}. Use WebSearch and WebFetch. Search in Vietnamese first, as Vietnamese keepers and shops write about it, then in English.

Collect facts, each with the index of its source in sources[] (from 0) and one section:
- about: what it is, what it looks like, how to tell it from similar kinds. What tree, wood or stone it is only if a page you fetched says so.
- water: what it does to the water (tannins and colour, pH, hardness), and for how long.
- prepare: how to prepare it before it goes in a tank (scrub, soak, boil, weigh it down until it sinks, change the soaking water), with times as sources give them.
- suits: the fish, shrimp, plants and tank styles it suits, and those it doesn't.
- mistakes: common errors.
- buy: where keepers in Vietnam buy it, and what to check before buying (size, weight, rot, smell). No prices.
- sources: every page used, once each: its URL, its title as the page itself gives it, and its kind: shop (a shop's product page or blog), article (a guide or article on a hobby site, a magazine or a keeper's blog), forum (a forum thread or a Q&A), video, paper (a study), other.
- found: false if nothing reliable was found.

Rules: facts in your own words, short, one claim each. Keep numbers and units as sources give them. If sources disagree, keep each fact with its own source. Only what a page you fetched says: never a guess at what a trade name means. Never fetch Shopee, Lazada, Tiki, Tokopedia or Facebook pages.${a.leads?.length ? `\n\nVietnamese shops' pages that sell it, to start from: ${a.leads.join(', ')}.` : ''}`

/**
 * Marketplaces (reached only through their affiliate APIs) and their short links (marketplaces.ts), Tokopedia and
 * Facebook: never a page's source. Nor an address that isn't a web page's.
 */
const BARRED = /(?:^|\.)(?:tokopedia|facebook|fb)\.[a-z.]+$/i
const host = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const usable = (url: string | undefined) => {
  if (!url || !/^https?:\/\/\S+$/i.test(url) || !host(url)) return false
  return !isMarketplace(url) && !BARRED.test(host(url))
}

/**
 * The facts a page is written from and its sources, numbered from 1 as the page cites them: only web pages, never a
 * marketplace's or Facebook's, each once, and only those a kept fact cites. A fact whose source went goes with it.
 */
export function keptFacts(r: MaterialFacts) {
  const facts0 = r.facts.filter(f => (SECTIONS as readonly string[]).includes(f.section) && usable(r.sources[f.source]?.url) && f.fact.trim())
  const urls = [...new Set(facts0.map(f => r.sources[f.source]!.url))]
  const sources = urls.map(url => {
    const s = r.sources.find(x => x.url === url)!
    return { url, title: s.title.trim() || host(url), kind: (KINDS as readonly string[]).includes(s.kind) ? s.kind : 'other' as Kind }
  })
  const facts = facts0.map(f => ({ section: f.section, fact: f.fact.trim(), source: urls.indexOf(r.sources[f.source]!.url) + 1 }))
  return { facts, sources }
}

type Written = { summary: string[]; sections: Partial<Record<Key, string>>; faq: { q: string; a: string }[] }
const WRITE_SCHEMA = {
  type: 'object', required: ['summary', 'sections', 'faq'],
  properties: {
    summary: { type: 'array', items: { type: 'string' } },
    sections: { type: 'object', properties: Object.fromEntries(SECTIONS.map(k => [k, { type: 'string' }])) },
    faq: { type: 'array', items: { type: 'object', required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
  },
}
const WRITE = readFileSync(new URL('./prompts/material.md', import.meta.url), 'utf8')
const prompt = (a: MaterialAsk, parent?: string) => WRITE.replace('{{PARENT_LINE}}', parent
  ? `Trang này là một loại ${parent.toLowerCase()}: câu đầu nói ${a.name} là loại ${parent.toLowerCase()} gì, theo dữ kiện.`
  : `Đây là trang chung: câu đầu nói ${a.name.toLowerCase()} là gì.`)

/** A number that starts and ends with a digit, so "ngày 7, đồng thời" is not "7, đồng". */
const N = String.raw`(?<![\p{L}\d])\d(?:[\d.,]*\d)?`
const END = String.raw`(?![\p{L}\d])`
/** A sum of money by its size alone: a thousands separator, or five digits and more ("150.000", "150000"; not a year). */
const SUM = String.raw`(?<![\p{L}\d])(?:\d{1,3}(?:[.,]\d{3})+|\d{5,})`
const SCALE = String.raw`(?:nghìn|ngàn|triệu|tỷ|tỉ)${END}`
/** A sum in words: "vài trăm", "hai chục", "nửa". */
const WORDS = String.raw`(?:(?:vài|mấy|một|hai|ba|bốn|năm|lăm|sáu|bảy|tám|chín|mười|mươi|chục|trăm|nửa)\s+)+`
/**
 * "đồng" as money, not "đồng thời" ("at the same time"): "vài triệu đồng thời" is a count. Money again before a word of
 * time ("150.000 đồng thời điểm này").
 */
const DONG = String.raw`đồng${END}(?!\s+thời${END}(?!\s+(?:điểm|gian|hạn|kỳ)${END}))`
const MONEY = String.raw`(?:(?:₫|vnđ|vnd|đ)${END}|${DONG})`
/** An amount after "giá": a sum, or a number or a range in digits or words with its "nghìn" or "triệu". */
const AMOUNT = String.raw`(?:${SUM}|${N}(?:\s*(?:đến|tới|[-–~])\s*${N})?\s*${SCALE}|${WORDS}${SCALE})`
/** Words of about-ness after "giá" or its colon, the first one right after a colon too ("Giá:từ vài trăm nghìn"). */
const AROUND = String.raw`(?:(?:\s+|(?<=:))(?:chỉ|từ|khoảng|tầm|chừng|cỡ|dao\s+động|rơi\s+vào))*`
/**
 * A price only by the marks that can't be anything else: a currency sign after a number ("150.000 ₫", "90 đ", "150.000đ
 * màu nâu"), "đồng" after a sum ("150.000 đồng"), "nghìn" or "triệu" with money's word after it ("200 nghìn đồng", "nửa
 * triệu đồng", "vài trăm nghìn đồng"), "k" ("150k", "150K/khúc"), and "giá" before an amount ("giá 150.000", "giá từ 5
 * triệu", "có giá vài trăm nghìn"), or after a word of selling or a colon before any number ("Giá bán: 99"). Never a
 * quantity: "2 triệu năm", "lên tới vài triệu, tùy loại nền", "6500 K", "giá thể 2 lớp", "đánh giá 2 khúc", "trên giá
 * khoảng 2 ngày", "ngày 7 đồng thời", "vài triệu đồng thời". A sum written any other way ("mỗi khúc 200 nghìn", "giá
 * từ 90") is the grounded reader's to note (GROUNDED): what follows a "nghìn" can be a count as well as a price, and a
 * mark that could be a quantity would refuse good drafts unread.
 */
const PRICE = [
  new RegExp(String.raw`${N}\s*(?:₫|vnđ|vnd|đ)${END}|${SUM}\s*${DONG}`, 'iu'),
  new RegExp(String.raw`(?:${N}\s*|(?<![\p{L}])${WORDS})${SCALE}(?:\s+rưỡi)?\s*${MONEY}`, 'iu'),
  new RegExp(String.raw`${N}\s*k${END}`, 'u'),
  // A capital K after three digits at most: a lamp's 6500 K is a colour.
  new RegExp(String.raw`(?<![\p{L}\d.,])\d{1,3}\s*K${END}`, 'u'),
  new RegExp(String.raw`(?<![\p{L}])(?<!đánh\s+)giá(?:(?:\s+(?:bán|lẻ|sỉ|mua|niêm\s+yết|tham\s+khảo))+${AROUND}\s*:?${AROUND}|\s*:${AROUND})\s*(?:${AMOUNT}|\d)|(?<![\p{L}])(?<!đánh\s+)giá${AROUND}\s+${AMOUNT}`, 'iu'),
]
const chars = (s: string) => [...s.normalize('NFC')].length
/** Every entity undone, named ones too ("&ndash;", "&deg;"), until none is left. */
const decode = (s: string) => {
  let out = s
  for (let prev = ''; prev !== out;) { prev = out; out = new TextNode(out, null as never).text }
  return out
}
const visible = (html: string) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
/**
 * A tag, its quoted values read whole, or a comment; not a comparison: "<" then an HTML element's name ("pH < 7",
 * "6<pH và KH>2" stay, and so does nothing of `<em title="pH < 7">`). A block's edge leaves a space.
 */
const ELEMENTS = 'a|abbr|article|aside|audio|b|big|blockquote|body|br|button|canvas|caption|center|cite|code|col|colgroup|dd|del|details|dfn|div|dl|dt|em|embed|figcaption|figure|font|footer|form|h[1-6]|head|header|hr|html|i|iframe|img|input|ins|kbd|label|li|link|main|mark|math|meta|nav|nobr|noscript|object|ol|option|p|picture|pre|q|s|samp|script|section|select|small|source|span|strike|strong|style|sub|summary|sup|svg|table|tbody|td|template|textarea|tfoot|th|thead|time|tr|tt|u|ul|var|video|wbr'
const TAG = new RegExp(String.raw`<!--[\s\S]*?-->|<\/?(?:${ELEMENTS})(?![a-z0-9-])(?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))?)*\s*\/?>`, 'gi')
/** A "<" that opens no element ("6<pH và KH>2") is text: escaped before the sanitizer, which would read it as a tag. */
const STRAY = new RegExp(String.raw`<(?!\/?(?:${ELEMENTS})(?![a-z0-9-])|!--)`, 'gi')
const untag = (s: string) => s.replace(TAG, t => (/^<\/?(?:p|br|div|li|ul|ol|h\d)\b/i.test(t) ? ' ' : ''))
/**
 * A summary line or a question as the page shows it: plain text, entities undone, no markup and no source's mark. One
 * level of entities at a time, the tags out before and after each, so a tag's own encoded values stay until it's gone
 * (`title="&quot;lũa rễ&quot;"`, and the same written encoded once more).
 */
const plain = (s: string) => {
  let out = untag(s ?? '')
  for (let prev = ''; prev !== out;) { prev = out; out = untag(new TextNode(out, null as never).text) }
  return out.replace(/\s*\[\d+\]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * A draft as it will be saved, which is what is checked, read and saved: its summary and questions plain, each part
 * sanitized (entities undone, comments gone), a part with nothing a reader sees dropped, and its figures in metric.
 */
export function asSaved(w: Written): Written {
  const summary = (w.summary ?? []).map(plain).filter(Boolean)
  const faq = (w.faq ?? []).map(f => ({ q: plain(f.q), a: plain(f.a) })).filter(f => f.q && f.a)
  const sections: Record<string, string> = {}
  for (const [k, html] of Object.entries(w.sections ?? {})) {
    const s = sanitizeHtml((html ?? '').replace(STRAY, '&lt;'))
    if (visible(s).replace(/\[\d+\]/g, '').trim()) sections[k] = s
  }
  const m = metricPage({ summary, faq, sections }, 'vi')
  return { summary: m.summary ?? [], faq: m.faq ?? [], sections: (m.sections ?? {}) as Written['sections'] }
}

/**
 * What the page's own form requires, checked in code before any reader: what the site's loader refuses (2–4 summary lines,
 * the six sections, a mark outside the sources) and the card's (its first line alone, 90 characters at most), every part
 * citing its sources, no heading or link inside a part, no price. A draft with any of these is written again or not saved.
 */
export function formNotes(w: Written, sourceCount: number): string[] {
  const notes: string[] = []
  const summary = w.summary ?? []
  if (summary.length < 2 || summary.length > 3) notes.push(`summary: write 2–3 lines, not ${summary.length}`)
  if (summary[0] && chars(summary[0]) > 90) notes.push(`summary: the first line has ${chars(summary[0])} characters, more than 90: "${summary[0]}"`)
  for (const k of Object.keys(w.sections ?? {})) if (!(SECTIONS as readonly string[]).includes(k)) notes.push(`sections: "${k}" is not one of ${SECTIONS.join(', ')}`)
  const parts = SECTIONS.filter(k => (w.sections?.[k] ?? '').trim())
  if (!parts.includes('about')) notes.push('sections: "about" is missing')
  for (const k of parts) {
    const html = w.sections[k]!
    for (const m of html.matchAll(/\[(\d+)\]/g)) if (Number(m[1]) < 1 || Number(m[1]) > sourceCount) notes.push(`${k}: [${m[1]}] is not a source (1–${sourceCount})`)
    if (!/\[\d+\]/.test(html)) notes.push(`${k}: cites no source`)
    if (/<(?:h\d|a)[\s>]/i.test(html)) notes.push(`${k}: has a heading or a link`)
  }
  const text = [...summary, ...parts.map(k => visible(w.sections[k]!)), ...(w.faq ?? []).flatMap(f => [f.q, f.a])].join('\n').replace(/\s*\[\d+\]/g, '').normalize('NFC')
  const price = PRICE.map(r => text.match(r)?.[0]).find(Boolean)
  if (price) notes.push(`a price ("${price}"): the page gives none`)
  return notes
}

const GROUNDED = `Below are FACTS gathered about an aquarium material and a Vietnamese PAGE written from them. Score 0–1 how well the PAGE sticks to the FACTS: 1.0 = every claim, number, time and recommendation is supported by the facts; 0.75 = small unsupported generalities; below 0.75 = an invented number, time, species, wood or claim, or a fact turned around.
The page gives no price: any sum of money in it, in digits or in words, is a wrong claim, whatever the facts say.
Each [n] after a sentence cites the facts' source n: a claim marked with a source whose facts don't give it is a wrong claim. A source called something other than its kind (shop: a shop; article: a guide or article; forum: a forum post; video: a keeper; paper: a study; other: a source) is a wrong claim.
notes: up to 10 unsupported or wrong claims (in English), quoting the phrase. Empty if none.`

export async function checkMaterial(llm: Llm, forWriter: object, w: Written): Promise<Review> {
  return steadyRead(async (): Promise<Review> => {
    const page = [...(w.summary ?? []), ...SECTIONS.map(k => w.sections?.[k] ?? '').filter(Boolean), ...(w.faq ?? []).map(f => `${f.q} ${f.a}`)].join('\n')
    const r = await llm<Review>({ system: 'You check a page against its facts. Reply only with JSON.', prompt: `${GROUNDED}\n\nFACTS:\n${JSON.stringify(forWriter)}\n\nPAGE:\n${page}`, schema: { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } } })
    return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: r.notes ?? [] }
  })
}

const readJson = async <T>(file: string) => JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as T | null

/**
 * Research (kept in engine-state/materials/<id>.json, and written from again with `reuse`: no new searching), the
 * Vietnamese page written from its facts, checked, and written once more on the check's or the form's notes. A page whose
 * every draft fails its form is not saved. Photos put on the page since stay. Files: content/materials/<id>/{entity,vi}.json.
 */
export async function makeMaterial(root: string, d: { research: Llm; llm: Llm }, a: MaterialAsk, o: MaterialOptions = {}) {
  // The site's loader refuses a page whose parent has none: checked before anything is asked or written.
  if (a.parent && !(await readJson(join(root, 'content/materials', a.parent, 'entity.json')))) throw new Error(`${a.id}: its parent "${a.parent}" has no page yet: write it first`)
  // A page is one piece of the step's day (pieces.ts): it starts only if what's left covers a page as the last one cost,
  // and its whole cost goes on record for the next.
  return piece(a.id, () => writeMaterial(root, d, a, o), { now: o.now })
}

type MaterialOptions = { reuse?: boolean; now?: () => Date; researchModel?: string; writeModel?: string }

async function writeMaterial(root: string, d: { research: Llm; llm: Llm }, a: MaterialAsk, o: MaterialOptions) {
  const now = o.now?.() ?? new Date()
  const factsFile = join(root, 'engine-state/materials', `${a.id}.json`)
  const kept = o.reuse ? await readJson<MaterialFacts>(factsFile) : null
  if (o.reuse && !kept) throw new Error(`${a.id}: no research kept in ${factsFile}`)
  let researched = kept
  if (!researched) {
    researched = { ...await d.research<MaterialFacts>({ system: 'You research aquarium materials carefully and cite every fact. Reply only with JSON.', prompt: researchPrompt(a), schema: FACTS_SCHEMA, model: o.researchModel ?? 'opus' }), at: now.toISOString().slice(0, 10) }
    await mkdir(join(root, 'engine-state/materials'), { recursive: true })
    await writeFile(factsFile, `${JSON.stringify(researched, null, 2)}\n`)
  }
  if (!researched.found) return { id: a.id, skipped: 'nothing reliable found' }
  const { facts, sources } = keptFacts(researched)
  if (!facts.length) return { id: a.id, skipped: 'no cited facts' }

  const parent = a.parent ? MATERIALS.find(m => m.id === a.parent)?.name : undefined
  const forWriter = { name: a.name, altNames: a.altNames, sources: sources.map((s, i) => ({ source: i + 1, kind: s.kind })), facts }
  const write = (notes?: string[]) => d.llm<Written>({
    system: 'You write Vietnamese aquarium pages from facts. Reply only with JSON.', model: o.writeModel ?? 'opus', schema: WRITE_SCHEMA,
    prompt: `${prompt(a, parent)}\n\n${STYLE}${notes?.length ? `\n\nBản trước có chỗ cần sửa. Sửa theo các ghi chú sau, chỉ viết điều dữ kiện có:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- DỮ KIỆN ---\n${JSON.stringify(forWriter, null, 1)}`,
  })
  // A draft that fails its form is written again on the form's notes alone: no reader is paid to read it.
  const review = async (w: Written) => {
    const form = formNotes(w, sources.length)
    return { w, form, review: form.length ? { score: 0, notes: form } : await checkMaterial(d.llm, forWriter, w) }
  }
  const drafts: Awaited<ReturnType<typeof review>>[] = []
  const log = (kept?: Review) => logReviews(root, 'material', { id: `materials/${a.id}`, lang: 'vi' }, drafts.map(x => x.review), kept, { now })
  try {
    drafts.push(await review(asSaved(await write())))
    if (drafts[0]!.form.length || drafts[0]!.review.score < QUALITY_THRESHOLD || drafts[0]!.review.notes.length) drafts.push(await review(asSaved(await write(drafts[0]!.review.notes))))
  } catch (e) {
    // A rewrite that fails keeps the reviews already made: none is kept, as nothing is saved.
    if (drafts.length) await log()
    throw e
  }
  // The better read, and at an equal one the draft with fewer notes left: a rewrite that cleared its notes.
  const good = drafts.filter(x => !x.form.length).sort((x, y) => y.review.score - x.review.score || x.review.notes.length - y.review.notes.length)[0]
  if (!good) {
    await log()
    throw new Error(`${a.id}: no draft has the page's form: ${drafts.at(-1)!.form.join('; ')}`)
  }

  const today = (researched.at ?? now.toISOString().slice(0, 10))
  const dir = join(root, 'content/materials', a.id)
  const prev = await readJson<MaterialEntity>(join(dir, 'entity.json'))
  const entity = MaterialSchema.parse({
    id: a.id, kind: a.kind, ...(a.parent ? { parent: a.parent } : {}), names: a.names, photos: prev?.photos ?? [],
    sources: sources.map(s => ({ ...s, at: today })), updatedAt: now.toISOString().slice(0, 10),
  })
  // Saved as it was checked and read (asSaved).
  const sections = Object.fromEntries(SECTIONS.flatMap(k => (good.w.sections[k] ? [[k, good.w.sections[k]!]] : [])))
  const vi = TranslationSchema.parse({
    slug: a.slug, name: a.name, altNames: a.altNames, sections, summary: good.w.summary, ...(good.w.faq.length ? { faq: good.w.faq } : {}),
    quality: { score: good.review.score, indexable: good.review.score >= QUALITY_THRESHOLD },
  })
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify(entity, null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), `${JSON.stringify(vi, null, 2)}\n`)
  await log(good.review)
  return { id: a.id, score: good.review.score, notes: good.review.notes, sources: sources.length, drafts: drafts.length }
}
