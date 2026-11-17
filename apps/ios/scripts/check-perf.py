#!/usr/bin/env python3
"""The app's performance budgets (apps/ios/perf-budgets.json), checked after the performance tests run.

Usage:
  check-perf.py RESULT.xcresult APP_BUNDLE      each measurement's median, and the app's size, within its budget
  check-perf.py --tightens-only OLD.json        no budget in perf-budgets.json looser than in OLD.json without a new
                                                reason (governance, Mobile apps rule 5)

Medians, not averages: a CI runner that stalls for one of the five runs shouldn't fail the check. A budgeted metric
the result doesn't have, or reads as 0, fails too (the test didn't run, Xcode renamed the metric, or the machine has
no such counter): a budget never checks nothing. A "signed" budget's metric is a change, which reads 0 or below when
memory is let go: missing still fails, 0 doesn't.

The fling's peak memory sits on one of two levels, 6–10 MB apart: the app's memory steps up once at a time that varies.
The test flings once more before measuring (XCTest's own unrecorded pass makes it two), to try to bring the step first.
A run whose peak still lands below it is said under the table, since its peak can hide up to the step's size of growth.
The note can't tell a low run carrying 3–6 MB of growth from a high run: that waits for the step to be found.
"""
import json, os, subprocess, sys
from statistics import median

here = os.path.dirname(os.path.abspath(__file__))
BUDGETS = os.path.join(here, '..', 'perf-budgets.json')
# The fling's peak, and the line between its two levels: its budget less 6.5 MB, about the step's smallest. Below it the
# app's one-time step hasn't come (GitHub's runs of 12–17 Nov: 71.2–73.9 MB below the step, 80.1–84.4 MB above it; the
# budget 83,000 kB puts the line at 76,500).
FLING_PEAK = ('PerformanceTests/testFlingingThroughTheFish()', 'com.apple.dt.XCTMetric_Memory-com.aquatome.app.physical_peak')
STEP_KB = 6500


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
        elif key in values and (median(values[key]) > 0 or b.get('signed')):
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
    peak, peak_budget = values.get(FLING_PEAK), budgets().get(FLING_PEAK)
    if peak and median(peak) > 0 and peak_budget and median(peak) < peak_budget['max'] - STEP_KB:
        line = peak_budget['max'] - STEP_KB
        table += ['', f'The fling\'s peak landed below the step ({median(peak):,.0f} kB, under {line:,} kB): the warm-up fling '
                      'didn\'t take it there, and up to the step\'s 6–10 MB of growth would pass its budget unseen.']
    print('\n'.join(table))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write('### App performance budgets\n\n' + '\n'.join(table) + '\n')
    if failed:
        sys.exit('over budget, or a budgeted measurement is missing: fix the app, not the budget (governance, Mobile apps rule 5)')


def tightens_only(old_path):
    old, new = budgets(old_path), budgets()
    # A budget raised, or newly "signed" (0 or below then passes), is looser.
    loosened = [b['name'] for k, b in new.items()
                if k in old and (b['max'] > old[k]['max'] or (b.get('signed') and not old[k].get('signed')))
                and b.get('reason') == old[k].get('reason')]
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
