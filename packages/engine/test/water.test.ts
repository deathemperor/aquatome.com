import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { SpeciesSchema } from '@aq/schema'
import { LlmError, type Llm } from '../src/claude'
import type { Block } from '../src/range'
import { checkAnswer, speciesWater } from '../src/water'

// The green spotted puffer's, the guppy's and the climbing perch's own sentences on Seriously Fish.
const PUFFER = 'Occurs in brackish water in coastal areas; freshwater rivers, streams, lakes and flooded areas. Although it\'s often considered a true freshwater species, it tends to be more long-lived with the addition of marine salt to a sg of around 1.005.'
const puffer: Block[] = [{ source: 'seriouslyfish', key: 'maintenance', text: PUFFER }]
const pufferQuote = 'Although it\'s often considered a true freshwater species, it tends to be more long-lived with the addition of marine salt to a sg of around 1.005.'

test('green spotted puffer: brackish, on Seriously Fish\'s sentence', () => {
  const r = checkAnswer({ claims: [{ kind: 'brackish', source: 'seriouslyfish', quote: pufferQuote }] }, puffer)
  expect(r.water).toEqual({ kind: 'brackish', source: 'seriouslyfish', quote: pufferQuote })
})

test('a claim is dropped without its sentence in the source, or with one that says nothing of salt or the sea', () => {
  const r = checkAnswer({
    claims: [
      { kind: 'brackish', source: 'seriouslyfish', quote: 'Keep it in brackish water.' },
      { kind: 'brackish', source: 'seriouslyfish', quote: 'freshwater rivers, streams, lakes and flooded areas.' },
      { kind: 'brackish', source: 'sprucepets', quote: pufferQuote },
      { kind: 'fresh', source: 'seriouslyfish', quote: pufferQuote },
    ],
  }, puffer)
  expect(r.water).toBeUndefined()
  expect(r.claims.map(c => c.why)).toEqual(['not in the source\'s text', 'says nothing of salt or the sea', 'not one of its sources', 'no kind'])
})

// A general pet-care site that salts a fish the specialist keeps fresh doesn't make it brackish.
const MOLLY: Block[] = [
  { source: 'seriouslyfish', key: 'habitat', text: 'Inhabits fresh and brackish coastal waters.' },
  { source: 'sprucepets', key: 'waterConditions', text: 'Mollies do best with a teaspoon of aquarium salt per gallon, kept in brackish water.' },
]

test('molly: a general site\'s brackish claim doesn\'t count when a specialist covers the species', () => {
  const answer = { claims: [{ kind: 'brackish', source: 'sprucepets', quote: 'Mollies do best with a teaspoon of aquarium salt per gallon, kept in brackish water.' }] }
  expect(checkAnswer(answer, MOLLY).water).toBeUndefined()
  // With no specialist text, it counts.
  expect(checkAnswer(answer, MOLLY.slice(1)).water?.kind).toBe('brackish')
})

