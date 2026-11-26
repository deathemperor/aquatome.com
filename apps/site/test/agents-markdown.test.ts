import { readFileSync } from 'node:fs'
import { LANG, OTHER_LANGS } from '@aq/schema/langs'
import { expect, test } from 'vitest'
import { toMarkdown } from '../scripts/markdown'
import { skillMd } from '../src/lib/agents'

test('every translated page reaches the Worker for Markdown negotiation', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
  for (const lang of OTHER_LANGS) expect(config.assets.run_worker_first, lang).toContain(`${LANG[lang].prefix}/*`)
})

test('a Markdown copy drops the hidden note for an old address and keeps the fish text', () => {
  const md = toMarkdown('<main><h1>Cá neon xanh</h1><p class="redirected" hidden>(Chuyển hướng từ <b>Cá neon xanh</b>)</p><p>Paracheirodon innesi</p></main>')
  expect(md).toBe('# Cá neon xanh\n\nParacheirodon innesi\n')
})

test('the agent skill identifies the neon tetra at its existing address', () => {
  expect(skillMd('https://aquatome.com/')).toContain('`ca-neon-xanh` for cá neon xanh, the neon tetra Paracheirodon innesi')
})
