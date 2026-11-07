import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { PageShard } from '@aq/schema/app-page'
import { appPage, DIST } from './dist'

// The chat's `section` block (protocols/chat.openapi.json) is a heading of the app's copy of a page and every block
// under it to the next heading, and the site's chat draws the same section from the web page itself: the element with
// that id when it is a section of the page (a guide's heading, or a fish or equipment page's `section` or `article`,
// which holds its heading and what is under it), from that heading to the next one. So every heading the Worker can
// send must be on the built web page with the same id, and neither may run into the next section: after a heading, the
// web page's next heading is the app copy's next one; a section or article holds none of the app copy's other sections
// (it may hold more of what the page shows there, as a fish's tank-mates list). Every language the build writes app
// copies for (the fixture build: Vietnamese).
test("every heading in the app's copy of a page is on the web page with the same id, and its section there stops before the next", () => {
  let headings = 0
  const problems: string[] = []
  const HEADING = /^H[1-6]$/
  for (const lang of readdirSync(`${DIST}/app/pages`)) {
    for (const file of readdirSync(`${DIST}/app/pages/${lang}`)) {
      const shard = JSON.parse(readFileSync(`${DIST}/app/pages/${lang}/${file}`, 'utf8')) as PageShard
      for (const [path, doc] of Object.entries(shard.pages)) {
        const ids = doc.blocks.flatMap(b => (b.t === 'h' ? [b.id] : []))
        if (!ids.some(Boolean)) continue
        const { dom } = appPage(path)
        const web = dom.querySelectorAll('h1, h2, h3, h4, h5, h6')
        /** The heading a section starts at on the web page: the element itself, or a section's or article's own heading. */
        const headingOf = (id: string) => {
          const el = dom.getElementById(id)
          return !el ? undefined : HEADING.test(el.tagName) ? el : el.querySelector('h1, h2, h3, h4, h5, h6') ?? undefined
        }
        ids.forEach((id, i) => {
          if (!id) return
          headings++
          const el = dom.getElementById(id)
          const h = headingOf(id)
          if (!el || !h) return void problems.push(`${path}#${id}: ${el ? `a ${el.tagName} with no heading` : 'not on the web page'}`)
          if (!HEADING.test(el.tagName)) {
            if (!['SECTION', 'ARTICLE'].includes(el.tagName)) problems.push(`${path}#${id}: a ${el.tagName}, not a heading, section or article`)
            const swallowed = ids.filter(other => other && other !== id && el.querySelector(`[id="${other}"]`))
            if (swallowed.length) problems.push(`${path}#${id}: its ${el.tagName} holds the app copy's next sections too: ${swallowed.join(', ')}`)
            return
          }
          const next = ids[i + 1]
          const after = web[web.indexOf(h) + 1]
          if (next && after !== headingOf(next)) problems.push(`${path}#${id}: the web page's next heading is ${JSON.stringify(after?.text.trim() ?? null)}, not #${next}'s`)
        })
      }
    }
  }
  expect(problems).toEqual([])
  expect(headings).toBeGreaterThan(10)
})
