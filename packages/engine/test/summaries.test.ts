import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { approveSummaries, draftSummaries, readSummaries, reviewDoc } from '../src/summaries'

async function content() {
  const root = join(await mkdtemp(join(tmpdir(), 'sum-')), 'content')
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), root, { recursive: true })
  await rm(join(root, 'summaries'), { recursive: true, force: true }) // start with no summaries
  return root
}
const now = () => new Date('2026-10-29T00:00:00Z')

test('drafts only indexable species, best first, grounded in the page text; pending until approved', async () => {
  const root = await content()
  const prompts: string[] = []
  const llm = async <T,>(a: { prompt: string }) => { prompts.push(a.prompt); return { summary: 'Hợp với bể cộng đồng nhỏ, nước mềm.', mistakes: ['Thả đơn lẻ: nên nuôi đàn từ 8 con.'] } as T }
  const ids = await draftSummaries(root, llm, { top: 2, now, publicBuild: false })
  expect(ids.length).toBe(2)
  expect(prompts[0]).toContain('Chỉ dùng thông tin có trong hồ sơ')
  expect(prompts[0]).not.toMatch(/<p>/)
  expect((await readSummaries(root)).every(s => s.review === 'pending')).toBe(true)
  // Unchanged pages are not drafted again.
  expect(await draftSummaries(root, llm, { top: 2, now, publicBuild: false })).not.toEqual(ids)
  const doc = await reviewDoc(root, false)
  expect(doc).toContain(`id: \`${ids[0]}\``)
  expect(await approveSummaries(root, [ids[0]!])).toEqual([ids[0]])
  expect(JSON.parse(await readFile(join(root, 'summaries', `${ids[0]}.json`), 'utf8')).review).toBe('approved')
  expect(await reviewDoc(root, false)).not.toContain(`id: \`${ids[0]}\``)
})
test('bad model output is skipped, nothing written', async () => {
  const root = await content()
  const ids = await draftSummaries(root, async <T,>() => ({ summary: 'x' }) as T, { top: 1, now, publicBuild: false })
  expect(ids).toEqual([])
  expect(await readSummaries(root)).toEqual([])
})
