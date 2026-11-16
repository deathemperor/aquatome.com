import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SCRIPTS = ['engine-cycle.sh', 'video-cycle.sh', 'video-recheck.sh']
const DRIVER = 'git config merge.main-whole.driver true'

// The crossings of 8, 9, 15 and 16 Nov 2026. Two jobs wrote the same video guide from one main. Main's side (the video
// job) swapped a still for the video's own frame and a part photo for another photo; the run (the photos job) judged the
// old still ("no one in it") and read the old photo's credit again. At the run's push the guide's file clashed, and
// `git pull --rebase -X theirs` took the run's lines where both changed and main's elsewhere: main's new address with
// the run's caption and mark on it, a still "no one in it" with no verdict of its own (at least five of 16 Nov's
// showed hands), and a part photo with another photo's credit. The rule: a run keeps main's whole file
// (merge=main-whole, set by the engine's job scripts alone).
type Still = { t: number; url: string; width: number; height: number; caption: string; sharpness: number; person?: boolean }
type Photo = { url: string; thumb: string; width: number; height: number; licence: string; author: string; sourceUrl: string; caption: string; source: string }
const still = (t: number, caption: string, sharpness: number, person?: boolean): Still =>
  ({ t, url: `https://media.aquatome.com/video/x/at${t}-hd.webp`, width: 1280, height: 720, caption, sharpness, ...(person === undefined ? {} : { person }) })
const photo = (name: string, credit: string): Photo => ({
  url: `https://media.aquatome.com/commons/${name}.webp`, thumb: `https://media.aquatome.com/commons/${name}-480.webp`, width: 1000, height: 667,
  licence: `CC BY-SA ${credit}`, author: `Author ${credit}`, sourceUrl: `https://commons.wikimedia.org/wiki/File:${credit}.jpg`, caption: `Caption ${credit}`, source: 'commons',
})
const guide = (s: Still, p: Photo) => ({ id: 'youtube-x', kind: 'video', source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=x', html: '', photos: [p], mentions: [],
  video: { youtubeId: 'x', title: 'Dựng bể', figures: [{ heading: 'Trải nền', moments: [s] }] } })
const SIDES = {
  base: guide(still(1900, 'Tay trải nền', 0.4), photo('aaaa', '1')),
  // the video job: the video's own frame at 1910, unjudged; another photo in the part's place
  main: guide(still(1910, 'Nền cát đã trải xong', 0.6), photo('bbbb', '2')),
  // the photos job: the old still judged "no one in it"; the old photo's credit read again
  run: guide(still(1900, 'Lớp nền trải đều', 0.5, false), photo('aaaa', '3')),
}
const ALBUM = { base: { id: 'ca-x', photos: [photo('cccc', '4')] }, main: { id: 'ca-x', photos: [photo('dddd', '5')] }, run: { id: 'ca-x', photos: [photo('cccc', '6')] } }
const FILE = 'content/guides/youtube-x/entity.json', ALBUM_FILE = 'content/gallery/ca-x.json'

// The run's real push (engine-cycle.sh), with the repository's .gitattributes and, `withDriver`, the job's own line for
// the driver; without it, the files merge as they did until this change.
function push(withDriver: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-main-whole-'))
  const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`
  // the run's verdict on the still it judged, a file only it changed: its commit isn't left empty
  const verdict = [['engine-state/_photo-guides.json', json({ [still(1900, '', 0).url]: { person: false } })]]
  const write = (side: keyof typeof SIDES) => [[FILE, json(SIDES[side])], [ALBUM_FILE, json(ALBUM[side])], ...(side === 'run' ? verdict : [])]
    .map(([f, t]) => `mkdir -p "$(dirname ${f})" && printf '%s' '${t.replace(/'/g, `'\\''`)}' > ${f} && git add ${f}`).join(' && ')
  const pushFn = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8').match(/^push\(\) \{[\s\S]*?^\}$/m)![0]
  const script = `
    set -e
    export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null
    cd "${dir}"
    git init -q -b main --bare origin.git
    git clone -q origin.git other 2>/dev/null && cd other && git checkout -q -b main
    cp "${join(ROOT, '.gitattributes')}" .gitattributes && git add .gitattributes
    ${write('base')}
    git commit -qm 'main as the run started' && git push -q origin main && cd ..
    git clone -q -b main origin.git cycle
    cd other && ${write('main')} && git commit -qm 'content: videos, meanwhile' && git push -q origin main && cd ..
    cd cycle
    ${withDriver ? DRIVER : ':'}
    ${write('run')} && git commit -qm 'content: engine photos'
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
  return { out: r.stdout, guide: pushed(FILE), album: pushed(ALBUM_FILE), verdicts: pushed('engine-state/_photo-guides.json') }
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

test('the engine cycle and both video jobs set the main-whole merge driver', () => {
  for (const name of SCRIPTS) expect(readFileSync(join(ROOT, 'scripts', name), 'utf8').split('\n'), name).toContain(DRIVER)
})

test("before this change, the push's fallback built 16 Nov's still and 9 Nov's part photo from two versions", () => {
  const r = push(false)
  expect(r.out).toContain('LOG another part changed the same files')
  expect(r.out).toContain('CODE 0')
  // main's new frame, with the run's caption and its "no one in it" on it
  expect(r.guide.video.figures[0].moments[0]).toEqual({ ...still(1910, 'Lớp nền trải đều', 0.5, false) })
  // main's new photo, with the old photo's credit read again
  expect(r.guide.photos[0]).toEqual({ ...photo('bbbb', '3') })
  expect(crossed(r.guide, SIDES.main, SIDES.run)).toHaveLength(2)
})

test("a run whose guide and album main also changed pushes main's whole files: no record built from two versions", () => {
  const r = push(true)
  // the pull merges cleanly now: nothing goes through the fallback
  expect(r.out).not.toContain('another part changed the same files')
  expect(r.out).toContain('CODE 0')
  expect(r.guide).toEqual(SIDES.main)
  expect(r.album).toEqual(ALBUM.main)
  expect(crossed(r.guide, SIDES.main, SIDES.run)).toEqual([])
  expect(crossed(r.album, ALBUM.main, ALBUM.run)).toEqual([])
  // the run's other work goes out
  expect(r.verdicts).toEqual({ [still(1900, '', 0).url]: { person: false } })
  // the still main swapped in shows only once judged: no mark of the run's on it
  expect(r.guide.video.figures[0].moments[0].person).toBeUndefined()
})

test("the pages' language files keep merging as text, so a hold the run added isn't dropped", () => {
  const attrs = spawnSync('git', ['-C', ROOT, 'check-attr', 'merge', '--', 'content/guides/youtube-x/vi.json', 'content/breeds/x/vi.json', FILE, ALBUM_FILE], { encoding: 'utf8' }).stdout
  expect(attrs).toContain('content/guides/youtube-x/vi.json: merge: unspecified')
  expect(attrs).toContain('content/breeds/x/vi.json: merge: unspecified')
  expect(attrs).toContain(`${FILE}: merge: main-whole`)
  expect(attrs).toContain(`${ALBUM_FILE}: merge: main-whole`)
})
