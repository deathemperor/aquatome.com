import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
// @ts-expect-error plain .mjs git merge driver
import { mergeMainWhole } from '../../../scripts/merge-main-whole.mjs'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SCRIPTS = ['engine-cycle.sh', 'video-cycle.sh', 'video-recheck.sh']
const GUARDED = "if engine_clone || engine_cloud; then git config merge.main-whole.driver 'node scripts/merge-main-whole.mjs %O %A %B %P'; fi"

// The crossings of 8, 9, 15 and 16 Nov 2026. Two jobs wrote the same video guide from one main. Main's side (the video
// job) swapped a still for the video's own frame and a part photo for another photo; the run (the photos job) judged the
// old still ("no one in it") and read the old photo's credit again. At the run's push the guide's file clashed, and
// `git pull --rebase -X theirs` took the run's lines where both changed and main's elsewhere: main's new address with
// the run's caption and mark on it, a still "no one in it" with no verdict of its own (at least five of 16 Nov's
// showed hands), and a part photo with another photo's credit. The rule (merge=main-whole, set in the engine's clones):
// main's records whole; what the run took off, off; what it put in, in, whole.
type Still = { t: number; url: string; width: number; height: number; caption: string; sharpness: number; person?: boolean }
type Photo = { url: string; thumb: string; width: number; height: number; licence: string; author: string; sourceUrl: string; caption: string; source: string }
const still = (t: number, caption: string, sharpness: number, person?: boolean): Still =>
  ({ t, url: `https://media.aquatome.com/video/x/at${t}-hd.webp`, width: 1280, height: 720, caption, sharpness, ...(person === undefined ? {} : { person }) })
const photo = (name: string, credit: string): Photo => ({
  url: `https://media.aquatome.com/commons/${name}.webp`, thumb: `https://media.aquatome.com/commons/${name}-480.webp`, width: 1000, height: 667,
  licence: `CC BY-SA ${credit}`, author: `Author ${credit}`, sourceUrl: `https://commons.wikimedia.org/wiki/File:${credit}.jpg`, caption: `Caption ${credit}`, source: 'commons',
})
const guide = (photos: Photo[], moments: Still[]) => ({ id: 'youtube-x', kind: 'video', source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=x', html: '', photos, mentions: [],
  video: { youtubeId: 'x', title: 'Dựng bể', figures: [{ heading: 'Trải nền', moments }, { heading: 'Thả cá', moments: [still(3000, 'Thả cá vào bể', 0.7, false)] }] } })
const card = (review: 'approved' | 'pending', summary: string, generatedAt = '2026-11-16T01:00:00.000Z') =>
  ({ id: 'ca-x', summary, mistakes: [], speciesUpdatedAt: '2026-11-01', generatedAt, review, ...(review === 'pending' ? { problems: ['a figure the card no longer shows'] } : {}), writtenFrom: 'abc' })

type Side = Record<string, unknown>
// 9 and 16 Nov: a still and a part photo each changed on both sides.
const CROSS: { base: Side; main: Side; run: Side } = {
  base: { 'content/guides/youtube-x/entity.json': guide([photo('aaaa', '1')], [still(1900, 'Tay trải nền', 0.4)]) },
  // the video job: the video's own frame at 1910, unjudged; another photo in the part's place
  main: { 'content/guides/youtube-x/entity.json': guide([photo('bbbb', '2')], [still(1910, 'Nền cát đã trải xong', 0.6)]) },
  // the photos job: the old still judged "no one in it"; the old photo's credit read again
  run: { 'content/guides/youtube-x/entity.json': guide([photo('aaaa', '3')], [still(1900, 'Lớp nền trải đều', 0.5, false)]) },
}
// What a run takes off for a person or a face, puts in, or takes back to pending, while main changed the same files.
const FACE = photo('ffff', 'face')
const PROTECT: { base: Side; main: Side; run: Side } = {
  base: {
    'content/guides/youtube-x/entity.json': guide([photo('aaaa', '1'), FACE], [still(1900, 'Tay trải nền', 0.4)]),
    'content/gallery/ca-x.json': { id: 'ca-x', photos: [photo('cccc', '4'), photo('dddd', 'hands')] },
    'content/summaries/ca-x.json': card('approved', 'Cá dễ nuôi.'),
  },
  main: {
    'content/guides/youtube-x/entity.json': guide([photo('aaaa', '1'), FACE], [still(1910, 'Nền cát đã trải xong', 0.6)]),
    'content/gallery/ca-x.json': { id: 'ca-x', photos: [photo('cccc', '4'), photo('dddd', 'hands'), photo('eeee', '5')] },
    'content/summaries/ca-x.json': card('approved', 'Cá dễ nuôi.', '2026-11-16T02:00:00.000Z'),
  },
  run: {
    // a face took FACE off; a new still at 2000 judged and put in; the summary's own check found a problem
    'content/guides/youtube-x/entity.json': guide([photo('aaaa', '1')], [still(1900, 'Tay trải nền', 0.4), still(2000, 'Cát trải phẳng', 0.8, false)]),
    'content/gallery/ca-x.json': { id: 'ca-x', photos: [photo('cccc', '4')] },
    'content/summaries/ca-x.json': card('pending', 'Cá dễ nuôi.'),
  },
}

