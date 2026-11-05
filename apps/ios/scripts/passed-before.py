#!/usr/bin/env python3
"""Whether a job of ios.yml already passed on the code it tests, so a run of the same code doesn't hold a Mac for it again.

A job's key: the git trees it tests (apps/ios, protocols and ios.yml) as the run checked them out, the job, the flows it
runs and where (the own Mac or GitHub's). A pull request's run checks out its merge with main, so a change on main that
reaches the app changes the key, and a rebase that only moved docs doesn't. Nothing else is read by the app's build or
its tests: the kit's tests read protocols/, the app's flows the fixtures in apps/ios.

`--mark KEY`: run by a job that passed. Prints `key=KEY/<toolchain>/<run id>` for actions/cache/save, the toolchain the
Xcode build and the simulator runtime's build, so a marker says what it passed on.

`--find`: run by job `changes`. For each job the run has, writes `key_<job>=` (what it marks if it passes) and
`passed_<job>=` (the run it passed in, or empty) to $GITHUB_OUTPUT. A marker counts when this pull request's runs or main's saved it, with
its key, and with the toolchain of the newest marker on that runner: after an Xcode or simulator update, the first job
to pass writes the new one, and the older markers stop counting. Never on the nightly run, a run by hand or a run
started again (its attempt past 1: "Re-run"), which run every job, nor for a fork's pull request: it runs its own copy
of ios.yml, so it could write markers for code it never tested. When GitHub doesn't answer, nothing counts as passed. A job that passed before runs on Linux as a stand-in that says where it passed: a check of the same name
that passed, and no Mac held. Markers are never restored, so GitHub evicts each within 7 days (sooner when the
repository's caches near their 10 GB).

`--test` checks the rules on made-up listings.
"""
import hashlib, json, os, re, subprocess, sys

TREES = ['apps/ios', 'protocols', '.github/workflows/ios.yml']
PREFIX = 'ios-pass'
# Jobs `kit` and `perf` run on GitHub's Macs; the flow jobs where job `changes` sends them.
HOSTED = 'hosted'


def where(runner):
    """`own` for the repository's own Mac (its label `aquatome`), else `hosted`."""
    return 'own' if 'aquatome' in json.loads(runner) else HOSTED


def jobs(env):
    """The run's jobs as (name, where, flows): those its flow outputs give, and `kit` and `perf` once it's ready."""
    if env.get('READY') != 'true':
        return []
    pool = where(env['RUNNER'])
    out = [('kit', HOSTED, 'kit')]
    if env.get('EVENT') != 'schedule':
        out.append(('perf', HOSTED, 'perf'))
    if env.get('APP'):
        out.append(('app', pool, env['APP']))
    for job in ('handbook', 'lights'):
        for half in json.loads(env.get(job.upper()) or '[]'):
            out.append((f'{job}_{half}', pool, env[f'{job.upper()}_{half}']))
    return out


def key(trees, name, pool, flows):
    digest = hashlib.sha256('\n'.join(trees + [name, pool, ' '.join(flows.split())]).encode()).hexdigest()[:20]
    return f'{PREFIX}/{pool}/{name}/{digest}'


def newest_toolchain(markers, pool):
    """The toolchain of the newest marker on `pool`, from markers as (key, created_at)."""
    mine = sorted((m for m in markers if m[0].startswith(f'{PREFIX}/{pool}/') and len(m[0].split('/')) == 6),
                  key=lambda m: m[1])
    return mine[-1][0].split('/')[4] if mine else None


def passed(markers, toolchains, k):
    """The run a marker of key `k` passed in, on its runner's newest toolchain, or ''."""
    pool = k.split('/')[1]
    runs = [m[0].split('/') for m in sorted(markers, key=lambda m: m[1]) if m[0].startswith(k + '/')]
    runs = [r[5] for r in runs if len(r) == 6 and r[4] == toolchains.get(pool)]
    return runs[-1] if runs else ''


