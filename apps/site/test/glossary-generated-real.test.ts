import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { LANGS, loadAll } from '@aq/schema'
import { slow } from '@aq/schema/test-time'
import { strictLoadedContentEqual } from './helpers/glossary-content-equality'

const root = fileURLToPath(new URL('../../../content', import.meta.url))
let referenceAddresses: Promise<Set<string>> | undefined
/** The complete screen domain, raw kind records and calendar addresses, plus unknown-photo controls and variants. */
async function addresses() {
  return referenceAddresses ??= (async () => {
    const screen = JSON.parse(await readFile(join(root, '../engine-state/_photo-watermarks.json'), 'utf8'))
    if (!screen || typeof screen !== 'object' || Array.isArray(screen)) throw new Error('invalid screen record for comparison')
    const out = new Set<string>([...Object.keys(screen), 'https://media.aquatome.com/generated/glossary/no-screen-fixture.webp'])
    const collect = (value: unknown) => {
      if (typeof value === 'string' && /^https?:\/\//.test(value)) out.add(value)
      else if (Array.isArray(value)) value.forEach(collect)
      else if (value && typeof value === 'object') Object.values(value).forEach(collect)
    }
    const calendar = await readFile(join(root, 'curation.json'), 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return '{}'; throw e })
    collect(JSON.parse(calendar))
    for (const folder of await readdir(join(root, 'glossary'), { withFileTypes: true })) if (folder.isDirectory()) {
      const raw = await readFile(join(root, 'glossary', folder.name, 'entity.json'), 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return '{}'; throw e })
      collect(JSON.parse(raw))
    }
    for (const address of [...out]) if (address.endsWith('.webp')) {
      out.add(address.replace(/\.webp$/, '-480.webp'))
      out.add(address.replace(/\.webp$/, '-large.webp'))
    }
    return out
  })()
}

for (const lang of LANGS) test(`${lang}: the glossary switch changes no real loaded content while no kind picture is approved`, async () => {
  const started = performance.now(), domain = await addresses()
  const before = await loadAll({ root, lang, publicBuild: true, photoScreen: 'required', glossaryKindImages: false, glossaryKindApprovals: false })
  const after = await loadAll({ root, lang, publicBuild: true, photoScreen: 'required', glossaryKindImages: true, glossaryKindApprovals: false })
  const loaded = performance.now()
  // Boolean only: a failure must not print personal credit names or other real content.
  expect(strictLoadedContentEqual(before, after, domain)).toBe(true)
  if (process.env.CI) console.info('glossary-real-proof-timing', JSON.stringify({ lang, loadMs: Math.round(loaded - started), compareMs: Math.round(performance.now() - loaded), callbackAddresses: domain.size, elapsedMs: Math.round(performance.now() - started) }))
}, slow(60_000))
