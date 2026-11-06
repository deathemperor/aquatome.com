import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { PageShard } from '@aq/schema/app-page'
import { appPage, DIST } from './dist'

// The chat's `section` block (protocols/chat.openapi.json) names a heading of the app's copy of a page, and the site's
// chat draws that section from the web page itself, from that heading's id to the next heading. So every heading the
// Worker can send must be on the built web page, with the same id.
test("every heading in the app's copy of a page is on the web page with the same id, for the chat's sections", () => {
  let headings = 0
  const missing: string[] = []
  for (const lang of readdirSync(`${DIST}/app/pages`)) {
    for (const file of readdirSync(`${DIST}/app/pages/${lang}`)) {
      const shard = JSON.parse(readFileSync(`${DIST}/app/pages/${lang}/${file}`, 'utf8')) as PageShard
      for (const [path, doc] of Object.entries(shard.pages)) {
        const ids = doc.blocks.flatMap(b => (b.t === 'h' && b.id ? [b.id] : []))
        if (!ids.length) continue
        const { dom } = appPage(path)
        for (const id of ids) {
          headings++
          if (!dom.getElementById(id)) missing.push(`${path}#${id}`)
        }
      }
    }
  }
  expect(missing).toEqual([])
  expect(headings).toBeGreaterThan(10)
})
