import { z } from 'zod'

/**
 * A content page as blocks, for an app that draws pages itself (the iOS app): the same page the site shows at `path`,
 * built from the same pieces (apps/site/src/lib/app-page.ts). JSON Schema: protocols/page.schema.json, generated from
 * this file; shared cases: protocols/page-vectors.json.
 *
 * A reader of this format meets a block whose `t` it doesn't know (a newer site) as "open this page on the web", and
 * a field it doesn't know as nothing: never as a page it can't show. So new blocks and fields need no version change;
 * `v` changes only if a known block changes meaning.
 */
export const PAGE_VERSION = 1

/** A short explanation shown when a link is tapped (a glossary term, a citation), as the site's data-term / data-tip. */
export const Tip = z.object({ term: z.string(), text: z.string() })
/**
 * Styled or linked text. `href` is a site path, an absolute URL, or `#id` (the block with that id on this page). A path
 * the app index lists opens that page in the app; any other path opens on the web.
 */
export const Run = z.object({
  text: z.string(),
  b: z.literal(true).optional(),
  i: z.literal(true).optional(),
  href: z.string().optional(),
  tip: Tip.optional(),
})
/** Text, plain (a string) or styled. A line break inside a paragraph is `\n`. */
export const Inline = z.union([z.string(), Run])
export const Text = z.array(Inline)

