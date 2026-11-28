import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { fitKey, fitText } from '../src/fit'
import { GATED_KINDS, HELD_BY_HAND } from '../src/gate'
import { loadCards, loadPages } from '../src/pages'
// @ts-expect-error a plain script
import { read, same } from '../../../scripts/main-holds.mjs'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const FIXTURE = join(ROOT, 'apps/site/test/fixture-content')
const fixtureJson = (f: string) => readFileSync(join(FIXTURE, f), 'utf8')
const DEFAULT_BODY = '<p>Cá con quen người.</p>'
const guideHash = (body: string) => fitText({
  lang: 'vi', kind: 'guides', id: 'youtube-x', path: '/vi/huong-dan/ho-ca/', title: 'Hồ cá',
  fields: [{ field: 'body', html: body }], lines: [], captions: [], latinNames: [], card: [],
}).hash
const defaultHash = guideHash(DEFAULT_BODY)
const eventCard = (country: string) => JSON.stringify({
  id: 'the-x', type: 'event', sources: [{ url: 'https://example.org/e', title: 'Hội chợ', publisher: 'Báo', date: '2026', accessed: '2026-11-15' }],
  show: { from: '2026-12-02', until: '2026-12-20' }, event: { start: '2026-12-18', end: '2026-12-20', place: 'Hội chợ', country, organiser: 'Hội' }, updatedAt: '2026-11-15',
})

// The case of 15 Nov 2026 (the outdoor pond guide, youtube-gJuWCudImSc): the photos part started from a main where the
// guide was held; meanwhile the video recheck read the same text clean and let it out on main; the photos part's own
// gate read that text again, found one sentence, and kept it held. At the push the guide's file clashed, `-X theirs`
// gave the page the photos part's hold, while _fit.json (merge=jsonmap, main's side first) kept main's clean record:
// a page held for a finding its own record doesn't carry, live for an hour and then a dead address.
// The rule: a page's hold follows the record that won, so a release on main during a run stands (Page Recovery's test,
// widened to a hold on main, a clean pull, a species page and a text that isn't main's).
type Held = { checks: string[]; at: string }
type Side = { held?: Held; body?: string; sections?: Record<string, string>; extra?: Record<string, unknown>; fit?: { at: string; hash: string; checks: string[] }; th?: Side; /** Other files as written, after the page's. */ files?: Record<string, string> }

const KINDS = {
  guides: { dir: 'content/guides/youtube-x', key: 'vi/guides/youtube-x' },
  species: { dir: 'content/species/ca-x', key: 'vi/species/ca-x' },
  cards: { dir: 'content/cards/the-x', key: 'vi/cards/the-x' },
}

