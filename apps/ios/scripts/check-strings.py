#!/usr/bin/env python3
"""Every string the app shows has an Indonesian and a Thai translation, with the same placeholders.

Usage: check-strings.py DERIVED_DATA. Reads the keys the compiler extracted from the app's Swift files (*.stringsdata,
written by SWIFT_EMIT_LOC_STRINGS during a build) and checks them against AquaTome/Localizable.xcstrings. Vietnamese is
the source language. Fails on a key with no translation, a translation whose placeholders differ from the key's, or a
catalog entry no code uses any more.
"""
import glob, json, os, re, sys

LANGS = ('id', 'th')
here = os.path.dirname(os.path.abspath(__file__))
catalog = json.load(open(os.path.join(here, '..', 'AquaTome', 'Localizable.xcstrings')))['strings']

keys = set()
for f in glob.glob(os.path.join(sys.argv[1], '**', 'AquaTome.build', '**', '*.stringsdata'), recursive=True):
    for table, entries in json.load(open(f)).get('tables', {}).items():
        if table == 'Localizable':
            keys |= {e['key'] for e in entries}
if not keys:
    sys.exit('no extracted strings found: build the app first (SWIFT_EMIT_LOC_STRINGS)')

def placeholders(s):
    # %@, %lld, %1$@ … in order of argument, ignoring %%.
    found = re.findall(r'%(?:(\d+)\$)?(@|lld|ld|d|f)', s.replace('%%', ''))
    return sorted((int(n) if n else i + 1, t) for i, (n, t) in enumerate(found))

problems = []
for k in sorted(keys):
    entry = catalog.get(k)
    if entry is None:
        problems.append(f'not in the catalog: {k!r}')
        continue
    for lang in LANGS:
        unit = entry.get('localizations', {}).get(lang, {}).get('stringUnit', {})
        if unit.get('state') != 'translated' or not unit.get('value'):
            problems.append(f'no {lang} translation: {k!r}')
        elif placeholders(unit['value']) != placeholders(k):
            problems.append(f'{lang} placeholders differ: {k!r} → {unit["value"]!r}')
for k in sorted(set(catalog) - keys):
    problems.append(f'in the catalog but not in the code: {k!r}')

print('\n'.join(problems) if problems else f'{len(keys)} strings, all translated ({", ".join(LANGS)})')
sys.exit(1 if problems else 0)
