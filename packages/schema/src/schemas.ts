import { z } from 'zod'

export const SOURCE_IDS = ['seriouslyfish', 'planetcatfish', 'loachesonline', 'glaser', 'bwaquatics', '2hraquarist', 'aquariumcoop', 'sprucepets', 'aquariumbreeder', 'tropica', 'scotcat', 'facebook-jim', 'panitvong', 'cryptspages', 'diendancacanh', 'youtube', 'aquatome'] as const
export const LANGS = ['vi', 'id', 'th'] as const

export const SECTION_ORDER = ['quickFacts', 'beforeYouBuy', 'distribution', 'habitat', 'aquariumSize', 'maintenance', 'waterConditions', 'equipment', 'diet', 'behaviour', 'dimorphism', 'reproduction', 'notes', 'references'] as const

const SourceId = z.enum(SOURCE_IDS)
const Range = z.object({ min: z.number(), max: z.number() })
const SourcedValue = z.object({ source: SourceId, value: z.union([Range, z.number()]) })
const DataCardField = z.enum(['tempC', 'ph', 'gh', 'sizeCm', 'tankCm', 'difficulty'])

const Section = z.object({ key: z.enum(SECTION_ORDER), source: SourceId, sourceUrl: z.string(), html: z.string() })
const Photo = z.object({ url: z.string(), thumb: z.string().optional(), width: z.number(), height: z.number(), licence: z.string(), author: z.string(), sourceUrl: z.string(), caption: z.string().optional(), source: SourceId.optional() })
const Video = z.object({ youtubeId: z.string(), title: z.string(), durationSec: z.number(), lang: z.string() })
const ProductSlot = z.object({ category: z.string(), keywords: z.array(z.string()) })

export const SpeciesSchema = z.object({
  id: z.string(), scientificName: z.string(), order: z.string(), family: z.string(), genus: z.string(), group: z.string(),
  lNumber: z.string().optional(), places: z.array(z.string()),
  dataCard: z.partialRecord(DataCardField, z.array(SourcedValue)),
  sections: z.array(Section), photos: z.array(Photo), videos: z.array(Video), productSlots: z.array(ProductSlot), updatedAt: z.string(),
})

export const PlantSchema = z.object({
  id: z.string(), scientificName: z.string(), difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  light: z.enum(['low', 'medium', 'high']), co2: z.enum(['none', 'optional', 'required']), growth: z.enum(['slow', 'medium', 'fast']),
  placement: z.array(z.enum(['foreground', 'midground', 'background', 'epiphyte', 'floating'])),
  sections: z.array(Section), photos: z.array(Photo), productSlots: z.array(ProductSlot), updatedAt: z.string(),
})

/**
 * The YouTube video an AquaTome guide is written from (source 'youtube'): the guide is our own writing on the video's core
 * ideas; the video is embedded with YouTube's player. `chapters`: the creator's chapter marks (seconds).
 */
export const VideoRef = z.object({
  youtubeId: z.string(), title: z.string(), channel: z.string(), channelUrl: z.string(), durationSec: z.number(),
  publishedAt: z.string().optional(), chapters: z.array(z.object({ start: z.number(), title: z.string() })),
  series: z.object({ id: z.string(), position: z.number() }).optional(),
  /** Largest thumbnail that exists (maxres 1280×720, else mq 320×180: both 16:9, no letterbox bars). */
  thumb: z.object({ url: z.string(), width: z.number(), height: z.number() }).optional(),
  /** YouTube has no captions for it: we wrote from our own transcript of the audio, and the player can't show Vietnamese captions. */
  transcribed: z.boolean().optional(),
  /** Spoken language of the video (ISO base code); absent means English. */
  lang: z.string().optional(),
  /** Fish, shrimp, snails and plants the video shows or recommends, by scientific name (read from the transcript). */
  taxa: z.array(z.string()).optional(),
  /**
   * Kit the video uses or recommends: equipment category (content/equipment ids, "khac" for anything else), the type within
   * it, brand and model only as the video names them, and when it first comes up (seconds). Absent until extracted.
   */
  gear: z.array(z.object({ category: z.string(), type: z.string().optional(), brand: z.string().optional(), model: z.string().optional(), t: z.number().optional() })).optional(),
  /**
   * Pictures per guide section (matched by its h3 text): stills from the video (YouTube storyboard frames, a click plays
   * the video from there) and an open-licence photo. Absent until the images pass has run; [] when nothing fitted.
   */
  figures: z.array(z.object({
    heading: z.string(),
    moments: z.array(z.object({ t: z.number(), url: z.string(), width: z.number(), height: z.number(), caption: z.string() })),
    photo: Photo.optional(),
  })).optional(),
})
export const GuideSchema = z.object({
  id: z.string(), kind: z.enum(['setup', 'care', 'breeding', 'disease', 'aquascaping', 'plantCare', 'discovery']),
  source: SourceId, sourceUrl: z.string(), html: z.string(), photos: z.array(Photo), mentions: z.array(z.string()), updatedAt: z.string(),
  video: VideoRef.optional(),
  /** Guides AquaTome writes itself from web research (source 'aquatome'): the pages the facts came from. */
  refs: z.array(z.object({ url: z.string(), title: z.string() })).optional(),
})
/** A YouTube playlist whose videos became guides, in the creator's order (content/series/<id>.json). */
export const SeriesSchema = z.object({
  id: z.string(), playlistId: z.string(), title: z.string(), channel: z.string(), channelUrl: z.string(), videoIds: z.array(z.string()),
  vi: z.object({ slug: z.string(), name: z.string(), intro: z.string() }),
})

