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

test("over one in ten refused at a mark of 200 titles stops the language there, its checked titles kept as checked; one in ten exactly goes on (the chief of staff, 16 Nov 02:12)", async () => {
  const root = await mkdtemp(join(tmpdir(), 'video-title-check-'))
  await mkdir(join(root, 'content/species/a'), { recursive: true })
  const ids = Array.from({ length: 500 }, (_, i) => `v${String(i).padStart(3, '0')}`)
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify({ scientificName: 'Aus bus', videos: ids.map(youtubeId => ({ youtubeId, title: `Aus ${youtubeId}`, durationSec: 60, lang: 'en' })) }))
  await writeFile(join(root, 'content/species/a/vi.json'), JSON.stringify({ name: 'Cá A' }))
  const titles = Object.fromEntries(ids.map(id => [id, `Cá A ${id}`]))
  // Refuses the titles it is shown whose place in the order `bad` picks, passes the rest.
  const model = (bad: (i: number) => boolean) => {
    let shown = 0, calls = 0
    const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
      calls++
      const n = prompt.split('\n').filter(l => /^\d+\. \[/.test(l)).length
      return { checks: Array.from({ length: n }, (_, j) => (bad(shown++) ? { n: j + 1, ok: false, kind: 'dropped', why: 'x' } : { n: j + 1, ok: true })) } as T
    }
    return { llm, calls: () => calls }
  }
  const over = model(i => i < 21)
  const r = await checkVideoTitles(root, over.llm, 'vi', titles)
  expect(Object.keys(r.checks)).toHaveLength(200)
  expect(over.calls()).toBe(5)
  expect(r.stopped).toBe('over one in ten refused at 200 titles: 21 of 200')
  const atTen = model(i => i < 20 || (i >= 200 && i < 220) || i >= 490)
  const s = await checkVideoTitles(root, atTen.llm, 'vi', titles)
  expect([Object.keys(s.checks).length, s.stopped]).toEqual([500, ''])
  // The mark is counted on everything checked so far: 20 of the first 200 goes on, and 21 more in the next 200 stops at 400.
  const later = model(i => i < 20 || (i >= 200 && i < 221))
  const t = await checkVideoTitles(root, later.llm, 'vi', titles)
  expect([Object.keys(t.checks).length, t.stopped]).toEqual([200 + 200, 'over one in ten refused at 400 titles: 41 of 400'])
})
