import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
// @ts-expect-error plain .mjs git merge driver
import { mergeMainWhole, mirrored } from '../../../scripts/merge-main-whole.mjs'
import { mirrorPlan } from '../src/mirror-photos'

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

// The run's real push (engine-cycle.sh) and the checks' choice after a clean pull (swept_pull, swept_clean; the sweep
// stubbed, the tests a VERIFY line), with the repository's .gitattributes and, `withDriver`, the job's own line for the
// driver (its script made absolute: the test's repositories have no scripts/); without it, the files merge as text, as
// they did until this change.
function push(sides: { base: Side; main: Side; run: Side }, withDriver: boolean, o: { fetchedFirst?: boolean } = {}) {
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
    ${o.fetchedFirst ? 'git fetch -q' : ':'}
    set +e
    PART=photos
    log() { echo "LOG $*"; }
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    net() { "$@"; }
    replan_merged() { :; }
    main_holds() { :; }
    sweep_merged() { :; }
    verify_cycle() { echo VERIFY; }
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
  // lines both sides changed, which used to clash and be tested again, are tested again
  expect(r.out).toContain(`LOG picture files with lines changed on both sides, merged by record: checked again (${G} )`)
  expect(r.out).toContain('VERIFY')
})

test("a pull after an earlier fetch (catch_up's, stopped after it) still sweeps and tests again what clashed", () => {
  const r = push(CROSS, true, { fetchedFirst: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed(G)).toEqual(CROSS.main[G])
  expect(r.out).toContain(`LOG picture files with lines changed on both sides, merged by record: checked again (${G} )`)
  expect(r.out).toContain('VERIFY')
})

test('a guide both sides changed on different lines merges as before, with no test run again', () => {
  const base = guide([photo('aaaa', '1')], [still(1900, 'Tay trải nền', 0.4)])
  const r = push({ base: { [G]: base }, main: { [G]: { ...base, html: '<p>Bài mới</p>' } },
    run: { [G]: guide([photo('aaaa', '1')], [still(1900, 'Tay trải nền', 0.4, false)]) } }, true)
  expect(r.out).toContain('CODE 0')
  expect(r.pushed(G)).toEqual({ ...guide([photo('aaaa', '1')], [still(1900, 'Tay trải nền', 0.4, false)]), html: '<p>Bài mới</p>' })
  expect(r.out).not.toContain('checked again')
  expect(r.out).not.toContain('VERIFY')
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
  expect(r.err).toContain("merge-main-whole: content/gallery/ca-x.json: merged, 1 of main's pictures off")
})

const cards = (base: unknown, ours: unknown, theirs: unknown) => mergeMainWhole(base, ours, theirs, {}, 'content/summaries/ca-x.json')

test("a summary card: an approval never goes onto text it didn't read, and a run's approval of old text gives way", () => {
  // the run approved the old text; main wrote a new one, pending: main's, still pending
  expect(cards(card('pending', 'Cũ'), card('pending', 'Mới'), card('approved', 'Cũ'))).toEqual(card('pending', 'Mới'))
  // both approved, different texts: main's
  expect(cards(card('pending', 'Cũ'), card('approved', 'Mới'), card('approved', 'Cũ khác'))).toEqual(card('approved', 'Mới'))
  // main approved, the run's check took it back to pending: the run's
  expect(cards(card('approved', 'Cũ'), card('approved', 'Cũ', 'x'), card('pending', 'Cũ'))).toEqual(card('pending', 'Cũ'))
  // a person approved it on main while the run, from a pending card, wrote it again pending: main's approval stands
  expect(cards(card('pending', 'Cũ'), card('approved', 'Cũ'), card('pending', 'Mới'))).toEqual(card('approved', 'Cũ'))
  // main wrote a new text and approved it while the run took the old one back to pending: main's new text
  expect(cards(card('approved', 'Cũ'), card('approved', 'Mới'), card('pending', 'Cũ'))).toEqual(card('approved', 'Mới'))
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

test("the run's moves, new figures, playlist and plain values go in; stills keep their order; a picture is never mixed", () => {
  const P = { url: 'u/p', author: 'a' }, Q = { url: 'u/q', author: 'q' }
  const s = (t: number, caption = `c${t}`) => ({ url: `u/at${t}`, t, caption })
  // the run moved a part photo into its figure; main put another photo in
  expect(mergeMainWhole({ photos: [P], video: { figures: [{ heading: 'A', moments: [] }] } },
    { photos: [P, Q], video: { figures: [{ heading: 'A', moments: [] }] } },
    { photos: [], video: { figures: [{ heading: 'A', moments: [], photo: P }] } }))
    .toEqual({ photos: [Q], video: { figures: [{ heading: 'A', moments: [], photo: P }] } })
  // a new figure the run wrote goes in after the one it follows, while main changed the first
  expect(mergeMainWhole({ video: { figures: [{ heading: 'A', moments: [s(10)] }] } },
    { video: { figures: [{ heading: 'A', moments: [s(12)] }] } },
    { video: { figures: [{ heading: 'A', moments: [s(10)] }, { heading: 'B', moments: [s(40)] }] } }))
    .toEqual({ video: { figures: [{ heading: 'A', moments: [s(12)] }, { heading: 'B', moments: [s(40)] }] } })
  // a still the run put in before main's goes in by its second
  expect(mergeMainWhole({ m: [s(1900)] }, { m: [s(1910), s(2500)] }, { m: [s(1900), s(1950)] })).toEqual({ m: [s(1910), s(1950), s(2500)] })
  // a playlist: the run's new video and main's new title both stay
  expect(mergeMainWhole({ title: 'x', videoIds: ['1', '2'] }, { title: 'y', videoIds: ['1', '2'] }, { title: 'x', videoIds: ['1', '2', '3'] }))
    .toEqual({ title: 'y', videoIds: ['1', '2', '3'] })
  // plain values: the side that changed one; both, a date the later, anything else main's
  expect(mergeMainWhole({ updatedAt: '2026-11-15', title: 'a', seen: 1, taxa: ['x'] }, { updatedAt: '2026-11-16', title: 'a', seen: 2, taxa: ['x', 'y'] },
    { updatedAt: '2026-11-17', title: 'b', seen: 3, taxa: ['x', 'z'] })).toEqual({ updatedAt: '2026-11-17', title: 'b', seen: 2, taxa: ['x', 'y'] })
  // a picture main changed and the run took off: off. One the run changed and main took off: off
  expect(mergeMainWhole({ photos: [P, Q] }, { photos: [{ ...P, author: 'main' }] }, { photos: [{ ...Q, author: 'run' }] })).toEqual({ photos: [] })
  // the run renamed a figure while main judged a still in it: one figure, the run's heading, main's still
  expect(mergeMainWhole({ figures: [{ heading: 'A', moments: [s(10)] }] }, { figures: [{ heading: 'A', moments: [{ ...s(10), person: false }] }] },
    { figures: [{ heading: 'A mới', moments: [s(10)] }] })).toEqual({ figures: [{ heading: 'A mới', moments: [{ ...s(10), person: false }] }] })
  // a heading a guide repeats: each figure by its place among those of that heading, the run's still in the second
  const fig = (moments: unknown[]) => ({ heading: 'A', moments })
  expect(mergeMainWhole({ figures: [fig([s(10)]), fig([s(50)])] }, { figures: [fig([s(12)]), fig([s(50)])] }, { figures: [fig([s(10)]), fig([s(50), s(60)])] }))
    .toEqual({ figures: [fig([s(12)]), fig([s(50), s(60)])] })
})

test("what either side took off the file stays off, however the other side changed the list it was in", () => {
  const FACE = { url: 'u/face', author: 'a' }, s = (t: number, person?: boolean) => ({ url: `u/at${t}`, t, width: 1280, height: 720, ...(person === undefined ? {} : { person }) })
  // the run took a figure off (its photo had a face, its stills were held); main changed the figure's text
  expect(mergeMainWhole({ figures: [{ heading: 'A', text: 'x', photo: FACE, moments: [s(1)] }, { heading: 'B', moments: [s(9)] }] },
    { figures: [{ heading: 'A', text: 'y', photo: FACE, moments: [s(1)] }, { heading: 'B', moments: [s(9)] }] },
    { figures: [{ heading: 'B', moments: [s(9)] }] })).toEqual({ figures: [{ heading: 'B', moments: [s(9)] }] })
  // ... and main had put a still of its own in it: the figure stays with main's still, without the face
  expect(mergeMainWhole({ figures: [{ heading: 'A', photo: FACE, moments: [] }] }, { figures: [{ heading: 'A', photo: FACE, moments: [s(5)] }] }, { figures: [] }))
    .toEqual({ figures: [{ heading: 'A', moments: [s(5)] }] })
  // main renamed the figure; the run took its photo off
  expect(mergeMainWhole({ figures: [{ heading: 'A', photo: FACE, moments: [s(1)] }] }, { figures: [{ heading: 'A2', photo: FACE, moments: [s(1)] }] },
    { figures: [{ heading: 'A', moments: [s(1)] }] })).toEqual({ figures: [{ heading: 'A2', moments: [s(1)] }] })
  // a list the merge can't follow item by item (one item has no address or heading), both changed: main's, less the face
  expect(mergeMainWhole({ refs: [FACE, { title: 'r' }] }, { refs: [FACE, { title: 'r' }, { title: 'm' }] }, { refs: [{ title: 'r' }] }))
    .toEqual({ refs: [{ title: 'r' }, { title: 'm' }] })
  // main moved the photo into a figure while the run took it off for a face
  expect(mergeMainWhole({ photos: [FACE], figures: [{ heading: 'A', moments: [s(1)] }] }, { photos: [], figures: [{ heading: 'A', photo: FACE, moments: [s(1)] }] },
    { photos: [], figures: [{ heading: 'A', moments: [s(1)] }] })).toEqual({ photos: [], figures: [{ heading: 'A', moments: [s(1)] }] })
  // the run moved a figure's photo to another figure while main read its credit again: once, where the run put it
  const C = { url: 'u/c', author: 'a' }
  expect(mergeMainWhole({ figures: [{ heading: 'A', photo: C, moments: [s(1)] }, { heading: 'B', moments: [s(2)] }] },
    { figures: [{ heading: 'A', photo: { ...C, author: 'main' }, moments: [s(1)] }, { heading: 'B', moments: [s(2)] }] },
    { figures: [{ heading: 'A', moments: [s(1)] }, { heading: 'B', photo: C, moments: [s(2)] }] }))
    .toEqual({ figures: [{ heading: 'A', moments: [s(1)] }, { heading: 'B', photo: C, moments: [s(2)] }] })
  // a figure's photo main swapped for another while the run took the old one off: main's new one
  expect(mergeMainWhole({ figures: [{ heading: 'A', photo: FACE, moments: [s(1)] }] }, { figures: [{ heading: 'A', photo: { url: 'u/new' }, moments: [s(1)] }] },
    { figures: [{ heading: 'A', moments: [s(1)] }] })).toEqual({ figures: [{ heading: 'A', photo: { url: 'u/new' }, moments: [s(1)] }] })
  // both put a source in a breed's list: main's first, so main's care figure still points to its own
  expect(mergeMainWhole({ sources: [{ url: 'u/s1' }] }, { sources: [{ url: 'u/s1' }, { url: 'u/main' }] }, { sources: [{ url: 'u/s1' }, { url: 'u/run' }] }))
    .toEqual({ sources: [{ url: 'u/s1' }, { url: 'u/main' }, { url: 'u/run' }] })
  // a hero the run replaced (its photo was taken off), main having read the old one's credit again: the run's
  expect(mergeMainWhole({ hero: { url: 'u/h', author: '0' }, types: [{ photo: { url: 'u/n' } }] }, { hero: { url: 'u/h', author: 'main' }, types: [{ photo: { url: 'u/n' } }] },
    { hero: { url: 'u/n' }, types: [{ photo: { url: 'u/n' } }] })).toEqual({ hero: { url: 'u/n' }, types: [{ photo: { url: 'u/n' } }] })
})

test("a still both sides changed: the side that keeps it off the page until it's judged", () => {
  const s = (t: number, person?: boolean) => ({ url: 'u/at10', t, width: 1280, height: 720, ...(person === undefined ? {} : { person }) })
  // main judged it ("no one in it"); the run moved it to its right second, unjudged: the run's, judged again by address
  expect(mergeMainWhole({ m: [s(10)] }, { m: [s(10, false)] }, { m: [s(12)] })).toEqual({ m: [s(12)] })
  // main moved it; the run judged the old one: main's, unjudged
  expect(mergeMainWhole({ m: [s(10)] }, { m: [s(12)] }, { m: [s(10, false)] })).toEqual({ m: [s(12)] })
})

test('an album merge gives a concurrent restoration its saved position', () => {
  const lead = photo('lead', 'lead'), tail = photo('tail', 'tail')
  const album = (photos: Photo[]) => ({ id: 'alpha', photos })
  expect(mergeMainWhole(album([tail]), album([tail, lead]), album([lead, tail]), {}, 'content/gallery/alpha.json'))
    .toEqual(album([lead, tail]))
})

test('an album merge preserves distinct plain and altered additions at one address', () => {
  const plain = photo('added', 'Plain credit')
  const wrapper = { ...plain, author: 'Wrapper credit', altered: [{ method: 'lanczos3-upscale' }], original: photo('original', 'Original credit') }
  const album = (photos: Photo[]) => ({ id: 'alpha', photos })
  for (const [main, run] of [[plain, wrapper], [wrapper, plain]] as const) {
    expect(mergeMainWhole(album([]), album([main]), album([run]), {}, 'content/gallery/alpha.json')).toEqual(album([main, run]))
  }
})

test('the script runs as the driver through a symlinked folder too', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-main-whole-link-'))
  symlinkSync(join(ROOT, 'scripts'), join(dir, 'scripts'))
  const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`
  writeFileSync(join(dir, 'O'), json({ photos: [{ url: 'u/a' }, { url: 'u/face' }] }))
  writeFileSync(join(dir, 'A'), json({ photos: [{ url: 'u/a' }, { url: 'u/face' }, { url: 'u/b' }] }))
  writeFileSync(join(dir, 'B'), json({ photos: [{ url: 'u/a' }] }))
  const r = spawnSync('node', ['scripts/merge-main-whole.mjs', 'O', 'A', 'B', 'content/gallery/ca-x.json'], { cwd: dir, encoding: 'utf8' })
  expect(r.status).toBe(0)
  expect(JSON.parse(readFileSync(join(dir, 'A'), 'utf8'))).toEqual({ photos: [{ url: 'u/a' }, { url: 'u/b' }] })
  expect(r.stderr).toContain("merge-main-whole: content/gallery/ca-x.json: merged, 1 of main's pictures off")
})

test("a photo the mirror copied on one side while the other took it off stays off; one copied and kept is there once", () => {
  const P = { url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Betta_splendens.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Betta_splendens.jpg', author: 'a' }
  const Q = { url: 'https://media.aquatome.com/commons/q.webp', author: 'q' }
  const copied = { ...P, url: mirrored(P.url)! }
  // main copied it to our media; the run took it off (a face)
  expect(mergeMainWhole({ photos: [Q, P] }, { photos: [Q, copied] }, { photos: [Q] })).toEqual({ photos: [Q] })
  expect(mergeMainWhole({ figures: [{ heading: 'A', photo: P, moments: [] }, { heading: 'B', photo: Q }] }, { figures: [{ heading: 'A', photo: copied, moments: [] }, { heading: 'B', photo: Q }] },
    { figures: [{ heading: 'B', photo: Q }] })).toEqual({ figures: [{ heading: 'B', photo: Q }] })
  // the run copied it; main took it off
  expect(mergeMainWhole({ photos: [Q, P] }, { photos: [Q] }, { photos: [Q, copied] })).toEqual({ photos: [Q] })
  // main copied it, the run kept it as it was: main's copy, once
  expect(mergeMainWhole({ photos: [Q, P] }, { photos: [Q, copied] }, { photos: [Q, P], seen: 1 })).toEqual({ photos: [Q, copied], seen: 1 })
})

test("the driver's copy of the mirror's addresses is the mirror's", () => {
  for (const url of ['https://upload.wikimedia.org/wikipedia/commons/a/ab/Betta_splendens.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Betta%20x.jpg/640px-Betta%20x.jpg',
    'https://inaturalist-open-data.s3.amazonaws.com/photos/12345/medium.jpg', 'https://static.inaturalist.org/photos/9/original.jpeg', 'https://live.staticflickr.com/65535/5123456789_abcdef1234_b.jpg',
    'https://api.gbif.org/v1/image/cache/fit-in/500x/occurrence/123/media/0123456789abcdef0123456789abcdef', 'https://example.com/x.jpg']) {
    const plan = mirrorPlan(url)
    expect(mirrored(url), url).toBe(plan ? `https://media.aquatome.com/${plan.key}` : undefined)
  }
})

test("a breed's sources and the care figures that point into them merge as one: both changed, main's", () => {
  const B = 'content/breeds/x/entity.json', S = (n: string) => ({ url: `https://src/${n}`, title: n })
  const base = { id: 'x', sources: [S('a')], care: { tempC: { source: 0 } } }
  // both put a source in and a figure on it
  const ours = { id: 'x', sources: [S('a'), S('main')], care: { tempC: { source: 0 }, ph: { source: 1 } } }
  expect(mergeMainWhole(base, ours, { id: 'x', sources: [S('a'), S('run')], care: { tempC: { source: 1 } } }, {}, B)).toEqual(ours)
  // the run took a source off while main put a figure on it
  const main2 = { id: 'x', sources: [S('a')], care: { tempC: { source: 0 }, ph: { source: 0 } } }
  expect(mergeMainWhole(base, main2, { id: 'x', sources: [], care: {} }, {}, B)).toEqual(main2)
  // a breed both sides wrote new: main's pair
  expect(mergeMainWhole(undefined, ours, { id: 'x', sources: [S('run')], care: { tempC: { source: 0 } } }, {}, B)).toEqual(ours)
  // only the run changed them: the run's
  const run3 = { id: 'x', sources: [S('a'), S('run')], care: { tempC: { source: 1 } } }
  expect(mergeMainWhole(base, { ...base, seen: 1 }, run3, {}, B)).toEqual({ ...run3, seen: 1 })
})

test('a picture both sides changed is one side\'s whole, never one with fields of both', () => {
  const p = (author: string, caption: string) => ({ url: 'u/p', author, caption })
  // main read its credit again, the run wrote its caption again: main's, with the old caption
  expect(mergeMainWhole({ photos: [p('0', '0')] }, { photos: [p('main', '0')] }, { photos: [p('0', 'run')] })).toEqual({ photos: [p('main', '0')] })
  expect(mergeMainWhole({ figures: [{ heading: 'A', photo: p('0', '0') }] }, { figures: [{ heading: 'A', photo: p('main', '0') }] }, { figures: [{ heading: 'A', photo: p('0', 'run') }] }))
    .toEqual({ figures: [{ heading: 'A', photo: p('main', '0') }] })
  // a list with an item that has neither an address nor a heading, both changed: main's whole
  expect(mergeMainWhole({ refs: [{ url: 'u/a' }, { title: 't' }] }, { refs: [{ url: 'u/a' }, { title: 't' }, { title: 'm' }] }, { refs: [{ url: 'u/a' }, { title: 't' }, { url: 'u/r' }] }))
    .toEqual({ refs: [{ url: 'u/a' }, { title: 't' }, { title: 'm' }] })
})

test("the review page stays main's, and JSON that doesn't read is left to git", () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-main-whole-exits-'))
  const run = (path: string, a: string) => {
    writeFileSync(join(dir, 'O'), 'base\n'); writeFileSync(join(dir, 'A'), a); writeFileSync(join(dir, 'B'), 'run\n')
    const r = spawnSync('node', [join(ROOT, 'scripts/merge-main-whole.mjs'), 'O', 'A', 'B', path], { cwd: dir, encoding: 'utf8' })
    return { status: r.status, a: readFileSync(join(dir, 'A'), 'utf8') }
  }
  expect(run('docs/review/photo-subjects.md', 'main\n')).toEqual({ status: 0, a: 'main\n' })
  expect(run('content/gallery/ca-x.json', '{ not json')).toEqual({ status: 1, a: '{ not json' })
})

