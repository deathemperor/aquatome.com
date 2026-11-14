import { z } from 'zod'
import { LANGS, type Lang } from './langs'

/**
 * The editorial calendar (content/curation.json): what the app's Hôm nay and Khám phá lead with, day by day and week by
 * week. The engine plans it (`pnpm engine curate`) and the build turns it into each language's app index (`home.days`,
 * `home.week`, `home.hero`, `home.shelves`, an item's `loop`). A page is named by its kind and content id
 * ("species/betta-splendens", "guides/<id>"), the same in every language: the build gives each language its own address,
 * and a pick that language has no page for is left out there, where the app falls back to its rotation.
 */

/** A short text in each language that has one. A language without it falls back to the page's own words. */
const Copy = z.partialRecord(z.enum(LANGS), z.string().min(1).max(140))
export const REF_KINDS = ['species', 'breeds', 'guides', 'plants'] as const
const Ref = z.string().regex(/^(species|breeds|guides|plants)\/[A-Za-z0-9_-]+$/)
/** A photo on our media host, at full size, to show in place of the page's own. */
const Img = z.string().regex(/^https:\/\/(media\.aquatome\.com|images\.unsplash\.com)\//)
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** One of the app's short cards (content/cards, cards.ts), which have no page on the site. */
const CardRef = z.string().regex(/^cards\/[a-z0-9-]+$/)

/** A story card: a page told in a few words. Without `img` it is drawn without a photo. */
const Story = z.object({ page: Ref, img: Img.optional(), eyebrow: Copy.optional(), title: Copy.optional(), dek: Copy.optional() })
/** A language's own picks for a day, where its readers' market or its pages differ. */
const LangPicks = z.object({ fish: Ref.optional(), img: Img.optional(), guide: Ref.optional(), guideImg: Img.optional() })

export const CurationDaySchema = z.object({
  date: Day,
  /** The fish of the day: a species or breed page. */
  fish: Ref.optional(),
  /**
   * The fish card's photo: the page's head photo, big enough for a large card (the planner sets it; never another photo).
   * The app shows this one, never the index's small photo scaled up.
   */
  img: Img.optional(),
  guide: Ref.optional(),
  /** The guide card's photo: the page's head photo when it's big enough for a large card; without it the card is drawn without a photo. */
  guideImg: Img.optional(),
  story: Story.optional(),
  /** A short card in the story's place, shown in the languages it's written in, within its `show` days. */
  card: CardRef.optional(),
  by: z.partialRecord(z.enum(LANGS), LangPicks).optional(),
  /** Why the planner picked these (the season, demand, what's new): for the owner's report, never shown in the app. */
  why: z.string().max(300).optional(),
  /** A person chose this day: the planner keeps it as long as its pages pass. */
  fixed: z.literal(true).optional(),
}).refine(d => !(d.story && d.card), { message: 'a day has a story or a card, not both' })

export const CurationWeekSchema = z.object({
  from: Day,
  to: Day,
  theme: Copy,
  /** What the planner looks for in this week's fish (curation.ts TAGS in the engine). */
  tags: z.array(z.string()).default([]),
  /** Fish and guides the week prefers, in order; the planner fills the days from them first. */
  fish: z.array(Ref).default([]),
  guides: z.array(Ref).default([]),
  /** Khám phá's top cards, in order. */
  hero: z.array(z.object({ page: Ref, img: Img.optional(), eyebrow: Copy.optional(), title: Copy.optional() })).default([]),
  /** Collections for Khám phá, in order. */
  shelves: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), title: Copy, pages: z.array(Ref).min(3) })).default([]),
  why: z.string().max(300).optional(),
})

