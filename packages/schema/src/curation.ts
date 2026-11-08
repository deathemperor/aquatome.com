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

/** A story card: a page told in a few words. Without `img` it is drawn without a photo. */
const Story = z.object({ page: Ref, img: Img.optional(), eyebrow: Copy.optional(), title: Copy.optional(), dek: Copy.optional() })
/** A language's own picks for a day, where its readers' market or its pages differ. */
const LangPicks = z.object({ fish: Ref.optional(), img: Img.optional(), guide: Ref.optional(), guideImg: Img.optional() })

export const CurationDaySchema = z.object({
  date: Day,
  /** The fish of the day: a species or breed page. */
  fish: Ref.optional(),
  /**
   * The fish card's photo: one of the page's checked photos, big enough for a large card (the planner sets it). The app
   * shows this one, never the index's small photo scaled up.
   */
  img: Img.optional(),
  guide: Ref.optional(),
  /** The guide card's photo, when one is big enough for a large card; without it the card is drawn without a photo. */
  guideImg: Img.optional(),
  story: Story.optional(),
  by: z.partialRecord(z.enum(LANGS), LangPicks).optional(),
  /** Why the planner picked these (the season, demand, what's new): for the owner's report, never shown in the app. */
  why: z.string().max(300).optional(),
  /** A person chose this day: the planner keeps it as long as its pages pass. */
  fixed: z.literal(true).optional(),
})

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
  /** Set on a loop kept until better footage comes: what replaces it, and when. The media lead's to act on; the app
   * shows the loop as any other. */
  replace: z.string().min(1).optional(),
})

export const CurationSchema = z.object({
  version: z.literal(1),
  weeks: z.array(CurationWeekSchema),
  days: z.array(CurationDaySchema),
  /** Loops by species or breed id. */
  loops: z.record(z.string(), LoopSchema).default({}),
  /** Photos never to lead a card, with why (a sick fish, a dark tank where the fish is small). */
  avoid: z.record(z.string(), z.string()).default({}),
})

export type Curation = z.infer<typeof CurationSchema>
export type CurationDay = z.infer<typeof CurationDaySchema>
export type CurationWeek = z.infer<typeof CurationWeekSchema>
export type Loop = z.infer<typeof LoopSchema>
export type CurationCopy = Partial<Record<Lang, string>>

/** The owner's day, in Vietnam (UTC+7): the readers' four countries are UTC+7 or +8. */
export const vnDate = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
