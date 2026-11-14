import { piece } from './pieces'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GuideSchema, metricPage, QUALITY_THRESHOLD, slugify, TranslationSchema, type GuideEntity, type Translation } from '@aq/schema'
import type { Llm } from './claude'
import { cycleOnlyHosts, refused } from './cycle-only'
import { isMarketplace } from './marketplaces'
import { lastKept, logReviews } from './review-log'
import { TARGETS, type TargetLang } from './localize'
import { pickSlug } from './merge'
import { plainParts, sanitizeHtml, unescapePlain } from './sanitize'
import { readForumState, topicLeads } from './forum'
import { lethalFigures, NAMES_TREATMENT } from './fit'
import { steadyRead } from './quality'
import { VI_STYLE as STYLE } from './phrases'
import { TANK_RULE, withTanks } from './round'
import { foreignSeasons } from './seasons'

/**
 * What a source is: the research tags each one, and the writers and the checker get each fact's source with its kind, so a
 * page names a society as a society and a shop as a guide, never by a guess from the fact.
 */
export const SOURCE_KINDS = {
  paper: 'a study in a journal, a thesis or a conference paper, or its record in an index (PubMed, AGRIS)',
  university: "a university's or its extension service's page or fact sheet (UF/IFAS), wherever it's published, not a paper",
  vet: "an aquatic vet, a vet clinic's page, a vets' network or a vet manual (Merck Veterinary Manual, VIN)",
  government: 'a government agency or office, writing for keepers or the public (one writing for farmers is farm)',
  society: "a fishkeepers' society, club or association (ANGFA, a killifish association)",
  maker: "a product's maker, its label or its own instructions",
  shop: "a shop's page or blog, a fish store's care sheet (Aquarium Co-Op)",
  keeper: "one hobbyist's own site or blog",
  magazine: 'a fishkeeping magazine, or a hobby site many keepers write for (Practical Fishkeeping)',
  news: "a newspaper's or a news site's report (VnExpress, Tuổi Trẻ, phys.org)",
  reference: 'an encyclopedia or a species database (Wikipedia, FishBase, Seriously Fish)',
  forum: 'a forum thread, a social media post or a Q&A answer',
  farm: "a page written for fish farmed for food (ponds, cages, hatcheries, an agriculture or fisheries office's advice to farmers), whatever its publisher; a university's or a vet's page on farmed and aquarium fish both is theirs",
  other: 'none of these',
} as const
export type SourceKind = keyof typeof SOURCE_KINDS
const KINDS = Object.keys(SOURCE_KINDS) as SourceKind[]
/** How a page names each kind of source, in English: the checker's list, and the other languages' writers'. */
const NAMED_AS: Record<SourceKind, string> = {
  paper: 'a study', university: 'a university', vet: 'a vet', government: 'a government agency', society: "a fishkeepers' society",
  maker: 'the maker', shop: 'a fishkeeping guide, never the shop by name', keeper: 'a keeper', magazine: 'a fishkeeping magazine',
  news: 'a news report', reference: 'a reference site', forum: 'a forum post', farm: 'a fish-farming guide', other: 'a source',
}
const NAMED_LIST = KINDS.map(k => `${k}: ${NAMED_AS[k]}`).join('; ')
const WRITE = withTanks(readFileSync(new URL('./prompts/topic.md', import.meta.url), 'utf8'))
const INTL = readFileSync(new URL('./prompts/topic-intl.md', import.meta.url), 'utf8').replace('{{SOURCE_KINDS}}', NAMED_LIST)

const SECTIONS = ['what', 'signs', 'causes', 'firstAid', 'treatment', 'steps', 'prevention', 'mistakes', 'vietnam', 'myths', 'other'] as const
/** What research found about one fishkeeping topic: facts in the researcher's own words, each with its source's index. */
export type TopicFacts = {
  found: boolean
  /** `also`: other sources that give the same, which a dose from a farm's page or a forum post needs (usableFact). */
  facts: { section: (typeof SECTIONS)[number]; fact: string; source: number; also?: number[] }[]
  /** Scientific names of the fish and plants the facts are about (links to their pages). */
  species: string[]
  sources: { url: string; title: string; kind: SourceKind }[]
}
export const FACTS_SCHEMA = {
  type: 'object', required: ['found', 'facts', 'species', 'sources'],
  properties: {
    found: { type: 'boolean' },
    facts: { type: 'array', items: { type: 'object', required: ['section', 'fact', 'source'], properties: { section: { type: 'string', enum: SECTIONS }, fact: { type: 'string' }, source: { type: 'number' }, also: { type: 'array', items: { type: 'number' } } } } },
    species: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'object', required: ['url', 'title', 'kind'], properties: { url: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: KINDS } } } },
  },
}

export type TopicAsk = { topic: string; kind: GuideEntity['kind'] }