test("only the engine's clones and GitHub's engine run set the driver", () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-main-whole-guard-'))
  const set = (cwd: string, env = '') => spawnSync('bash', ['-c', `
    set -e; unset GITHUB_ACTIONS GITHUB_WORKFLOW_REF; ${env}
    export HOME="${dir}" GIT_CONFIG_GLOBAL=/dev/null
    mkdir -p "${cwd}" && cd "${cwd}" && git init -q .
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    ${GUARDED}
    git config merge.main-whole.driver || echo unset`], { encoding: 'utf8' }).stdout.trim()
  expect(set(`${dir}/.local/share/aquatome/engine-photos`)).toBe('node scripts/merge-main-whole.mjs %O %A %B %P')
  expect(set(`${dir}/lead-checkout`)).toBe('unset')
  expect(set(`${dir}/runner`, 'export GITHUB_ACTIONS=true GITHUB_WORKFLOW_REF=o/r/.github/workflows/engine.yml@refs/heads/main')).toBe('node scripts/merge-main-whole.mjs %O %A %B %P')
  expect(set(`${dir}/ci`, 'export GITHUB_ACTIONS=true GITHUB_WORKFLOW_REF=o/r/.github/workflows/ci.yml@refs/heads/main')).toBe('unset')
})

test("the six kinds take the driver, and the pages' language files keep merging as text, for their holds", () => {
  const files = ['content/guides/youtube-x/entity.json', 'content/breeds/x/entity.json', 'content/gallery/ca-x.json', 'content/series/p.json',
    'content/summaries/ca-x.json', 'docs/review/photo-subjects.md', 'content/guides/youtube-x/vi.json', 'content/breeds/x/th.json']
  const attrs = spawnSync('git', ['-C', ROOT, 'check-attr', 'merge', '--', ...files], { encoding: 'utf8' }).stdout
  for (const f of files.slice(0, 6)) expect(attrs).toContain(`${f}: merge: main-whole`)
  for (const f of files.slice(6)) expect(attrs).toContain(`${f}: merge: unspecified`)
})
