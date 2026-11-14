#!/usr/bin/env python3
"""TestFlight's "What to Test" for a build (testflight.yml): the titles of the pull requests merged into the app
(apps/ios, protocols) since the last upload, newest first, one a line, in plain words. Commits that aren't a merged
pull request (the content engine's, say) are left out. At most TestFlight's 4,000 bytes (UTF-8): past that, the oldest
are counted instead of listed. "<", ">" and emoji, which TestFlight refuses, are dropped; a symbol it refuses or may
refuse is swapped for a plain one (`PLAIN`), and asc-build-state.mjs sends the note once more without any other
character Apple names.

A pull request whose description has a "## What to Test" section (the squash merge's body is the description) has that
section's lines under its title: where to tap, from the app's first screen, for a build the owner is to try.

Usage: testflight-notes.py SINCE prints the text (SINCE: the last upload's commit; empty when there was none).
`--test` checks it on a throwaway repository."""
import os, re, subprocess, sys, tempfile

PATHS = ['apps/ios', 'protocols']
LIMIT = 4000
NOTHING = 'No app changes listed since the last build.'


def plain(subject):
    """A squash merge's subject in plain words: "feat(ios kit): a tank's fish (#380)" is "A tank's fish" (a first word
    written like "iOS" stays as it is). None for a commit that isn't a merged pull request."""
    m = re.fullmatch(r'(?:[a-z0-9]+(?:\([^)]*\))?!?: )?(.+?) \(#\d+\)', subject.strip())
    if not m:
        return None
    t = clean(m.group(1))
    first = t.split(' ', 1)[0]
    return t if first[1:] != first[1:].lower() else t[:1].upper() + t[1:]


# Symbols our "What to Test" sections use, as plain characters. Apple publishes no list of what "What to Test" refuses:
# in the 141 uploads to 14 Nov it refused one note, build 363's, for "✕" (U+2715), and took "“", "”" and "…" (builds
# 348 and 357). "⋯" and the arrows are the other symbols the 477 sections in pull requests use (#1143, #766), never yet
# sent to Apple: swapped too rather than tried on a build.
PLAIN = {'✕': 'X', '✖': 'X', '⋯': '...', '→': '->', '←': '<-', '↑': '^', '↓': 'v'}


def clean(text):
    text = ''.join(PLAIN.get(c, c) for c in text)
    return ' '.join(''.join(c for c in text if c not in '<>' and ord(c) <= 0xFFFF and c != '\ufe0f').split())


def taps(body):
    """The lines of a description's "## What to Test" section, up to the next heading or the "Generated with" line a
    description ends with, blank ones left out."""
    m = re.search(r'^## What to Test[ \t]*$(.*?)(?=^#{1,2} |^\S* ?Generated with |\Z)', (body or '').replace('\r\n', '\n'),
                  re.M | re.S)
    return [t for t in map(clean, m.group(1).splitlines()) if t] if m else []


def entry(commit):
    """A commit (its subject, or its subject and body) as its lines in the note; None for one that isn't a merged pull
    request."""
    subject, body = commit if isinstance(commit, tuple) else (commit, '')
    title = plain(subject)
    return None if title is None else '\n'.join([f'- {title}', *(f'  {t}' for t in taps(body))])


def size(text):
    return len(text.encode())


def notes(commits):
    entries = [e for e in map(entry, commits) if e]
    kept = entries
    text = '\n'.join(kept)
    while size(text) > LIMIT:
        kept = kept[:-1]
        text = '\n'.join(kept) + f'\n…and {len(entries) - len(kept)} more'
    return text or NOTHING


def subjects(since, cwd=None):
    """Each commit since then that touches the app, newest first, as its subject and body."""
    if not since:
        return []
    log = subprocess.run(['git', 'log', '--format=%s%x1f%b%x1e', f'{since}..HEAD', '--', *PATHS], cwd=cwd, check=True,
                         capture_output=True, text=True).stdout
    return [tuple(c.strip('\n').split('\x1f', 1)) for c in log.split('\x1e') if c.strip()]


