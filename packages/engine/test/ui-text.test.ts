import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { unservedMissing } from '../src/ui-text'

const dicts = async (files: Record<string, object>) => {
  const dir = await mkdtemp(join(tmpdir(), 'aq-ui-'))
  for (const [f, v] of Object.entries(files)) await writeFile(join(dir, `${f}.json`), JSON.stringify(v))
  return dir
}

test("no build asks for a language the site doesn't serve: it gets what a served language has and it lacks, a share at a time", async () => {
  const dir = await dicts({ id: { Bể: 'Akuarium', Cá: 'Ikan', Cây: 'Tanaman' }, th: { Bể: 'ตู้', Cá: 'ปลา', Cây: 'ไม้' } })
  expect(await unservedMissing(dir)).toEqual({ ms: ['Bể', 'Cá', 'Cây'] })
  expect(await unservedMissing(dir, 2)).toEqual({ ms: ['Bể', 'Cá'] })
  await writeFile(join(dir, 'ms.json'), JSON.stringify({ Bể: 'Akuarium', Cá: 'Ikan' }))
  expect(await unservedMissing(dir, 2)).toEqual({ ms: ['Cây'] })
  await writeFile(join(dir, 'ms.json'), JSON.stringify({ Bể: 'Akuarium', Cá: 'Ikan', Cây: 'Tumbuhan' }))
  expect(await unservedMissing(dir, 2)).toEqual({})
})

test('the real dictionaries agree on their strings, so which served language it reads makes no difference', async () => {
  const site = new URL('../../../apps/site/src/i18n/', import.meta.url)
  const keys = async (l: string) => Object.keys((await import(new URL(`${l}.json`, site).href, { with: { type: 'json' } })).default)
  expect(await keys('id')).toEqual(await keys('th'))
})
