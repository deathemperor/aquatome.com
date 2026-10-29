import type { z } from 'zod'
import type { ChangelogEntrySchema, EquipmentSchema, GlossarySchema, GuideSchema, LANGS, PlaceSchema, PlantSchema, SECTION_ORDER, SeriesSchema, SOURCE_IDS, SourceInfoSchema, SpeciesSchema, SummarySchema, TraitsSchema, TranslationSchema, schemas } from './schemas'

export type Lang = (typeof LANGS)[number]
export type SourceId = (typeof SOURCE_IDS)[number]
export type SectionKey = (typeof SECTION_ORDER)[number]
export type Range = z.infer<typeof schemas.Range>
export type SourcedValue = z.infer<typeof schemas.SourcedValue>
export type DataCardField = 'tempC' | 'ph' | 'gh' | 'sizeCm' | 'tankCm' | 'difficulty'
export type Section = z.infer<typeof schemas.Section>
export type Photo = z.infer<typeof schemas.Photo>
export type Video = z.infer<typeof schemas.Video>
export type ProductSlot = z.infer<typeof schemas.ProductSlot>
export type Summary = z.infer<typeof SummarySchema>
export type Traits = z.infer<typeof TraitsSchema>
export type SpeciesEntity = z.infer<typeof SpeciesSchema>
export type PlantEntity = z.infer<typeof PlantSchema>
export type GuideEntity = z.infer<typeof GuideSchema>
export type Series = z.infer<typeof SeriesSchema>
export type GlossaryEntity = z.infer<typeof GlossarySchema>
export type PlaceEntity = z.infer<typeof PlaceSchema>
export type EquipmentGuide = z.infer<typeof EquipmentSchema>
export type Translation = z.infer<typeof TranslationSchema>
export type SourceInfo = z.infer<typeof SourceInfoSchema>
export type ChangelogEntry = z.infer<typeof ChangelogEntrySchema>
