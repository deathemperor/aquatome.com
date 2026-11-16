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
type Side = { held?: Held; body?: string; fit?: { at: string; hash: string; checks: string[] } }

const KINDS = { guides: { dir: 'content/guides/youtube-x', key: 'vi/guides/youtube-x' }, species: { dir: 'content/species/ca-x', key: 'vi/species/ca-x' } }

function push(kind: keyof typeof KINDS, sides: { base: Side; main: Side; run: Side }, o: { mainOther?: boolean; kept?: boolean; catchUp?: boolean } = {}) {
  const { dir: pageDir, key } = KINDS[kind]
  const file = `${pageDir}/vi.json`
  const dir = mkdtempSync(join(tmpdir(), 'aq-push-hold-'))
  const page = (s: Side) =>
    `${JSON.stringify({ slug: 'ho-ca', name: 'Hồ cá', body: s.body ?? '<p>Cá con quen người.</p>', ...(s.held ? { held: s.held } : {}) }, null, 2)}\n`
  const fit = (s: Side) =>
    `${JSON.stringify(s.fit ? { [key]: { at: s.fit.at, hash: s.fit.hash, model: 'opus', checklist: 3, findings: s.fit.checks.map(check => ({ check, part: 'P2', quote: 'Cá con quen người.', why: 'w', by: 'model' })), products: [] } } : {}, null, 2)}\n`
  const write = (files: Record<string, string>) =>
    Object.entries(files).map(([f, t]) => `mkdir -p "$(dirname ${f})" && printf '%s' '${t.replace(/'/g, `'\\''`)}' > ${f} && git add ${f}`).join(' && ')
  const both = (s: Side) => write({ [file]: page(s), 'engine-state/_fit.json': fit(s) })
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
    net() { "$@"; }
    replan_merged() { :; }
    sweep_merged() { :; }
    verify_cycle() { echo VERIFY; }
    swept_pull() { :; }
    keep_unpublished() { echo "KEPT"; }
    sleep() { :; }
    ended_row() { :; }
    ${pushFn}
    ${o.kept ? 'git branch kept/photos/20261116T000000 && push_kept kept/photos/20261116T000000' : o.catchUp ? 'catch_up' : 'push'}
    echo "CODE $?"
    git log --format='COMMIT %s' -3`
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' })
  expect(r.stderr).not.toMatch(/fatal/i)
  const read = (f: string) => JSON.parse(readFileSync(join(dir, 'cycle', f), 'utf8'))
  const pushed = (f: string) => JSON.parse(spawnSync('git', ['-C', join(dir, 'origin.git'), 'show', `main:${f}`], { encoding: 'utf8' }).stdout)
  return { out: r.stdout, page: read(file), record: read('engine-state/_fit.json')[key], pushed: pushed(file) }
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
  expect(readFileSync(join(ROOT, 'scripts/cycle-checks.sh'), 'utf8')).toMatch(/head=\$\(git rev-parse HEAD\)\n\s*\[ -z "\$BRANCH" \] \|\| main_pages "\$BRANCH"\n\s*main_holds "\$run" origin\/main \|\| true\n\s*\[ "\$\(git rev-parse HEAD\)" = "\$head" \] \|\| check=1/)
})

test("main-holds.mjs reads the gate's kinds", () => {
  const src = readFileSync(join(ROOT, 'scripts/main-holds.mjs'), 'utf8')
  const kinds = JSON.parse(src.match(/^const GATED_KINDS = (\[.*\])$/m)![1]!.replace(/'/g, '"'))
  expect(kinds).toEqual([...GATED_KINDS])
})
