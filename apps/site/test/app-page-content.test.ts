import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { slow } from '@aq/schema/test-time'
import { expect, test } from 'vitest'
import { LANGS } from '../src/lib/i18n'
import { htmlBlocks } from '../src/lib/page-blocks'

// The real content's text as the app draws it (app-page.test.ts holds the rest, on the fixture build). A file of its own:
// a content run's checks run it without building the site (scripts/content-tests.json).
const CONTENT = fileURLToPath(new URL('../../../content/', import.meta.url))

test('every content file\'s text converts: nothing the app would have to send to the web', () => {
  const unknown = new Map<string, string>()
  let n = 0
  for (const kind of ['guides', 'species', 'plants', 'breeds']) {
    for (const id of readdirSync(CONTENT + kind)) {
      for (const lang of LANGS) {
        const f = `${CONTENT}${kind}/${id}/${lang}.json`
        if (!existsSync(f)) continue
        const t = JSON.parse(readFileSync(f, 'utf8')) as { body?: string; sections?: Record<string, string> }
        for (const html of [t.body, ...Object.values(t.sections ?? {})]) {
          if (typeof html !== 'string' || !html) continue
          n++
          for (const u of htmlBlocks(html).unknown) unknown.set(u, `${kind}/${id}/${lang}`)
        }
      }
    }
  }
  expect(n).toBeGreaterThan(100)
  expect([...unknown]).toEqual([])
}, slow(60_000)) // about 17,000 texts: a second alone, more beside the other tests
