#!/usr/bin/env python3
"""Flaky tests are seen, not hidden: each UI test that passed only on its retry is a warning on the run and a line in
its summary. Usage: retried-tests.py RESULT_BUNDLE (none there: nothing to say)."""
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