def test():
    assert plain('feat(ios accounts): add a passkey from the app (#373)') == 'Add a passkey from the app'
    assert plain('fix: a capped field shows what\'s kept (#374)') == 'A capped field shows what\'s kept'
    assert plain('Revert "x" (#12)') == 'Revert "x"'
    assert plain('content: engine pages 2026-11-02') is None
    assert plain('feat: iOS app: a tank (#200)') == 'iOS app: a tank'
    assert plain('a11y(ios): labels read in order (#9)') == 'Labels read in order'
    assert plain('feat(i18n): strings in (/app/<lang>.json) 🐟 now (#198)') == 'Strings in (/app/lang.json) now'
    assert notes([]) == NOTHING and notes(['content: engine pages 2026-11-02']) == NOTHING
    many = notes([f'feat(ios): đổi số {i:03}, một tiêu đề đủ dài để lấp đầy ghi chú × (#{i})' for i in range(200)])
    assert size(many) <= LIMIT and many.startswith('- Đổi số 000') and many.endswith(' more'), many[-40:]
    body = 'Why it changes.\n\n## What to Test\n\n- Owner only: open <Cá betta>, tap ⋯.\n  Then Ảnh.\n\n## Changelog\n- App: x'
    assert taps(body) == ['- Owner only: open Cá betta, tap ....', 'Then Ảnh.'], taps(body)
    assert taps(body.replace('\n', '\r\n')) == taps(body)
    assert taps('## Changelog\n- none') == [] and taps('') == [] and taps('## What to Test\n### On v2\n- x\n# Other\n- y') == ['### On v2', '- x']
    # Build 363's (#1171): Apple refused the whole note for its "✕", and the build went out with none (14 Nov).
    swipe = ('## What to Test\n\n6. Open a guide\'s card on Hôm nay, tap a link in its text to a fish: that page has the back '
             'button at the top left and the ✕ at the right. Tap back: you\'re on the guide. Tap ✕: you\'re on Hôm nay\'s top.\n'
             '7. Known: a Hôm nay post closes with ✕, or with a swipe from the left edge at an unhurried speed.\n\n'
             '🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\n')
    assert taps(swipe) == ['6. Open a guide\'s card on Hôm nay, tap a link in its text to a fish: that page has the back button at '
                           'the top left and the X at the right. Tap back: you\'re on the guide. Tap X: you\'re on Hôm nay\'s top.',
                           '7. Known: a Hôm nay post closes with X, or with a swipe from the left edge at an unhurried speed.'], taps(swipe)
    assert not set(notes([('fix(ios v2): a page goes back by iOS\'s own swipe (#1171)', swipe)])) & set(PLAIN)
    assert clean('Tap ⋯, then ↓ “Ảnh”…') == 'Tap ..., then v “Ảnh”…'
    assert notes([('feat(ios v2): the whole page (#5)', body), 'fix(ios): x (#4)']) == \
        '- The whole page\n  - Owner only: open Cá betta, tap ....\n  Then Ảnh.\n- X', notes([('feat(ios v2): the whole page (#5)', body)])
    with tempfile.TemporaryDirectory() as d:
        git = lambda *a: subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', *a], cwd=d,
                                        check=True, capture_output=True, text=True).stdout.strip()
        git('init', '-q')
        def commit(path, subject, body=''):
            os.makedirs(os.path.join(d, os.path.dirname(path)), exist_ok=True)
            with open(os.path.join(d, path), 'a') as f:
                f.write(subject + '\n')
            git('add', '-A')
            git('commit', '-q', '-m', subject, *(['-m', body] if body else []))
            return git('rev-parse', 'HEAD')
        last = commit('apps/ios/a.swift', 'feat(ios): uploaded already (#1)')
        commit('docs/a.md', 'docs: not the app (#2)')
        commit('apps/ios/b.swift', 'fix(ios): the second (#3)')
        commit('protocols/p.json', 'chore(protocols): the third (#4)')
        commit('apps/ios/c.json', 'content: engine pages 2026-11-02')
        assert notes(subjects(last, d)) == '- The third\n- The second', notes(subjects(last, d))
        commit('apps/ios/d.swift', 'feat(ios v2): the fourth (#5)', '## What to Test\n- Open Cá betta.\n\n## Changelog\n- App: x')
        assert notes(subjects(last, d)) == '- The fourth\n  - Open Cá betta.\n- The third\n- The second', notes(subjects(last, d))
        assert notes(subjects('', d)) == NOTHING


if __name__ == '__main__':
    if sys.argv[1:] == ['--test']:
        test()
    else:
        print(notes(subjects(sys.argv[1] if len(sys.argv) > 1 else '')))
