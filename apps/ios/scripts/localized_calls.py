#!/usr/bin/env python3
"""The app's `String(localized:)` and `AttributedString(localized:)` calls, read from its Swift files.

A call looks its words up in the language iOS opened the app in, whatever language the reader picks while it runs; one
given `bundle: .app` (the picked language's .lproj, AppLanguageNow) looks them up in the language picked. So every call
in the app's sources passes `bundle:`, and check-strings.py fails a change with one that doesn't, naming its file:line.

  localized_calls.py [REF]      counts them (in the working tree, or at a git ref): how many, which already pass `bundle:` or `table:`, which span lines, which
                                take a LocalizedStringResource (no `bundle:` there: its locale picks the language)
  localized_calls.py --apply    adds `bundle: .app` to each string-literal call without one, in the argument order Swift
                                wants (after the key and `table:`, before `locale:` and `comment:`), and lists any it
                                can't make
  localized_calls.py --missing  the calls without `bundle:`, file:line (what check-strings.py fails on)
  localized_calls.py --self-test the check fails on a bad line, and the edit makes it pass
"""
import os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '..', 'AquaTome')
# A line break or spaces before `localized:` too (Codex, 21 Nov: `String(\n localized: "Đèn")` went unseen).
CALL = re.compile(r'\b(Attributed)?String\(\s*localized:')
# A type's or a file's constant: made once, at its first reading.
DECL = re.compile(r'^(\s*)(?:@MainActor\s+)?(?:(?:private|fileprivate|public|internal)\s+)?(?:nonisolated\s+)?(static\s+let|let)\s+\w+')
# Labels after the key, in the order the initializers take them.
ORDER = ('defaultValue', 'options', 'table', 'bundle', 'locale', 'comment', 'including')
# Files the edit and the check leave alone, each with why. Take a line out when its file is ready: --apply then edits it.
LEFT = {}


def skip_string(src, i):
    """Index just past the string literal starting at src[i] (`"`, `\"\"\"`, or `#"`…`"#`), interpolations included."""
    hashes = 0
    while src[i] == '#':
        hashes += 1
        i += 1
    triple = src.startswith('"""', i)
    quote = '"""' if triple else '"'
    i += len(quote)
    close = quote + '#' * hashes
    escape = '\\' + '#' * hashes
    while i < len(src):
        if src.startswith(escape, i):
            j = i + len(escape)
            if j < len(src) and src[j] == '(':
                i = skip_parens(src, j)  # an interpolation: code, with its own strings
                continue
            i = j + 1
            continue
        if src.startswith(close, i):
            return i + len(close)
        i += 1
    raise ValueError('unterminated string')


def skip_parens(src, i):
    """Index just past the parenthesis group that opens at src[i]."""
    depth = 0
    while i < len(src):
        c = src[i]
        if c == '"' or (c == '#' and re.match(r'#+"', src[i:])):
            i = skip_string(src, i)
            continue
        if src.startswith('//', i):
            i = src.index('\n', i)
            continue
        if src.startswith('/*', i):
            i = src.index('*/', i) + 2
            continue
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise ValueError('unbalanced parentheses')


def top_level_args(src, open_paren, close_paren):
    """The call's arguments at its own level: (label or None, start, end) each, end exclusive."""
    args, start, i, depth = [], open_paren + 1, open_paren + 1, 0
    while i < close_paren:
        c = src[i]
        if c == '"' or (c == '#' and re.match(r'#+"', src[i:])):
            i = skip_string(src, i)
            continue
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
        elif c == ',' and depth == 0:
            args.append((start, i))
            start = i + 1
        i += 1
    args.append((start, close_paren))
    out = []
    for s, e in args:
        m = re.match(r'\s*(\w+)\s*:', src[s:e])
        out.append((m.group(1) if m else None, s, e))
    return out


def in_comment(src, i):
    line_start = src.rfind('\n', 0, i) + 1
    before = src[line_start:i]
    return '//' in before.split('"')[0] or before.lstrip().startswith('*') or before.lstrip().startswith('///')


def read(path, ref=None):
    if ref is None:
        return open(path, encoding='utf-8').read()
    return subprocess.run(['git', 'show', f'{ref}:./{os.path.relpath(path, APP)}'], cwd=APP, capture_output=True, text=True,
                          check=True).stdout


def calls(path, ref=None):
    return calls_in(read(path, ref))


