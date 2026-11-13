import { loadAll } from '@aq/schema'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { appPages } from '../src/lib/app-page'
import { LANGS } from '../src/lib/i18n'
import { linkListsBuilt } from '../src/lib/mentions'

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