export const researchPrompt = (a: TopicAsk) => `Research this freshwater fishkeeping topic for a Vietnamese aquarium handbook: "${a.topic}" (kind: ${a.kind}). Use WebSearch and WebFetch. Search in English and in Vietnamese.

Prefer aquatic vets, universities and extension services (for example UF/IFAS, Merck Veterinary Manual), makers' own documentation, and long-time hobbyist articles; forums only for what keepers report. Collect facts, each with the index of its source in sources[] and one section:
- what (what it is, why it matters), signs (how it looks, how to tell it from look-alikes), causes, firstAid (what to do at once), treatment (methods with exact doses, temperatures and durations as sources give them, and what fish, shrimp, snails or plants cannot take them), steps (for a how-to: the steps in order), prevention, mistakes (common errors), vietnam (anything specific to Vietnam: tropical climate and hot season, tap water, power cuts, products or names used there), myths (claims sources say are wrong, with who says so), other.
- species: scientific names of the fish or plants the topic is mostly about or that sources single out (sensitive species, typical victims). Empty if none.
- sources: every page used, once each: its URL, its title as the page itself gives it (never a description of what you found there), and its kind, by who wrote it and for whom: ${KINDS.map(k => `${k}: ${SOURCE_KINDS[k]}`).join('; ')}.
- found: false if this is not a real fishkeeping topic or nothing reliable was found.

Rules: facts in your own words, short, one claim each. Keep numbers and units as sources give them. If sources disagree, keep each fact with its own source. A dose a source gives for one product: name the product in the fact. A dose from a farm page or a forum post is used only when another page, not a farm's, gives the same dose: search for one, and put its index in the fact's also. Leave out a test's lethal level (LC50, LD50, the level that killed half the animals tested): give what the source says is safe or harmful, or that the substance is toxic at low levels. Never fetch Shopee, Lazada or Tiki pages.`

/**
 * A dose a reader would measure out, in a fact's words: an amount, or a salt's percentage. The owner's chief, 8 Nov 2026,
 * after guides gave a fish farm's salt dips and a forum post's quinine to aquarium keepers: "a dose taken from a source
 * written for farmed food fish, or from a single forum post, needs a second source before it's used."
 */