export const GlossarySchema = z.object({ id: z.string(), en: z.string(), latin: z.string().optional() })
export const PlaceSchema = z.object({ id: z.string(), kind: z.enum(['continent', 'country', 'region', 'river']), parent: z.string().optional() })

/** AquaTome's own buying guide for one equipment category (content/equipment/<category>.json, Vietnamese). */
export const EquipmentSchema = z.object({
  category: z.string(), name: z.string(), lead: z.string(), intro: z.string(), hero: Photo,
  /** `match`: a regex over the shop keywords species pages suggest; the first type that matches a keyword owns it. `buy`: the search to send shoppers to. */
  types: z.array(z.object({ id: z.string(), name: z.string(), match: z.string(), desc: z.string(), pick: z.string(), buy: z.string(), photo: Photo.optional() })),
  choose: z.array(z.string()), mistakes: z.array(z.string()), faq: z.array(z.object({ q: z.string(), a: z.string() })),
  /** A translation's review score (content/equipment/<lang>/<category>.json); the Vietnamese original has none. */
  quality: z.object({ score: z.number(), indexable: z.boolean() }).optional(),
})

/**
 * Many photos of one species (content/gallery/<species id>.json): open-licence photos from Wikimedia Commons and
 * iNaturalist, screened (a living fish, clearly shown, no people), best first, each with a short Vietnamese caption.
 */
/** `builtAt`: the last Commons + iNaturalist build (`updatedAt` also moves when a source adds a photo). */
/** Photo captions written in Vietnamese, in one other language (content/captions/<lang>.json): Vietnamese caption → translation. */
export const CaptionsSchema = z.record(z.string(), z.string())

/**
 * A gallery photo can carry what the screening model said of it, so a top-up re-ranks the whole gallery: `best`, one of
 * its picks of a contact sheet; `kind`, what it shows (male, female, colour form, juvenile, habitat; for a plant
 * submersed, emersed, flower…). Photos screened before these existed have neither.
 */
const GalleryPhoto = Photo.extend({ best: z.boolean().optional(), kind: z.string().optional() })
export const GallerySchema = z.object({ id: z.string(), photos: z.array(GalleryPhoto), seen: z.number(), updatedAt: z.string(), builtAt: z.string().optional() })

/** A link the site renders: http(s) only, so researched or scraped data can never become a javascript: link. */
const WebUrl = z.string().regex(/^https?:\/\/[^\s]+$/i)
const ProductSpec = z.object({ key: z.string(), value: z.string(), source: z.number().int().optional() })
/**
 * One product (brand + model), the same in every language and market: its specs and variants, each fact pointing at the
 * source it came from (manufacturer, shops, reviews). Written from facts only, never from a shop's text.
 */
export const ProductSchema = z.object({
  id: z.string(), brand: z.string(), model: z.string(), category: z.string(), type: z.string().optional(),
  specs: z.array(ProductSpec), variants: z.array(z.object({ name: z.string(), specs: z.array(ProductSpec) })),
  sources: z.array(z.object({ url: WebUrl, title: z.string(), kind: z.enum(['manufacturer', 'shop', 'review', 'video', 'forum', 'other']), at: z.string() })),
  updatedAt: z.string(),
})
/** A product's prices in one market (content/products/<id>/<market>.json): shops' own listings, each dated. */
/**
 * A fish people made, with no scientific name of its own: a hybrid (La Hán, Hồng Két), a line or colour form of one
 * species (goldfish Ranchu, koi, guppy and betta lines, arowana colour forms) or a transgenic fish (GloFish).
 * Researched on the web and cited like a product; never given an invented binomial.
 */
