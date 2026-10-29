import { z } from 'zod'

export const SOURCE_IDS = ['seriouslyfish', 'planetcatfish', 'loachesonline', 'glaser', 'bwaquatics', '2hraquarist', 'aquariumcoop', 'sprucepets', 'aquariumbreeder', 'tropica'] as const
export const LANGS = ['vi'] as const

export const SECTION_ORDER = ['quickFacts', 'beforeYouBuy', 'distribution', 'habitat', 'aquariumSize', 'maintenance', 'waterConditions', 'equipment', 'diet', 'behaviour', 'dimorphism', 'reproduction', 'notes', 'references'] as const

const SourceId = z.enum(SOURCE_IDS)
const Range = z.object({ min: z.number(), max: z.number() })
const SourcedValue = z.object({ source: SourceId, value: z.union([Range, z.number()]) })
const DataCardField = z.enum(['tempC', 'ph', 'gh', 'sizeCm', 'tankCm', 'difficulty'])

const Section = z.object({ key: z.enum(SECTION_ORDER), source: SourceId, sourceUrl: z.string(), html: z.string() })
const Photo = z.object({ url: z.string(), width: z.number(), height: z.number(), licence: z.string(), author: z.string(), sourceUrl: z.string(), caption: z.string().optional(), source: SourceId.optional() })
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

export const GuideSchema = z.object({
  id: z.string(), kind: z.enum(['setup', 'care', 'breeding', 'disease', 'aquascaping', 'plantCare', 'discovery']),
  source: SourceId, sourceUrl: z.string(), html: z.string(), photos: z.array(Photo), mentions: z.array(z.string()), updatedAt: z.string(),
})

export const GlossarySchema = z.object({ id: z.string(), en: z.string(), latin: z.string().optional() })
export const PlaceSchema = z.object({ id: z.string(), kind: z.enum(['continent', 'country', 'region', 'river']), parent: z.string().optional() })

export const TranslationSchema = z.object({
  slug: z.string(), name: z.string(), altNames: z.array(z.string()), sections: z.record(z.string(), z.string()),
  body: z.string().optional(), definition: z.string().optional(),
  quality: z.object({ score: z.number(), indexable: z.boolean(), bySource: z.partialRecord(SourceId, z.number()).optional() }),
})

export const ChangelogEntrySchema = z.object({
  date: z.string(), kind: z.enum(['species', 'plant', 'guide']), id: z.string(), source: SourceId, action: z.enum(['new', 'updated']),
})
export const ChangelogSchema = z.array(ChangelogEntrySchema)

export const SourceInfoSchema = z.object({
  name: z.string(), homepage: z.string(), publish: z.boolean(),
  permission: z.object({ date: z.string(), file: z.string(), scope: z.array(z.string()) }).optional(),
}).refine(s => !s.publish || s.permission !== undefined, { message: 'publish: true requires a permission record', path: ['permission'] })
export const SourcesSchema = z.partialRecord(SourceId, SourceInfoSchema)

export const schemas = { Range, SourcedValue, Section, Photo, Video, ProductSlot }

/** AquaTome's own summary of a species page, drafted from its translated text; the site shows it only once approved. */
export const SummarySchema = z.object({
  id: z.string(), review: z.enum(['pending', 'approved']),
  summary: z.string(), mistakes: z.array(z.string()).max(3),
  speciesUpdatedAt: z.string(), generatedAt: z.string(),
})
