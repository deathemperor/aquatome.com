import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, test } from 'vitest'
import * as schema from '../src/index'

const root = fileURLToPath(new URL('../../../apps/site/test/fixture-content', import.meta.url))
const scratch: string[] = []
afterEach(async () => { for (const dir of scratch.splice(0)) await rm(dir, { recursive: true, force: true }) })
const read = async (file: string) => JSON.parse(await readFile(join(root, 'materials', file), 'utf8'))
const load = (dir = root, lang: schema.Lang = 'vi', publicBuild = false) => schema.loadAll({ root: dir, lang, publicBuild })
async function changed(file: string, patch: (value: any) => void) {
  const dir = await mkdtemp(join(tmpdir(), 'aq-materials-'))
  scratch.push(dir)
  await cp(root, dir, { recursive: true })
  const value = await read(file)
  patch(value)
  await writeFile(join(dir, 'materials', file), JSON.stringify(value))
  return dir
}

test('materials have their own schema, with all four kinds and web sources', async () => {
  const entity = await read('lua-sa-tung/entity.json')
  expect(schema.MaterialSchema).toBeDefined()
  for (const kind of ['wood', 'substrate', 'rock', 'botanical', 'other']) expect(schema.MaterialSchema.parse({ ...entity, kind }).kind).toBe(kind)
  expect(schema.MaterialSchema.safeParse({ ...entity, kind: 'fish' }).success).toBe(false)
  expect(schema.MaterialSchema.safeParse({ ...entity, sources: [{ ...entity.sources[0], url: 'javascript:alert(1)' }] }).success).toBe(false)
  expect(schema.MaterialSchema.safeParse({ ...entity, sources: [{ ...entity.sources[0], kind: 'breeder' }] }).success).toBe(false)
  expect(schema.MaterialSchema.safeParse({ ...entity, photos: [{}] }).success).toBe(false)
})

test('loads Vietnamese materials, their shared translations, parent and photos in public builds too', async () => {
  for (const publicBuild of [false, true]) {
    const c = await load(root, 'vi', publicBuild)
    expect(c.materials.map(m => m.id)).toEqual(['lua', 'lua-sa-tung'])
    const child = c.materials[1]!
    expect(child.parent).toBe('lua')
    expect(child.photos).toHaveLength(1)
    expect(child.t).toEqual(schema.TranslationSchema.parse(await read('lua-sa-tung/vi.json')))
  }
})

test.each(['id', 'th', 'ms'] as const)('pilot ignores even a supplied %s translation', async lang => {
  const dir = await changed('lua-sa-tung/vi.json', () => {})
  await cp(join(dir, 'materials/lua-sa-tung/vi.json'), join(dir, `materials/lua-sa-tung/${lang}.json`))
  expect((await load(dir, lang)).materials).toEqual([])
})

test.each(['[4]', '[0]'])('loader refuses a section citing absent source %s', async mark => {
  const dir = await changed('lua-sa-tung/vi.json', t => { t.sections.water = `<p>Nước đổi màu. ${mark}</p>` })
  await expect(load(dir)).rejects.toThrow(/lua-sa-tung.*source/i)
})

test.each([[undefined], [['Một dòng.']], [['1', '2', '3', '4', '5']]])('materials require two to four summary lines (%j)', async summary => {
  const dir = await changed('lua-sa-tung/vi.json', t => { t.summary = summary })
  await expect(load(dir)).rejects.toThrow(/lua-sa-tung.*summary/i)
})

test('unknown section keys fail instead of silently losing writing', async () => {
  const dir = await changed('lua-sa-tung/vi.json', t => { t.sections.watre = '<p>Nước.</p>' })
  await expect(load(dir)).rejects.toThrow(/lua-sa-tung.*section/i)
})

test('duplicate material slugs stop a build instead of replacing a page', async () => {
  const dir = await changed('lua-sa-tung/vi.json', t => { t.slug = 'lua' })
  await expect(load(dir)).rejects.toThrow(/material.*slug/i)
})

test('held materials and unlicensed or unscreened photos obey the existing publication gates', async () => {
  const held = await changed('lua-sa-tung/vi.json', t => { t.held = { checks: ['review'], at: '2026-11-13' } })
  expect((await schema.loadAll({ root: held, lang: 'vi', publicBuild: true, leaveOutHeld: true })).materials.map(m => m.id)).toEqual(['lua'])
  const dir = await changed('lua-sa-tung/entity.json', e => { e.photos[0].licence = 'All rights reserved' })
  expect((await load(dir)).materials[1]!.photos).toEqual([])
  expect((await schema.loadAll({ root, lang: 'vi', publicBuild: true, photoScreen: {} })).materials[1]!.photos).toEqual([])
})
