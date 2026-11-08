/**
 * The owner's fish names, in a module of their own: the content rules and the sweep hold pages to them (content-rules.ts),
 * and every Vietnamese writer's prompt lists them (phrases.ts, VI_STYLE). It imports nothing, so both can read it.
 */
/** A fish's old name: in a sentence that names one of `fish`, `was` is its old name and `now` its name. */
export type SwappedName = {
  was: string
  fish: readonly string[]
  now: string
  /** Only in the name's own brackets: "cá bám đá" still names the family. */
  brackets?: true
  /** `fish` is a group, and `now` its genera's names: the words don't say which one, so the sweep leaves it. */
  group?: true
  /** The fish the old name belongs to now: a sentence naming them may be right, so it is neither listed nor renamed. */
  stillFor?: readonly string[]
}
export const SIAMESE = ['Crossocheilus', 'algae eater']
export const PARADISE = ['Macropodus', 'paradise fish']
/** The owner's names of 2026-11-07. The writers' prompts read this list, the sweep writes it, and the swapped-name rule holds it. */
export const SWAPPED: readonly SwappedName[] = [
  { was: 'cá bút chì', fish: ['Nannostomus', 'pencilfish', 'pencil fish'], now: 'cá chì', stillFor: SIAMESE },
  { was: 'cá bám đá', fish: ['Beaufortia', 'Sewellia', 'Gastromyzon', 'Pseudogastromyzon', 'Sinogastromyzon'], now: 'cá tỳ bà bướm', brackets: true },
  { was: 'cá cờ', fish: ['Jordanella', 'flagfish'], now: 'cá flagfish', stillFor: PARADISE },
  { was: 'cá cờ', fish: ['Mesonauta'], now: 'cá Mesonauta', stillFor: PARADISE },
  { was: 'cá cờ', fish: ['Laetacara'], now: 'cá Laetacara', stillFor: PARADISE },
  { was: 'cá cờ', fish: ['flag cichlid'], now: 'cá Mesonauta, cá Laetacara', group: true },
  { was: 'cá thiên đường', fish: ['Macropodus opercularis'], now: 'cá cờ' },
]
