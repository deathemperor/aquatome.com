import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { PHRASES, phraseRun } from '../src/phrases'
import { gitChanged, LISTED_ON, listedBy, marksFor, phrasesPass, rewriteMarks, slips, textParts, writeReport, type ChangedParts } from '../src/rewrite-marks'
import { rewriteExisting, type RewriteState } from '../src/vi-backfill'

const put = async (root: string, path: string, v: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(v)) }
const guide = (root: string, slug: string, body: string) => Promise.all([
  put(root, `guides/${slug}/entity.json`, { id: slug, source: 'aquariumcoop', html: '' }),
  put(root, `guides/${slug}/vi.json`, { slug, name: slug, body, quality: { score: 0.85, indexable: true } }),
])
const rec = (at: string, more: Partial<RewriteState[string]> = {}) => ({ at, rewritten: 1, of: 1, scores: [0.9], v: 2, ...more })
const opts = { mode: 'fix' as const }
// What `gitChanged` finds when each record's commit changed the page's body to what it is now, but for the pages named:
// 'none', no commit found; 'unchanged', the commit left the page as it was.
const landed = (root: string, but: Record<string, 'none' | 'unchanged'> = {}): ChangedParts => async want => {
  const out = new Map<string, Record<string, string>>()
  for (const id of Object.keys(want)) {
    const body = await readFile(join(root, id, 'vi.json'), 'utf8').then(t => JSON.parse(t).body as string, () => undefined)
    if (but[id] !== 'none' && body !== undefined) out.set(id, but[id] === 'unchanged' ? {} : { body })
  }
  return out
}

async function setup(state: RewriteState, pages: Record<string, string>) {
  const root = join(await mkdtemp(join(tmpdir(), 'aq-marks-')), 'content') // engine-state beside it, as in the repository
  for (const [slug, body] of Object.entries(pages)) await guide(root, slug, body)
  const file = join(root, '..', 'vi-rewrite.json')
  await writeFile(file, JSON.stringify(state))
  return { root, file }
}

// A row added to the list after this step goes here, never in the table: the step marks none of its words.
const ADDED_SINCE: string[] = []
test('the table holds every row on the list, each on the day it reached the rewrite', () => {
  const says = (PHRASES.vi ?? []).map(p => p.say)
  expect(Object.keys(LISTED_ON).filter(s => !says.includes(s))).toEqual([])
  expect(says.filter(s => !LISTED_ON[s])).toEqual(ADDED_SINCE)
  expect(Object.values(LISTED_ON).filter(d => d === '2026-11-08')).toHaveLength(61)
  expect(Object.entries(LISTED_ON).filter(([, d]) => d === '2026-11-12').map(([s]) => s).sort()).toEqual(['nửa tá', 'thài lài', 'thủng lỗ đầu', 'trùn chỉ đỏ'])
})

// The pass marks with each row's words as they are now, against the row's day: a row whose words widened later would
// mark a page for a word its rewrite never saw. Each row's words are pinned as on its day (from git, none widened since);
// a widening moves the row's day in the table to the widening's, which leaves the pages before it for the pass.
test('each dated row matches the words it matched on its day', () => {
  const rows = (PHRASES.vi ?? []).filter(p => LISTED_ON[p.say]).map(p => `${p.say}\t${LISTED_ON[p.say]}\t${p.find ?? p.say}`).join('\n')
  expect(createHash('sha256').update(rows).digest('hex').slice(0, 16)).toBe('2d60d9e4189ddab6')
})

test('a word counts only for a page rewritten on a later day than its row reached the rewrite', () => {
  expect(listedBy('phần lớn', '2026-11-08')).toBe(false)
  expect(listedBy('phần lớn', '2026-11-09')).toBe(true)
  expect(listedBy('nửa tá', '2026-11-12')).toBe(false)
  expect(listedBy('nửa tá', '2026-11-13')).toBe(true)
  expect(listedBy('a row added later', '2026-12-01')).toBe(false)
  // As --phrases matches it: the word as written, lower-cased; a 12 Nov row's word not yet on a page of 12 Nov.
  expect(marksFor('["Phần lớn cá… nửa tá con"]', '2026-11-12', PHRASES.vi!)).toEqual(['phần lớn'])
  expect(marksFor('["Phần lớn cá… nửa tá con"]', '2026-11-13', PHRASES.vi!).sort()).toEqual(['nửa tá', 'phần lớn'])
})