const AMOUNT = /\d\s*(?:(?:mg|mcg|µg|μg|g|gm|grams?|gam|kg|ml|drops?|giọt|tsp|teaspoons?|tbsp|tablespoons?|thìa|muỗng|viên|gói|tablets?|capsules?|measures?|scoops?|capfuls?|caps?|nắp|cc|ppm|ppt|percent|phần trăm|persen|packets?|bungkus|sachets?|tetes|sendok)(?![\p{L}])|‰|%|ซอง|หยด|เม็ด|ช้อน|กรัม|มล)/iu
/** Something measured out, never a fish's weight: a spoon, a cap, a drop, a packet, a ratio (1:2000). */
const MEASURE = /(?<![\d.,])1\s*:\s*\d{2,}(?![\d.,])|(?<![\p{L}])(?:half(?:\s+a)?|a|one|nửa|một|setengah|satu|se)\s+(?:teaspoons?|tablespoons?|thìa|muỗng|sendok|sudu|capfuls?|caps?|tablets?|capsules?|kapsul|scoops?|measures?|packets?|sachets?|cups?|viên|gói|nắp|bungkus)(?![\p{L}])|\d\s*(?:(?:sudu|kapsul|cups?|chén|ml|drops?|giọt|tsp|teaspoons?|tbsp|tablespoons?|thìa|muỗng|viên|gói|tablets?|capsules?|measures?|scoops?|capfuls?|caps?|nắp|cc|sachets?|packets?|bungkus|tetes|sendok|sdt|sdm)(?![\p{L}])|ซอง|หยด|เม็ด|ช้อน|มล)/iu
/** A pinch: of food it's no dose, of a treatment it is. */
const PINCH = /(?<![\p{L}])(?:\d+|a|one|một|satu|se)\s*(?:pinch(?:es)?|nhúm|jumput)(?![\p{L}])/iu
/** A level in the water. */
const LEVEL = /\d[\d.,]*(?:\s*[–-]\s*\d[\d.,]*)?\s*(?:(?:ppm|ppt|mg\s*\/\s*l(?:ít|iters?|itres?)?)(?![\p{L}])|‰)/giu
/** So much in so much water, food or fish: "per 40 litres", "/L", "mỗi m³", "per kg of food". */
const PER = /(?:\/|\b(?:per|cho|trong|in|setiap|bagi|untuk)\s|mỗi\s|ต่อ(?:น้ำ)?)\s*(?:about\s+|khoảng\s+|sekitar\s+)?(\d[\d.,–-]*\s*)?(l|lít|lit|liters?|litres?|gallons?|gal|m³|m3|kg|kilograms?|ลิตร)(?![\p{L}])/giu
/** The water's own levels, named just before a level's figure: that figure is the water's, not a dose. (Oxy già is hydrogen peroxide.) */
const WATER = /(?:nitrat\p{L}*|nitrit\p{L}*|ammonia|amoni\p{L}*|\bNO[23](?:-N)?|\bNH[34]\+?|\bH2S|hydrogen sulfide|oxygen|\boxy\b(?!\s*già)|oksigen|TDS|CO2|CO₂|\bKH\b|\bGH\b|(?:calcium|canxi|kalsium|magnesium|magie|iron|sắt|besi|phosphat\p{L}*|phốt phát|fosfat|silicat\p{L}*|potassium|kali)(?!\s*(?:\(?\s*(?:II|III)\s*\)?\s*)?(?:sul|sun|hypo|chlor|clor|perman|oxid|carbon|citr|glucon|EDTA|iodid)))(?:[\s-]+\p{L}+){0,3}?\s*(?:[<>≤≥~]|khoảng|about|above|below|under|over|at|to|dưới|trên|di bawah|di atas)?\s*\(?\s*$|(?:แอมโมเนีย|ไนไตร[ทต]์?|ไนเตร[ทต]|ออกซิเจน)[\p{L}\p{M}\s]{0,20}$/iu
/** A treatment the rules have no name for: a dose, a bath, a medicine by its kind. */
const TREATING = /(?<![\p{L}\p{N}])(?:dos(?:e|es|ing|is)|liều|thuốc|obat|ubat|treat\p{L}*|chữa|điều trị|pengobatan|rawat\p{L}*|dips?|baths?|tắm|ngâm|rendam|celup|mandi|peroxide|oxy già|H2O2|ivermectin|emamectin|chloramine\p{L}*|toltrazuril|paraguard|cupramine|coppersafe)(?![\p{L}\p{N}])|ยา(?!ว)|รักษา|แช่/iu
/** A fish's weight: "fish weigh 20 g per litre of tank". */
const WEIGHT = /(?<![\p{L}])(?:weigh\p{L}*|nặng|berat|bobot)(?![\p{L}])|หนัก/iu
/**
 * An amount right before so much water, food or fish ("250 mg per 40 litres", "10 mg/kg"), not a fish's weight. Milligrams
 * per litre with no litres counted ("5 mg/L") are a level in the water, which treatmentLevel reads.
 */
const amountPer = (fact: string) => [...fact.matchAll(PER)].some(m => {
  const before = fact.slice(Math.max(0, m.index - 30), m.index)
  return AMOUNT.test(before) && !WEIGHT.test(before) && (!!m[1] || !/^l|^lít|^lit|ลิตร/iu.test(m[2]!) || !/mg\s*$/iu.test(before))
})
/** The water's nitrogen named right after a level's figure: "8.6 mg/L nitrite-nitrogen", "0.5 mg/L NO2-N". */
const WATER_AFTER = /^\s*(?:as\s+)?(?:NO[23]|NH[34]|nitrit\p{L}*|nitrat\p{L}*|ammonia|amoni\p{L}*)/iu
/**
 * A level whose figure isn't the water's own. A figure in the same list as a water level is the water's too ("oxygen
 * above 3 mg/L for warmwater fish or 5 mg/L for coldwater"), unless a treatment or a new sentence comes between.
 */
const treatmentLevel = (fact: string) => {
  let water = false
  let end = 0
  return [...fact.matchAll(LEVEL)].some(m => {
    const between = fact.slice(end, m.index)
    water = WATER.test(fact.slice(Math.max(0, m.index - 40), m.index)) || WATER_AFTER.test(fact.slice(m.index + m[0].length))
      || (water && !/[.;!?](?:\s|$)|\n/.test(between) && !NAMES_TREATMENT.test(between) && !TREATING.test(between))
    end = m.index + m[0].length
    return !water
  })
}
/**
 * An amount that names a treatment; a level not the water's own; something measured out; a weight per volume, food or
 * fish; a percentage of a bath or a solution. A fish's weight or a water change is not one.
 */
const isDose = (fact: string) => (AMOUNT.test(fact) && (NAMES_TREATMENT.test(fact) || TREATING.test(fact)))
  || treatmentLevel(fact) || MEASURE.test(fact) || amountPer(fact) || (PINCH.test(fact) && (NAMES_TREATMENT.test(fact) || TREATING.test(fact)))
/**
 * A site, as one source: another page of the same thread is the same one, and so is another thread of the same forum,
 * whose members repeat each other's advice. Addresses can't tell a thread's pages from its posts (phpBB's "?p=", SMF's
 * "topic=12.15", Reddit's comment links), so a second source must be another site: another registered domain, with a
 * site's short links (redd.it, fb.com) as the site.
 */
const SHORT: Record<string, string> = { 'redd.it': 'reddit.com', 'fb.com': 'facebook.com', 'fb.me': 'facebook.com', 'youtu.be': 'youtube.com' }
const siteOf = (url: string) => {
  let host: string
  try { host = new URL(url).hostname } catch { host = url.replace(/^\w+:\/\//, '').replace(/[/?#:].*$/, '') }
  const labels = host.toLowerCase().replace(/\.$/, '').split('.')
  // A country's second level (example.com.vn, example.co.th) keeps one more label.
  const keep = labels.length > 2 && /^[a-z]{2}$/.test(labels.at(-1)!) && /^(?:com|co|net|org|gov|edu|ac|or|in|go|my|biz|info)$/.test(labels.at(-2)!) ? 3 : 2
  // A blog host's blogs are each a site (a.blogspot.com, b.wordpress.com).
  const blog = labels.length > keep && /^(?:blogspot|wordpress|github|tumblr|weebly|wixsite|substack)$/.test(labels.at(-keep)!) ? 1 : 0
  const site = labels.slice(-keep - blog).join('.')
  return SHORT[site] ?? site
}
/** Live food by name: raising it doses its own water, not a fish's. */
const LIVE_FOOD = /(?<![\p{L}])(?:artemia|brine shrimp|live foods?|decapsulat\p{L}*|microworms?|vinegar eels?|banana worms?|walter worms?|grindal(?: worms?)?|white worms?|daphnia|moina|infusoria|rotifers?|bo bo|trùn chỉ|thức ăn tươi sống|pakan hidup|makanan hidup|kutu air|cacing sutra)(?![\p{L}])|อาร์ทีเมีย|ไรทะเล|ไรแดง|อาหารมีชีวิต/iu
/** A fish or its young, as a fact being given something names them. */
const FISH = /(?<![\p{L}])(?:fish|fry|fingerlings?|larvae|juveniles?|broodstock|cá|ikan|benih)(?![\p{L}])|ปลา/iu
/**
 * Raising live food (hatching and decapsulating artemia, microworms, daphnia): the farm rule is for what fish are given,
 * so a hatchery's figures for it need no second page (the chief, 9 Nov). Named in the fact or the page's title, and not a
 * fish being treated.
 */
const raisingLiveFood = (s: TopicFacts['sources'][number], fact: string) =>
  (LIVE_FOOD.test(fact) || LIVE_FOOD.test(s.title)) && !(FISH.test(fact) && (TREATING.test(fact) || NAMES_TREATMENT.test(fact)))
/**
 * Whether a fact may be written: a dose from a farm's page or a forum post only with another page, not a farm's, that
 * gives it too. A farm's figures for raising live food are not a fish's dose. A test's lethal level is never written.
 */
export function usableFact(r: TopicFacts, f: TopicFacts['facts'][number]): boolean {
  const s = r.sources[f.source]
  if (lethalFigures(f.fact).length) return false
  if (!s || (s.kind !== 'farm' && s.kind !== 'forum') || !isDose(f.fact)) return true
  if (s.kind === 'farm' && raisingLiveFood(s, f.fact)) return true
  return (f.also ?? []).some(i => { const o = r.sources[i]; return !!o && /^https?:\/\//i.test(o.url) && siteOf(o.url) !== siteOf(s.url) && o.kind !== 'farm' })
}

const WRITE_SCHEMA = {
  type: 'object', required: ['name', 'summary', 'body', 'faq'],
  properties: {
    name: { type: 'string' }, summary: { type: 'array', items: { type: 'string' } }, body: { type: 'string' },
    faq: { type: 'array', items: { type: 'object', required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
  },
}
export type Written = { name: string; summary: string[]; body: string; faq: { q: string; a: string }[] }
/** What a reader of a guide sees of it: its title, summary, body and questions. */
/**
 * A copy's text as it will be saved: its name, summary and answers unescaped, its body sanitized. The seasons check reads
 * this, not what the writer sent (Astra's read: "<div>ฤดู</div><div>ใบไม้ผลิ</div>" passed and was saved as "ฤดูใบไม้ผลิ",
 * and "musim&amp;#32;panas" passed and was saved as "musim panas").
 */
const savedText = (w: Written) => {
  const p = plainParts(w.summary ?? [], w.faq ?? [])
  return [unescapePlain(w.name), ...p.summary, sanitizeHtml(w.body), ...p.faq.flatMap(f => [f.q, f.a])].join('\n')
}
const INTL_SCHEMA = { ...WRITE_SCHEMA, required: [...WRITE_SCHEMA.required, 'slug'], properties: { ...WRITE_SCHEMA.properties, slug: { type: 'string' } } }

const GROUNDED = `Below are FACTS gathered about a fishkeeping topic and a Vietnamese GUIDE written from them. Score 0–1 how well the GUIDE sticks to the FACTS: 1.0 = every claim, dose, number, product and recommendation is supported by the facts; 0.75 = small unsupported generalities; below 0.75 = an invented dose, number, medicine, cause or claim, or a fact turned around. A fact's figure converted to metric (°F → °C, inches → cm, gallons → litres, sensibly rounded; ${TANK_RULE.en}) is that fact's figure.
Each fact's source is a number, and the facts' sources list gives each number's kind. A page names a source as its kind (${NAMED_LIST}); naming one as another kind (a society called a guide, a shop called a vet, a forum post called a study) is a wrong claim.
By the label: the writer's rules make it dose every medicine, product or salt the facts give no dose for by its label or its maker's directions ("theo nhãn", "sesuai label", "ikut label", "ตามฉลาก"). That counts as supported, whether or not the facts mention a label: score it as a supported line, and it is never one of the notes.
notes: up to 10 unsupported or wrong claims (in English), quoting the phrase. Empty if none.`

/**
 * For a guide's copy in another language only (the Writing Lead, 13 Nov 2026): the copy's writer is told to give a fact
 * tied to another place's season by its condition, and may call time away from home by the reader's own name for it.
 * GROUNDED is the Vietnamese guides' and the recheck's too, so the line goes in for a copy alone.
 */
const COPY_GROUNDED = `Time away from home called by the reader's own name for it ("mudik", "balik kampung"), and a fact given by its condition without the season or place it was tied to, count as supported and are never notes. Anything said about that occasion or season itself is not.`

type Grounded = { score: number; notes: string[]; reads?: number[] }
/**
 * A read this close to the bar is read twice more. One read of the same text varies by about ±0.06, and 4 guides in 20
 * landed on both sides of the bar on two reads; the median of three varies by about ±0.04 (9 Nov 2026).
 */
/**
 * A guide in `lang` (the language's English name) checked against the facts its writer had. A first read near the bar is
 * read twice more, and the guide gets the median read (steadyRead).
 */
export async function checkGuide(llm: Llm, lang: string, forWriter: object, x: Written): Promise<Grounded> {
  return steadyRead(async (): Promise<Grounded> => {
    const r = await llm<Grounded>({ system: 'You check a guide against its facts. Reply only with JSON.', prompt: `${lang === 'Vietnamese' ? GROUNDED : GROUNDED.replace('Vietnamese GUIDE', `${lang} GUIDE`).replace('\nnotes: ', `\n${COPY_GROUNDED}\nnotes: `)}\n\nFACTS:\n${JSON.stringify(forWriter)}\n\nGUIDE:\n${x.name}\n${x.summary.join('\n')}\n${sanitizeHtml(x.body)}\n${x.faq.map(f => `${f.q} ${f.a}`).join('\n')}`, schema: { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } } })
    return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: r.notes ?? [] }
  })
}

/**
 * The facts the Vietnamese guide is written from, and its references. Only web links are kept as sources, each page once
 * (a fact citing a page listed twice cites its first listing); a fact whose source was dropped goes with it, and the rest
 * are renumbered.
 */
export function viFacts(researched: TopicFacts) {
  const urls = [...new Set(researched.sources.map(s => s.url).filter(u => /^https?:\/\/\S+$/i.test(u)))]
  const at = (i: number) => urls.indexOf(researched.sources[i]?.url ?? '')
  const facts = researched.facts.filter(f => at(f.source) >= 0 && usableFact(researched, f)).map(f => ({ section: f.section, fact: f.fact, source: at(f.source) }))
  const refs = urls.map(url => ({ url, title: researched.sources.find(s => s.url === url)!.title }))
  return { facts, refs, sources: kindsOf(researched, refs) }
}

/**
 * viFacts with every source research may not read cited by no address, so it goes, and the facts resting on it alone with
 * it: a marketplace's page, or one on a host the engine reads only at its own pace (cycle-only.ts, the magazine read for
 * ideas among them). Research is denied those hosts, but may still name a page it found through search (the chief of
 * staff, 14 Nov 2026).
 */
async function citedFacts(root: string, researched: TopicFacts) {
  const off = await cycleOnlyHosts(root)
  return viFacts({ ...researched, sources: researched.sources.map(x => (isMarketplace(x.url) || refused(off, x.url) ? { ...x, url: '' } : x)) })
}

/** Each reference's kind, numbered as the facts cite them: what the writer names each source as. */
const kindsOf = (researched: TopicFacts, refs: { url: string }[]) => refs.map((r, i) => ({ source: i, kind: researched.sources.find(s => s.url === r.url)?.kind ?? 'other' }))

/**
 * The facts a guide in another language is written from, and its references. Facts about Vietnam itself stay on the
 * Vietnamese page; the page cites only the sources its facts come from (in the Vietnamese page's order), numbered afresh.
 */
function localFacts(researched: TopicFacts, entity: GuideEntity) {
  const kept = researched.facts.filter(f => f.section !== 'vietnam' && usableFact(researched, f) && (entity.refs ?? []).some(r => r.url === researched.sources[f.source]?.url))
  const refs = (entity.refs ?? []).filter(r => kept.some(f => researched.sources[f.source]?.url === r.url))
  const facts = kept.map(f => ({ section: f.section, fact: f.fact, source: refs.findIndex(r => r.url === researched.sources[f.source]!.url) }))
  return { facts, refs, sources: kindsOf(researched, refs) }
}

/**
 * A guide on the site checked against its facts again as it is, nothing rewritten (review-backfill.ts), after the
 * checker's prompt changed. It reads the facts its writer had, and the check's score is the guide's, so a guide the old
 * prompt marked down is indexed once it passes.
 */
export async function recheckTopic(root: string, llm: Llm, id: string, lang: 'vi' | TargetLang): Promise<Grounded> {
  const dir = join(root, 'content/guides', id)
  const read = async <T>(f: string) => JSON.parse(await readFile(f, 'utf8')) as T
  const researched = await read<TopicFacts>(join(root, 'engine-state/topics', `${id}.json`))
  const entity = await read<GuideEntity>(join(dir, 'entity.json'))
  const t = await read<Translation>(join(dir, `${lang}.json`))
  const vi = lang === 'vi' ? t : await read<Translation>(join(dir, 'vi.json'))
  // The facts its writer had: those on the guide's own references (a source refused when it was written is not among them).
  const cited = entity.refs && new Set(entity.refs.map(r => r.url))
  const { facts, sources } = lang !== 'vi' ? localFacts(researched, entity) : viFacts(cited ? { ...researched, sources: researched.sources.map(x => (cited.has(x.url) ? x : { ...x, url: '' })) } : researched)
  const r = await checkGuide(llm, lang === 'vi' ? 'Vietnamese' : TARGETS[lang].lang, { topic: vi.name, kind: entity.kind, sources, facts }, { name: t.name, summary: t.summary ?? [], body: t.body ?? '', faq: t.faq ?? [] })
  await writeFile(join(dir, `${lang}.json`), `${JSON.stringify({ ...t, quality: { ...t.quality, score: r.score, indexable: r.score >= QUALITY_THRESHOLD } }, null, 2)}\n`)
  return r
}

/** Scientific name → page id, for the species and plants we have. */
async function idsByName(content: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const kind of ['species', 'plants']) {
    for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) {
      const e = JSON.parse(await readFile(join(content, kind, id, 'entity.json'), 'utf8').catch(() => '{}')) as { scientificName?: string }
      if (e.scientificName) out.set(e.scientificName.toLowerCase(), id)
    }
  }
  return out
}

/**
 * Breed pages a text names, by their Vietnamese or English names of two words or more (a trailing "discus", "cichlid"
 * or "fish" dropped: "Blue Diamond" names Blue Diamond discus). A guide lists them in its mentions, so their pages link to it.
 */
export async function breedsNamed(content: string, text: string): Promise<string[]> {
  const plain = ` ${text.replace(/<[^>]+>/g, ' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  const out: string[] = []
  for (const id of (await readdir(join(content, 'breeds')).catch(() => [] as string[])).sort()) {
    const t = JSON.parse(await readFile(join(content, 'breeds', id, 'vi.json'), 'utf8').catch(() => 'null')) as { name: string; altNames: string[] } | null
    if (!t) continue
    const names = [t.name.replace(/\s*\(.*\)\s*$/, ''), t.name.match(/\(([^)]+)\)/)?.[1] ?? '', ...t.altNames]
      .flatMap(n => [n, n.replace(/\s+(discus|cichlid|fish)$/i, '')])
      .map(n => n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).filter(n => n.includes(' '))
    if (names.some(n => plain.includes(` ${n} `))) out.push(id)
  }
  return out
}

/**
 * A guide AquaTome writes itself: web research (cited facts, kept in engine-state/topics for --redo), a Vietnamese
 * guide written from the facts only and checked against them (one rewrite with the checker's notes), linked to the
 * species and plants it is about. Files: content/guides/<id>/{entity,vi}.json, source 'aquatome', with its references.
 */
/** The guide's id: content/guides/<id>, engine-state/topics/<id>.json. */
export const topicId = (topic: string) => `aquatome-${slugify(topic)}`.slice(0, 90).replace(/-+$/, '')

/** `leads`: more lines for the research, after the forum's (shops' posts on the topic, ideas.ts). */
export async function makeTopic(root: string, d: { research: Llm; llm: Llm }, a: TopicAsk, o: { researchModel?: string; writeModel?: string; reuse?: boolean; now?: () => Date; leads?: string } = {}) {
  const content = join(root, 'content')
  const id = topicId(a.topic)
  const factsFile = join(root, 'engine-state/topics', `${id}.json`)
  const kept = o.reuse ? JSON.parse(await readFile(factsFile, 'utf8').catch(() => 'null')) as TopicFacts | null : null
  // Forum threads on the topic (engine forum notes): a translated post leads to its original, the source to cite.
  const leads = kept ? '' : topicLeads(await readForumState(join(root, 'engine-state/forum/diendancacanh.json')), a.topic) + (o.leads ?? '')
  const researched = kept ?? await d.research<TopicFacts>({ system: 'You research fishkeeping topics carefully and cite every fact. Reply only with JSON.', prompt: researchPrompt(a) + leads, schema: FACTS_SCHEMA, model: o.researchModel ?? 'opus' })
  if (!kept) { await mkdir(join(root, 'engine-state/topics'), { recursive: true }); await writeFile(factsFile, `${JSON.stringify(researched, null, 2)}\n`) }
  if (!researched.found) return { id, skipped: `${a.topic}: nothing reliable found` }

  const { facts, refs, sources } = await citedFacts(root, researched)
  if (!facts.length) return { id, skipped: `${a.topic}: no cited facts` }

  const forWriter = { topic: a.topic, kind: a.kind, sources, facts }
  const write = (notes?: string[]) => d.llm<Written>({
    system: 'You write Vietnamese aquarium guides from facts. Reply only with JSON.', model: o.writeModel ?? 'opus', schema: WRITE_SCHEMA,
    prompt: `${WRITE}\n\n${STYLE}${notes?.length ? `\n\nBản trước có chỗ vượt quá dữ kiện. Sửa theo các ghi chú sau, chỉ viết điều dữ kiện có:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- DỮ KIỆN ---\n${JSON.stringify(forWriter, null, 1)}`,
  })
  const check = (x: Written) => checkGuide(d.llm, 'Vietnamese', forWriter, x)
  // A redo starts from what the last review of the guide on the site found, as the rewrite below does.
  const before = kept ? await lastKept(root, { id: `guides/${id}`, lang: 'vi' }, ['topic']) : undefined
  let w = await write(before?.notes)
  let review = await check(w)
  const tries = [review]
  if (review.score < QUALITY_THRESHOLD || review.notes.length) {
    const again = await write(review.notes)
    const r = await check(again)
    tries.push(r)
    if (r.score > review.score) { w = again; review = r }
  }

  const dir = join(content, 'guides', id)
  const prev = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8').catch(() => 'null')) as { slug: string } | null
  const taken = new Set<string>()
  for (const g of await readdir(join(content, 'guides')).catch(() => [] as string[])) {
    if (g === id) continue
    const t = JSON.parse(await readFile(join(content, 'guides', g, 'vi.json'), 'utf8').catch(() => '{}')) as { slug?: string }
    if (t.slug) taken.add(t.slug)
  }
  const name = unescapePlain(w.name).trim()
  const slug = prev?.slug ?? pickSlug(name.replace(/:.*$/, ''), 'huong-dan', taken)
  const ids = await idsByName(content)
  const today = (o.now?.() ?? new Date()).toISOString().slice(0, 10)
  // A rewrite keeps the photos put on the guide since (our drawings, photos picked for its sections).
  const prevEntity = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8').catch(() => 'null')) as GuideEntity | null
  const entity: GuideEntity = GuideSchema.parse({
    id, kind: a.kind, source: 'aquatome', sourceUrl: `https://aquatome.com/vi/huong-dan/${slug}/`, html: '', photos: prevEntity?.photos ?? [],
    mentions: [...new Set([...researched.species.map(s => ids.get(s.replace(/\s*\(.*$/, '').trim().toLowerCase())).filter((x): x is string => !!x), ...await breedsNamed(content, `${w.summary.join(' ')} ${w.body}`)])],
    updatedAt: today, refs,
  })
  // Metric only: the writer keeps the facts' own units (doses are never changed by a model); the conversion is ours.
  const prevVi = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8').catch(() => 'null')) as Translation | null
  const vi = TranslationSchema.parse(metricPage({
    slug, name, altNames: [], sections: {}, body: prevVi?.bodyFixed ? prevVi.body : sanitizeHtml(w.body), ...plainParts(w.summary, w.faq),
    quality: { score: review.score, indexable: review.score >= QUALITY_THRESHOLD },
    ...(prevVi?.localNote ? { localNote: prevVi.localNote } : {}),
    ...(prevVi?.bodyFixed ? { bodyFixed: true } : {}),
  }, 'vi'))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify(entity, null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), `${JSON.stringify(vi, null, 2)}\n`)
  await logReviews(root, 'topic', { id: `guides/${id}`, lang: 'vi' }, tries, review, o.now ? { now: o.now() } : {})
  return { id, slug, score: review.score, notes: review.notes, refs: refs.length }
}

/**
 * An AquaTome guide in another site language, written afresh from the same research (engine-state/topics/<id>.json)
 * rather than translated from the Vietnamese: facts about Vietnam itself are left out, the rest written for that
 * country's hobbyists and checked against the facts like the Vietnamese one. content/guides/<id>/<lang>.json; a guide
 * already done is skipped unless redo. Thai pages are addressed by an English slug the writer gives.
 */
export async function localizeTopic(root: string, llm: Llm, id: string, lang: TargetLang, o: { model?: string; redo?: boolean } = {}) {
  const file = join(root, 'content/guides', id, `${lang}.json`)
  if (!o.redo && (await readFile(file, 'utf8').then(() => true, () => false))) return { id, skipped: 'done' }
  return piece(`${lang}/${id}`, async () => {
    const researched = JSON.parse(await readFile(join(root, 'engine-state/topics', `${id}.json`), 'utf8')) as TopicFacts
    const vi = JSON.parse(await readFile(join(root, 'content/guides', id, 'vi.json'), 'utf8')) as { name: string }
    const entity = JSON.parse(await readFile(join(root, 'content/guides', id, 'entity.json'), 'utf8')) as GuideEntity
    const { facts, refs, sources } = localFacts(researched, entity)
    if (!facts.length) return { id, skipped: 'no facts' }
    const forWriter = { topic: vi.name, kind: entity.kind, sources, facts }
    const T = TARGETS[lang]
    const prompt = (notes?: string[]) => `${INTL.replaceAll('{{LANG}}', T.lang).replaceAll('{{COUNTRY}}', T.country).replace('{{STYLE}}', T.style)}${notes?.length ? `\n\nThe previous version went beyond the facts. Fix these, writing only what the facts say:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- FACTS (topic given in Vietnamese) ---\n${JSON.stringify(forWriter, null, 1)}`
    const write = (notes?: string[]) => llm<Written & { slug: string }>({ system: `You write ${T.lang} aquarium guides from facts. Reply only with JSON.`, model: o.model ?? 'opus', schema: INTL_SCHEMA, prompt: prompt(notes) })
    const check = (x: Written) => checkGuide(llm, T.lang, forWriter, x)
    // A redo starts from what the last review of the guide on the site found.
    const before = o.redo ? await lastKept(root, { id: `guides/${id}`, lang }, ['topic']) : undefined
    let w = await write(before?.notes)
    let review = await check(w)
    const tries = [review]
    if (review.score < QUALITY_THRESHOLD || review.notes.length) {
      const again = await write(review.notes)
      const r = await check(again)
      tries.push(r)
      if (r.score > review.score) { w = again; review = r }
    }
    // A season none of its readers' countries has (seasons.ts), written once more with the condition in its place; a copy
    // that still names one isn't saved (the chief of staff, 13 Nov 2026: eight guides' copies told readers in Indonesia,
    // Thailand and Malaysia about a summer, a winter or koi fed by spring and autumn).
    const named = foreignSeasons(savedText(w), lang)
    if (named.length) {
      const fixed = await write([`It names another place's season: ${named.map(s => `"${s}"`).join(', ')}. Write the condition the facts tie to it instead, and leave the season out.`, ...review.notes])
      const r = await check(fixed)
      tries.push(r)
      const left = foreignSeasons(savedText(fixed), lang)
      // Not saved, and every try's review logged, none of them kept (Astra's read).
      if (left.length) { await logReviews(root, 'topic', { id: `guides/${id}`, lang }, tries, undefined); return { id, skipped: `names another place's season: ${left.join(', ')}` } }
      w = fixed
      review = r
    }
    const taken = new Set<string>()
    for (const g of await readdir(join(root, 'content/guides')).catch(() => [] as string[])) {
      if (g === id) continue
      const t = JSON.parse(await readFile(join(root, 'content/guides', g, `${lang}.json`), 'utf8').catch(() => '{}')) as { slug?: string }
      if (t.slug) taken.add(t.slug)
    }
    const prev = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as { slug: string } | null
    const name = unescapePlain(w.name).trim()
    const slug = prev?.slug ?? pickSlug(lang === 'th' || !slugify(name) ? w.slug : name.replace(/:.*$/, ''), T.slugWords.guide, taken)
    const t = TranslationSchema.parse(metricPage({
      slug, name, altNames: [], sections: {}, body: sanitizeHtml(w.body), ...plainParts(w.summary, w.faq),
      refs, quality: { score: review.score, indexable: review.score >= QUALITY_THRESHOLD },
    }, lang))
    await writeFile(file, `${JSON.stringify(t, null, 2)}\n`)
    await logReviews(root, 'topic', { id: `guides/${id}`, lang }, tries, review)
    return { id, slug, score: review.score, notes: review.notes }
  })
}
