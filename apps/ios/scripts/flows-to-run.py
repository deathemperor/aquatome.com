#!/usr/bin/env python3
"""Which of the long flow jobs a pull request runs (ios.yml): the handbook's and the lights' run when its change can
reach them; job `app` always runs, and main runs everything. Reads the changed paths on stdin, one a line, and
HANDBOOK_FLOWS from the environment; prints `handbook=true|false` and `lights=true|false` for $GITHUB_OUTPUT.
`--test` checks the rules below on a few changes and prints nothing.

A path reaches the lights' flows alone, the handbook's alone, neither (it's outside the app, or only read by `kit` or
`app`), or both: anything not listed, such as the tanks tab (where accounts, plugs, lights and the tank-mates check all
show), the app's start, the project, or these workflows. A UI test file runs in one job only. The string catalog holds
the Indonesian and Thai text only (the Vietnamese the flows read is in the code), so it reaches no flow."""
import os, re, sys

KIT = 'apps/ios/AquaTomeKit/Sources/'
TESTS = 'apps/ios/AquaTomeUITests/'
LIGHTS = ('apps/ios/AquaTome/Lights/', KIT + 'Chihiros/', KIT + 'ChihirosBLE/', KIT + 'light-harness/')
HANDBOOK = ('apps/ios/AquaTome/Handbook/', KIT + 'Handbook/')
NEITHER = ('protocols/', 'apps/ios/AquaTomeKit/Tests/', 'apps/ios/README.md', 'apps/ios/perf-budgets.json',
           'apps/ios/AquaTome/Localizable.xcstrings', 'apps/ios/scripts/check-perf.py',
           'apps/ios/scripts/check-strings.py', 'apps/ios/scripts/asc-build-state.mjs')


def pick(paths, handbook_flows):
    run = {'handbook': False, 'lights': False}
    for p in paths:
        if not p.startswith('apps/ios/') and p != '.github/workflows/ios.yml':
            continue
        test = re.fullmatch(re.escape(TESTS) + r'(\w+)\.swift', p)
        if test:
            name = test.group(1)
            if name == 'LightFlowTests':
                run['lights'] = True
            elif name in handbook_flows:
                run['handbook'] = True
        elif p.startswith(LIGHTS):
            run['lights'] = True
        elif p.startswith(HANDBOOK):
            run['handbook'] = True
        elif not p.startswith(NEITHER):
            run = {'handbook': True, 'lights': True}
    return run


def test():
    flows = {'HandbookFlowTests', 'TankLifeFlowTests'}
    cases = [
        (['apps/ios/AquaTome/Handbook/HomeView.swift', KIT + 'Handbook/Blocks.swift'], (True, False)),
        (['apps/ios/AquaTome/Lights/LightsView.swift', KIT + 'ChihirosBLE/Link.swift'], (False, True)),
        ([TESTS + 'TankLifeFlowTests.swift'], (True, False)),
        ([TESTS + 'LightFlowTests.swift'], (False, True)),
        ([TESTS + 'AccountFlowTests.swift', 'protocols/tanks-vectors.json', 'apps/ios/perf-budgets.json',
          'apps/ios/AquaTome/Localizable.xcstrings', 'apps/ios/AquaTomeKit/Tests/TanksTests/StoreTests.swift'],
         (False, False)),
        (['apps/ios/AquaTome/Handbook/HomeView.swift', 'apps/ios/AquaTome/Tanks/TanksView.swift'], (True, True)),
        (['apps/ios/AquaTome/Account/AccountSection.swift'], (True, True)),
        (['.github/workflows/ios.yml'], (True, True)),
        (['docs/governance.md', 'apps/site/src/pages/vi/index.astro', '.github/workflows/ci.yml',
          'apps/ios/AquaTome/Handbook/HomeView.swift'], (True, False)),
        (['apps/ios/scripts/wait-for-simulator.sh'], (True, True)),
        (['apps/ios/AquaTome.xcodeproj/project.pbxproj'], (True, True)),
    ]
    for paths, want in cases:
        got = pick(paths, flows)
        assert (got['handbook'], got['lights']) == want, (paths, got)


if __name__ == '__main__':
    if sys.argv[1:] == ['--test']:
        test()
    else:
        run = pick([l.strip() for l in sys.stdin if l.strip()], set(os.environ['HANDBOOK_FLOWS'].split()))
        for job, yes in run.items():
            print(f'{job}={str(yes).lower()}')