/** A photo's credit as the page shows it: the line ("Ảnh: Aquarium Breeder"), its licence, the photo's own page. */
export const Credit = z.object({ text: z.string(), licence: z.string(), url: z.string().optional() })
export const Image = z.object({
  src: z.string(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  alt: z.string().optional(),
  credit: Credit.optional(),
})

export const Heading = z.object({ t: z.literal('h'), text: z.string(), id: z.string().optional() })
export const Paragraph = z.object({ t: z.literal('p'), c: Text })
/** Rows of cells; `head` is the header row, when the table has one. */
export const Table = z.object({ t: z.literal('table'), head: z.array(Text).optional(), rows: z.array(z.array(Text)) })
/** A photo in the text; `href` is the page it shows (a fish or plant named there). */
export const Figure = z.object({ t: z.literal('figure'), img: Image, caption: Text.optional(), href: z.string().optional() })
/** Stills from a guide's video, each playing it from that moment (`at`, seconds). */
export const Moments = z.object({
  t: z.literal('moments'),
  title: z.string(),
  youtubeId: z.string(),
  items: z.array(z.object({ at: z.number().int().nonnegative(), img: Image, caption: z.string() })),
})
/**
 * A guide's key points (`items`), or a fish's summary: one paragraph (`text`), which `items` also holds as its only
 * item, for apps that predate `text`. A fish's also has the mistakes keepers make (`mistakes`) and who wrote it (`by`,
 * "AquaTome tóm tắt từ các nguồn bên dưới.").
 */
export const Summary = z.object({
  t: z.literal('summary'),
  title: z.string(),
  text: z.string().optional(),
  items: z.array(z.string()),
  mistakes: z.object({ title: z.string(), items: z.array(z.string()) }).optional(),
  by: z.string().optional(),
})
export const Faq = z.object({ t: z.literal('faq'), title: z.string(), items: z.array(z.object({ q: z.string(), a: z.string() })) })
/**
 * The sources a page cites; `id` is the anchor the page's credit links to (`#nguon`). On a fish's or plant's page they
 * are numbered as the marks in its text (a run whose `tip` names the source), and `note` says on what terms the text
 * uses them.
 */
export const Refs = z.object({
  t: z.literal('refs'),
  title: z.string(),
  id: z.string().optional(),
  items: z.array(z.object({ title: z.string(), url: z.string() })),
  note: z.string().optional(),
})
/** Other pages, by their paths, each one the app index lists (the next guides, the fish and plants a guide names). */
export const Pages = z.object({ t: z.literal('pages'), title: z.string(), paths: z.array(z.string()) })
/** A part only the web page can show: the app offers to open the page there. */
export const Web = z.object({ t: z.literal('web') })

// Fish, plant and glossary pages (added after the first app that reads this format: it shows each block below as "open on
// the web", so those kinds are at level 2, which the first app doesn't know; see PageShard).

/** A photo of a gallery: `thumb` is a smaller copy (about 480 px wide) for a grid of them. */
export const GalleryPhoto = Image.extend({ thumb: z.string().optional() })
/**
 * A fish's or plant's photo gallery, every photo with its credit, in the gallery page's order. `strip`: the photos the
 * page shows in its row, by their place in `photos` (a photo the page shows elsewhere is left out of the row, not out of
 * the gallery). `note`: how many photos, from which sites, under what licences, as the gallery page says. `href`: the
 * gallery's own web page.
 */
export const Gallery = z.object({
  t: z.literal('gallery'),
  title: z.string(),
  note: z.string(),
  photos: z.array(GalleryPhoto),
  strip: z.array(z.number().int().nonnegative()),
  href: z.string().optional(),
})
/**
 * What each figure on a fish's data card rests on (the site's "Nguồn và độ tin cậy"), in the card's order. The figures
 * themselves are the app index's (`facts`), so they aren't repeated here. A row names the sources that give the figure
 * (`items`); where they disagree (`conflict`, the card's dot, explained by `legend`), each source's own figure and which
 * one the card shows (`note`).
 */
export const Trust = z.object({
  t: z.literal('trust'),
  title: z.string(),
  legend: z.string().optional(),
  rows: z.array(z.object({
    /** The index's name for the figure: tempC, ph, gh, sizeCm, tankCm, difficulty. */
    field: z.string(),
    label: z.string(),
    conflict: z.literal(true).optional(),
    note: z.string().optional(),
    items: z.array(z.string()),
  })),
})
/** Another fish to keep with this one or away from it: its page, name, photo, and why to keep it away. */
const Mate = z.object({ path: z.string(), name: z.string(), img: Image.optional(), why: z.string().optional() })
/**
 * "Nuôi chung": fish to keep with this one (`good`) and fish to keep away (`avoid`), as the tank-mates tool judges them,
 * what the suggestions rest on (`note`), and the tool, set to this fish (`tool`). The fish's own temperament and shoal
 * size are the index's facts.
 */
export const Mates = z.object({
  t: z.literal('mates'),
  title: z.string(),
  good: z.object({ title: z.string(), items: z.array(Mate) }).optional(),
  avoid: z.object({ title: z.string(), items: z.array(Mate) }).optional(),
  note: z.string().optional(),
  tool: z.object({ text: z.string(), href: z.string() }),
})
/**
 * "Nuôi ở Việt Nam" (Vietnamese pages): what the fish's temperature range means for a tank with no heater or chiller,
 * region by region (`ok`: fine as it is), and the water temperatures that assumes (`note`).
 */
export const Climate = z.object({
  t: z.literal('climate'),
  title: z.string(),
  items: z.array(z.object({ label: z.string(), ok: z.boolean(), text: z.string() })),
  note: z.string(),
})
/**
 * Cards for other pages, each drawn from what it carries rather than the app index (a fish's breeds and hybrids, which
 * the index may not list): the path opens in the app when the index lists it, else on the web. `sub`: the line under
 * the name (a breed's kind).
 */
export const Cards = z.object({
  t: z.literal('cards'),
  title: z.string(),
  items: z.array(z.object({ path: z.string(), name: z.string(), sub: z.string().optional(), img: Image.optional() })),
})
/** Videos about a fish (not guides), each played on YouTube. `lang`: its language as the page names it ("EN", "tiếng Việt"). */
export const Videos = z.object({
  t: z.literal('videos'),
  title: z.string(),
  items: z.array(z.object({ youtubeId: z.string(), title: z.string(), durationSec: z.number().int().nonnegative(), lang: z.string() })),
})

type BlockT =
  | z.infer<typeof Heading> | z.infer<typeof Paragraph> | { t: 'list'; ordered?: true; items: BlockT[][] } | z.infer<typeof Table>
  | z.infer<typeof Figure> | z.infer<typeof Moments> | z.infer<typeof Summary> | z.infer<typeof Faq> | z.infer<typeof Refs>
  | z.infer<typeof Pages> | z.infer<typeof Web> | z.infer<typeof Gallery> | z.infer<typeof Trust> | z.infer<typeof Mates>
  | z.infer<typeof Climate> | z.infer<typeof Cards> | z.infer<typeof Videos>
/** A list; each item is blocks (mostly one paragraph, sometimes a list inside it). */
export const List: z.ZodType<{ t: 'list'; ordered?: true; items: BlockT[][] }> = z.lazy(() =>
  z.object({ t: z.literal('list'), ordered: z.literal(true).optional(), items: z.array(z.array(Block)) }))
export const Block: z.ZodType<BlockT> = z.lazy(() =>
  z.union([Heading, Paragraph, List, Table, Figure, Moments, Summary, Faq, Refs, Pages, Web, Gallery, Trust, Mates, Climate, Cards, Videos]))

/** A guide's video: the app shows its thumbnail and plays it on YouTube, from a chapter's start (`at`, seconds) if picked. */
export const Video = z.object({
  youtubeId: z.string(),
  title: z.string(),
  channel: z.string(),
  durationSec: z.number().int().positive(),
  /** The badge when the video has Vietnamese subtitles (the site's "Phụ đề tiếng Việt"); none when it's in the page's language. */
  subtitles: z.string().optional(),
  chapters: z.array(z.object({ at: z.number().int().nonnegative(), title: z.string() })).optional(),
})

export const PageDoc = z.object({
  v: z.literal(PAGE_VERSION),
  kind: z.enum(['guide', 'fish', 'plant', 'glossary', 'video']),
  /** The web page: what "open on the web" and sharing use, and the app index's `path` for it. */
  path: z.string(),
  title: z.string(),
  /** A scientific name. */
  sub: z.string().optional(),
  /** The line above the title, as the site writes it ("Chăm sóc · đọc khoảng 6 phút"). */
  meta: z.string().optional(),
  /** A fish's line above its name, as the site writes it: its family and country, the country linked to its origin page. */
  where: Text.optional(),
  /** Its other names, as the site writes them under the name ("Tên khác: …"). */
  aka: z.string().optional(),
  /** Whose page this is ("Theo Aquarium Breeder"; a fish's "Dịch và tổng hợp từ …"), linked as on the site. */
  credit: Text.optional(),
  lead: Image.optional(),
  video: Video.optional(),
  /**
   * The keys of the page's readers' sections, as its web page has them (`data-entity`): its comments (`/_c?e=`) and its
   * readers' photos (`/_p?e=`). One it lacks, the page has no such section.
   */
  talk: z.object({ comments: z.string().optional(), photos: z.string().optional() }).optional(),
  blocks: z.array(Block),
})

export type Inline = z.infer<typeof Inline>
export type Run = z.infer<typeof Run>
export type Image = z.infer<typeof Image>
export type Block = BlockT
export type PageDoc = z.infer<typeof PageDoc>

/**
 * Pages come in shards, not one file each (the site's static files stay few): `/app/pages/<lang>/<kind>-<n>.json` holds
 * every page of that kind whose path hashes to n. The hash is 32-bit FNV-1a over the path's UTF-8 bytes;
 * protocols/page-vectors.json has cases.
 *
 * The app index says how many shards each kind has, and which apps may draw it:
 * - `shards`: every kind with pages, as `{ n, level }`. `n` is its shard count (a power of two); `level` is the level an
 *   app must know to draw that kind itself.
 * - `pages`: the shard counts alone, of guides only. The first app reads this and draws every kind it lists, so it stays
 *   as it is, for the apps already installed: no kind is ever added to it.
 *
 * Levels:
 * - An app draws a kind itself only when the kind's `level` is at or below the level the app knows (`drawnKinds`).
 *   It opens the other kinds' pages on the web.
 * - Level 1 is the first app's: guides, the kind `pages` lists.
 * - Level 2: fish, plant and glossary pages, with the blocks gallery, trust, mates, climate, cards and videos, and video
 *   series, whose guides are cards. The iOS app that reads `shards` knows level 2.
 * - A kind that needs a block no shipped app knows gets the next level: one above the highest an app has shipped
 *   knowing. An app that knows a lower level keeps that kind on the web.
 *
 * protocols/page-vectors.json `levels` has cases.
 */
export const PageShard = z.object({ v: z.literal(PAGE_VERSION), pages: z.record(z.string(), PageDoc) })
export type PageShard = z.infer<typeof PageShard>

export function pageShard(path: string, shards: number): number {
  let h = 0x811c9dc5
  for (const b of new TextEncoder().encode(path)) h = Math.imul(h ^ b, 0x01000193) >>> 0
  return h % shards
}

/** How many shards for this many pages: about 8 pages each, a power of two (so the count changes rarely). */
export function shardCount(pages: number): number {
  let n = 1
  while (n * 8 < pages) n *= 2
  return n
}

/** A kind's entry in the app index's `shards`: how many shards it has, and the level an app must know to draw it. */
export type KindShards = { n: number; level: number }

/** The kinds an app that knows `appLevel` draws itself, in the order `shards` gives them; it opens the others on the web. */
export function drawnKinds(shards: Partial<Record<PageDoc['kind'], KindShards>>, appLevel: number): PageDoc['kind'][] {
  return (Object.entries(shards) as [PageDoc['kind'], KindShards][]).filter(([, s]) => s.level <= appLevel).map(([k]) => k)
}