export const BreedSchema = z.object({
  id: z.string(), kind: z.enum(['hybrid', 'variety', 'transgenic']),
  /** What it is a form of: a species id (carassius-auratus for Ranchu) or another breed (a La Hán line). */
  basedOn: z.string().optional(),
  /** Hybrids: the parent fish as the sources give them, with the species page when we have one. */
  parents: z.array(z.object({ name: z.string(), species: z.string().optional(), certain: z.boolean() })),
  /** Care values, each pointing at its source in `sources`. */
  care: z.partialRecord(DataCardField, z.array(z.object({ source: z.number().int(), value: z.union([Range, z.number()]) }))),
  photos: z.array(Photo),
  /** Wikimedia Commons category for its photos, when there is one. */
  commons: z.string().optional(),
  sources: z.array(z.object({ url: WebUrl, title: z.string(), kind: z.enum(['breeder', 'shop', 'article', 'forum', 'video', 'paper', 'other']), at: z.string() })),
  updatedAt: z.string(),
})

export const MarketSchema = z.object({
  currency: z.string(), checkedAt: z.string(),
  prices: z.array(z.object({ shop: z.string(), url: WebUrl, variant: z.string().optional(), price: z.number(), at: z.string() })),
})

export const TranslationSchema = z.object({
  slug: z.string(), name: z.string(), altNames: z.array(z.string()), sections: z.record(z.string(), z.string()),
  body: z.string().optional(), definition: z.string().optional(),
  /** Video guides: key takeaways, questions readers ask, and the video's chapter titles in Vietnamese (same order). */
  summary: z.array(z.string()).optional(), faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(), chapters: z.array(z.string()).optional(),
  /** Video guides: the words on the video's thumbnail in Vietnamese (≤ 5 words), shown as our label over it (the image itself is never altered). */
  cover: z.string().optional(),
  /** Hybrids in another language: each parent's display name, in the order of the entity's parents. */
  parents: z.array(z.string()).optional(),
  /** Products: names for the spec keys in this language. */
  labels: z.record(z.string(), z.string()).optional(),
  /** Owner-chosen main name: the engine never replaces it (variety names go to altNames). */
  nameFixed: z.boolean().optional(),
  /** Earlier addresses of this page: the Worker 301s them here and the page says "Chuyển hướng từ <name>". */
  redirectFrom: z.array(z.object({ slug: z.string(), name: z.string() })).optional(),
  /** AquaTome's own guides in another language: the sources that page's facts come from (the entity's refs otherwise). */
  refs: z.array(z.object({ url: z.string(), title: z.string() })).optional(),
  /**
   * Species pages: `reason` is why the page is out of search: `thin` (below the depth bar with no in-depth source, depth.ts)
   * or a low translation `score`; thin is named when both.
   */
  quality: z.object({ score: z.number(), indexable: z.boolean(), bySource: z.partialRecord(SourceId, z.number()).optional(), reason: z.enum(['thin', 'score']).optional() }),
})

export const ChangelogEntrySchema = z.object({
  date: z.string(), kind: z.enum(['species', 'plant', 'guide']), id: z.string(), source: SourceId, action: z.enum(['new', 'updated']),
})
export const ChangelogSchema = z.array(ChangelogEntrySchema)

/**
 * `publish`: true once the written permission covers the source's text and photos; `'photos'` when it covers only photos
 * (Diễn Đàn Cá Cảnh): a public build shows its photos, and nothing written from its text (sections, guides, card values).
 */
export const SourceInfoSchema = z.object({
  name: z.string(), homepage: z.string(), publish: z.union([z.boolean(), z.literal('photos')]),
  permission: z.object({ date: z.string(), file: z.string(), scope: z.array(z.string()) }).optional(),
}).refine(s => !s.publish || s.permission !== undefined, { message: 'publish requires a permission record', path: ['permission'] })
/** What a public build may show from a source: its text (and what is written from it), or its photos. */
export const mayPublish = (info: { publish?: boolean | 'photos' } | undefined, what: 'text' | 'photos') =>
  info?.publish === true || (what === 'photos' && info?.publish === 'photos')
export const SourcesSchema = z.partialRecord(SourceId, SourceInfoSchema)

export const schemas = { Range, SourcedValue, Section, Photo, Video, ProductSlot }

/**
 * AquaTome's own summary of a species page, drafted from its translated text and data card; the site shows it only once
 * approved (by the engine's check, or by hand). `problems`: what the check found, while it stays pending.
 */
export const SummarySchema = z.object({
  id: z.string(), review: z.enum(['pending', 'approved']),
  summary: z.string(), mistakes: z.array(z.string()).max(3),
  speciesUpdatedAt: z.string(), generatedAt: z.string(),
  problems: z.array(z.string()).optional(),
})

/** Behaviour facts read from a species page's own text, for the tank-mates checker. Re-read when the page changes. */
export const TraitsSchema = z.object({
  id: z.string(),
  temperament: z.enum(['peaceful', 'semi-aggressive', 'aggressive', 'predator']).nullable(),
  finNipper: z.boolean(), schoolMin: z.number().int().min(2).max(50).nullable(),
  speciesUpdatedAt: z.string(), generatedAt: z.string(),
})