test('a word is marked only in a part the rewrite commit changed, and only when the page has it nowhere else', () => {
  const list = PHRASES.vi!, at = '2026-11-15', body = '<p>Phần lớn cá.</p>'
  expect(slips({ body }, { body }, at, list)).toEqual(['phần lớn'])
  expect(slips({}, { body }, at, list)).toEqual([]) // the commit changed nothing: the rewrite came back as it was
  expect(slips({ body }, { body, 'faq:0:a': 'Phần lớn là dễ.' }, at, list)).toEqual([]) // in a question too, which the queue never sends
  expect(slips({ body }, { body: '<p>Cá khỏe.</p>' }, at, list)).toEqual([]) // gone from the page since
  expect(slips({ body: '<p>Cá khỏe.</p>' }, { body }, at, list)).toEqual([]) // came in later: not the writer's
  // A fish page: a word in its references, or in a section the commit didn't change, closes the mark.
  const fish = { 'care:sf': body, 'diet:sf': '<p>Phần lớn ăn rêu.</p>', 'references:sf': '<li>Loricariid catfishes</li>' }
  expect(slips({ 'care:sf': body }, fish, at, list)).toEqual([])
  expect(slips({ 'care:sf': body, 'diet:sf': fish['diet:sf'] }, fish, at, list)).toEqual(['phần lớn'])
  // Part by part: a word the rewrite left in one part and a later step put in another isn't the rewrite's (Codex, Fable).
  expect(slips({ 'care:sf': '<p>Phần lớn cá.</p>', 'diet:sf': '<p>Ăn rêu.</p>' }, { 'care:sf': '<p>Cá khỏe.</p>', 'diet:sf': '<p>Phần lớn ăn rêu.</p>' }, at, list)).toEqual([])
  expect(textParts({ body: 'b', summary: ['s'], faq: [{ q: 'q', a: 'a' }], definition: 'd', sections: { 'x:sf': 'x' } })).toEqual({ body: 'b', 'summary:0': 's', 'faq:0:q': 'q', 'faq:0:a': 'a', definition: 'd', 'x:sf': 'x' })
})