/** A short silent loop of the species, real footage under a licence we can use (the media lead checks every one). */
export const LoopSchema = z.object({
  /** HEVC (hvc1), faststart, no audio track, BT.709, square. */
  src: z.string().regex(/^https:\/\/media\.aquatome\.com\/loops\/[a-z0-9-]+\.mp4$/),
  /** H.264, for browsers without HEVC. */
  h264: z.string().regex(/^https:\/\/media\.aquatome\.com\/loops\/[a-z0-9-]+\.mp4$/).optional(),
  poster: z.string().regex(/^https:\/\/media\.aquatome\.com\/loops\/[a-z0-9-]+\.webp$/),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  seconds: z.number().positive().max(10),
  licence: z.string().min(1),
  /** The licence's own page (for Creative Commons, its deed), which the credit links. Every loop is cut from a longer
   * clip and looped, and the credit says so: CC BY and BY-SA ask that a change be noted (council, 2026-11-08). */
  licenceUrl: z.string().url(),
  author: z.string().min(1),
  /** The original's page, for the credit. */
  source: z.string().url(),
  /** The original's title, which the credit shows: CC BY 3.0, YouTube's Creative Commons licence, asks for it. */
  title: z.string().min(1).optional(),
  /** The record of what was taken, kept for the licence and not sent to the app: where in the original the loop was cut
   * (seconds, all the footage used, its crossfade's second too), the day the licence was read on the original's page, and
   * a dated copy of that page (Internet Archive). */
  cut: z.object({ from: z.number().nonnegative(), to: z.number().positive() }).refine(c => c.to > c.from, 'a cut ends after it starts').optional(),
  checkedAt: Day.optional(),
  snapshot: z.string().url().optional(),
  /** Set on a loop kept until better footage comes: what replaces it, and when. The media lead's to act on; the app
   * shows the loop as any other. */
  replace: z.string().min(1).optional(),
}).superRefine((l, ctx) => {
  // make-loop.sh makes a loop from its cut one of two ways: the cut less a crossfade of up to a second, or (BOUNCE) the cut
  // backward and forward again, twice its length.
  if (l.cut) {
    const len = l.cut.to - l.cut.from
    if (!(l.seconds <= len + 0.05 && l.seconds >= len - 1.05) && Math.abs(l.seconds - 2 * len) > 0.1) ctx.addIssue({ code: 'custom', message: `a loop of ${l.seconds} s doesn't fit its ${len} s cut: the cut less its crossfade (up to 1 s), or twice the cut for one that plays back and forth` })
  }
  // A loop cut from YouTube: only from a video its uploader released under YouTube's Creative Commons licence (CC BY
  // 3.0), with the whole record, since a mark can be changed later (docs/curation.md, Video loops).
  if (!/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(l.source) && !/youtu\.?be/.test(l.source)) return
  if (l.licence !== 'CC BY 3.0' || l.licenceUrl !== 'https://creativecommons.org/licenses/by/3.0/') ctx.addIssue({ code: 'custom', message: 'a YouTube loop is CC BY 3.0, the licence YouTube offers' })
  if (!/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(l.source)) ctx.addIssue({ code: 'custom', message: 'a YouTube loop names its video as https://www.youtube.com/watch?v=<id>' })
  for (const k of ['title', 'cut', 'checkedAt', 'snapshot'] as const) if (l[k] === undefined) ctx.addIssue({ code: 'custom', message: `a YouTube loop records its ${k}` })
  // A dated copy of this video's own page (an id is letters, digits, - and _: nothing a pattern reads).
  const id = l.source.match(/[?&]v=([\w-]{11})$/)?.[1]
  if (l.snapshot && !new RegExp(`^https://web\\.archive\\.org/web/\\d{14}/https://www\\.youtube\\.com/watch\\?v=${id}$`).test(l.snapshot)) ctx.addIssue({ code: 'custom', message: "a YouTube loop's snapshot is a dated Internet Archive copy of its own video's page" })
})

/**
 * A keepers' group on Khám phá's chips row (the Design Lead's spec-chips.md; the Writing Lead's groups and words, the chief of
 * staff's order, 13 Nov). Which fish it holds is a rule, so a fish the engine adds joins without an edit here: a species is
 * in where it matches every field given (each a list, any of whose values will do) or is named in `species`; a breed is in
 * where what it is a form of, or for a cross its parents, is in, or where it is named in `breeds`.
 */
