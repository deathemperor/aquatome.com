import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { GATED_KINDS } from '../src/gate'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

// The case of 15 Nov 2026 (the outdoor pond guide, youtube-gJuWCudImSc): the photos part started from a main where the
// guide was held; meanwhile the video recheck read the same text clean and let it out on main; the photos part's own
// gate read that text again, found one sentence, and kept it held. At the push the guide's file clashed, `-X theirs`
// gave the page the photos part's hold, while _fit.json (merge=jsonmap, main's side first) kept main's clean record:
// a page held for a finding its own record doesn't carry, live for an hour and then a dead address.
// The rule: a page's hold follows the record that won, so a release on main during a run stands (Page Recovery's test,
// widened to a hold on main, a clean pull, a species page and a text that isn't main's).
type Held = { checks: string[]; at: string }
type Side = { held?: Held; body?: string; fit?: { at: string; hash: string; checks: string[] }; th?: Side }

const KINDS = { guides: { dir: 'content/guides/youtube-x', key: 'vi/guides/youtube-x' }, species: { dir: 'content/species/ca-x', key: 'vi/species/ca-x' } }

// lostPush: the run's first push loses, as main gets this side meanwhile. uncompared: the comparison of holds fails, as a
// git read or a file it can't parse would make it.
function push(kind: keyof typeof KINDS, sides: { base: Side; main: Side; run: Side }, o: { mainOther?: boolean; kept?: boolean; catchUp?: boolean; lostPush?: Side; uncompared?: boolean } = {}) {
  const { dir: pageDir, key } = KINDS[kind]
  const file = `${pageDir}/vi.json`
  const dir = mkdtempSync(join(tmpdir(), 'aq-push-hold-'))
  const page = (s: Side) =>
    `${JSON.stringify({ slug: 'ho-ca', name: 'Hồ cá', body: s.body ?? '<p>Cá con quen người.</p>', ...(s.held ? { held: s.held } : {}) }, null, 2)}\n`
  const record = (f: NonNullable<Side['fit']>) =>
    ({ at: f.at, hash: f.hash, model: 'opus', checklist: 3, findings: f.checks.map(check => ({ check, part: 'P2', quote: 'Cá con quen người.', why: 'w', by: 'model' })), products: [] })
  // The page's Thai file and record, where a side has them.
  const thKey = key.replace(/^vi\//, 'th/'), thFile = file.replace(/vi\.json$/, 'th.json')
  const fit = (s: Side) =>
    `${JSON.stringify({ ...(s.fit ? { [key]: record(s.fit) } : {}), ...(s.th?.fit ? { [thKey]: record(s.th.fit) } : {}) }, null, 2)}\n`
  const write = (files: Record<string, string>) =>
    Object.entries(files).map(([f, t]) => `mkdir -p "$(dirname ${f})" && printf '%s' '${t.replace(/'/g, `'\\''`)}' > ${f} && git add ${f}`).join(' && ')
  const both = (s: Side) => write({ [file]: page(s), ...(s.th ? { [thFile]: page(s.th) } : {}), 'engine-state/_fit.json': fit(s) })
  const pushFn = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8').match(/^push\(\) \{[\s\S]*?^\}$/m)![0]
  const script = `
    set -e
    export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null
    cd "${dir}"
    git init -q -b main --bare origin.git
    git clone -q origin.git other 2>/dev/null && cd other && git checkout -q -b main
    printf 'engine-state/_fit.json merge=jsonmap\\ncontent/species/*/*.json merge=entity\\n' > .gitattributes && git add .gitattributes
    ${both(sides.base)}
    git commit -qm 'main as the run started' && git push -q origin main && cd ..
    git clone -q -b main origin.git cycle
    for c in other cycle; do
      git -C $c config merge.jsonmap.driver "node ${join(ROOT, 'scripts/merge-json-map.mjs')} %O %A %B"
      git -C $c config merge.entity.driver "node ${join(ROOT, 'scripts/merge-entity.mjs')} %O %A %B"
    done
    cd other && ${both(sides.main)}
    ${o.mainOther ? `${write({ 'content/guides/other/vi.json': '{"slug":"khac"}\n' })} &&` : ''} git commit -qm 'content: another part, meanwhile' && git push -q origin main && cd ..
    cd cycle && ${both(sides.run)}
    git commit -qm 'content: this run'
    set +e
    PART=photos
    log() { echo "LOG $*"; }
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    ${o.uncompared ? `mkdir -p ../broken && echo 'process.exit(1)' > ../broken/main-holds.mjs && CYCLE_DIR="$PWD/../broken"` : ''}
    net() {
      ${o.lostPush ? `if [ "$1 $2" = "git push" ] && [ ! -e ../lost ]; then touch ../lost; (cd ../other && ${both(o.lostPush)} && git commit -qm 'content: main again, meanwhile' && git push -q origin main); fi` : ':'}
      "$@"
    }
    replan_merged() { :; }
    sweep_merged() { :; }
    verify_cycle() { echo VERIFY; }
    swept_pull() { :; }
    keep_unpublished() { echo "KEPT"; }
    keep_lost_push() { echo "LOST $*"; }
    sleep() { :; }
    ended_row() { :; }
    ${pushFn}
    ${o.kept ? 'git branch kept/photos/20261116T000000 && push_kept kept/photos/20261116T000000' : o.catchUp ? 'catch_up' : 'push'}
    echo "CODE $?"
    echo "WHY $KEPT_WHY"
    git log --format='COMMIT %s' -3`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  expect(r.stderr).not.toMatch(/fatal/i)
  const read = (f: string) => JSON.parse(readFileSync(join(dir, 'cycle', f), 'utf8'))
  const pushed = (f: string) => JSON.parse(spawnSync('git', ['-C', join(dir, 'origin.git'), 'show', `main:${f}`], { encoding: 'utf8' }).stdout)
  return { out: r.stdout, page: read(file), record: read('engine-state/_fit.json')[key], pushed: pushed(file), pushedRecord: pushed('engine-state/_fit.json')[key], pushedTh: () => pushed(thFile), log: r.stdout.split('\n').filter(l => l.startsWith('COMMIT ')) }
}

const clean = { at: '2026-11-15', hash: 'e025', checks: [] }
const heldFor = (...checks: string[]) => ({ at: '2026-11-15', hash: 'e025', checks })
const hold = (...checks: string[]) => ({ checks, at: '2026-11-15' })

test("a page main let out while a run read it again keeps main's release after the push's clash: its hold follows the record that won", () => {
  const r = push('guides', {
    base: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere', 'source'] } },
    main: { fit: clean },
    run: { held: hold('source'), fit: heldFor('source') },
  })
  expect(r.out).toContain('LOG another part changed the same files')
  expect(r.out).toContain('CODE 0')
  // the record that won is main's: read clean
  expect(r.record.findings).toEqual([])
  // so the page isn't held: before this, it carried the photos part's hold, a finding its own record doesn't have
  expect(r.page.held).toBeUndefined()
  expect(r.pushed.held).toBeUndefined()
  expect(r.out).toContain('LOG 1 pages main read during this run take main\'s hold')
  expect(r.out).toContain("COMMIT content: main's holds on 1 pages main read during this run")
  expect(r.out).toContain('VERIFY')
})

test("a page main kept held while the run let it out stays held, on a clean pull, and the merge is checked again", () => {
  // Main read the same text again and kept it held (its file unchanged); the run let it out. The pull is clean: the page
  // file changed on the run's side alone, and its record on both, main's first. A live page under a record with findings.
  const r = push('guides', {
    base: { held: hold('harm'), fit: { at: '2026-11-14', hash: 'e025', checks: ['harm'] } },
    main: { held: hold('harm'), fit: heldFor('harm') },
    run: { fit: clean },
  })
  expect(r.out).not.toContain('another part changed the same files')
  expect(r.record.findings.map((f: { check: string }) => f.check)).toEqual(['harm'])
  expect(r.page.held).toEqual(hold('harm'))
  expect(r.pushed.held).toEqual(hold('harm'))
  // a tree no check has seen: checked again, whatever the sweep did
  expect(r.out).toContain('VERIFY')
  expect(r.out).toContain('CODE 0')
})

test("a species page merged by field keeps main's release too, though nothing clashes", () => {
  const r = push('species', {
    base: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere'] } },
    main: { fit: clean },
    run: { held: hold('source'), fit: heldFor('source') },
  })
  expect(r.out).not.toContain('another part changed the same files')
  expect(r.record.findings).toEqual([])
  expect(r.page.held).toBeUndefined()
  expect(r.out).toContain('VERIFY')
})

// A reader of #1505: the run's pull before its checks (catch_up) is clean for a species page, and push()'s base is then the
// main it brought in, which no longer differs in that record. So catch_up brings main's holds too.
test("a species page main let out before the run's pull ahead of its checks keeps main's release from that pull on", () => {
  const r = push('species', {
    base: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere'] } },
    main: { fit: clean },
    run: { held: hold('source'), fit: heldFor('source') },
  }, { catchUp: true })
  expect(r.out).toContain('CODE 0')
  expect(r.record.findings).toEqual([])
  expect(r.page.held).toBeUndefined()
  expect(r.out).toContain("COMMIT content: main's holds on 1 pages main read during this run")
})

// A reader of #1505: the first try takes main's release and its push loses; main holds the page again meanwhile. The second
// try's rebase replays the first try's "main's holds" commit, which takes out main's new hold, and against the merge-base
// that file has no change. The candidates are the files the merge differs from main in, so main's hold stands.
test("a later try of a lost push keeps a hold main put back meanwhile, though an earlier try took main's release", () => {
  const r = push('guides', {
    base: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere', 'source'] } },
    main: { fit: clean },
    run: { held: hold('source'), fit: heldFor('source') },
  }, { lostPush: { held: hold('harm'), fit: heldFor('harm') } })
  expect(r.out).toContain('CODE 0')
  expect(r.pushedRecord.findings.map((f: { check: string }) => f.check)).toEqual(['harm'])
  expect(r.pushed.held).toEqual(hold('harm'))
})

// A reader of #1505: harm in one language holds every language (gate.ts). The run held the Vietnamese for its new Thai
// text's harm; main read the Vietnamese again meanwhile, its file the same. Main's release would leave the Thai held for
// harm beside a live Vietnamese, so the Vietnamese stays held, for the next gate to decide.
test("a page main let out stays held while another of its languages is held for harm", () => {
  const read = { at: '2026-11-14', hash: 'e025', checks: [] }
  const r = push('guides', {
    base: { fit: read },
    main: { fit: clean },
    run: { held: hold('harm'), fit: read, th: { held: hold('harm'), fit: heldFor('harm') } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.record.findings).toEqual([])
  expect(r.pushed.held).toEqual(hold('harm'))
  expect(r.out).toContain('LOG 1 pages main read during this run stay held: another of their languages is held for harm')
  expect(r.out).not.toContain("main's holds on")
})

// The re-check of #1505: the run held both languages for the Thai text's harm, and main read both clean and let them out.
// Neither stays held for the other: both take main's release.
test("a page main let out in every language goes out in each, though the run held them all for one's harm", () => {
  const read = { at: '2026-11-14', hash: 'e025', checks: [] }
  const r = push('guides', {
    base: { fit: read, th: { fit: read } },
    main: { fit: clean, th: { fit: clean } },
    run: { held: hold('harm'), fit: read, th: { held: hold('harm'), fit: heldFor('harm') } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held).toBeUndefined()
  expect(r.pushedTh().held).toBeUndefined()
  expect(r.out).toContain("LOG 2 pages main read during this run take main's hold")
  expect(r.out).not.toContain('held for harm')
})

test("a page whose text isn't main's keeps the merge's hold: main's record read another text", () => {
  // Main let the old text out; the run wrote a new one, and its own read held it. Main's record is the one that stands, but
  // it read the old text: its release would let out what no read passed. Counted in the log, left as merged.
  const r = push('guides', {
    base: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere'] } },
    main: { fit: clean },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('harm'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['harm'] } },
  })
  expect(r.page.body).toBe('<p>Một văn bản mới.</p>')
  expect(r.page.held).toEqual(hold('harm'))
  expect(r.out).toContain("LOG 1 pages main read during this run have main's record and this run's text, left as merged")
  expect(r.out).not.toContain("main's holds on")
})

// The pages push of 19 Nov 2026 (Corydoras geoffroy): the run wrote the page again, and its own read held it for a source
// finding, the hold it had at the start. Main read the old text meanwhile and let it out. The page merges by field: the
// run's text, and main's release, as the run's hold was the start's. The record that stood was main's, of the old text, so
// the page went out open on a text whose only read held it. Now it keeps the run's hold.
test("a page whose text isn't main's keeps the run's own hold, though the merge took main's release", () => {
  const r = push('species', {
    base: { held: hold('source'), fit: { at: '2026-11-14', hash: 'old', checks: ['source'] } },
    main: { fit: clean },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('source'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['source'] } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.record.hash).toBe('e025')
  expect(r.pushed.body).toBe('<p>Một văn bản mới.</p>')
  expect(r.pushed.held).toEqual(hold('source'))
  expect(r.out).toContain("LOG 1 pages main read during this run have main's record and this run's text: held until their next read")
  expect(r.out).toContain("COMMIT content: this run's holds on 1 pages whose text main's record didn't read")
  // a tree no check has seen
  expect(r.out).toContain('VERIFY')
})

// The same, where the run's own read passed its text: main's record, which stands, read another. No read on record is of
// this text, so it waits held for its next read, with the gate's mark for a page not yet read (gate.ts: no checks).
test("a page whose text isn't main's, held by neither side, waits held for its next read", () => {
  const r = push('species', {
    base: { fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    main: { fit: clean },
    run: { body: '<p>Một văn bản mới.</p>', fit: { at: '2026-11-15', hash: 'n3w', checks: [] } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.body).toBe('<p>Một văn bản mới.</p>')
  expect(r.pushed.held.checks).toEqual([])
  expect(r.pushed.held.at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

// A comparison that fails publishes nothing: the pull is undone, and the work is kept on the run's own commit, so the next
// try compares from the main this run started on. Until now it logged and published the merge as it was.
test("a push whose holds can't be compared isn't published, and keeps the run's own commit", () => {
  const r = push('species', {
    base: { held: hold('source'), fit: { at: '2026-11-14', hash: 'old', checks: ['source'] } },
    main: { fit: clean },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('source'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['source'] } },
  }, { uncompared: true })
  expect(r.out).toContain('CODE 1')
  expect(r.out).toMatch(/LOG main's holds: the pages main read during this run couldn't be compared/)
  expect(r.out).toContain("LOST photos main's holds couldn't be compared")
  expect(r.log).toEqual(['COMMIT content: this run', 'COMMIT main as the run started'])
  expect(r.pushed.held).toBeUndefined()
  expect(r.pushedRecord.hash).toBe('e025')
  expect(r.out).not.toContain('VERIFY')
})

test("kept work whose holds can't be compared stays kept, on its own commit", () => {
  const r = push('species', {
    base: { held: hold('source'), fit: { at: '2026-11-14', hash: 'old', checks: ['source'] } },
    main: { fit: clean },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('source'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['source'] } },
  }, { kept: true, uncompared: true })
  expect(r.out).toContain('CODE 1')
  expect(r.out).toContain("WHY its holds couldn't be compared with main's")
  expect(r.log).toEqual(['COMMIT content: this run', 'COMMIT main as the run started'])
  expect(r.pushed.body).toBe('<p>Cá con quen người.</p>')
})

// The pull ahead of the run's checks: undone, so push() compares from the main the run started on, as it does after a
// clash there.
test("the pull ahead of the checks is undone when its holds can't be compared", () => {
  const r = push('species', {
    base: { held: hold('source'), fit: { at: '2026-11-14', hash: 'old', checks: ['source'] } },
    main: { fit: clean },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('source'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['source'] } },
  }, { catchUp: true, uncompared: true })
  expect(r.out).toContain('CODE 0')
  expect(r.log).toEqual(['COMMIT content: this run', 'COMMIT main as the run started'])
  expect(r.page.held).toEqual(hold('source'))
})

test("every push that compares main's holds stops on a comparison that failed", () => {
  for (const s of ['engine-cycle.sh', 'video-cycle.sh', 'video-recheck.sh', 'cycle-checks.sh']) {
    const calls = readFileSync(join(ROOT, 'scripts', s), 'utf8').split('\n').filter(l => /\bmain_holds "\$run"/.test(l) && !/^\s*#/.test(l))
    expect(calls.length, s).toBeGreaterThan(0)
    for (const l of calls) {
      expect(l, s).not.toMatch(/\|\| true\b/)
      // 1: main's holds committed, checked again; anything else: not published
      expect(l, s).toMatch(/\|\| \[ \$\? = 1 \] \|\||\|\| case \$\? in 1\)/)
    }
  }
})

test('a pull where main read nothing this run wrote changes nothing, and adds no check', () => {
  const r = push('guides', {
    base: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere'] } },
    main: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere'] } },
    run: { fit: clean },
  }, { mainOther: true })
  expect(r.page.held).toBeUndefined()
  expect(r.out).not.toContain('VERIFY')
  expect(r.out).not.toContain("main's hold")
  expect(r.out).toContain('CODE 0')
})

test("kept work published later takes main's holds the same way, and they're in the tree its checks see", () => {
  const r = push('guides', {
    base: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere', 'source'] } },
    main: { fit: clean },
    run: { held: hold('source'), fit: heldFor('source') },
  }, { kept: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held).toBeUndefined()
  // A kept branch is checked on its first try anyway (check=1). What holds a later try's check (check= once it has passed)
  // is the order: main_holds commits before HEAD is compared.
  expect(readFileSync(join(ROOT, 'scripts/cycle-checks.sh'), 'utf8')).toMatch(/head=\$\(git rev-parse HEAD\)\n\s*\[ -z "\$BRANCH" \] \|\| main_pages "\$BRANCH"\n\s*main_holds "\$run" origin\/main \|\| \[ \$\? = 1 \] \|\| \{ KEPT_WHY=[^\n]*; return 1; \}\n\s*\[ "\$\(git rev-parse HEAD\)" = "\$head" \] \|\| check=1/)
})

test("main-holds.mjs reads the gate's kinds", () => {
  const src = readFileSync(join(ROOT, 'scripts/main-holds.mjs'), 'utf8')
  const kinds = JSON.parse(src.match(/^const GATED_KINDS = (\[.*\])$/m)![1]!.replace(/'/g, '"'))
  expect(kinds).toEqual([...GATED_KINDS])
})
