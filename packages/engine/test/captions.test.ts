import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { localizeCaptions } from '../src/captions'

const photo = (caption: string) => ({ url: 'https://x/1.jpg', width: 4, height: 3, licence: 'CC BY 4.0', author: 'A', sourceUrl: 'https://x/1', caption })

test('Vietnamese captions of pages the language has are translated, with the page name; English ones and pages it lacks are not', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-cap-'))
  for (const id of ['betta-splendens', 'danio-rerio']) await mkdir(join(root, 'content/species', id), { recursive: true })
  await writeFile(join(root, 'content/species/betta-splendens/entity.json'), JSON.stringify({ scientificName: 'Betta splendens', photos: [photo('Male, aquarium trade')] }))
  await writeFile(join(root, 'content/species/betta-splendens/th.json'), JSON.stringify({ name: 'ปลากัด' }))
  await writeFile(join(root, 'content/species/danio-rerio/entity.json'), JSON.stringify({ scientificName: 'Danio rerio', photos: [] }))
  await mkdir(join(root, 'content/gallery'))
  await writeFile(join(root, 'content/gallery/betta-splendens.json'), JSON.stringify({ photos: [photo('Cá betta đực màu đỏ'), photo('Cá betta cái'), photo('Cá betta đực màu đỏ')] }))
  await writeFile(join(root, 'content/gallery/danio-rerio.json'), JSON.stringify({ photos: [photo('Cá ngựa vằn')] }))
  const prompts: string[] = []
  const llm = (async ({ prompt }: { prompt: string }) => {
    prompts.push(prompt)
    // The second comes back still in Vietnamese: not kept.
    return { captions: [{ n: 1, text: 'ปลากัดตัวผู้สีแดง.' }, { n: 2, text: 'Cá betta cái' }] }
  }) as unknown as Llm
  const r = await localizeCaptions(root, llm, 'th')
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('"ปลากัด" (Betta splendens)')
  expect(prompts[0]).toContain('1. Cá betta đực màu đỏ\n2. Cá betta cái')
  expect(prompts[0]).not.toContain('Male, aquarium trade')
  expect(JSON.parse(await readFile(join(root, 'content/captions/th.json'), 'utf8'))).toEqual({ 'Cá betta đực màu đỏ': 'ปลากัดตัวผู้สีแดง' })
  expect(r.done).toEqual(['betta-splendens: 1/2'])
  // Run again: only the caption still missing is asked for.
  await localizeCaptions(root, llm, 'th')
  expect(prompts[1]).toContain('1. Cá betta cái')
  expect(prompts[1]).not.toContain('màu đỏ')
})
