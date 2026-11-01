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
export const Summary = z.object({ t: z.literal('summary'), title: z.string(), items: z.array(z.string()) })
export const Faq = z.object({ t: z.literal('faq'), title: z.string(), items: z.array(z.object({ q: z.string(), a: z.string() })) })
/** The sources a page cites; `id` is the anchor the page's credit links to (`#nguon`). */
export const Refs = z.object({
  t: z.literal('refs'),
  title: z.string(),
  id: z.string().optional(),
  items: z.array(z.object({ title: z.string(), url: z.string() })),
})
/** Other pages, by their paths, each one the app index lists (the next guides, the fish and plants a guide names). */
export const Pages = z.object({ t: z.literal('pages'), title: z.string(), paths: z.array(z.string()) })
/** A part only the web page can show: the app offers to open the page there. */
export const Web = z.object({ t: z.literal('web') })

type BlockT =
  | z.infer<typeof Heading> | z.infer<typeof Paragraph> | { t: 'list'; ordered?: true; items: BlockT[][] } | z.infer<typeof Table>
  | z.infer<typeof Figure> | z.infer<typeof Moments> | z.infer<typeof Summary> | z.infer<typeof Faq> | z.infer<typeof Refs>
  | z.infer<typeof Pages> | z.infer<typeof Web>
/** A list; each item is blocks (mostly one paragraph, sometimes a list inside it). */
export const List: z.ZodType<{ t: 'list'; ordered?: true; items: BlockT[][] }> = z.lazy(() =>
  z.object({ t: z.literal('list'), ordered: z.literal(true).optional(), items: z.array(z.array(Block)) }))
export const Block: z.ZodType<BlockT> = z.lazy(() =>
  z.union([Heading, Paragraph, List, Table, Figure, Moments, Summary, Faq, Refs, Pages, Web]))

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
  kind: z.enum(['guide', 'fish', 'plant', 'glossary']),
  /** The web page: what "open on the web" and sharing use, and the app index's `path` for it. */
  path: z.string(),
  title: z.string(),
  /** A scientific name. */
  sub: z.string().optional(),
  /** The line above the title, as the site writes it ("Chăm sóc · đọc khoảng 6 phút"). */
  meta: z.string().optional(),
  /** Whose page this is ("Theo Aquarium Breeder"), linked as on the site. */
  credit: Text.optional(),
  lead: Image.optional(),
  video: Video.optional(),
  blocks: z.array(Block),
})

export type Inline = z.infer<typeof Inline>
export type Run = z.infer<typeof Run>
export type Image = z.infer<typeof Image>
export type Block = BlockT
export type PageDoc = z.infer<typeof PageDoc>

/**
 * Pages come in shards, not one file each (the site's static files stay few): `/app/pages/<lang>/<kind>-<n>.json` holds
 * every page of that kind whose path hashes to n. The app index says how many shards each kind has (`pages`, a power of
 * two). The hash is 32-bit FNV-1a over the path's UTF-8 bytes; protocols/page-vectors.json has cases.
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
