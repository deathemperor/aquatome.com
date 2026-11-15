import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { checkVideoTitles, recordRefusals } from '../src/video-title-check'

async function store() {
  const root = await mkdtemp(join(tmpdir(), 'video-title-check-'))
  await mkdir(join(root, 'content/species/a'), { recursive: true })
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify({ scientificName: 'Aus bus', videos: [{ youtubeId: 'en-a', title: 'RARE Predatory Fish Forum Aus', durationSec: 60, lang: 'en' }, { youtubeId: 'en-b', title: 'Aus tank tour', durationSec: 60, lang: 'en' }, { youtubeId: 'vi-a', title: 'Nuôi cá A', durationSec: 60, lang: 'vi' }] }))
  await writeFile(join(root, 'content/species/a/vi.json'), JSON.stringify({ name: 'Cá A' }))
  await mkdir(join(root, 'content/video-titles'), { recursive: true })
  return root
}

test('each written title is read against its own title and the page, and a refusal is recorded with its reason; one that now passes comes off (the chief of staff, 16 Nov)', async () => {
  const root = await store()
  const seen: string[] = []
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
    seen.push(prompt.split('\n\n').at(-1)!.trim())
    return { checks: [{ n: 1, ok: false, kind: 'added', why: '"săn mồi" is the forum\'s name' }, { n: 2, ok: true }] } as T
  }
  const r = await checkVideoTitles(root, llm, 'vi', { 'en-a': 'Cá A săn mồi hiếm', 'en-b': 'Tham quan bể cá A' })
  expect(seen[0]).toBe('1. [Cá A, Aus bus] RARE Predatory Fish Forum Aus\n   Vietnamese: Cá A săn mồi hiếm\n2. [Cá A, Aus bus] Aus tank tour\n   Vietnamese: Tham quan bể cá A')
  expect(r.checks).toEqual({ 'en-a': { ok: false, kind: 'added', why: '"săn mồi" is the forum\'s name' }, 'en-b': { ok: true } })
  await writeFile(join(root, 'content/video-titles/vi.refused.json'), JSON.stringify({ 'en-b': 'dropped: earlier run', zz: 'kept from before' }))
  await recordRefusals(root, 'vi', r.checks)
  expect(JSON.parse(await readFile(join(root, 'content/video-titles/vi.refused.json'), 'utf8'))).toEqual({ 'en-a': 'added: "săn mồi" is the forum\'s name', zz: 'kept from before' })
})
