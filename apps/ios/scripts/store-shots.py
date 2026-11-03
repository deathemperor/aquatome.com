#!/usr/bin/env python3
"""The App Store's screenshots out of a result bundle of StoreShotsFlowTests (named `store-<lang>-<nn>-<screen>`), as
OUT_DIR/<lang>/<nn>-<screen>.png, the last try's when a test ran again: the layout apps/ios/scripts/asc-listing.mjs
uploads from, one OUT_DIR per screenshot set. Fails unless each of listing.json's languages has all six screens (what
it found is copied all the same). Usage: store-shots.py RESULT_BUNDLE OUT_DIR."""
import json, os, re, shutil, subprocess, sys, tempfile

SCREENS = 6  # StoreShotsFlowTests' screens in each language
LISTING = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'store', 'listing.json')

bundle, out = sys.argv[1], sys.argv[2]
with tempfile.TemporaryDirectory() as raw:
    subprocess.run(['xcrun', 'xcresulttool', 'export', 'attachments', '--path', bundle, '--output-path', raw], check=True)
    with open(os.path.join(raw, 'manifest.json')) as f:
        tests = json.load(f)
    best = {}
    for t in tests:
        if not t['testIdentifier'].startswith('StoreShotsFlowTests/'):
            continue
        for a in t['attachments']:
            # The name given in the test, then `_<n>_<UUID>.png`.
            m = re.match(r'store-([a-z]{2})-(\d\d-[\w-]+?)(?:_\d+_[0-9A-F-]+)?(?:\.png)?$', a['suggestedHumanReadableName'])
            key = m and (m.group(1), m.group(2))
            if m and a.get('repetitionNumber', 1) >= best.get(key, (0, ''))[0]:
                best[key] = (a.get('repetitionNumber', 1), a['exportedFileName'])
    for (lang, name), (_, file) in sorted(best.items()):
        os.makedirs(os.path.join(out, lang), exist_ok=True)
        shutil.copy(os.path.join(raw, file), os.path.join(out, lang, name + '.png'))
    print(f'{len(best)} screenshots in {out}')
with open(LISTING) as f:
    langs = json.load(f)['locales']
short = {lang: SCREENS - sum(1 for l, _ in best if l == lang) for lang in langs}
if any(short.values()):
    sys.exit('missing: ' + ', '.join(f'{n} of {lang}' for lang, n in short.items() if n))
