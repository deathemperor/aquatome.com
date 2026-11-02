#!/usr/bin/env python3
"""TestFlight's "What to Test" for a build (testflight.yml): the titles of the pull requests merged into the app
(apps/ios, protocols) since the last upload, newest first, one a line, in plain words. Commits that aren't a merged
pull request (the content engine's, say) are left out. At most TestFlight's 4,000 characters: past that, the oldest
are counted instead of listed.

Usage: testflight-notes.py SINCE prints the text (SINCE: the last upload's commit; empty when there was none).
`--test` checks it on a throwaway repository."""
import os, re, subprocess, sys, tempfile

PATHS = ['apps/ios', 'protocols']
LIMIT = 4000
NOTHING = 'Small fixes since the last build.'


def plain(subject):
    """A squash merge's subject in plain words: "feat(ios kit): a tank's fish (#380)" is "A tank's fish". None for a
    commit that isn't a merged pull request."""
    m = re.fullmatch(r'(?:[a-z]+(?:\([^)]*\))?!?: )?(.+?) \(#\d+\)', subject.strip())
    return m and m.group(1)[:1].upper() + m.group(1)[1:]


def notes(subjects):
    titles = [t for t in map(plain, subjects) if t]
    kept = titles
    text = '\n'.join(f'- {t}' for t in kept)
    while len(text) > LIMIT:
        kept = kept[:-1]
        text = '\n'.join(f'- {t}' for t in kept) + f'\n…and {len(titles) - len(kept)} more'
    return text or NOTHING


def subjects(since, cwd=None):
    if not since:
        return []
    log = subprocess.run(['git', 'log', '--format=%s', f'{since}..HEAD', '--', *PATHS], cwd=cwd, check=True,
                         capture_output=True, text=True).stdout
    return log.splitlines()


def test():
    assert plain('feat(ios accounts): add a passkey from the app (#373)') == 'Add a passkey from the app'
    assert plain('fix: a capped field shows what\'s kept (#374)') == 'A capped field shows what\'s kept'
    assert plain('Revert "x" (#12)') == 'Revert "x"'
    assert plain('content: engine pages 2026-11-02') is None
    assert notes([]) == NOTHING and notes(['content: engine pages 2026-11-02']) == NOTHING
    many = notes([f'feat(ios): change number {i:03} with a title long enough to fill the note (#{i})' for i in range(200)])
    assert len(many) <= LIMIT and many.startswith('- Change number 000') and many.endswith(' more'), many[-40:]
    with tempfile.TemporaryDirectory() as d:
        git = lambda *a: subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', *a], cwd=d,
                                        check=True, capture_output=True, text=True).stdout.strip()
        git('init', '-q')
        def commit(path, subject):
            os.makedirs(os.path.join(d, os.path.dirname(path)), exist_ok=True)
            with open(os.path.join(d, path), 'a') as f:
                f.write(subject + '\n')
            git('add', '-A')
            git('commit', '-q', '-m', subject)
            return git('rev-parse', 'HEAD')
        last = commit('apps/ios/a.swift', 'feat(ios): uploaded already (#1)')
        commit('docs/a.md', 'docs: not the app (#2)')
        commit('apps/ios/b.swift', 'fix(ios): the second (#3)')
        commit('protocols/p.json', 'chore(protocols): the third (#4)')
        commit('apps/ios/c.json', 'content: engine pages 2026-11-02')
        assert notes(subjects(last, d)) == '- The third\n- The second', notes(subjects(last, d))
        assert notes(subjects('', d)) == NOTHING


if __name__ == '__main__':
    if sys.argv[1:] == ['--test']:
        test()
    else:
        print(notes(subjects(sys.argv[1] if len(sys.argv) > 1 else '')))
