import { expect, test } from 'vitest'
import { LANGS } from '@aq/schema/langs'
import { localizePath } from '../src/lib/i18n'
import { TOOLS } from '../worker/admin/scoreboard'

// The Worker can't take src/lib/i18n.ts (it carries every translation), so the scoreboard writes these out.
test("the scoreboard's tool addresses are the site's, in each language", () => {
  for (const l of LANGS) expect(localizePath(l, '/vi/cong-cu/'), l).toBe(TOOLS[l])
})
