import { loadAll } from '@aq/schema'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { appPages } from '../src/lib/app-page'
import { LANGS } from '../src/lib/i18n'
import { linkListsBuilt } from '../src/lib/mentions'
import { plantParts, plantPartsBuilt } from '../src/lib/plant-page'
import { speciesParts, speciesPartsBuilt } from '../src/lib/species-page'

const root = fileURLToPath(new URL('fixture-content/', import.meta.url))

test('the app\'s pages build the link list once per language, not once per breed', async () => {
  // A breed's own text links the names it uses from the list mentionIndex keeps for that language. Building the list
  // walks every species, plant and breed name, so a fresh walk per breed is what makes the app's pages slow.
  for (const lang of LANGS) {
    const c = await loadAll({ root, lang, publicBuild: false, leaveOutHeld: true })
    const bodies = c.breeds.filter(b => b.t.body).length
    const start = linkListsBuilt()
    await appPages(lang, c)
    if (lang === 'vi') expect(bodies).toBeGreaterThan(1)
    expect(linkListsBuilt() - start, lang).toBe(1)
  }
})

test('a species or plant page is put together once, for the app and for the page', async () => {
  // The app's copy is built before any page (getStaticPaths). The page asks for the same parts again. Putting them
  // together judges every other species and links the text, so a second time is the same work.
  const c = await loadAll({ root, lang: 'vi', publicBuild: false, leaveOutHeld: true })
  expect(c.species.length).toBeGreaterThan(0)
  expect(c.plants.length).toBeGreaterThan(0)
  const start = { s: speciesPartsBuilt(), p: plantPartsBuilt() }
  await appPages('vi', c)
  const once = { s: speciesPartsBuilt() - start.s, p: plantPartsBuilt() - start.p }
  expect(once).toEqual({ s: c.species.length, p: c.plants.length })
  for (const s of c.species) await speciesParts('vi', c, s)
  for (const plant of c.plants) plantParts('vi', c, plant)
  expect({ s: speciesPartsBuilt() - start.s, p: plantPartsBuilt() - start.p }).toEqual(once)
})