// The run's real push (engine-cycle.sh), with the repository's .gitattributes and, `withDriver`, the job's own line for
// the driver (its script made absolute: the test's repositories have no scripts/); without it, the files merge as text,
// as they did until this change.
function push(sides: { base: Side; main: Side; run: Side }, withDriver: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-main-whole-'))
  const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`
  // the run's verdict on a still it judged, a file only it changed: its commit isn't left empty
  const verdicts = { 'engine-state/_photo-guides.json': { [still(1900, '', 0).url]: { person: false } } }
  const write = (files: Side) => Object.entries(files)
    .map(([f, v]) => `mkdir -p "$(dirname ${f})" && printf '%s' '${json(v).replace(/'/g, `'\\''`)}' > ${f} && git add ${f}`).join(' && ')
  const line = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8').split('\n').find(l => l === GUARDED)!
  const config = line.match(/git config merge\.main-whole\.driver '[^']*'/)![0].replace('node scripts/', `node ${join(ROOT, 'scripts')}/`)
  const pushFn = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8').match(/^push\(\) \{[\s\S]*?^\}$/m)![0]
  const script = `
    set -e
    export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null
    cd "${dir}"
    git init -q -b main --bare origin.git
    git clone -q origin.git other 2>/dev/null && cd other && git checkout -q -b main
    cp "${join(ROOT, '.gitattributes')}" .gitattributes && git add .gitattributes
    ${write(sides.base)}
    git commit -qm 'main as the run started' && git push -q origin main && cd ..
    git clone -q -b main origin.git cycle
    cd other && ${write(sides.main)} && git commit -qm 'content: videos, meanwhile' && git push -q origin main && cd ..
    cd cycle
    ${withDriver ? config : ':'}
    ${write({ ...sides.run, ...verdicts })} && git commit -qm 'content: engine photos'
    set +e
    PART=photos
    log() { echo "LOG $*"; }
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    net() { "$@"; }
    replan_merged() { :; }
    main_holds() { :; }
    sweep_merged() { :; }
    swept_pull() { :; }
    verify_cycle() { :; }
    keep_unpublished() { echo KEPT; }
    sleep() { :; }
    ${pushFn}
    push
    echo "CODE $?"`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  expect(r.stderr).not.toMatch(/fatal/i)
  const pushed = (f: string) => JSON.parse(spawnSync('git', ['-C', join(dir, 'origin.git'), 'show', `main:${f}`], { encoding: 'utf8' }).stdout)
  return { out: r.stdout, err: r.stderr, pushed, verdicts: pushed('engine-state/_photo-guides.json') }
}

// Every record with an address in a file, by address.
const records = (v: unknown, out: Record<string, unknown[]> = {}): Record<string, unknown[]> => {
  if (Array.isArray(v)) v.forEach(x => records(x, out))
  else if (v && typeof v === 'object') {
    const url = (v as { url?: unknown }).url
    if (typeof url === 'string') (out[url] ??= []).push(v)
    Object.values(v).forEach(x => records(x, out))
  }
  return out
}
// The records in `pushed` that are neither side's own record of that address: built from two versions.
const crossed = (pushed: unknown, a: unknown, b: unknown) => {
  const ra = records(a), rb = records(b)
  const same = (x: unknown, ys: unknown[] = []) => ys.some(y => JSON.stringify(y) === JSON.stringify(x))
  return Object.entries(records(pushed)).flatMap(([url, rs]) => rs.filter(r => !same(r, ra[url]) && !same(r, rb[url])))
}
const G = 'content/guides/youtube-x/entity.json'

test("the engine cycle and both video jobs set the driver, in the engine's clones alone", () => {
  for (const name of SCRIPTS) expect(readFileSync(join(ROOT, 'scripts', name), 'utf8').split('\n'), name).toContain(GUARDED)
})

test("before this change, the push's fallback built 16 Nov's still and 9 Nov's part photo from two versions", () => {
  const r = push(CROSS, false)
  expect(r.out).toContain('LOG another part changed the same files')
  expect(r.out).toContain('CODE 0')
  const g = r.pushed(G)
  // main's new frame, with the run's caption and its "no one in it" on it
  expect(g.video.figures[0].moments[0]).toEqual(still(1910, 'Lớp nền trải đều', 0.5, false))
  // main's new photo, with the old photo's credit read again
  expect(g.photos[0]).toEqual(photo('bbbb', '3'))
  expect(crossed(g, CROSS.main[G], CROSS.run[G])).toHaveLength(2)
})

