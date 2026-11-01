import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import type { Page } from '../src/pages'
import { canRewrite, duePages, keepFindings, pageKey, readerReport, readerText, readPages, rewritePart, type ReaderState } from '../src/reader'

const page = (o: Partial<Page>): Page => ({ lang: 'vi', kind: 'guides', id: 'g', title: 'Cá ăn gì', path: '/vi/huong-dan/g/', fields: [], lines: [], captions: [], latinNames: [], card: [], ...o })
const GUIDE = '<p>Cá cần ăn đủ.</p><p>Cho ăn hai lần một ngày là được rồi đó nha bạn.</p><h3>Kết luận</h3><p>Hết.</p>'

/** A stand-in for the model: the reader's answer, a rewrite of each part it is given, a review score. */
function fakeLlm(o: { findings?: object[]; rewrite?: (vi: string) => string; score?: number; fail?: boolean }) {
  const calls: string[] = []
  const llm: Llm = async <T>({ prompt, schema }: { prompt: string; schema: object }) => {
    const need = (schema as { required: string[] }).required
    if (need.includes('findings')) { calls.push('read'); if (o.fail) throw new LlmError('usage limit'); return { findings: o.findings ?? [] } as T }
    if (need.includes('parts')) {
      calls.push('rewrite')
      const parts = [...prompt.matchAll(/### (\S+)\n(?:EN:\n[\s\S]*?\n)?VI:\n([\s\S]*?)(?=\n\n### |$)/g)].map(m => ({ id: m[1]!, vi: (o.rewrite ?? (v => v))(m[2]!.trim()) }))
      return { parts } as T
    }
    calls.push('review')
    return { score: o.score ?? 0.9, notes: [] } as T
  }
  return { llm, calls }
}

test('the page as the reader gets it: numbered parts, the card, captions once, no reference list; the same text, the same hash', () => {
  const p = page({
    kind: 'species', card: [{ field: 'tempC', source: 'sf', value: { min: 22, max: 26 } }],
    fields: [{ field: 'sections.diet:sf', html: '<p>Ăn tạp.</p><ul><li>Trùn chỉ</li></ul>' }, { field: 'sections.references:sf', html: '<ul><li>Smith 2001</li></ul>' }],
    lines: [{ field: 'summary.0', text: 'Dễ nuôi.' }], captions: [{ url: 'a', caption: 'Cá đực' }, { url: 'b', caption: 'Cá đực' }],
  })
  const r = readerText(p)
  expect(r.text).toBe('TITLE: Cá ăn gì\nADDRESS: /vi/huong-dan/g/\n[CARD] tempC 22–26 (sf)\n\n[P1 diet, from sf]\nĂn tạp.\n- Trùn chỉ\n\n[L1 summary.0] Dễ nuôi.\n\n[C1] Cá đực')
  expect(r.parts).toEqual({ CARD: 'card', P1: 'sections.diet:sf', L1: 'summary.0', C1: 'caption' })
  expect(readerText(p).hash).toBe(r.hash)
  expect(readerText({ ...p, title: 'Khác' }).hash).not.toBe(r.hash)
})

test('pages due: not read yet first (Vietnamese, then guides), then changed ones, the longest ago first; unchanged ones never', () => {
  const pages = [
    page({ lang: 'th', kind: 'species', id: 'a', path: '/th/fish/a/' }), page({ kind: 'species', id: 'b', path: '/vi/ca/b/' }),
    page({ id: 'c', path: '/vi/huong-dan/c/' }), page({ id: 'd', path: '/vi/huong-dan/d/' }), page({ id: 'e', path: '/vi/huong-dan/e/' }),
  ]
  const state: ReaderState = {
    'vi/guides/d': { at: '2026-10-01', hash: 'old', findings: [] },
    'vi/guides/e': { at: '2026-10-02', hash: readerText(pages[4]!).hash, findings: [] },
  }
  expect(duePages(pages, state).map(pageKey)).toEqual(['vi/guides/c', 'vi/species/b', 'th/species/a', 'vi/guides/d'])
})

test('a finding holds only with a known kind, a part the page has and a quote that is on the page', () => {
  const { text, parts } = readerText(page({ fields: [{ field: 'body', html: GUIDE }] }))
  const f = { kind: 'language', severity: 'medium', part: 'P1', quote: 'là được rồi đó nha bạn', problem: 'Too chatty.' } as const
  expect(keepFindings([
    f, { ...f, part: 'P9' }, { ...f, quote: 'not on the page' }, { ...f, kind: 'style' as 'language' }, { ...f, fix: ' ', rule: '' },
    { ...f, problem: 'The figure differs from the card; this is consistent with the source, so it is not an error.' },
  ], text, parts)).toEqual([{ ...f, field: 'body' }, { ...f, field: 'body' }])
})

test('what the engine rewrites: Vietnamese wording anywhere, facts only against the English; never Indonesian or Thai, a slip, a summary line', () => {
  const sp = page({ kind: 'species', en: { 'sections.diet:sf': '<p>Omnivore.</p>' } })
  const f = (o: object) => ({ kind: 'language', severity: 'medium', part: 'P1', quote: 'x', problem: 'p', field: 'body', ...o }) as Parameters<typeof canRewrite>[1]
  expect(canRewrite(page({}), f({}))).toBe(true)
  expect(canRewrite(page({}), f({ kind: 'numbers' }))).toBe(false)
  expect(canRewrite(sp, f({ kind: 'numbers', field: 'sections.diet:sf' }))).toBe(true)
  expect(canRewrite(sp, f({ kind: 'caption', field: 'sections.diet:sf' }))).toBe(false)
  expect(canRewrite(page({ lang: 'id' }), f({}))).toBe(false)
  expect(canRewrite(page({}), f({ severity: 'low' }))).toBe(false)
  expect(canRewrite(page({}), f({ field: 'summary.0' }))).toBe(false)
  expect(canRewrite(sp, f({ field: 'sections.references:sf' }))).toBe(false)
})

test('a guide is rewritten only in the block a finding quotes, and checked against its old wording', async () => {
  const { llm, calls } = fakeLlm({ rewrite: vi => vi.replace('là được rồi đó nha bạn', 'là đủ'), score: 0.92 })
  const r = await rewritePart(llm, GUIDE, [{ kind: 'language', severity: 'medium', part: 'P1', quote: 'là được rồi đó nha bạn', problem: 'Too chatty.' }], {})
  expect(r).toEqual({ html: '<p>Cá cần ăn đủ.</p><p>Cho ăn hai lần một ngày là đủ.</p><h3>Kết luận</h3><p>Hết.</p>', score: 0.92, notes: [] })
  expect(calls).toEqual(['rewrite', 'review'])
  // A quote not in any one block: nothing is rewritten.
  expect(await rewritePart(llm, GUIDE, [{ kind: 'language', severity: 'medium', part: 'P1', quote: 'không có', problem: 'x' }], {})).toBeUndefined()
})

test('a cycle: reads what is due, keeps findings, rewrites a part the reviewer passes, writes nothing it fails; an unchanged page is not read again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rd-'))
  await mkdir(join(root, 'content', 'guides', 'g'), { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const file = join(root, 'content', 'guides', 'g', 'vi.json')
  await writeFile(file, JSON.stringify({ slug: 'g', name: 'Cá ăn gì', body: GUIDE }))
  const p = page({ fields: [{ field: 'body', html: GUIDE }], origin: { source: 'youtube', url: 'https://youtu.be/x' } })
  const findings = [
    { kind: 'language', severity: 'medium', part: 'P1', quote: 'là được rồi đó nha bạn', problem: 'Too chatty.', fix: 'là đủ' },
    { kind: 'structure', severity: 'low', part: 'P1', quote: 'Kết luận', problem: 'A one-line conclusion.', rule: 'a last heading with one short line under it' },
  ]
  const now = () => new Date('2026-11-01T00:00:00Z')
  // The reviewer fails the rewrite: the page stays as it was, both findings stay open.
  const failing = fakeLlm({ findings, rewrite: v => v.replace('là được rồi đó nha bạn', 'là đủ'), score: 0.5 })
  let { report, state } = await readPages(root, [p], { llm: failing.llm, now }, { limit: 20, rewrites: 3 })
  expect(report.read).toEqual(['vi/guides/g (2)'])
  expect(report.notKept).toHaveLength(1)
  expect(JSON.parse(await readFile(file, 'utf8')).body).toBe(GUIDE)
  expect(state['vi/guides/g']!.findings).toHaveLength(2)
  // Read again (the page changed nothing, so only with --only): this time the reviewer passes it.
  const passing = fakeLlm({ findings, rewrite: v => v.replace('là được rồi đó nha bạn', 'là đủ'), score: 0.9 })
  ;({ report, state } = await readPages(root, [p], { llm: passing.llm, now }, { limit: 20, rewrites: 3, only: ['vi/guides/g'] }))
  expect(report.rewritten).toEqual(['vi/guides/g body (0.90)'])
  const body = JSON.parse(await readFile(file, 'utf8')).body as string
  expect(body).toContain('Cho ăn hai lần một ngày là đủ.')
  expect(state['vi/guides/g']!.findings.map(f => f.kind)).toEqual(['structure'])
  expect(state['vi/guides/g']!.rewrites!.map(r => r.kept)).toEqual([false, true])
  // The page as it is now counts as read: nothing is due, no model call.
  const again = fakeLlm({ findings })
  ;({ report } = await readPages(root, [{ ...p, fields: [{ field: 'body', html: body }] }], { llm: again.llm, now }, { limit: 20, rewrites: 3 }))
  expect(report.read).toEqual([])
  expect(again.calls).toEqual([])
  const md = readerReport([{ ...p, fields: [{ field: 'body', html: body }] }], state)
  expect(md).toContain('## Could become a rule (1)\n\nKinds of problem a check with no model could find on every page (add it to `content-rules.ts`).\n\n- a last heading with one short line under it — [vi · Cá ăn gì](https://aquatome.com/vi/huong-dan/g/): "Kết luận"')
  expect(md).toContain('### Structure that misleads (1)')
  expect(md).toContain('- 2026-11-01 [vi · Cá ăn gì](https://aquatome.com/vi/huong-dan/g/) — body: kept (review 0.90): Too chatty.')
})

test('two parts rewritten in one cycle: the page counts as read with both', async () => {
  const root = await mkdtemp(join(tmpdir(), 'r2-'))
  await mkdir(join(root, 'content', 'species', 's'), { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const sections = { 'diet:sf': '<p>Ăn trùn chỉ đỏ.</p>', 'behaviour:sf': '<p>Nuôi với cá rô phi châu Phi.</p>' }
  await writeFile(join(root, 'content', 'species', 's', 'vi.json'), JSON.stringify({ slug: 's', name: 'Cá', sections }))
  const p = page({
    kind: 'species', id: 's', path: '/vi/ca/s/', fields: Object.entries(sections).map(([k, html]) => ({ field: `sections.${k}`, html })),
    en: { 'sections.diet:sf': '<p>Eats bloodworms.</p>', 'sections.behaviour:sf': '<p>Kept with African cichlids.</p>' },
  })
  const findings = [
    { kind: 'language', severity: 'medium', part: 'P1', quote: 'trùn chỉ đỏ', problem: 'Bloodworms are trùn huyết.' },
    { kind: 'language', severity: 'medium', part: 'P2', quote: 'cá rô phi châu Phi', problem: 'Rô phi is tilapia.' },
  ]
  const { llm } = fakeLlm({ findings, rewrite: v => v.replace('trùn chỉ đỏ', 'trùn huyết').replace('cá rô phi', 'cá cichlid'), score: 0.9 })
  const { report, state } = await readPages(root, [p], { llm, now: () => new Date('2026-11-01T00:00:00Z') }, { limit: 20, rewrites: 3 })
  expect(report.rewritten).toEqual(['vi/species/s sections.diet:sf (0.90)', 'vi/species/s sections.behaviour:sf (0.90)'])
  const stored = JSON.parse(await readFile(join(root, 'content', 'species', 's', 'vi.json'), 'utf8')).sections as Record<string, string>
  const after = { ...p, fields: Object.entries(stored).map(([k, html]) => ({ field: `sections.${k}`, html })) }
  expect(state['vi/species/s']!.hash).toBe(readerText(after).hash)
  expect(duePages([after], state)).toEqual([])
})

test('a usage limit stops the sweep with what it has saved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rl-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const { llm, calls } = fakeLlm({ fail: true })
  const { report } = await readPages(root, [page({ id: 'a', path: '/vi/huong-dan/a/' }), page({ id: 'b', path: '/vi/huong-dan/b/' })], { llm, now: () => new Date() }, { limit: 20, rewrites: 3 })
  expect(report.stopped).toMatch(/^vi\/guides\/a: usage limit/)
  expect(calls).toEqual(['read'])
})
