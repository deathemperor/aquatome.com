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

// A language the site doesn't serve has no build to say what it lacks: it gets what a served language has, a share at a
// time (the cycle's --unserved step). None is unserved since Malay went live: its build says what it misses, as the
// others' do, and the next language's row is held here.
test('a language the site serves leaves the list: Malay, missing strings, gets none from it', async () => {
  const dir = await dicts({ id: { Bể: 'Akuarium', Cá: 'Ikan', Cây: 'Tanaman' }, th: { Bể: 'ตู้', Cá: 'ปลา', Cây: 'ไม้' }, ms: { Bể: 'Tangki' } })
  expect(await unservedMissing(dir)).toEqual({})
  expect(await unservedMissing(dir, 2)).toEqual({})
})

test('the real dictionaries agree on their strings, so which served language it reads makes no difference', async () => {
  const site = new URL('../../../apps/site/src/i18n/', import.meta.url)
  const keys = async (l: string) => Object.keys((await import(new URL(`${l}.json`, site).href, { with: { type: 'json' } })).default)
  expect(await keys('id')).toEqual(await keys('th'))
})