export const ChipSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Its word in each language whose keepers' word is settled (read by the editors); a language without one has no such chip. */
  names: z.partialRecord(z.enum(LANGS), z.string().trim().min(1).max(30)),
  match: z.object({
    group: z.array(z.string()).optional(),
    /** A place the species lives in (a continent, a country: `places`). */
    places: z.array(z.string()).optional(),
    family: z.array(z.string()).optional(),
    genus: z.array(z.string()).optional(),
    species: z.array(z.string()).optional(),
    breeds: z.array(z.string()).optional(),
    /** Species or breeds the rule would take that keepers don't count in the group, by id (Tép leaves out crayfish and
     * marine shrimp: the Writing Lead, 14 Nov). A breed of a species left out is out too. */
    except: z.array(z.string()).optional(),
  }).refine(({ except: _, ...m }) => Object.values(m).some(v => v?.length), 'a chip holds some fish'),
  /** Members whose photo is tried first for its picture, in order. */
  cover: z.array(z.string()).optional(),
  /**
   * Guides by id, set by hand against the title rule (chipGuides): `add`, one about the group whose title misses its
   * names (Ali's are titled "cichlid châu Phi"); `off`, one whose title holds a name and isn't about it ("cá ốc", the
   * shell dwellers, under Ốc).
   */
  guides: z.object({ add: z.array(z.string()).optional(), off: z.array(z.string()).optional() }).optional(),
})

export const CurationSchema = z.object({
  version: z.literal(1),
  weeks: z.array(CurationWeekSchema),
  days: z.array(CurationDaySchema),
  /** Loops by species or breed id. */
  loops: z.record(z.string(), LoopSchema).default({}),
  /** Photos never to lead a card, with why (a sick fish, a dark tank where the fish is small). */
  avoid: z.record(z.string(), z.string()).default({}),
  /**
   * Head photos, by the address a card loads, whose fish Hôm nay's card cuts, with why. That card crops its photo by the
   * middle to the space under the fish's name, and a long fish's snout can fall outside it. Such a photo still leads its
   * page and Khám phá's wide card; its fish isn't a day's fish while it is the head.
   */
  todayCut: z.record(z.string(), z.string()).default({}),
  /**
   * Pages the weeks' top cards, shelves or days' stories name that don't pass reader fit now, with why. The planner
   * writes it afresh on each run and the build leaves them out, so the editor's picks come back once they pass. A day's
   * fish and guide are replaced instead.
   */
  off: z.record(z.string(), z.string()).default({}),
  /**
   * Tìm's suggested searches ("Gợi ý tìm kiếm") in each language, in order: eight a reader of that language types, each
   * finding its own page or its topic first in that language's index with the app's search (Curation checks them there).
   * A language with fewer than eight that pass has none, and the app shows no section (the chief of staff, 2026-11-12).
   */
  searches: z.partialRecord(z.enum(LANGS), z.array(z.string().trim().min(1).max(40)).length(8)
    .refine(xs => new Set(xs.map(x => x.toLowerCase())).size === xs.length, 'a search listed twice')).default({}),
  /**
   * Khám phá's chips row, in its order, a plain list the owner may reorder or strike from (ChipSchema; the chief of staff,
   * 14 Nov: an order computed from counts put groups of one fish with many breeds last).
   */
  chips: z.array(ChipSchema).default([]).refine(cs => new Set(cs.map(c => c.id)).size === cs.length, 'a chip listed twice'),
})

export type Curation = z.infer<typeof CurationSchema>
export type CurationDay = z.infer<typeof CurationDaySchema>
export type CurationWeek = z.infer<typeof CurationWeekSchema>
export type Loop = z.infer<typeof LoopSchema>
export type Chip = z.infer<typeof ChipSchema>
export type CurationCopy = Partial<Record<Lang, string>>

/** The owner's day, in Vietnam (UTC+7): the readers' four countries are UTC+7 or +8. */
export const vnDate = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