// lostPush: the run's first push loses, as main gets this side meanwhile. uncompared: the comparison of holds fails, as a
// git read or a file it can't parse would make it; 'locked', and it leaves a lock in the index, so the pull can't be
// undone. oldCaller: a cycle that started on the older script calls main-holds.mjs as that script did, with two arguments.
function push(kind: keyof typeof KINDS, sides: { base: Side; main: Side; run: Side }, o: {
  mainOther?: boolean; mainDidNotMove?: boolean; kept?: boolean; catchUp?: boolean; lostPush?: Side;
  uncompared?: boolean | 'locked'; oldCaller?: boolean; video?: 'fresh' | 'kept';
  holdFault?: 'process' | 'unreadable' | 'malformed'; baseWithoutFit?: boolean; baseWithoutEntity?: boolean; sweepBody?: string;
} = {}) {
  const { dir: pageDir, key } = KINDS[kind]
  const file = `${pageDir}/vi.json`
  const secondGuide = 'content/guides/youtube-y/vi.json'
  const dir = mkdtempSync(join(tmpdir(), 'aq-push-hold-'))
  const page = (s: Side) =>
    `${JSON.stringify({ ...(kind === 'cards' ? { title: 'Hội chợ', eyebrow: 'Sự kiện' } : { slug: 'ho-ca', name: 'Hồ cá', altNames: [], sections: s.sections ?? {}, quality: { score: 0.9, indexable: true } }), body: s.body ?? DEFAULT_BODY, ...s.extra, ...(s.held ? { held: s.held } : {}) }, null, 2)}\n`
  const record = (f: NonNullable<Side['fit']>) =>
    ({ at: f.at, hash: f.hash, model: 'opus', checklist: 3, findings: f.checks.map(check => ({ check, part: 'P2', quote: 'Cá con quen người.', why: 'w', by: 'model' })), products: [] })
  // The page's Thai file and record, where a side has them.
  const thKey = key.replace(/^vi\//, 'th/'), thFile = file.replace(/vi\.json$/, 'th.json')
  const fit = (s: Side) =>
    `${JSON.stringify({ ...(s.fit ? { [key]: record(s.fit) } : {}), ...(s.th?.fit ? { [thKey]: record(s.th.fit) } : {}) }, null, 2)}\n`
  const write = (files: Record<string, string>) =>
    Object.entries(files).map(([f, t]) => `mkdir -p "$(dirname ${f})" && printf '%s' '${t.replace(/'/g, `'\\''`)}' > ${f} && git add ${f}`).join(' && ')
  const both = (s: Side, includeFit = true) => write({
    [file]: page(s),
    ...(s.th ? { [thFile]: page(s.th) } : {}),
    ...(includeFit ? { 'engine-state/_fit.json': fit(s) } : {}),
    ...s.files,
  })
  const entity = kind === 'cards' ? JSON.parse(eventCard('TH')) : { ...JSON.parse(fixtureJson(kind === 'guides' ? 'guides/youtube-r53ZQW0m8VM/entity.json' : 'species/paracheirodon-innesi/entity.json')), id: pageDir.split('/').at(-1) }
  if (kind === 'species') entity.sections = [{ ...entity.sections[0], source: 'youtube' }]
  const seedEntity = write({ [`${pageDir}/entity.json`]: JSON.stringify(entity) })
  const pushFn = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8').match(/^push\(\) \{[\s\S]*?^\}$/m)![0]
  const script = `
    set -e
    export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null
    cd "${dir}"
    git init -q -b main --bare origin.git
    git clone -q origin.git other 2>/dev/null && cd other && git checkout -q -b main
    mkdir scripts && cp '${join(ROOT, 'scripts/main-holds.mjs')}' scripts/main-holds.mjs && git add scripts
    printf 'engine-state/_fit.json merge=jsonmap\\ncontent/species/*/*.json merge=entity\\n' > .gitattributes && git add .gitattributes
    ${write({ 'content/sources.json': fixtureJson('sources.json') })} && ${o.baseWithoutEntity ? ':' : seedEntity} && ${both(sides.base, !o.baseWithoutFit)}
    git commit -qm 'main as the run started' && git push -q origin main && cd ..
    git clone -q -b main origin.git cycle
    for c in other cycle; do
      git -C $c config merge.jsonmap.driver "node ${join(ROOT, 'scripts/merge-json-map.mjs')} %O %A %B"
      git -C $c config merge.entity.driver "node ${join(ROOT, 'scripts/merge-entity.mjs')} %O %A %B"
    done
    ${o.mainDidNotMove ? '' : `
    cd other && ${both(sides.main)}
    ${o.mainOther ? `${write({ 'content/guides/other/vi.json': '{"slug":"khac"}\n' })} &&` : ''} git commit -qm 'content: another part, meanwhile' && git push -q origin main && cd ..
    `}
    cd cycle && ${both(sides.run)}
    ${o.baseWithoutEntity ? seedEntity : ':'}
    ${o.video ? write({ [secondGuide]: '{"slug":"huong-dan","body":"<p>Đoạn mới.</p>"}\n' }) : ':'}
    git commit -qm '${o.video ? 'content: video guides checked again (fixture)' : 'content: this run'}'
    set +e
    PART=photos
    log() { echo "LOG $*"; }
    source "${join(ROOT, 'scripts/cycle-checks.sh')}"
    AQ_SCRIPT_HEAD=$(git rev-parse origin/main)
    ${o.holdFault ? 'engine_clone() { return 0; }' : ''}
    ${o.video ? `
      # The fixture has no package installation. The same helper runs with the test checkout's loader and reads Git here.
      node() {
        case "$1" in
          */aquatome-video-reconcile/scripts/main-holds.mjs)
            ${o.holdFault === 'process' ? 'return 42' : `shift; set -- '${join(ROOT, 'scripts/main-holds.mjs')}' "$@"`}
            ;;
        esac
        command node "$@"
      }
    ` : ''}
    ${o.holdFault && o.holdFault !== 'process' ? `
      export FIXTURE_GIT=$(command -v git) FIXTURE_READ="$(git -C ../other rev-parse HEAD):${file}"
      mkdir ../bin && cat > ../bin/git <<'GIT'
#!/bin/sh
if [ "$1" = show ] && [ "$2" = "$FIXTURE_READ" ]; then
  ${o.holdFault === 'malformed' ? "printf '{broken json\\n'; exit 0" : 'exit 42'}
fi
exec "$FIXTURE_GIT" "$@"
GIT
      chmod +x ../bin/git
      export PATH="${dir}/bin:$PATH"
    ` : ''}
    ${o.uncompared ? `mkdir -p ../broken && echo '${o.uncompared === 'locked' ? 'import { writeFileSync } from "node:fs"; writeFileSync(".git/index.lock", ""); ' : ''}process.exit(1)' > ../broken/main-holds.mjs && CYCLE_DIR="$PWD/../broken"` : ''}
    ${o.oldCaller ? `main_holds() { local base; base=$(git merge-base "$1" '@{u}'); node "$CYCLE_DIR/main-holds.mjs" "$base" "$(git rev-parse '@{u}')"; echo "NODE $?"; return 0; }` : ''}
    net() {
      ${o.lostPush ? `if [ "$1 $2" = "git push" ] && [ ! -e ../lost ]; then touch ../lost; (cd ../other && ${both(o.lostPush)} && ${o.video ? write({ 'content/concurrent.json': '{"main":true}\n' }) : ':'} && git commit -qm 'content: main again, meanwhile' && git push -q origin main); fi` : ':'}
      "$@"
    }
    replan_merged() { :; }
    pnpm() { [ "$1 $2 $3 $4" = '--filter @aq/engine... install --offline' ]; }
    sweep_merged() {
      ${o.sweepBody ? `${write({ [file]: page({ ...sides.run, body: o.sweepBody }) })} && commit_reconciled_changes "content: fixture sweep"` : ':'}
    }
    verify_cycle() {
      git show HEAD:${file} | node -e '
        const page = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
        console.log("VERIFY " + (page.held?.checks.join(",") ?? "clear"))
      '
    }
    swept_pull() { :; }
    # On the kept retry, no sweep change can independently trigger verification.
    ${o.kept && o.lostPush ? 'swept_clean() { return 0; }' : ''}
    keep_unpublished() { echo "KEPT"; }
    ${o.video ? '' : 'keep_lost_push() { echo "LOST $*"; }'}
    sleep() { :; }
    ended_row() { :; }
    ${pushFn}
    echo "RUN $(git rev-parse HEAD)"
    case '${o.video ?? ''}' in
      fresh)
        source "${join(ROOT, 'scripts/video-recheck-publish.sh')}"
        git update-ref "$VIDEO_RECHECK_PENDING_REF" HEAD '' && push_video_recheck
        ;;
      kept) git branch kept/video-recheck/20261116T000000 && push_kept kept/video-recheck/20261116T000000 ;;
      *) ${o.kept ? 'git branch kept/photos/20261116T000000 && push_kept kept/photos/20261116T000000' : o.catchUp ? 'catch_up' : 'push'} ;;
    esac
    echo "CODE $?"
    echo "WHY $KEPT_WHY"
    git for-each-ref --format='QUEUED %(refname:short)' refs/heads/kept
    git log --format='COMMIT %s' -3`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  expect(r.stderr).not.toMatch(/fatal/i)
  const read = (f: string) => JSON.parse(readFileSync(join(dir, 'cycle', f), 'utf8'))
  const pushed = (f: string) => {
    const result = spawnSync('git', ['-C', join(dir, 'origin.git'), 'show', `main:${f}`], { encoding: 'utf8' })
    return result.status === 0 ? JSON.parse(result.stdout) : undefined
  }
  return { out: r.stdout, page: read(file), record: read('engine-state/_fit.json')[key], pushed: pushed(file), pushedRecord: pushed('engine-state/_fit.json')[key], pushedTh: () => pushed(thFile), pushedSecondGuide: () => pushed(secondGuide), log: r.stdout.split('\n').filter(l => l.startsWith('COMMIT ')) }
}

const clean = { at: '2026-11-15', hash: defaultHash, checks: [] }
const heldFor = (...checks: string[]) => ({ at: '2026-11-15', hash: defaultHash, checks })
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
    base: { held: hold('harm'), fit: { at: '2026-11-14', hash: defaultHash, checks: ['harm'] } },
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
  const read = { at: '2026-11-14', hash: defaultHash, checks: [] }
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
  const read = { at: '2026-11-14', hash: defaultHash, checks: [] }
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
  expect(r.record.hash).toBe(defaultHash)
  expect(r.pushed.body).toBe('<p>Một văn bản mới.</p>')
  expect(r.pushed.held).toEqual(hold('source'))
  expect(r.out).toContain("LOG 1 pages main read during this run have main's record and this run's text: held until their next read")
  expect(r.out).toContain("COMMIT content: holds on 1 pages as this run's push ends")
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
  expect(r.out).toContain(`LOST photos main's holds couldn't be compared ${/^RUN (\w+)$/m.exec(r.out)![1]}`)
  expect(r.log).toEqual(['COMMIT content: this run', 'COMMIT main as the run started'])
  expect(r.pushed.held).toBeUndefined()
  expect(r.pushedRecord.hash).toBe(defaultHash)
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

// The pull ahead of the run's checks: undone, and the run stops there, its commit kept (engine-cycle.sh). Going on, a pull
// it failed to undo would leave push() nothing to compare (a reader of #1703).
test("the pull ahead of the checks is undone when its holds can't be compared, and the run stops", () => {
  const r = push('species', {
    base: { held: hold('source'), fit: { at: '2026-11-14', hash: 'old', checks: ['source'] } },
    main: { fit: clean },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('source'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['source'] } },
  }, { catchUp: true, uncompared: true })
  expect(r.out).toContain('CODE 1')
  expect(r.log).toEqual(['COMMIT content: this run', 'COMMIT main as the run started'])
  expect(r.page.held).toEqual(hold('source'))
  expect(readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8')).toMatch(/\nran=\$\(git rev-parse HEAD\)\ncatch_up \|\| \{ keep_lost_push "\$PART" "[^"\n]+" "\$ran"; exit 1; \}\nsweep_merged\n/)
})

// A reader of #1703: a lock left in the index, and the pull can't be undone. The work kept is the run's own commit, by
// name, not HEAD, and nothing is published.
test("a push whose holds can't be compared, and whose pull can't be undone, keeps the run's own commit by name", () => {
  const r = push('species', {
    base: { held: hold('source'), fit: { at: '2026-11-14', hash: 'old', checks: ['source'] } },
    main: { fit: clean },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('source'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['source'] } },
  }, { uncompared: 'locked' })
  const run = /^RUN (\w+)$/m.exec(r.out)![1]
  expect(r.out).toContain('CODE 1')
  expect(r.out).toContain(`LOG the pull couldn't be undone: this run's commit is ${run}`)
  expect(r.out).toContain(`LOST photos main's holds couldn't be compared ${run}`)
  expect(r.pushed.held).toBeUndefined()
  expect(r.pushedRecord.hash).toBe(defaultHash)
})

// A reader of #1703: harm in one language holds the page's every language (gate.ts). The run's new Vietnamese text held for
// harm, and the Thai held beside it; main read both old texts and let them out. The Vietnamese gets the run's hold back
// (its text isn't main's), and the Thai, the merge's open copy of main's, may not go out beside it.
test("a page kept held for harm in one language stays held in each", () => {
  const harmRead = { at: '2026-11-14', hash: 'old', checks: ['harm'] }
  const r = push('species', {
    base: { held: hold('harm'), fit: harmRead, th: { held: hold('harm'), fit: harmRead } },
    main: { fit: clean, th: { fit: clean } },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('harm'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['harm'] }, th: { held: hold('harm'), fit: harmRead } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held).toEqual(hold('harm'))
  expect(r.pushedTh().held).toEqual(hold('harm'))
})

// A reader of #1703: the merge keeps the Vietnamese held for harm on a text main's record didn't read (left as merged), and
// the Thai, which the run didn't change, took main's release with the line merge. Harm holds every language: the Thai stays
// held too, with the run's hold.
test("a language main let out stays held beside one the merge keeps held for harm", () => {
  const harmRead = { at: '2026-11-14', hash: 'old', checks: ['harm'] }
  const r = push('guides', {
    base: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere'] }, th: { held: hold('harm'), fit: harmRead } },
    main: { fit: clean, th: { fit: clean } },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('harm'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['harm'] }, th: { held: hold('harm'), fit: harmRead } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held).toEqual(hold('harm'))
  expect(r.pushedTh().held).toEqual(hold('harm'))
})

// Both readers of c8902db524: the harm hold is main's, on a file the run didn't touch, and the run added the page's Thai.
// Only the Thai is in the merge's changes; the page's other languages are looked at all the same.
test("a translation the run added stays held beside a language main held for harm", () => {
  const r = push('species', {
    base: { fit: clean },
    main: { held: hold('harm'), fit: heldFor('harm') },
    run: { fit: clean, th: { fit: clean } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held).toEqual(hold('harm'))
  expect(r.pushedTh().held.checks).toEqual(['harm'])
  expect(r.out).toContain('LOG 1 pages held beside another of their languages held for harm')
})

// Sol's read of c8902db524: a guide's cover isn't read. The run set one and kept its start's hold; main read the same text
// and let it out. The page goes out open, with the run's cover.
test("a page whose change on the run's side the read doesn't cover takes main's release, and keeps the change", () => {
  const r = push('guides', {
    base: { held: hold('source'), fit: { at: '2026-11-14', hash: defaultHash, checks: ['source'] } },
    main: { fit: clean },
    run: { held: hold('source'), extra: { cover: 'Bể có nắp kiểu cũ' }, fit: { at: '2026-11-14', hash: defaultHash, checks: ['source'] } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.cover).toBe('Bể có nắp kiểu cũ')
  expect(r.pushed.held).toBeUndefined()
  expect(r.out).toContain("LOG 1 pages main read during this run take main's hold on this run's file, as its record read their text")
})

// Astra's read of c8902db524: a guide's note for its readers is read for its words, not its sources. Main changed a source
// alone, with no read; the run's read passed its own new body. The text as it goes out is the one the run read.
test("a page both sides changed stays open when its read text is the run's", () => {
  const note = (url: string) => ({ localNote: { html: '<p>Ghi chú cho bạn đọc.</p>', refs: [{ url, title: 'Nguồn' }] } })
  const r = push('guides', {
    base: { extra: note('https://example.org/a'), fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    main: { extra: note('https://example.org/b'), fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    run: { body: '<p>Một văn bản mới.</p>', extra: note('https://example.org/a'), fit: { at: '2026-11-15', hash: 'run', checks: [] } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.body).toBe('<p>Một văn bản mới.</p>')
  expect(r.pushed.localNote.refs[0].url).toBe('https://example.org/b')
  expect(r.pushed.held).toBeUndefined()
  expect(r.out).not.toContain('no record read')
})

// A reader of #1703: main fixed one section of an open species page by hand, with no read; the run rewrote another, and its
// own read passed it. The entity driver keeps both edits, and the record that stands is the run's, of its own text: nobody
// read the page as it would go out. It waits held for its next read, with the gate's mark for a page not yet read.
const SECTIONS = { 'care:sf': '<p>Nuôi dễ.</p>', 'diet:sf': '<p>Ăn tạp.</p>' }
test("a page whose merged text is neither side's waits held for its next read", () => {
  const r = push('species', {
    base: { sections: SECTIONS, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    main: { sections: { ...SECTIONS, 'diet:sf': '<p>Ăn tạp, thích trùn chỉ.</p>' }, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    run: { sections: { ...SECTIONS, 'care:sf': '<p>Nuôi rất dễ.</p>' }, fit: { at: '2026-11-15', hash: 'run', checks: [] } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.sections).toEqual({ 'care:sf': '<p>Nuôi rất dễ.</p>', 'diet:sf': '<p>Ăn tạp, thích trùn chỉ.</p>' })
  expect(r.pushedRecord.hash).toBe('run')
  expect(r.pushed.held.checks).toEqual([])
  expect(r.out).toContain('LOG 1 pages both sides changed, whose text together no record read: held until their next read')
  expect(r.out).toContain("COMMIT content: holds on 1 pages as this run's push ends")
})

// The chief of staff's ruling of 20 Nov stands: a text that is one side's goes out as merged. Main's hand fix alone, and the
// run's change to a field its read doesn't cover, leave the page open; so does a field outside the read on main's side.
test("a page whose read text is one side's stays open, whatever else both sides changed", () => {
  const handFix = push('species', {
    base: { sections: SECTIONS, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    main: { sections: { ...SECTIONS, 'diet:sf': '<p>Ăn tạp, thích trùn chỉ.</p>' }, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    run: { sections: SECTIONS, extra: { altNames: ['Cá x'] }, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
  })
  expect(handFix.pushed.sections['diet:sf']).toBe('<p>Ăn tạp, thích trùn chỉ.</p>')
  expect(handFix.pushed.held).toBeUndefined()
  const outside = push('species', {
    base: { sections: SECTIONS, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    main: { sections: SECTIONS, extra: { altNames: ['Cá x'] }, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    run: { sections: { ...SECTIONS, 'care:sf': '<p>Nuôi rất dễ.</p>' }, fit: { at: '2026-11-15', hash: 'run', checks: [] } },
  })
  expect(outside.pushed.altNames).toEqual(['Cá x'])
  expect(outside.pushed.held).toBeUndefined()
  expect(outside.out).not.toContain('no record read')
})

// The third reads of #1703 (Codex, gpt-6.2-sol and gpt-6.2-astra, on 5898a90997).
// Which of a species' parts show turns on content/one-voice.json too. Main turned the diet part on; the run rewrote it while
// it was off, and its read didn't see it. The page goes out with a part nobody read: it waits held for its next read.
test("a part main turned on that the run rewrote while it was off waits held for its next read", () => {
  const off = { 'content/one-voice.json': '{"ca-x":{"diet":false}}\n' }
  const r = push('species', {
    base: { sections: SECTIONS, files: off, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    main: { sections: SECTIONS, files: { 'content/one-voice.json': '{}\n' }, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    run: { sections: { ...SECTIONS, 'diet:sf': '<p>Ăn tạp, nhiều loại.</p>' }, files: off, fit: { at: '2026-11-15', hash: 'run', checks: [] } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.sections['diet:sf']).toBe('<p>Ăn tạp, nhiều loại.</p>')
  expect(r.pushed.held.checks).toEqual([])
  expect(r.out).toContain('no record read')
})

// A record main took out is no read: the run's hold on the same text stays.
test("a page whose record main took out keeps the run's hold: a deleted record read nothing", () => {
  const r = push('species', {
    base: { fit: clean },
    main: {},
    run: { held: hold('source'), fit: { at: '2026-11-15', hash: defaultHash, checks: ['source'] } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held).toEqual(hold('source'))
})

// Main read the old words again and wrote a source hold; the run rewrote them and its read found harm. The words going out
// are the run's, so its harm stays with main's source hold.
test("a harm the run found on the words going out stays, though the merge took main's hold", () => {
  const r = push('species', {
    base: { sections: SECTIONS, held: hold('harm'), fit: { at: '2026-11-14', hash: 'old', checks: ['harm'] } },
    main: { sections: SECTIONS, held: hold('source'), fit: { at: '2026-11-15', hash: 'old', checks: ['source'] } },
    run: { sections: { ...SECTIONS, 'care:sf': '<p>Nuôi rất dễ.</p>' }, held: hold('harm'), fit: { at: '2026-11-15', hash: 'run', checks: ['harm'] } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.sections['care:sf']).toBe('<p>Nuôi rất dễ.</p>')
  expect(r.pushed.held.checks).toContain('harm')
})

// No questions and an empty list of them read the same, as the gate reads them.
test("a page whose only difference from the run's read text is an empty list of questions stays open", () => {
  const r = push('species', {
    base: { sections: SECTIONS, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    main: { sections: SECTIONS, extra: { faq: [] }, fit: { at: '2026-11-14', hash: 'old', checks: [] } },
    run: { sections: { ...SECTIONS, 'care:sf': '<p>Nuôi rất dễ.</p>' }, fit: { at: '2026-11-15', hash: 'run', checks: [] } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held).toBeUndefined()
  expect(r.out).not.toContain('no record read')
})

// A language file written as null isn't a page that isn't there: the comparison fails, and nothing is published.
test("a language file that isn't a page fails the comparison, and the push isn't published", () => {
  const r = push('guides', {
    base: { fit: clean, th: { held: hold('source'), fit: { at: '2026-11-14', hash: 'old', checks: ['source'] } } },
    main: { fit: clean, th: { fit: clean } },
    run: { fit: clean, files: { 'content/guides/youtube-x/th.json': 'null\n' } },
  })
  expect(r.out).toContain('CODE 1')
  expect(r.out).toMatch(/LOG main's holds: the pages main read during this run couldn't be compared/)
})

// Harm is read from each file's hold, not searched for as a word: a hold written with an escape still holds a translation
// the run added beside it.
test("a translation the run added is held beside a hold for harm however its file spells it", () => {
  const harmVi = '{\n  "slug": "ho-ca",\n  "name": "Hồ cá",\n  "body": "<p>Cá con quen người.</p>",\n  "held": { "checks": ["h\\u0061rm"], "at": "2026-11-15" }\n}\n'
  const r = push('guides', {
    base: { fit: clean },
    main: { files: { 'content/guides/youtube-x/vi.json': harmVi }, fit: heldFor('harm') },
    run: { fit: clean, th: { fit: clean } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushedTh().held.checks).toEqual(['harm'])
})

// A reader of #1703: a cycle running while this lands sourced the older script, then pulls the new main-holds.mjs and calls
// it with two arguments. It answers as the older one did, and writes nothing.
test("main-holds.mjs answers a caller of the older script as it did", () => {
  const r = push('species', {
    base: { held: hold('source'), fit: { at: '2026-11-14', hash: 'old', checks: ['source'] } },
    main: { fit: clean },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('source'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['source'] } },
  }, { oldCaller: true })
  expect(r.out).toContain('NODE 0')
  expect(r.out).toContain('text content/species/ca-x/vi.json')
  expect(r.out).not.toContain('keep ')
  expect(r.page.held).toBeUndefined()
  // Sol's read of c8902db524: nor does it hold a language beside one held for harm, which writes a file the older script
  // would leave in the tree uncommitted.
  const harmRead = { at: '2026-11-14', hash: 'old', checks: ['harm'] }
  const harm = push('guides', {
    base: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere'] }, th: { held: hold('harm'), fit: harmRead } },
    main: { fit: clean, th: { fit: clean } },
    run: { body: '<p>Một văn bản mới.</p>', held: hold('harm'), fit: { at: '2026-11-15', hash: 'n3w', checks: ['harm'] }, th: { held: hold('harm'), fit: harmRead } },
  }, { oldCaller: true })
  expect(harm.out).toContain('NODE 0')
  expect(harm.out).toContain('text content/guides/youtube-x/vi.json')
  expect(harm.out).not.toMatch(/^(keep|unread|own|beside) /m)
  // The third read of sol: its releases are decided on the merge's holds, as the older script's were. Main held the page
  // for harm and let the Thai out; the merge kept a source hold on both. The older script took the Thai's release.
  const later = { at: '2026-11-16', checks: ['source'] }
  const arbiter = push('guides', {
    base: { held: hold('source'), fit: { at: '2026-11-14', hash: 'old', checks: ['source'] }, th: { held: hold('source'), fit: { at: '2026-11-14', hash: 'old', checks: ['source'] } } },
    main: { held: hold('harm'), fit: { at: '2026-11-15', hash: 'old', checks: ['harm'] }, th: { fit: clean } },
    run: { held: later, fit: { at: '2026-11-14', hash: 'old', checks: ['source'] }, th: { held: later, fit: { at: '2026-11-14', hash: 'old', checks: ['source'] } } },
  }, { oldCaller: true })
  expect(arbiter.out).toContain('NODE 0')
  expect(arbiter.out).toContain('hold content/guides/youtube-x/th.json')
  expect(arbiter.out).not.toContain('harm content/guides/youtube-x/th.json')
})

test.each([false, true])('the older caller reports the valid hold alongside a malformed page (review changed: %s)', reviewChanged => {
  const old = { ...heldFor('source'), at: '2026-11-14' }
  const malformed = reviewChanged ? 'content/guides/youtube-x/th.json' : 'content/guides/youtube-z/vi.json'
  const thai = reviewChanged ? { th: { fit: old } } : {}
  const r = push('guides', {
    base: { held: hold('source'), fit: old, ...thai },
    main: { held: hold('source'), fit: heldFor('source'), ...(reviewChanged ? { th: { fit: clean } } : {}) },
    run: { fit: old, ...thai, files: { [malformed]: '{broken json\n' } },
  }, { oldCaller: true })
  expect(r.out).toContain('NODE 0')
  expect(r.out.match(/^hold .*$/gm)).toEqual(['hold content/guides/youtube-x/vi.json'])
})

test('a release without a new review leaves the run’s hold on its rewritten fish page', () => {
  const body = '<p>Một văn bản mới.</p>'
  const r = push('species', {
    base: { held: hold('source'), fit: clean },
    main: { fit: clean },
    run: { body, held: hold('source'), fit: { ...heldFor('source'), hash: 'rewritten' } },
  })
  expect(r.pushed.body).toBe(body)
  expect(r.pushed.held).toEqual(hold('source'))
})

test('a review of the old text does not release a rewritten fish page on the same new words as main', () => {
  const body = '<p>Một văn bản mới.</p>'
  const r = push('species', {
    base: { held: hold('source'), fit: { ...heldFor('source'), at: '2026-11-14' } },
    main: { body, fit: clean },
    run: { body, held: hold('source'), fit: { ...heldFor('source'), hash: 'rewritten' } },
  })
  expect(r.pushed.body).toBe(body)
  expect(r.pushed.held).toEqual(hold('source'))
})

test('main’s release without a new review leaves the run’s hold on the same rewritten text', () => {
  const body = '<p>Một văn bản mới.</p>'
  const originalRead = { ...heldFor('source'), at: '2026-11-14' }
  const r = push('species', {
    base: { held: hold('source'), fit: originalRead },
    main: { body, fit: originalRead },
    run: { body, held: hold('source'), fit: { ...heldFor('source'), hash: 'rewritten' } },
  })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.body).toBe(body)
  expect(r.pushedRecord.hash).toBe('rewritten')
  expect(r.pushed.held).toEqual(hold('source'))
})

test('a newly added translation waits if main enabled one of its parts after it was read', () => {
  const off = { 'content/one-voice.json': '{"ca-x":{"diet":false}}\n' }
  const r = push('species', {
    base: { sections: SECTIONS, files: off, fit: clean },
    main: { sections: SECTIONS, files: { 'content/one-voice.json': '{}\n' }, fit: clean },
    run: { sections: SECTIONS, files: off, fit: clean, th: { sections: SECTIONS, fit: clean } },
  })
  expect(r.pushedTh().held?.checks).toEqual([])
})

test.each([false, true])('recovery holds a page the older publisher kept open with a review of different text (main advanced: %s)', mainAdvanced => {
  const body = '<p>Một văn bản mới.</p>'
  const r = push('species', {
    base: { fit: clean },
    main: { fit: clean },
    run: { body, fit: clean },
  }, { kept: true, mainOther: mainAdvanced, mainDidNotMove: !mainAdvanced })
  expect(r.pushed.body).toBe(body)
  expect(r.pushed.held?.checks).toEqual([])
})

test.each([false, true])('recovery holds combined text when its saved review covered only the run’s edit (main advanced: %s)', mainAdvanced => {
  const diet = { ...SECTIONS, 'diet:sf': '<p>Ăn tạp, thích trùn chỉ.</p>' }
  const combined = { ...diet, 'care:sf': '<p>Nuôi rất dễ.</p>' }
  const r = push('species', {
    base: { sections: diet, fit: clean },
    main: { sections: diet, fit: clean },
    run: { sections: combined, fit: { ...clean, hash: 'care-only' } },
  }, { kept: true, mainOther: mainAdvanced, mainDidNotMove: !mainAdvanced })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.sections).toEqual(combined)
  expect(r.pushedRecord.hash).toBe('care-only')
  expect(r.pushed.held?.checks).toEqual([])
})

test('recovery leaves a guide open when the saved review matches the outgoing text', () => {
  const main = { body: '<p>Bài cũ.</p>', fit: { ...clean, hash: 'old' } }
  const r = push('guides', {
    base: main,
    main,
    run: { fit: clean },
  }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.body).toBe(DEFAULT_BODY)
  expect(r.pushedRecord.hash).toBe(defaultHash)
  expect(r.pushed.held).toBeUndefined()
})

test('recovery leaves the live text in place when the edit introduces a blocking finding', () => {
  const body = '<p>Bài cũ.</p>'
  const main = { body, fit: { ...clean, hash: guideHash(body) } }
  const r = push('guides', { base: main, main, run: { fit: heldFor('source') } }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 1')
  expect(r.out).not.toContain('VERIFY')
  expect(r.out).toContain('QUEUED kept/photos/')
  expect(r.pushed.body).toBe(body)
  expect(r.pushed.held).toBeUndefined()
})

test('recovery can publish an edit carrying only a finding from an unchanged sentence', () => {
  const body = `${DEFAULT_BODY}<p>Bài cũ.</p>`
  const main = { body, fit: { ...clean, hash: guideHash(body) } }
  const r = push('guides', { base: main, main, run: { fit: heldFor('source') } }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.body).toBe(DEFAULT_BODY)
  expect(r.pushed.held).toBeUndefined()
})

test.each(['matching', 'stale'] as const)('recovery considers a %s harm review even when its translation was already held', review => {
  const main = { held: hold('source'), fit: heldFor('source'), th: {} }
  const fit = { ...heldFor('harm'), hash: review === 'matching' ? defaultHash : 'stale' }
  const r = push('guides', { base: main, main, run: { ...main, fit } }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held?.checks).toEqual(review === 'matching' ? ['harm', 'source'] : ['source'])
  expect(r.pushedTh().held?.checks).toEqual(review === 'matching' ? ['harm'] : undefined)
})

test.each(['TH', 'US'])('recovery checks whether changing a card country from %s makes its translation public', country => {
  const file = 'content/cards/the-x/entity.json'
  const main = { files: { [file]: eventCard(country) } }
  const r = push('cards', { base: main, main, run: { files: { [file]: eventCard('VN') } } }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held?.checks).toEqual(country === 'TH' ? [] : undefined)
})

test('recovery checks an unread guide made visible by changing to a public source', () => {
  const file = 'content/guides/youtube-x/entity.json'
  const entity = { ...JSON.parse(fixtureJson('guides/youtube-r53ZQW0m8VM/entity.json')), id: 'youtube-x' }
  const main = { files: { [file]: JSON.stringify({ ...entity, source: 'aquatome' }) } }
  const r = push('guides', { base: main, main, run: { files: { [file]: JSON.stringify(entity) } } }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held?.checks).toEqual([])
})

test('recovery applies a manual hold to a translation whose saved review passes', () => {
  const manual = hold('source')
  const main = { held: manual, files: { [HELD_BY_HAND]: JSON.stringify({ 'guides/youtube-x': { ...manual, why: 'fixture' } }) } }
  const r = push('guides', { base: main, main, run: { ...main, th: { fit: clean } } }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushedTh().held).toEqual(manual)
})

test.each(['stale', 'missing'] as const)('recovery holds a queued translation without a review of a now-visible part (%s)', review => {
  // This batch is already based on main with the diet enabled. Its Thai record is from before that change.
  const main = { sections: SECTIONS, fit: clean, files: { 'content/one-voice.json': '{}\n' } }
  const r = push('species', {
    base: main,
    main,
    run: { ...main, th: { sections: SECTIONS, fit: review === 'stale' ? { ...clean, hash: 'diet-hidden' } : undefined } },
  }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushedTh().sections).toEqual(SECTIONS)
  expect(r.pushedTh().held?.checks).toEqual([])
})

test.each(['stale', 'missing', 'matching'] as const)('recovery requires a review of the outgoing text before releasing an unchanged held guide (%s)', review => {
  const main = { held: hold('source'), fit: { ...heldFor('source'), hash: 'old-text' } }
  const r = push('guides', {
    base: main,
    main,
    run: { fit: review === 'missing' ? undefined : { ...clean, hash: review === 'matching' ? defaultHash : 'old-text' } },
  }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.body).toBe(DEFAULT_BODY)
  expect(r.pushed.held).toEqual(review === 'matching' ? undefined : main.held)
})

test('recovery can update a cover without a review when the same text is already live', () => {
  const r = push('guides', {
    base: {},
    main: {},
    run: { extra: { cover: 'Ảnh mới' } },
  }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.cover).toBe('Ảnh mới')
  expect(r.pushed.held).toBeUndefined()
})

test.each(['harm', 'source'])('recovery preserves a hold when the matching review still finds %s', check => {
  const main = { held: hold(check), fit: heldFor(check) }
  const r = push('guides', {
    base: main,
    main,
    run: { fit: main.fit },
  }, { kept: true, mainDidNotMove: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.held?.checks).toEqual([check])
})

test.each(['photos', 'video'])('a recovered %s batch verifies the hold after the sweep rewrites reviewed text', kind => {
  const main = { body: '<p>Bài cũ.</p>', fit: { ...clean, hash: 'old' } }
  const sweepBody = '<p>Đoạn sau khi dọn.</p>'
  const r = push('guides', {
    base: main,
    main,
    run: { fit: clean },
  }, { kept: true, video: kind === 'video' ? 'kept' : undefined, mainDidNotMove: true, sweepBody })
  expect(r.out).toContain('CODE 0')
  expect(r.out).toMatch(/^VERIFY $/m)
  expect(r.pushed.body).toBe(sweepBody)
  expect(r.pushed.held?.checks).toEqual([])
})

test.each(['unread', 'reviewed'] as const)('recovery checks an %s translation made visible by a restored entity', review => {
  const fit = review === 'reviewed' ? clean : undefined
  const r = push('guides', {
    base: { fit },
    main: { fit },
    run: { fit },
  }, { kept: true, mainDidNotMove: true, baseWithoutEntity: true })
  expect(r.out).toContain('CODE 0')
  expect(r.pushed.body).toBe(DEFAULT_BODY)
  expect(r.pushed.held?.checks).toEqual(review === 'unread' ? [] : undefined)
})

test('the older caller restores a hold when the only other change is a part selection', () => {
  const previous = { ...heldFor('source'), at: '2026-11-14' }
  const r = push('species', {
    base: { held: hold('source'), fit: previous },
    main: { held: hold('source'), fit: heldFor('source') },
    run: { fit: previous, files: { 'content/one-voice.json': '{"ca-x":{"diet":false}}\n' } },
  }, { oldCaller: true })
  expect(r.out).toContain('NODE 0')
  expect(r.out).toContain('hold content/species/ca-x/vi.json')
})

test("every push that compares main's holds stops on a comparison that failed", () => {
  for (const s of ['engine-cycle.sh', 'video-cycle.sh', 'cycle-checks.sh']) {
    const calls = readFileSync(join(ROOT, 'scripts', s), 'utf8').split('\n').filter(l => /\bmain_holds "\$(?:run|batch)"/.test(l) && !/^\s*#/.test(l))
    expect(calls.length, s).toBeGreaterThan(0)
    for (const l of calls) {
      expect(l, s).not.toMatch(/\|\| true\b/)
      // 1: main's holds committed, checked again; anything else: not published
      expect(l, s).toMatch(/\|\| (?:\{ )?\[ "?\$\?"? = 1 \] \|\||\|\| case \$\? in 1\)/)
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
  expect(r.out.match(/^VERIFY .*$/gm)).toEqual(['VERIFY clear'])
})

test("a kept push retries its checks when main puts a hold back after the first check", () => {
  const r = push('guides', {
    base: { held: hold('elsewhere'), fit: { at: '2026-11-14', hash: 'old', checks: ['elsewhere', 'source'] } },
    main: { fit: clean },
    run: { held: hold('source'), fit: heldFor('source') },
  }, { kept: true, lostPush: { held: hold('harm'), fit: heldFor('harm') } })
  expect(r.out).toContain('CODE 0')
  expect(r.out.match(/^VERIFY .*$/gm)).toEqual(['VERIFY clear', 'VERIFY harm'])
  expect(r.pushed.held).toEqual(hold('harm'))
})

test.each(['fresh', 'kept'] as const)('a %s video recheck restores main’s hold again on a rejected push and publishes its second guide', video => {
  const stillHeld = { held: hold('harm'), fit: heldFor('harm') }
  const r = push('guides', {
    base: { held: stillHeld.held, fit: { at: '2026-11-14', hash: 'e025', checks: ['harm'] } },
    main: stillHeld,
    run: { fit: clean },
  }, { video, lostPush: stillHeld })
  expect(r.out).toContain('CODE 0')
  expect(r.out.match(/^VERIFY .*$/gm)).toEqual(['VERIFY harm', 'VERIFY harm'])
  expect(r.pushed.held).toEqual(stillHeld.held)
  expect(r.pushedSecondGuide().body).toBe('<p>Đoạn mới.</p>')
})

test.each([
  ['fresh', 'process'],
  ['kept', 'process'],
  ['fresh', 'unreadable'],
  ['kept', 'malformed'],
] as const)('a %s video recheck stays queued when main’s holds cannot be compared (%s)', (video, holdFault) => {
  const stillHeld = { held: hold('harm'), fit: heldFor('harm') }
  const r = push('guides', {
    base: { held: stillHeld.held, fit: { at: '2026-11-14', hash: 'e025', checks: ['harm'] } },
    main: stillHeld,
    run: { fit: clean },
  }, { video, holdFault })
  expect(r.out).toContain('CODE 1')
  expect(r.out).toMatch(/^QUEUED kept\/video-recheck\//m)
  expect(r.out).not.toContain('VERIFY')
  expect(r.pushed.held).toEqual(stillHeld.held)
  expect(r.pushedSecondGuide()).toBeUndefined()
})

test('a video recheck can restore a hold when the base predates its review file', () => {
  const stillHeld = { held: hold('harm'), fit: heldFor('harm') }
  const r = push('guides', {
    base: { held: stillHeld.held },
    main: stillHeld,
    run: { fit: clean },
  }, { video: 'fresh', baseWithoutFit: true })
  expect(r.out).toContain('CODE 0')
  expect(r.out).toContain('VERIFY harm')
  expect(r.pushed.held).toEqual(stillHeld.held)
  expect(r.pushedSecondGuide().body).toBe('<p>Đoạn mới.</p>')
})

test("main-holds.mjs reads the gate's kinds", () => {
  const src = readFileSync(join(ROOT, 'scripts/main-holds.mjs'), 'utf8')
  const kinds = JSON.parse(src.match(/^const GATED_KINDS = (\[.*\])$/m)![1]!.replace(/'/g, '"'))
  expect(kinds).toEqual([...GATED_KINDS])
})

// main-holds.mjs takes a text as read when the fields the gate's read covers are the same (its own `read`). Each field of a
// guide, a fish page, a plant, a breed and a card, as the content has them, changed in turn: fitText's hash moves exactly
// when main-holds.mjs's read of the page does.
test("main-holds.mjs's read fields are the ones the gate's read covers", async () => {
  const root = mkdtempSync(join(tmpdir(), 'aq-read-fields-'))
  await cp(join(ROOT, 'apps/site/test/fixture-content'), join(root, 'content'), { recursive: true })
  // The fixture's fish sources aren't shown on a public build: here they are, so a section is on the page.
  const sourcesFile = join(root, 'content/sources.json')
  const sources = JSON.parse(await readFile(sourcesFile, 'utf8')) as Record<string, { publish: boolean; permission?: object }>
  for (const s of Object.values(sources)) Object.assign(s, { publish: true, permission: { date: '2026-11-08', file: 'test', scope: ['text'] } })
  await writeFile(sourcesFile, JSON.stringify(sources))
  // The other fields a language file has on main, as main has them.
  const more = {
    cover: 'Bể có nắp kiểu cũ vẫn đẹp', chapters: ['Bể xấu cần làm lại'], refs: [{ url: 'https://example.org/a.pdf', title: 'Bảng an toàn' }],
    localNote: { html: '<p>Ghi chú cho bạn đọc ở Việt Nam.</p>', refs: [{ url: 'https://example.org/b', title: 'Nguồn' }] }, redirectFrom: [{ slug: 'cu', name: 'Tên cũ' }],
    bodyFixed: true, faqFixed: true, nameFixed: true, held: { checks: ['source'], at: '2026-11-15' },
    // No guide has sections on main; the field is there, and the gate doesn't read it.
    sections: { 'habitat:aquatome': '<p>Sống ở suối.</p>' },
  }
  // A card, which the fixture hasn't.
  await mkdir(join(root, 'content/cards/the-x'), { recursive: true })
  await writeFile(join(root, 'content/cards/the-x/entity.json'), JSON.stringify({
    id: 'the-x', type: 'event', about: [], sources: [{ url: 'https://example.org/e', title: 'Hội chợ', publisher: 'Báo', date: '2026', accessed: '2026-11-15' }],
    show: { from: '2026-12-02', until: '2026-12-20' }, event: { start: '2026-12-18', end: '2026-12-20', place: 'Kuala Lumpur', country: 'MY', organiser: 'Hội' }, rotate: 7, updatedAt: '2026-11-15',
  }))
  await writeFile(join(root, 'content/cards/the-x/vi.json'), JSON.stringify({ eyebrow: 'Mới', title: 'Cá mới', body: '<p>Cá mới về.</p>' }))
  const files = { guides: 'aquatome-phan-loai-ca-dia', species: 'paracheirodon-innesi', plants: 'cryptocoryne-wendtii', breeds: 'flowerhorn-cichlid', cards: 'the-x' }
  // Words inside the HTML's first element, where a reader reads them.
  const bump = (v: unknown): unknown => {
    if (typeof v === 'string') return v.includes('</') ? v.replace('</', ' x</') : `${v} x`
    if (typeof v === 'number') return v + 1
    if (typeof v === 'boolean') return !v
    if (Array.isArray(v)) return v.length ? [bump(v[0]), ...v.slice(1)] : ['x']
    if (v && typeof v === 'object') { const [k, x] = Object.entries(v)[0]!; return { ...v, [k]: bump(x) } }
    return 'x'
  }
  // Every change loads: one that doesn't is a field this test didn't compare (sol's read of c8902db524).
  const tried: string[] = [], unloaded: string[] = []
  for (const [kind, id] of Object.entries(files)) {
    const file = join(root, 'content', kind, id, 'vi.json')
    const page = { ...JSON.parse(await readFile(file, 'utf8')), ...(kind === 'guides' ? more : kind === 'cards' ? {} : { nameFixed: true, held: more.held, ...(kind === 'breeds' ? { sections: more.sections } : {}) }) }
    // An empty list has no item to change: a question and a summary line, where the page has the fields.
    for (const [k, v] of [['faq', [{ q: 'Cá này ăn gì?', a: 'Ăn tạp.' }]], ['summary', ['Cá dễ nuôi.']]] as const) if (Array.isArray(page[k]) && !page[k].length) page[k] = v
    // The fixture's plants have no sources' references: one, as a fish page has them.
    if (kind === 'plants') page.sections = { ...page.sections, 'references:tropica': '<p>Tropica. 2020. Cryptocoryne wendtii. Tropica Aquarium Plants.</p>' }
    const hash = async (t: Record<string, unknown>) => {
      await writeFile(file, JSON.stringify(t))
      const p = (kind === 'cards' ? await loadCards(join(root, 'content'), ['vi']) : await loadPages(join(root, 'content'), ['vi'])).find(x => x.kind === kind && x.id === id)
      return p && fitText(p).hash
    }
    const before = await hash(page)
    expect(before, `${kind} loads`).toBeTruthy()
    const changes: [string, Record<string, unknown>][] = []
    for (const [k, v] of Object.entries(page)) {
      if (k === 'sections') for (const sec of Object.keys(v as object)) changes.push([`sections.${sec}`, { ...page, sections: { ...(v as object), [sec]: bump((v as Record<string, unknown>)[sec]) } }])
      else changes.push([k, { ...page, [k]: bump(v) }])
    }
    for (const [what, t] of changes) {
      const after = await hash(t).catch(() => undefined)
      if (!after) { unloaded.push(`${kind} ${what}`); continue }
      tried.push(`${kind} ${what}`)
      const isRead = !same(read(page, kind), read(t, kind))
      expect(after !== before, `${kind} ${what}: ${isRead ? 'read' : 'not read'}`).toBe(isRead)
    }
    await writeFile(file, JSON.stringify(page))
  }
  expect(unloaded).toEqual([])
  for (const k of ['name', 'body', 'summary', 'faq', 'localNote', 'cover', 'refs']) expect(tried, k).toContain(`guides ${k}`)
  for (const k of ['eyebrow', 'title', 'body']) expect(tried, k).toContain(`cards ${k}`)
  for (const k of ['species', 'plants']) {
    expect(tried.some(t => new RegExp(`^${k} sections\\.(?!references)`).test(t)), k).toBe(true)
    expect(tried.some(t => new RegExp(`^${k} sections\\.references`).test(t)), `${k} references`).toBe(true)
  }
  for (const k of ['guides', 'breeds']) expect(tried.some(t => t.startsWith(`${k} sections.`)), k).toBe(true)
})