def calls_in(src):
    """Each call in Swift source: its line, whether it's an AttributedString, its argument labels, whether its key is a
    string literal (else the key's text), whether it spans lines, and where `bundle: .app` would go (an index into the
    source)."""
    for m in CALL.finditer(src):
        if in_comment(src, m.start()):
            continue
        open_paren = src.index('(', m.start())
        close = skip_parens(src, open_paren) - 1
        args = top_level_args(src, open_paren, close)
        labels = [a[0] for a in args]
        bundle = next((src[s:e].split(':', 1)[1].strip() for label, s, e in args[1:] if label == 'bundle'), None)
        key = src[args[0][1]:args[0][2]].split(':', 1)[1].lstrip()
        literal = key.startswith('"') or key.startswith('#"')
        # bundle: goes before the first argument whose label comes after it in ORDER, else at the end.
        insert = close
        for label, s, _ in args[1:]:
            if label in ORDER and ORDER.index(label) > ORDER.index('bundle'):
                insert = s
                break
        yield {
            'line': src.count('\n', 0, m.start()) + 1,
            'attributed': bool(m.group(1)),
            'labels': labels,
            'bundle': bundle,
            'literal': literal,
            'key': key,
            'multiline': '\n' in src[m.start():close],
            'insert': insert,
            'before_label': insert != close,
        }


def swift_files(ref=None):
    cmd = ['git', 'ls-tree', '-r', '--name-only', ref, '--', '.'] if ref else ['git', 'ls-files']
    out = subprocess.run(cmd, cwd=APP, capture_output=True, text=True, check=True).stdout
    paths = [os.path.normpath(os.path.join(APP, f)) for f in out.split() if f.endswith('.swift')]
    return [p for p in paths if rel(p) not in LEFT]


def rel(path):
    return os.path.relpath(path, os.path.join(HERE, '..'))


def cached_in(src):
    """The lines of the constants built from a lookup: a `static let`, or a file's own `let`. Made once, they keep the
    language of their first reading whatever the reader picks after (Codex, 21 Nov: Week Aqua's channel names, the colour
    wheel's hue names, a page's jump chips)."""
    out, lines = [], src.split('\n')
    for i, l in enumerate(lines):
        m = DECL.match(l)
        if not m or (m.group(2) == 'let' and m.group(1)):
            continue
        body, j = l, i
        depth = sum(l.count(c) for c in '([{') - sum(l.count(c) for c in ')]}')
        while depth > 0 and j + 1 < len(lines):
            j += 1
            body += '\n' + lines[j]
            depth += sum(lines[j].count(c) for c in '([{') - sum(lines[j].count(c) for c in ')]}')
        if CALL.search(body):
            out.append(i + 1)
    return out


def problems_in(src):
    """The calls that look up in the language the app opened in, as (line, why): a string key without `bundle:`, one
    given another bundle than `.app`, a LocalizedStringResource (which takes no `bundle:`) not given the app's locale with
    `.inApp`, or a constant made from one."""
    out = []
    for c in calls_in(src):
        if c['bundle'] is not None and c['bundle'] != '.app':
            out.append((c['line'], f'bundle: {c["bundle"]} (the language picked is bundle: .app)'))
        elif c['literal'] and 'bundle' not in c['labels']:
            out.append((c['line'], 'no bundle: (add bundle: .app)'))
        elif not c['literal'] and not c['key'].rstrip().endswith('.inApp') and 'bundle' not in c['labels']:
            out.append((c['line'], 'a resource without .inApp (give it the app\'s locale: resource.inApp)'))
    for line in cached_in(src):
        out.append((line, 'a constant made from a lookup keeps the first language (make it computed: static var … { … })'))
    return sorted(out)


def missing(files=None):
    """Every such call in the app's sources, as (file, line, why)."""
    return [(rel(f), line, why) for f in files or swift_files() for line, why in problems_in(read(f))]


def apply_to(src):
    """`src` with `bundle: .app` added to each string-key call without it, how many, and the lines of those it can't make."""
    made, skipped, edits = 0, [], []
    for c in calls_in(src):
        if 'bundle' in c['labels']:
            continue
        if not c['literal']:
            skipped.append(c['line'])
            continue
        edits.append(c)
    for c in sorted(edits, key=lambda c: -c['insert']):
        i = c['insert']
        if c['before_label']:
            # Before `locale:` or `comment:`: right after the comma that ends the argument before it.
            src = src[:i] + ' bundle: .app,' + src[i:]
        else:
            src = src[:i] + ', bundle: .app' + src[i:]
        made += 1
    return src, made, skipped


