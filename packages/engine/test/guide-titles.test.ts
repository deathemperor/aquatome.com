import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { checkPages, RULES } from '../src/content-rules'
import { onlyAName, retitleGuide, sourceTitle, titleClashes, titleKey } from '../src/guide-titles'
import type { Page } from '../src/pages'

// The owner, 2026-11-11, on the app's list of guides: "Duplicated". 2Hr Aquarist's tank pages were titled with the
// aquascaper's name alone (four rows reading "Dou Mok"), and two videos from one channel had one title.
test('a title with no word of its language is only a name, in each language', () => {
  for (const t of ['Dou Mok', 'Cory Hopkins', 'Fernando Ferreira 3', 'ADG', 'Balbi vaquero', 'Jordan Stirrat - 2HR Craftspeak']) expect(onlyAName(t, 'vi'), t).toBe(true)
  for (const t of ['Bể Iwagumi đá xám của Dou Mok', 'Cá neon vua', 'Tự làm thức ăn đông lạnh cho cá đĩa', 'Rêu Java']) expect(onlyAName(t, 'vi'), t).toBe(false)
  expect(onlyAName('Dou Mok', 'th')).toBe(true)
  expect(onlyAName('ตู้ไม้น้ำสไตล์ Iwagumi ของ Dou Mok', 'th')).toBe(false)
  expect(onlyAName('Dou Mok', 'id')).toBe(true)
  expect(onlyAName('Cara Merawat Ikan Cupang', 'id')).toBe(false) // title case, but the language's own words
  expect(onlyAName('Akuarium Iwagumi Karya Dou Mok', 'ms')).toBe(false)
  expect(onlyAName('Panduan Lengkap Merawat Udang Hias Untuk Pemula', 'id')).toBe(false) // more than four words
})

test('two guides share a title when it reads the same, in the same language; a name alone is a clash by itself', () => {
  const g = (lang: 'vi' | 'id', id: string, title: string) => ({ lang, id, title })
  const guides = [g('vi', 'a', 'Tự làm thức ăn  đông lạnh'), g('vi', 'b', 'tự làm thức ăn đông lạnh'), g('id', 'a', 'Tự làm thức ăn đông lạnh'), g('vi', 'c', 'George Farmer'), g('vi', 'd', 'Cá neon vua')]
  const clashes = titleClashes(guides)
  expect(clashes.map(c => [c.guide.lang, c.guide.id, c.why, c.with.map(w => w.id)])).toEqual([
    ['vi', 'a', 'shared', ['b']], ['vi', 'b', 'shared', ['a']], ['vi', 'c', 'name', []],
  ])
  expect(titleKey(' Cá  Neon\tvua ')).toBe('cá neon vua')
})

test('the source\'s own title: a video\'s, or the heading kept with the source page\'s copy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'titles-'))
  await mkdir(join(root, 'sources/2hraquarist'), { recursive: true })
  await writeFile(join(root, 'sources/2hraquarist/blogs-aquascaping-ideas-dou-mok.md'), '---\nurl: https://www.2hraquarist.com/blogs/aquascaping-ideas/dou-mok\ntitle: Dou Mok | Iwagumi - The 2Hr Aquarist\n---\n\n# Dou Mok | Iwagumi\n')
  expect(await sourceTitle(root, { source: '2hraquarist', sourceUrl: 'https://www.2hraquarist.com/blogs/aquascaping-ideas/dou-mok' })).toBe('Dou Mok | Iwagumi - The 2Hr Aquarist')
  expect(await sourceTitle(root, { source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=x', video: { title: 'MAKING MY OWN FISH FOOD' } })).toBe('MAKING MY OWN FISH FOOD')
  expect(await sourceTitle(root, { source: '2hraquarist', sourceUrl: 'https://www.2hraquarist.com/blogs/aquascaping-ideas/none' })).toBeUndefined()
})

test('a new title is scored only when it is new, not a name alone and no other guide\'s; the writer is told the credit rule', async () => {
  const prompts: string[] = []
  const llm = (title: string, score = 0.9) => (async (a: { prompt: string; schema: { properties: object } }) => {
    prompts.push(a.prompt)
    return 'score' in a.schema.properties ? { score, notes: [] } : { title }
  }) as Llm
  const g = { title: 'Dou Mok', body: '<p>Bể Iwagumi với đá xám và thảm cỏ.</p>', lang: 'vi' as const, why: 'name' as const, source: 'Dou Mok | Iwagumi - The 2Hr Aquarist', others: [{ title: 'Dou Mok', body: '<p>Bể nature style với lũa.</p>' }], taken: new Set(['dou mok', 'bể nature lũa và rêu – dou mok']) }
  expect(await retitleGuide(llm('Bể Iwagumi đá xám, thảm cỏ ngắn – Dou Mok'), g)).toEqual({ title: 'Bể Iwagumi đá xám, thảm cỏ ngắn – Dou Mok', score: 0.9, notes: [] })
  expect(prompts[0]).toContain('then a spaced en dash and the person or studio as its credit ("Bể Iwagumi đá xám, thảm cỏ ngắn – Dou Mok")')
  expect(prompts[0]).toContain("THE SOURCE'S OWN TITLE: Dou Mok | Iwagumi")
  expect(prompts[0]).toContain('--- OTHER GUIDE 1 ---\nTITLE: Dou Mok')
  expect(prompts[1]).toContain('NEW: Bể Iwagumi đá xám, thảm cỏ ngắn – Dou Mok')
  prompts.length = 0
  for (const [title, why] of [['Dou Mok', 'unchanged'], ['Dou Mok Studio', 'still only a name'], ['Bể Nature lũa và rêu – Dou Mok', 'another guide has it'], ['', 'empty']] as const) {
    expect(await retitleGuide(llm(title), g), title).toEqual({ title, score: 0, notes: [why] })
  }
  expect(prompts).toHaveLength(4) // no review for any of them
})

test('the content rule finds a shared title and a name alone on guides, in every language, and nothing on other pages', () => {
  const page = (lang: Page['lang'], id: string, title: string, kind: Page['kind'] = 'guides') => ({ lang, kind, id, title, path: `/${lang}/huong-dan/${id}/`, fields: [], lines: [], captions: [], latinNames: [], card: [] }) as Page
  const { findings, errors } = checkPages([page('vi', 'a', 'Dou Mok'), page('vi', 'b', 'Cá đĩa'), page('vi', 'c', 'cá  đĩa'), page('th', 'd', 'Dou Mok'), page('vi', 'e', 'Cá đĩa', 'species')], RULES.filter(r => r.id === 'guide-title'))
  expect(errors).toEqual([])
  expect(findings.map(f => `${f.page.lang}/${f.page.id}: ${f.detail}`)).toEqual(['vi/a: "Dou Mok" is only a name', 'vi/b: "Cá đĩa" is the title of 2 guides', 'vi/c: "cá  đĩa" is the title of 2 guides', 'th/d: "Dou Mok" is only a name'])
})