def find(env, trees, listing, newest, warn=print):
    """`key_<job>` and `passed_<job>` for each job. `listing(ref)` gives a ref's markers; `newest(pool)` the newest
    marker on a runner, any ref's."""
    out = {}
    js = jobs(env)
    skip = (env.get('EVENT') in ('schedule', 'workflow_dispatch') or int(env.get('ATTEMPT') or 1) > 1
            or env.get('FORK') == 'true')
    markers, toolchains = [], {}
    if not skip:
        try:
            markers = listing(env['REF']) + (listing('refs/heads/main') if env['REF'] != 'refs/heads/main' else [])
            toolchains = {p: newest(p) for p in {j[1] for j in js}}
        except Exception as e:  # noqa: BLE001 — GitHub's API down or refusing: run every job
            warn(f'::warning title=Passed before::markers not read, every job runs ({e})')
            skip = True
    for name, pool, flows in js:
        k = key(trees, name, pool, flows)
        out[f'key_{name}'] = k
        out[f'passed_{name}'] = '' if skip else passed(markers, toolchains, k)
    return out


def gh_markers(params):
    out, page = [], 1
    while True:
        r = subprocess.run(['gh', 'api', f"repos/{os.environ['GITHUB_REPOSITORY']}/actions/caches?"
                            f'{params}&per_page=100&page={page}'], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stderr.strip()[:200])
        r = json.loads(r.stdout)
        out += [(c['key'], c['created_at']) for c in r['actions_caches']]
        if len(r['actions_caches']) < 100 or page == 10:
            return out
        page += 1


def toolchain():
    """The Xcode build and the build of the simulator runtime this job tests on: the own Mac's simulator, else the iOS
    version its destination names."""
    xcode = re.search(r'Build version (\S+)', subprocess.run(['xcodebuild', '-version'], capture_output=True,
                                                             text=True, check=True).stdout).group(1)
    sims = json.loads(subprocess.run(['xcrun', 'simctl', 'list', '-j'], capture_output=True, text=True,
                                     check=True).stdout)
    udid, runtime = os.environ.get('AQ_CI_UDID'), None
    for rt, devices in sims['devices'].items():
        if udid and any(d['udid'] == udid for d in devices):
            runtime = rt
    if not runtime:
        version = re.search(r'OS=([\d.]+)', os.environ.get('AQ_CI_DEST') or 'OS=26.5').group(1)
        runtime = next(r['identifier'] for r in sims['runtimes'] if r['platform'] == 'iOS' and r['version'] == version)
    build = next(r['buildversion'] for r in sims['runtimes'] if r['identifier'] == runtime)
    return f'{xcode}-{build}'