const entity = (id: string, html: string) => SpeciesSchema.parse({
  id, scientificName: id, order: 'o', family: 'f', genus: 'g', group: 'other', places: [], range: { native: { countries: ['TH'], regions: [], sources: ['seriouslyfish'] } },
  dataCard: {}, sections: [{ key: 'habitat', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/x', html }], photos: [], videos: [], productSlots: [], updatedAt: '2026-11-07',
})

test('a pass: no call for a species whose sources never mention salt or the sea; `water` after `range`; read once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'water-'))
  await mkdir(join(root, 'content/species/puffer'), { recursive: true })
  await mkdir(join(root, 'content/species/tetra'), { recursive: true })
  await writeFile(join(root, 'content/sources.json'), JSON.stringify({ seriouslyfish: { publish: true } }))
  await writeFile(join(root, 'content/species/puffer/entity.json'), `${JSON.stringify(entity('puffer', `<p>${PUFFER}</p>`), null, 2)}\n`)
  await writeFile(join(root, 'content/species/tetra/entity.json'), `${JSON.stringify(entity('tetra', '<p>Blackwater streams of the Rio Negro.</p>'), null, 2)}\n`)
  let calls = 0
  const llm = (async () => { calls++; return { claims: [{ kind: 'brackish', source: 'seriouslyfish', quote: pufferQuote }] } }) as Llm
  const deps = { llm, now: () => new Date('2026-11-07T00:00:00Z'), order: [] }
  const r = await speciesWater(root, deps, { limit: 5 })
  expect(r).toMatchObject({ read: ['puffer'], quiet: ['tetra'], calls: 1, salt: ['puffer: brackish (seriouslyfish)'] })
  const saved = JSON.parse(await readFile(join(root, 'content/species/puffer/entity.json'), 'utf8'))
  expect(Object.keys(saved).slice(6, 9)).toEqual(['places', 'range', 'water'])
  expect(SpeciesSchema.parse(saved).water?.kind).toBe('brackish')
  expect(JSON.parse(await readFile(join(root, 'content/species/tetra/entity.json'), 'utf8')).water).toBeUndefined()
  expect(await speciesWater(root, deps, { limit: 5 })).toMatchObject({ read: [], quiet: [], calls: 0 })
  expect(calls).toBe(1)
})

// The toadfish's own sentence on Seriously Fish: about salt ("euryhaline"), but in no word the check knows. FishBase: "Marine;
// brackish … Euryhaline". A person set its water (`fixed`), as `nameFixed` holds a name.
const TOADFISH = 'Although this species is euryhaline it rarely does well when maintained in freshwater for prolonged periods. The family Batrachoididae is the only family in the order Batrachoidiformes of which members are mostly distributed in marine and brackish waters.'

test('toadfish: water a person set (`fixed`) stays, with no call, whatever its text says', async () => {
  const root = await mkdtemp(join(tmpdir(), 'water-'))
  await mkdir(join(root, 'content/species/toadfish'), { recursive: true })
  await writeFile(join(root, 'content/sources.json'), JSON.stringify({ seriouslyfish: { publish: true } }))
  const water = { kind: 'brackish', source: 'seriouslyfish', quote: 'Although this species is euryhaline it rarely does well when maintained in freshwater for prolonged periods.', fixed: true }
  const raw = `${JSON.stringify({ ...entity('toadfish', `<p>${TOADFISH}</p>`), water }, null, 2)}\n`
  await writeFile(join(root, 'content/species/toadfish/entity.json'), raw)
  let calls = 0
  const llm = (async () => { calls++; return { claims: [] } }) as Llm
  const r = await speciesWater(root, { llm, now: () => new Date('2026-11-07T00:00:00Z'), order: [] }, { limit: 5 })
  expect(calls).toBe(0)
  expect(r).toMatchObject({ read: [], quiet: [], calls: 0 })
  expect(await readFile(join(root, 'content/species/toadfish/entity.json'), 'utf8')).toBe(raw)
  expect(SpeciesSchema.parse(JSON.parse(raw)).water).toEqual(water)
})

const WEEKLY = "claude failed (1): You've hit your weekly limit · resets Nov 14 at 8am (Asia/Saigon)"

/** Two species whose sources mention salt, each with an audit that has no `failed`. */
async function saltyPair() {
  const root = await mkdtemp(join(tmpdir(), 'water-'))
  await mkdir(join(root, 'content'), { recursive: true })
  await writeFile(join(root, 'content/sources.json'), JSON.stringify({ seriouslyfish: { publish: true } }))
  await mkdir(join(root, 'engine-state/water'), { recursive: true })
  const prior = (id: string) => `${JSON.stringify({ id }, null, 2)}\n`
  for (const id of ['brackish-a', 'brackish-b']) {
    await mkdir(join(root, 'content/species', id), { recursive: true })
    await writeFile(join(root, 'content/species', id, 'entity.json'), `${JSON.stringify(entity(id, `<p>${PUFFER}</p>`), null, 2)}\n`)
    await writeFile(join(root, 'engine-state/water', `${id}.json`), prior(id))
  }
  const audit = (id: string) => readFile(join(root, 'engine-state/water', `${id}.json`), 'utf8')
  return { root, prior, audit }
}
const waterDeps = (llm: Llm) => ({ llm, now: () => new Date('2026-11-07T00:00:00Z'), order: ['brackish-a', 'brackish-b'] })

test('a usage limit leaves each audit as it was and stops the step\'s model calls', async () => {
  const s = await saltyPair()
  let calls = 0
  const r = await speciesWater(s.root, waterDeps((async () => { calls++; throw new LlmError(WEEKLY) }) as Llm), { limit: 5 })
  expect(calls).toBe(1)
  expect(r.failed).toEqual([])
  expect(r.stopped).toBe(WEEKLY)
  expect(await s.audit('brackish-a')).toBe(s.prior('brackish-a'))
  expect(await s.audit('brackish-b')).toBe(s.prior('brackish-b'))
})

test('a failure that is not the usage limit still stamps the species and the step goes on', async () => {
  const s = await saltyPair()
  let calls = 0
  const llm = (async () => { calls++; throw calls === 1 ? new Error('bad answer') : new LlmError('claude failed (1): no JSON in the reply') }) as Llm
  const r = await speciesWater(s.root, waterDeps(llm), { limit: 5 })
  expect(calls).toBe(2)
  expect(r.stopped).toBe('')
  expect(r.failed).toEqual(['brackish-a', 'brackish-b'])
  expect(JSON.parse(await s.audit('brackish-a')).failed.error).toBe('bad answer')
  expect(JSON.parse(await s.audit('brackish-b')).failed.error).toMatch(/no JSON/)
})