// From Fable's read of 22 Nov: four marked pages had their words in text byte-identical to before their rewrite, and on
// one the rewrite's commit didn't touch the page. The lookup reads the commit that wrote each record.
test('the lookup in git: what the commit that wrote each record changed on its page', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-marks-git-'))
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd: dir, stdio: 'pipe' })
  const page = (slug: string, v: object) => { mkdirSync(join(dir, 'content/guides', slug), { recursive: true }); writeFileSync(join(dir, 'content/guides', slug, 'vi.json'), JSON.stringify(v)) }
  const record = (m: object) => { mkdirSync(join(dir, 'engine-state'), { recursive: true }); writeFileSync(join(dir, 'engine-state/vi-rewrite.json'), JSON.stringify(m, null, 2)) }
  git('init', '-q', '-b', 'main')
  const old = { body: '<p>Phần lớn cá sống ở suối. Dù vậy, cá khỏe.</p>', faq: [{ q: 'Khó không?', a: 'Dễ.' }] }
  // "units": its question has the word too, and an inch the rewrite's unit step takes out after the model (metricPage).
  const units = { ...old, faq: [{ q: 'Phần lớn cá dài tối đa 5 cm (≈ 2″).', a: 'Dễ.' }] }
  page('landed', old); page('as-was', old); page('units', units); record({})
  git('add', '.'); git('commit', '-qm', 'pages')
  const now = { ...old, body: '<p>Phần lớn cá sống ở suối. Cá vẫn khỏe.</p>' }
  page('landed', now) // the rewrite changed the body and kept "phần lớn"; "as-was" came back as it was
  page('units', { ...now, faq: [{ q: 'Phần lớn cá dài tối đa 5 cm.', a: 'Dễ.' }] }) // the model saw only the body
  const state = { 'guides/landed': rec('2026-11-15'), 'guides/as-was': rec('2026-11-15'), 'guides/units': rec('2026-11-15') }
  record(state); git('commit', '-qam', 'rewrite')
  page('landed', { ...now, summary: ['Cá dễ nuôi.'] }); git('commit', '-qam', 'a later step')
  const found = await gitChanged(join(dir, 'content'))({ ...state, 'guides/none': rec('2026-11-15') })
  expect(found.get('guides/landed')).toEqual({ body: now.body })
  expect(found.get('guides/as-was')).toEqual({})
  expect(found.has('guides/none')).toBe(false)
  // The unit step's change isn't the rewrite's: only the body counts, so the question's word stays for the pass.
  expect(found.get('guides/units')).toEqual({ body: now.body })
  // The step itself, from git: the page whose rewrite landed is marked, the one that came back as it was isn't.
  const r = await rewriteMarks(join(dir, 'content'), join(dir, 'engine-state/vi-rewrite.json'), { dry: true, opts })
  expect(r.marked).toEqual(['guides/landed'])
  expect([r.unchanged, r.noCommit]).toEqual([1, 0])
  // No history (not a git checkout): nothing is marked.
  const { root, file } = await setup(state, { landed: now.body, 'as-was': old.body, units: now.body })
  const none = await rewriteMarks(root, file, { dry: true, opts })
  expect([none.marked.length, none.noCommit]).toEqual([0, 3])
  // A checkout cut short (a shallow clone): a commit whose parent isn't there shows nothing, so nothing is marked. It
  // read as a commit that wrote every record and every page from nothing: 45 pages marked, not 37 (Codex, Fable, 22 Nov).
  for (const depth of ['1', '2']) {
    const cut = mkdtempSync(join(tmpdir(), 'aq-marks-cut-'))
    execFileSync('git', ['clone', '-q', '--depth', depth, `file://${dir}`, cut], { stdio: 'pipe' })
    const s = await rewriteMarks(join(cut, 'content'), join(cut, 'engine-state/vi-rewrite.json'), { dry: true, opts })
    expect([depth, s.marked.length, s.noCommit]).toEqual([depth, 0, 3])
  }
  // A page moved with its record, or first written in its record's commit: a page from nothing shows nothing of a rewrite.
  git('mv', 'content/guides/as-was', 'content/guides/moved')
  page('fresh', now)
  const later = { 'guides/moved': rec('2026-11-15'), 'guides/fresh': rec('2026-11-16') }
  record({ 'guides/landed': state['guides/landed'], 'guides/units': state['guides/units'], ...later })
  git('add', '.'); git('commit', '-qm', 'moved')
  expect([...(await gitChanged(join(dir, 'content'))(later)).keys()]).toEqual([])
  // A page whose earlier version isn't JSON counts as one with none: nothing shown, and the step goes on (Codex).
  mkdirSync(join(dir, 'content/guides/broken'), { recursive: true })
  writeFileSync(join(dir, 'content/guides/broken/vi.json'), '{')
  git('add', '.'); git('commit', '-qm', 'a broken page')
  page('broken', now)
  const fix = { 'guides/broken': rec('2026-11-17') }
  record({ ...JSON.parse(readFileSync(join(dir, 'engine-state/vi-rewrite.json'), 'utf8')), ...fix })
  git('commit', '-qam', 'its rewrite')
  expect([...(await gitChanged(join(dir, 'content'))(fix)).keys()]).toEqual([])
})

