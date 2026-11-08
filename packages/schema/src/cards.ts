import { z } from 'zod'
import { PhotoSchema } from './schemas'

/**
 * Short cards for the app's Hôm nay (content/cards/<id>/entity.json and <lang>.json): trivia, a newly described species, a
 * trend, an event, a product. They have no page on the site. The editorial calendar names one as `cards/<id>`, a day's
 * `card` (docs/curation.md). Each cites dated sources and is written through the Writing Lead's writer and gate.
 */
export const CARD_TYPES = ['trivia', 'new-species', 'trend', 'event', 'product'] as const
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** A page the card is about, by its kind and content id, as the calendar names pages. */
const About = z.string().regex(/^(species|breeds|guides|plants|products)\/[A-Za-z0-9_-]+$/)
const Source = z.object({ url: z.string().url(), title: z.string().min(1), publisher: z.string().min(1), date: Day, accessed: Day })

export const CardSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  type: z.enum(CARD_TYPES),
  about: z.array(About).default([]),
  sources: z.array(Source).min(1),
  /** The days it may be shown, Vietnam's, both included. */
  show: z.object({ from: Day, until: Day }),
  event: z.object({ start: Day, end: Day, place: z.string().min(1), country: z.string().regex(/^[A-Z]{2}$/), organiser: z.string().min(1) }).optional(),
  product: z.string().regex(/^products\/[A-Za-z0-9_-]+$/).optional(),
  photo: PhotoSchema.optional(),
  /** Shown again this many days after, while `show` lasts. */
  rotate: z.number().int().positive().optional(),
  updatedAt: Day,
}).superRefine((c, ctx) => {
  const say = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (c.show.until < c.show.from) say('show.until is before show.from')
  if (c.type === 'event' && !c.event) say('an event card needs `event`')
  if (c.event && c.event.end < c.event.start) say('event.end is before event.start')
  if (c.type === 'product' && !c.product) say('a product card needs `product`')
})

/** Why the gate holds a card back in this language (gate.ts `Held`): the build leaves it out. */
const Held = z.object({ checks: z.array(z.string()), at: z.string() })
/** The eyebrow and title fit Hôm nay's card at the largest text size (v2 Lab, 2026-11-08); a tap opens the body. */
export const CardTextSchema = z.object({
  eyebrow: z.string().min(1).max(24),
  title: z.string().min(1).max(70),
  /** HTML, about 80 words. */
  body: z.string().min(1).max(2000),
  held: Held.optional(),
})

export type CardEntity = z.infer<typeof CardSchema>
export type CardText = z.infer<typeof CardTextSchema>
export type Card = CardEntity & { t: CardText }