def test():
    env = {'READY': 'true', 'EVENT': 'pull_request', 'REF': 'refs/pull/7/merge',
           'RUNNER': '["self-hosted","macOS","aquatome"]', 'APP': '-only-testing:AquaTomeUITests/TanksFlowTests',
           'HANDBOOK': '[2]', 'HANDBOOK_2': '-only-testing:AquaTomeUITests/OfflineFlowTests', 'LIGHTS': '[]'}
    trees = ['a1', 'b2', 'c3']
    assert [j[:2] for j in jobs(env)] == [('kit', HOSTED), ('perf', HOSTED), ('app', 'own'), ('handbook_2', 'own')]
    assert jobs(dict(env, READY='false')) == []
    assert [j[0] for j in jobs(dict(env, EVENT='schedule'))] == ['kit', 'app', 'handbook_2']
    assert where('"macos-26"') == HOSTED
    app = key(trees, 'app', 'own', env['APP'])
    # The key changes with the trees, the flows, the job and the runner, not with spaces in the flows.
    assert app != key(['a1', 'b2', 'c4'], 'app', 'own', env['APP'])
    assert app != key(trees, 'app', 'own', env['APP'] + ' -only-testing:AquaTomeUITests/PlugFlowTests')
    assert app != key(trees, 'app', HOSTED, env['APP']) != key(trees, 'kit', 'own', env['APP'])
    assert app == key(trees, 'app', 'own', '  ' + env['APP'] + ' ')
    t = 'T2'
    lists = {'refs/pull/7/merge': [(f'{app}/T1/100', '2026-11-04T01'), (f'{app}/{t}/101', '2026-11-05T01')],
             'refs/heads/main': [], 'refs/pull/8/merge': []}
    newest = {'own': f'{PREFIX}/own/kit/x/{t}/120', HOSTED: None}
    got = find(env, trees, lambda r: lists[r], lambda p: newest_toolchain([(newest[p], 'z')] if newest[p] else [], p))
    # Passed in run 101 on the newest toolchain; nothing for the others, which still get their keys.
    assert got['passed_app'] == '101' and got['key_app'] == app, got
    assert got['passed_kit'] == got['passed_perf'] == got['passed_handbook_2'] == '', got
    assert set(got) == {f'{p}_{j}' for p in ('key', 'passed') for j in ('kit', 'perf', 'app', 'handbook_2')}
    # Only on the toolchain the runner has now: a marker from before an update doesn't count.
    lists['refs/pull/7/merge'] = [(f'{app}/T1/100', '2026-11-04T01')]
    assert find(env, trees, lambda r: lists[r], lambda p: 'T2' if p == 'own' else None)['passed_app'] == ''
    # Main's markers count for a pull request; another pull request's aren't asked for.
    lists['refs/heads/main'] = [(f'{app}/T2/90', '2026-11-03T01')]
    assert find(env, trees, lambda r: lists[r], lambda p: 'T2')['passed_app'] == '90'
    asked = []
    find(env, trees, lambda r: asked.append(r) or [], lambda p: 'T2')
    assert asked == ['refs/pull/7/merge', 'refs/heads/main'], asked
    # The newest of several counts.
    lists['refs/pull/7/merge'] = [(f'{app}/T2/103', '2026-11-05T03'), (f'{app}/T2/102', '2026-11-05T02')]
    assert find(env, trees, lambda r: lists[r], lambda p: 'T2')['passed_app'] == '103'
    # The nightly run, a run by hand and a run started again run everything, and ask for nothing.
    for again in ({'EVENT': 'schedule'}, {'EVENT': 'workflow_dispatch'}, {'ATTEMPT': '2'}):
        got = find(dict(env, **again), trees, lambda r: 1 / 0, lambda p: 1 / 0)
        assert not any(v for k, v in got.items() if k.startswith('passed_')) and got['key_app'], got
    assert find(dict(env, ATTEMPT='1'), trees, lambda r: lists[r], lambda p: 'T2')['passed_app']
    # A fork's pull request asks for nothing: it could have written its own markers.
    got = find(dict(env, FORK='true'), trees, lambda r: 1 / 0, lambda p: 1 / 0)
    assert not any(v for k, v in got.items() if k.startswith('passed_')) and got['key_app'], got
    # GitHub not answering: nothing counts, every job runs.
    def down(_):
        raise RuntimeError('HTTP 502')
    got = find(env, trees, down, lambda p: 'T2', warn=lambda m: None)
    assert not any(v for k, v in got.items() if k.startswith('passed_')) and got['key_app'], got
    assert find(env, trees, lambda r: lists[r], down, warn=lambda m: None)['passed_app'] == ''
    # Another key's marker, or one cut short, doesn't count.
    lists['refs/pull/7/merge'] = [(f'{app}x/T2/104', 'z'), (f'{app}/T2', 'z')]
    assert find(env, trees, lambda r: lists[r], lambda p: 'T2')['passed_app'] == '90'
    assert newest_toolchain([(f'{PREFIX}/own/a/k/T1/1', '1'), (f'{PREFIX}/own/b/k/T3/2', '2'),
                             (f'{PREFIX}/{HOSTED}/a/k/T9/3', '3')], 'own') == 'T3'
    # A malformed marker, newest or not, is passed over (any ref's are read for the toolchain).
    assert newest_toolchain([(f'{PREFIX}/own/a/k/T1/1', '1'), (f'{PREFIX}/own/x', '9')], 'own') == 'T1'
    assert newest_toolchain([(f'{PREFIX}/own/x', '9')], 'own') is None


if __name__ == '__main__':
    if sys.argv[1:] == ['--test']:
        test()
    elif sys.argv[1:2] == ['--mark'] and len(sys.argv) == 3:
        print(f"key={sys.argv[2]}/{toolchain()}/{os.environ['GITHUB_RUN_ID']}")
    elif sys.argv[1:] == ['--find']:
        env = dict(os.environ)
        trees = subprocess.run(['git', 'rev-parse'] + [f'HEAD:{t}' for t in TREES], capture_output=True, text=True,
                               check=True).stdout.split()
        got = find(env, trees, lambda ref: gh_markers(f'key={PREFIX}/&ref={ref}'),
                   lambda pool: newest_toolchain(gh_markers(f'key={PREFIX}/{pool}/&sort=created_at&direction=desc'),
                                                 pool))
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.writelines(f'{k}={v}\n' for k, v in got.items())
        for k, v in got.items():
            print(f'{k}={v}')
            if k.startswith('passed_') and v:
                print(f"::notice title=Passed before::{k[7:]} passed on this code in run "
                      f"{os.environ['GITHUB_SERVER_URL']}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{v}")
    else:
        sys.exit(__doc__)
