#!/usr/bin/env python3
"""The pages' screenshots for a pull request's before and after (docs/governance.md): each screenshot PageShotsFlowTests
keeps (named `shot-…`) out of a result bundle, as `<name>.png`, the last try's when a test ran again. Usage:
shots.py RESULT_BUNDLE OUT_DIR (no bundle: nothing to export)."""
import json, os, re, shutil, subprocess, sys, tempfile

bundle, out = sys.argv[1], sys.argv[2]
if not os.path.isdir(bundle):
    sys.exit(0)
with tempfile.TemporaryDirectory() as raw:
    subprocess.run(['xcrun', 'xcresulttool', 'export', 'attachments', '--path', bundle, '--output-path', raw], check=True)
    with open(os.path.join(raw, 'manifest.json')) as f:
        tests = json.load(f)
    best = {}
    for t in tests:
        if not t['testIdentifier'].startswith('PageShotsFlowTests/'):
            continue
        for a in t['attachments']:
            # The name given in the test, then `_<n>_<UUID>.png`.
            m = re.match(r'(shot-[\w-]+?)(?:_\d+_[0-9A-F-]+)?(?:\.png)?$', a['suggestedHumanReadableName'])
            if m and a.get('repetitionNumber', 1) >= best.get(m.group(1), (0, ''))[0]:
                best[m.group(1)] = (a.get('repetitionNumber', 1), a['exportedFileName'])
    os.makedirs(out, exist_ok=True)
    for name, (_, file) in sorted(best.items()):
        shutil.copy(os.path.join(raw, file), os.path.join(out, name[len('shot-'):] + '.png'))
    print(f'{len(best)} screenshots in {out}')