test("a run whose guide main also changed pushes main's records whole: none built from two versions", () => {
  const r = push(CROSS, true)
  // the pull merges cleanly now: nothing goes through the fallback
  expect(r.out).not.toContain('another part changed the same files')
  expect(r.out).toContain('CODE 0')
  expect(r.pushed(G)).toEqual(CROSS.main[G])
  expect(crossed(r.pushed(G), CROSS.main[G], CROSS.run[G])).toEqual([])
  // the still main swapped in shows only once judged: no mark of the run's on it
  expect(r.pushed(G).video.figures[0].moments[0].person).toBeUndefined()
  // the run's other work goes out
  expect(r.verdicts).toEqual({ [still(1900, '', 0).url]: { person: false } })
})

test('what the run took off stays off, what it put in goes in whole, and a card it took back to pending stays pending', () => {
  const r = push(PROTECT, true)
  expect(r.out).toContain('CODE 0')
  const g = r.pushed(G)
  // a face took it off the run's: off main's too, though main kept it (the sweep wouldn't take it off again)
  expect(g.photos).toEqual([photo('aaaa', '1')])
  // main's swapped still as main has it, and the run's new judged still, whole, in the same figure
  expect(g.video.figures[0].moments).toEqual([still(1910, 'Nền cát đã trải xong', 0.6), still(2000, 'Cát trải phẳng', 0.8, false)])
  expect(g.video.figures[1]).toEqual((PROTECT.main[G] as ReturnType<typeof guide>).video.figures[1])
  expect(crossed(g, PROTECT.main[G], PROTECT.run[G])).toEqual([])
  // the album: main's new photo in, the one with hands the run took off, off
  expect(r.pushed('content/gallery/ca-x.json').photos).toEqual([photo('cccc', '4'), photo('eeee', '5')])
  // the card the run's check took back to pending: the run's, whole
  expect(r.pushed('content/summaries/ca-x.json')).toEqual(card('pending', 'Cá dễ nuôi.'))
  expect(r.err).toContain("merge-main-whole: content/summaries/ca-x.json: the run's card, back to pending")
  expect(r.err).toContain('merge-main-whole: content/gallery/ca-x.json: main\'s file, less 1 the run took off')
})

test("a summary card: an approval never goes onto text it didn't read, and a run's approval of old text gives way", () => {
  // the run approved the old text; main wrote a new one, pending: main's, still pending
  expect(mergeMainWhole(card('pending', 'Cũ'), card('pending', 'Mới'), card('approved', 'Cũ'))).toEqual(card('pending', 'Mới'))
  // both approved, different texts: main's
  expect(mergeMainWhole(card('pending', 'Cũ'), card('approved', 'Mới'), card('approved', 'Cũ khác'))).toEqual(card('approved', 'Mới'))
  // main approved, the run's check took it back to pending: the run's
  expect(mergeMainWhole(card('approved', 'Cũ'), card('approved', 'Cũ', 'x'), card('pending', 'Cũ'))).toEqual(card('pending', 'Cũ'))
})

test("a picture the run put in goes nowhere main no longer has, and a record main changed stays main's", () => {
  const base = { photos: [], video: { thumb: { url: 'u/t0' }, figures: [{ heading: 'A', moments: [] }] } }
  // main renamed the figure and changed the thumb; the run put a still in figure A and changed the thumb too
  const ours = { photos: [], video: { thumb: { url: 'u/t2' }, figures: [{ heading: 'A2', moments: [] }] } }
  const theirs = { photos: [{ url: 'u/p1', caption: 'p' }], video: { thumb: { url: 'u/t1' }, figures: [{ heading: 'A', moments: [{ url: 'u/s1', t: 1 }] }] } }
  const said = { off: 0, in: 0 }
  const out = mergeMainWhole(base, ours, theirs, said)
  expect(out).toEqual({ photos: [{ url: 'u/p1', caption: 'p' }], video: { thumb: { url: 'u/t2' }, figures: [{ heading: 'A2', moments: [] }] } })
  expect(said).toEqual({ off: 0, in: 1 })
  // a record both kept, edited on both: main's, whole
  const p = (author: string) => ({ url: 'u/p', author, licence: author })
  expect(mergeMainWhole({ photos: [p('0')] }, { photos: [p('main')] }, { photos: [p('run')] })).toEqual({ photos: [p('main')] })
})

test("the six kinds take the driver, and the pages' language files keep merging as text, for their holds", () => {
  const files = ['content/guides/youtube-x/entity.json', 'content/breeds/x/entity.json', 'content/gallery/ca-x.json', 'content/series/p.json',
    'content/summaries/ca-x.json', 'docs/review/photo-subjects.md', 'content/guides/youtube-x/vi.json', 'content/breeds/x/th.json']
  const attrs = spawnSync('git', ['-C', ROOT, 'check-attr', 'merge', '--', ...files], { encoding: 'utf8' }).stdout
  for (const f of files.slice(0, 6)) expect(attrs).toContain(`${f}: merge: main-whole`)
  for (const f of files.slice(6)) expect(attrs).toContain(`${f}: merge: unspecified`)
})