SAMPLE = '''struct S {
  var a: String { String(localized: "Đèn") }
  var b: String { String(localized: "Đèn", bundle: .app) }
  var c: AttributedString { AttributedString(localized: "**Đèn** \\(n) ổ") }
  var d: String { String(localized: "Đèn (\\(f(x, y)))", comment: "x, y") }
  var e: String { String(localized: name.inApp) }
  var f: String { String(localized: name) }
  // String(localized: "in a comment")
  var g: String { String(
    localized: "Đèn") }
  var h: String { String(localized: "Đèn", bundle: .main) }
  static let i = [String(localized: "Đèn", bundle: .app)]
  static var j: [String] { [String(localized: "Đèn", bundle: .app)] }
}
'''


def self_test():
    """The check fails on a bad line, names its line, and passes the same lines once the edit has made them."""
    found = problems_in(SAMPLE)
    assert [l for l, _ in found] == [2, 4, 5, 7, 9, 11, 12], found
    fixed, made, skipped = apply_to(SAMPLE)
    assert made == 4 and skipped == [6, 7], (made, skipped)
    assert 'String(\n    localized: "Đèn", bundle: .app) }' in fixed, fixed
    assert 'String(localized: "Đèn", bundle: .app) }\n  var b' in fixed, fixed
    assert 'AttributedString(localized: "**Đèn** \\(n) ổ", bundle: .app)' in fixed, fixed
    assert 'String(localized: "Đèn (\\(f(x, y)))", bundle: .app, comment: "x, y")' in fixed, fixed
    # Left for a person: the resource, the other bundle, the constant.
    assert [l for l, _ in problems_in(fixed)] == [7, 11, 12], problems_in(fixed)


def count(ref=None):
    files = swift_files(ref)
    rows = [(f, c) for f in files for c in calls(f, ref)]
    kit = subprocess.run(['git', 'grep', '-c', '-E', r'(Attributed)?String\(localized:'] + ([ref] if ref else []) + ['--', 'Sources'],
                         cwd=os.path.join(HERE, '..', 'AquaTomeKit'), capture_output=True, text=True).stdout.split()
    s = lambda pred: sum(1 for _, c in rows if pred(c))
    print(f'at {ref or "the working tree"}: {len(files)} Swift files under apps/ios/AquaTome')
    print(f'calls: {len(rows)} in {len({f for f, _ in rows})} files')
    print(f'  String(localized:): {s(lambda c: not c["attributed"])}')
    print(f'  AttributedString(localized:): {s(lambda c: c["attributed"])}')
    print(f'  already pass bundle:: {s(lambda c: "bundle" in c["labels"])}')
    print(f'  pass table:: {s(lambda c: "table" in c["labels"])}')
    print(f'  pass locale: or comment: (bundle: goes before it): {s(lambda c: c["before_label"])}')
    print(f'  span lines: {s(lambda c: c["multiline"])}')
    print(f'  key not a string literal (a resource, or a variable): {s(lambda c: not c["literal"])}')
    for f, c in rows:
        if not c['literal']:
            print(f'    {rel(f)}:{c["line"]}')
    print(f'  in AquaTomeKit (its own bundle, not the app\'s): {sum(int(x.split(":")[1]) for x in kit) if kit else 0}')
    print(f'  to edit (string literal, no bundle:): {s(lambda c: c["literal"] and "bundle" not in c["labels"])}')
    for f, why in LEFT.items():
        print(f'  left out: {f}, {len(list(calls(os.path.join(HERE, "..", f), ref)))} calls ({why})')


def apply():
    self_test()
    made, skipped = 0, []
    for f in swift_files():
        src = open(f, encoding='utf-8').read()
        new, n, lines = apply_to(src)
        if n:
            open(f, 'w', encoding='utf-8').write(new)
        made += n
        skipped += [f'{rel(f)}:{l}: key not a string literal' for l in lines]
    print(f'added bundle: .app to {made} calls')
    for s in skipped:
        print(f'not made: {s}')


if __name__ == '__main__':
    if '--apply' in sys.argv:
        apply()
    elif '--self-test' in sys.argv:
        self_test()
        print('self-test passed')
    elif '--missing' in sys.argv:
        for f, line, why in missing():
            print(f'{f}:{line}: {why}')
    else:
        count(next((a for a in sys.argv[1:] if not a.startswith('-')), None))
