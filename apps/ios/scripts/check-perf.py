#!/usr/bin/env python3
"""The app's performance budgets (apps/ios/perf-budgets.json), checked after the performance tests run.

Usage:
  check-perf.py RESULT.xcresult APP_BUNDLE      each measurement's median, and the app's size, within its budget
  check-perf.py --tightens-only OLD.json        no budget in perf-budgets.json looser than in OLD.json without a new
                                                reason (governance, Mobile apps rule 5)

Medians, not averages: a CI runner that stalls for one of the five runs shouldn't fail the check. A budgeted metric
the result doesn't have, or reads as 0, fails too (the test didn't run, Xcode renamed the metric, or the machine has
no such counter): a budget never checks nothing.
"""
import json, os, subprocess, sys
from statistics import median

here = os.path.dirname(os.path.abspath(__file__))
BUDGETS = os.path.join(here, '..', 'perf-budgets.json')


def budgets(path=BUDGETS):
    return {(b['test'], b['metric']): b for b in json.load(open(path))['budgets']}


def app_size_kb(app):
    """Bytes of every file in the bundle, in kB: the same number on any machine (du counts disk blocks)."""
    total = 0
    for root, _, files in os.walk(app):
        for f in files:
            p = os.path.join(root, f)
            if not os.path.islink(p):
                total += os.path.getsize(p)
    return total / 1000


def measured(xcresult):
    out = subprocess.run(['xcrun', 'xcresulttool', 'get', 'test-results', 'metrics', '--path', xcresult],
                         check=True, capture_output=True, text=True).stdout
    found = {}
    for test in json.loads(out):
        for run in test.get('testRuns', []):
            for m in run.get('metrics', []):
                found[(test['testIdentifier'], m['identifier'])] = m['measurements']
    return found


def check(values, app):
    rows, failed = [], False
    for key, b in budgets().items():
        if b['test'] == 'bundle':
            value = app_size_kb(app)
        elif key in values and median(values[key]) > 0:
            value = median(values[key])
        else:
            # Missing, or 0: a counter the machine doesn't have (CPU instructions read 0 on the hosted runners' VMs).
            rows.append((b['name'], 'not measured', b['max'], b['unit'], '✘'))
            failed = True
            continue
        over = value > b['max']
        failed |= over
        rows.append((b['name'], f'{value:.3f}'.rstrip('0').rstrip('.'), b['max'], b['unit'], '✘' if over else '✔'))
    table = ['| | measured | budget | |', '|---|---|---|---|'] + [f'| {n} | {v}{" " + u if v != "not measured" else ""} | {m} {u} | {ok} |' for n, v, m, u, ok in rows]
    print('\n'.join(table))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write('### App performance budgets\n\n' + '\n'.join(table) + '\n')
    if failed:
        sys.exit('over budget, or a budgeted measurement is missing: fix the app, not the budget (governance, Mobile apps rule 5)')


def tightens_only(old_path):
    old, new = budgets(old_path), budgets()
    loosened = [b['name'] for k, b in new.items()
                if k in old and b['max'] > old[k]['max'] and b.get('reason') == old[k].get('reason')]
    dropped = [b['name'] for k, b in old.items() if k not in new]
    if loosened or dropped:
        sys.exit(f'budgets loosened without a new reason: {loosened}; budgets removed: {dropped}. '
                 'A budget only tightens; one raised says why in its "reason" (governance, Mobile apps rule 5).')
    print(f'{len(new)} budgets, none looser than before without a reason')


if __name__ == '__main__':
    if sys.argv[1:2] == ['--tightens-only']:
        tightens_only(sys.argv[2])
    else:
        check(measured(sys.argv[1]), sys.argv[2])
