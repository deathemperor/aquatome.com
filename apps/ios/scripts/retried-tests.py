#!/usr/bin/env python3
"""Flaky tests are seen, not hidden: each UI test that passed only on its retry is a warning on the run and a line in
its summary. So is a job whose tests took longer than flows-to-run.py's line (LINE_SECONDS), which its lists' times
can't see (a flow that grew slower, not longer): main's full run on 789ca5218 had two jobs stopped at GitHub's 120
minutes with nothing said before. Usage: retried-tests.py RESULT_BUNDLE (none there: nothing to say)."""
import json, os, subprocess, sys

if not os.path.isdir(sys.argv[1]):
    sys.exit(0)
tests = json.loads(subprocess.run(['xcrun', 'xcresulttool', 'get', 'test-results', 'tests', '--path', sys.argv[1]],
                                  check=True, capture_output=True, text=True).stdout)

def walk(n, path):
    runs = [c for c in n.get('children', []) if c.get('nodeType') == 'Repetition']
    if n.get('nodeType') == 'Test Case' and n.get('result') == 'Passed' and any(r.get('result') == 'Failed' for r in runs):
        name = '/'.join(path + [n['name']])
        print(f'::warning title=Passed only on a retry::{name}')
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write(f'- passed only on a retry: `{name}`\n')
    for c in n.get('children', []):
        walk(c, path + ([n['name']] if n.get('nodeType') == 'Test Suite' else []))

for t in tests['testNodes']:
    walk(t, [])

def cases(nodes):
    return [m for n in nodes for m in ([n] if n.get('nodeType') == 'Test Case' else cases(n.get('children', [])))]

# 4,500 s: LINE_SECONDS in flows-to-run.py, whose --test fails a plan past it.
took = sum(n.get('durationInSeconds', 0) for n in cases(tests['testNodes']))
if took > 4500:
    print(f"::warning title=Past the line::this job's tests took {took / 60:.0f} minutes, past the 75 that flows-to-run.py "
          f"plans a job for (about 85 with the build; GitHub stops a job at 120). TEST_SECONDS in flow_lists.py wants "
          f"this run's times, or PARTS a job more")
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
        f.write(f'- tests took {took / 60:.0f} minutes, past the line of 75\n')
