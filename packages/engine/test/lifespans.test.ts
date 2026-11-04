import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { fillLifespans, lifespanOf } from '../src/lifespans'

test('a lifespan is read from a value that is only the figure', () => {
  expect(lifespanOf('4 years')).toEqual({ min: 4, max: 4 })
  expect(lifespanOf('3 to 5 years')).toEqual({ min: 3, max: 5 })
  expect(lifespanOf('3-5 yrs.')).toEqual({ min: 3, max: 5 })
  expect(lifespanOf('Up to 3 years')).toEqual({ min: 3, max: 3 })
  expect(lifespanOf('18 months')).toEqual({ min: 1.5, max: 1.5 })
  expect(lifespanOf('10–15 years (in captivity)')).toEqual({ min: 10, max: 15 })
  // More than the figure, or a figure out of bounds: nothing.
  for (const v of ['5 years or more with good care', 'several years', 'decades', '200 years', '5 to 3 years']) expect(lifespanOf(v), v).toBeUndefined()
})

test('labelled lines go on the card per source; prose, and a source already there, are left', async () => {
  const root = await mkdtemp(join(tmpdir(), 'life-'))
  const dir = join(root, 'species', 'a')
  await mkdir(dir, { recursive: true })
  const entity = {
    id: 'a', dataCard: { tempC: [{ source: 'seriouslyfish', value: { min: 20, max: 26 } }], lifeYears: [{ source: 'glaser', value: { min: 2, max: 2 } }] },
    sections: [
      { key: 'quickFacts', source: 'sprucepets', html: '<ul><li><strong>Family:</strong> Characidae</li><li><strong>Life expectancy:</strong> 3 to 5 years</li></ul>' },
      { key: 'quickFacts', source: 'aquariumbreeder', html: '<ul><li>Lifespan: 18 months</li></ul>' },
      { key: 'care', source: 'seriouslyfish', html: '<p>Its lifespan tends to increase in well-maintained aquaria, to 10 years.</p>' },
      { key: 'quickFacts', source: 'glaser', html: '<ul><li>Life span: 4 years</li></ul>' },
    ],
  }
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify(entity, null, 2)}\n`)
  expect(await fillLifespans(root)).toEqual({ species: 1, values: 2 })
  const after = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
  expect(after.dataCard.lifeYears).toEqual([
    { source: 'glaser', value: { min: 2, max: 2 } },
    { source: 'sprucepets', value: { min: 3, max: 5 } },
    { source: 'aquariumbreeder', value: { min: 1.5, max: 1.5 } },
  ])
  expect(after.dataCard.tempC).toEqual(entity.dataCard.tempC)
  // Run again: nothing to add.
  expect(await fillLifespans(root)).toEqual({ species: 0, values: 0 })
})