test('marks what a page kept from a rewrite made with its word listed; the rest stays for --phrases, as its own dry run picks', async () => {
  const state: RewriteState = {
    'guides/slip': rec('2026-11-15'), // rewritten whole with the list: its word is a slip, marked
    'guides/same-day': rec('2026-11-08'), // the day the list landed: not marked
    'guides/before': rec('2026-11-02'), // before the list: not marked
    'guides/kept': rec('2026-11-15', { rewritten: 0, scores: [0.6] }), // the reviewer refused it: its text wasn't rewritten, not marked
    'guides/partial': rec('2026-11-15', { rewritten: 1, of: 2, scores: [0.9, 0.6] }), // one part refused, which one unknown: not marked
    'guides/failed': rec('2026-11-15', { rewritten: 0, error: 'boom' }), // the rewrite failed: not marked
    'guides/failed-quiet': rec('2026-11-15', { rewritten: 0, error: '' }), // failed with no message: still a failure
    'guides/marked': rec('2026-11-20', { phrases: ['dù vậy'] }), // marked already: left as it is
    'guides/no-marks': rec('2026-11-15', { phrases: [] }), // an empty list is no marks: marked
    'guides/late-row': rec('2026-11-12'), // has a 12 Nov row's word on 12 Nov: that word stays, the other is marked
    'guides/faq-only': rec('2026-11-15'), // its word is only in an FAQ answer, which the rewrite never sent: not marked
    'guides/unchanged': rec('2026-11-15'), // its commit left the page as it was: not marked
    'guides/no-commit': rec('2026-11-15'), // no commit found that wrote its record: not marked
    'guides/both': rec('2026-11-15'), // its word is in its body and a question too: the mark would close the question, not marked
  }
  const { root, file } = await setup(state, {
    slip: '<p>Phần lớn cá sống ở suối.</p>',
    'same-day': '<p>Phần lớn cá sống ở suối.</p>',
    before: '<p>Phần lớn cá sống ở suối.</p>',
    kept: '<p>Dù vậy, cá vẫn khỏe.</p>',
    partial: '<p>Phần lớn cá sống ở suối.</p>',
    failed: '<p>Dù vậy, cá vẫn khỏe.</p>',
    'failed-quiet': '<p>Dù vậy, cá vẫn khỏe.</p>',
    marked: '<p>Dù vậy, cá vẫn khỏe. Nhìn chung là ổn.</p>',
    'no-marks': '<p>Dù vậy, cá vẫn khỏe.</p>',
    'late-row': '<p>Phần lớn cá đẻ nửa tá trứng.</p>',
    'faq-only': '<p>Cá dễ nuôi.</p>',
    unchanged: '<p>Phần lớn cá sống ở suối.</p>',
    'no-commit': '<p>Phần lớn cá sống ở suối.</p>',
    both: '<p>Phần lớn cá sống ở suối.</p>',
    never: '<p>Nhìn chung cá dễ nuôi.</p>', // never rewritten: --phrases takes it up
    clean: '<p>Cá dễ nuôi.</p>', // no listed word: never due
  })
  await put(root, 'guides/faq-only/vi.json', { slug: 'faq-only', name: 'F', body: '<p>Cá dễ nuôi.</p>', faq: [{ q: 'Khó không?', a: 'Nhìn chung là dễ.' }], quality: { score: 0.85, indexable: true } })
  await put(root, 'guides/both/vi.json', { slug: 'both', name: 'B', body: '<p>Phần lớn cá sống ở suối.</p>', faq: [{ q: 'Khó không?', a: 'Phần lớn là dễ.' }], quality: { score: 0.85, indexable: true } })
  const changed = landed(root, { 'guides/unchanged': 'unchanged', 'guides/no-commit': 'none' })
  const before = await readFile(file, 'utf8')
  const dry = await rewriteMarks(root, file, { dry: true, opts, changed })
  expect(await readFile(file, 'utf8')).toBe(before)
  const r = await rewriteMarks(root, file, { opts, changed })
  expect(r).toEqual(dry)
  expect(r.marked.sort()).toEqual(['guides/late-row', 'guides/no-marks', 'guides/slip'])
  expect([r.records, r.skipped, r.partial, r.eligible, r.noCommit, r.unchanged]).toEqual([14, 3, 2, 9, 1, 1])
  const after = JSON.parse(await readFile(file, 'utf8')) as RewriteState
  expect(after['guides/slip']!.phrases).toEqual(['phần lớn'])
  expect(after['guides/no-marks']!.phrases).toEqual(['dù vậy'])
  expect(after['guides/late-row']!.phrases).toEqual(['phần lớn'])
  for (const id of ['guides/same-day', 'guides/before', 'guides/kept', 'guides/partial', 'guides/failed', 'guides/failed-quiet', 'guides/marked', 'guides/faq-only', 'guides/unchanged', 'guides/no-commit', 'guides/both']) expect(after[id]).toEqual(state[id])
  const ids = (xs: string[]) => xs.map(x => x.split(' ')[0]).sort()
  expect(ids(r.dueBefore)).toEqual(['guides/before', 'guides/both', 'guides/failed', 'guides/failed-quiet', 'guides/faq-only', 'guides/kept', 'guides/late-row', 'guides/marked', 'guides/never', 'guides/no-commit', 'guides/no-marks', 'guides/partial', 'guides/same-day', 'guides/slip', 'guides/unchanged'])
  expect(ids(r.dueAfter)).toEqual(['guides/before', 'guides/both', 'guides/failed', 'guides/failed-quiet', 'guides/faq-only', 'guides/kept', 'guides/late-row', 'guides/marked', 'guides/never', 'guides/no-commit', 'guides/partial', 'guides/same-day', 'guides/unchanged'])
  expect([r.afterRecorded, r.afterNever, r.parts]).toEqual([12, 1, 14]) // "both" sends its body and its question
  // The count is the rewrite's own: with the record as written, --phrases takes up exactly the pages left.
  const real = await rewriteExisting(root, file, { llm: async () => { throw new Error('no model') }, opts, now: () => new Date() }, { limit: Infinity, ...phraseRun('vi'), dry: true })
  expect(ids(real.done)).toEqual(ids(r.dueAfter))
  // Every record rewritten with the row counts, the two whose commit shows no rewrite too (Codex, Fable).
  expect(r.byRow['phần lớn']).toEqual({ rewrittenWith: 7, stillHave: 2, leftWith: 6 })
  expect(r.byRow['nửa tá']).toEqual({ rewrittenWith: 6, stillHave: 0, leftWith: 1 })
  // A second run marks nothing more.
  const again = await rewriteMarks(root, file, { opts, changed })
  expect(again.marked).toEqual([])
  expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(after, null, 2)}\n`)
})

test('the record is written whole, and not at all if it changed during the run; the report never goes over a file', async () => {
  const { root, file } = await setup({ 'guides/slip': rec('2026-11-15') }, { slip: '<p>Phần lớn cá sống ở suối.</p>' })
  const changed = JSON.stringify({ 'guides/slip': rec('2026-11-15'), 'guides/new': rec('2026-11-22') })
  await expect(rewriteMarks(root, file, { opts, changed: landed(root), beforeWrite: () => writeFile(file, changed) })).rejects.toThrow('changed while the marks were made')
  expect(await readFile(file, 'utf8')).toBe(changed)
  expect(await readdir(join(file, '..'))).not.toContainEqual(expect.stringContaining('.marks-'))
  // A file already where the new one goes (here a link to the record) is never written through: the record stays as it was.
  const side = `${file}.marks-${process.pid}`
  await symlink(file, side)
  await expect(rewriteMarks(root, file, { opts, changed: landed(root) })).rejects.toThrow('EEXIST')
  expect(await readFile(file, 'utf8')).toBe(changed)
  expect(lstatSync(side).isSymbolicLink()).toBe(true)
  await rm(side)
  const r = await rewriteMarks(root, file, { opts, changed: landed(root) })
  expect(r.marked).toEqual(['guides/slip'])
  await expect(writeReport(file, r)).rejects.toThrow()
  expect(JSON.parse(await readFile(file, 'utf8'))['guides/slip'].phrases).toEqual(['phần lớn'])
  const out = join(root, '..', 'report.json')
  await writeReport(out, r)
  expect(JSON.parse(await readFile(out, 'utf8')).marked).toEqual(['guides/slip'])
})

// The chief of staff, 22 Nov: the pass writes the marks as its first step, so the slips the daily queue left since the
// last pass are marked before any page goes to a model, and no one has to run the step by hand days ahead.
test('the pass writes the marks before its first page, so it takes up only what they leave; its dry run writes nothing', async () => {
  const { root, file } = await setup({ 'guides/slip': rec('2026-11-15'), 'guides/before': rec('2026-11-02') }, {
    slip: '<p>Phần lớn cá sống ở suối.</p>', // rewritten whole with the list: a slip, marked
    before: '<p>Phần lớn cá sống ở suối.</p>', // before the list: the pass takes it up
    never: '<p>Nhìn chung cá dễ nuôi.</p>', // never rewritten: the pass takes it up
  })
  const none = { llm: async () => { throw new Error('a dry run calls no model') }, opts, now: () => new Date() }
  const ids = (xs: string[]) => xs.map(x => x.split(' ')[0]).sort()
  // Without the marks, --phrases takes the slip up again.
  expect(ids((await rewriteExisting(root, file, none, { limit: Infinity, ...phraseRun('vi'), dry: true })).done)).toEqual(['guides/before', 'guides/never', 'guides/slip'])
  const before = await readFile(file, 'utf8')
  const dry = await phrasesPass(root, file, none, { limit: Infinity, dry: true }, { changed: landed(root) })
  expect(await readFile(file, 'utf8')).toBe(before)
  expect(dry.marks.marked).toEqual(['guides/slip'])
  expect(ids(dry.run.done)).toEqual(['guides/before', 'guides/never'])
  // A pass: when its first page goes to the model, the record already has the slip's mark.
  const seen: unknown[] = []
  const llm = async () => { seen.push(JSON.parse(await readFile(file, 'utf8'))['guides/slip'].phrases); throw new Error('stand-in') }
  const r = await phrasesPass(root, file, { llm, opts, now: () => new Date() }, { limit: 1 }, { changed: landed(root) })
  expect(r.marks.marked).toEqual(['guides/slip'])
  expect(seen.length).toBeGreaterThan(0)
  expect(seen).toEqual(seen.map(() => ['phần lớn']))
  expect(r.run.failed.map(x => x.split(':')[0])).toEqual(['guides/before'])
  expect(JSON.parse(await readFile(file, 'utf8'))['guides/slip'].phrases).toEqual(['phần lớn'])
})

// The marks go to main in the pass's commit (the chief of staff, 22 Nov). Should a daily run's push meet it, the record
// merges page by page, as the engine's other keyed records do: here the pass marks the last page and the run adds the
// next, the two neighbouring lines a merge as text can't take apart.
test('the record merges page by page, so the marks and a rewrite run that met keep both', () => {
  const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'aq-marks-merge-'))
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd: dir, stdio: 'pipe' })
  const file = join(dir, 'engine-state', 'vi-rewrite.json')
  const write = (m: object) => writeFileSync(file, `${JSON.stringify(m, null, 2)}\n`)
  git('init', '-q', '-b', 'main')
  git('config', 'merge.jsonmap.driver', `node ${join(ROOT, 'scripts/merge-json-map.mjs')} %O %A %B`)
  copyFileSync(join(ROOT, '.gitattributes'), join(dir, '.gitattributes'))
  mkdirSync(join(dir, 'engine-state'))
  const a = rec('2026-11-02'), b = rec('2026-11-15')
  write({ 'species/a': a, 'species/b': b }); git('add', '.'); git('commit', '-qm', 'base')
  git('checkout', '-qb', 'marks'); write({ 'species/a': a, 'species/b': { ...b, phrases: ['phần lớn'] } }); git('commit', '-qam', 'marks')
  git('checkout', '-q', 'main'); write({ 'species/a': a, 'species/b': b, 'species/c': rec('2026-11-22') }); git('commit', '-qam', 'rewrite run')
  git('merge', '-q', '--no-edit', 'marks')
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ 'species/a': a, 'species/b': { ...b, phrases: ['phần lớn'] }, 'species/c': rec('2026-11-22') })
})
