import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { checkPr, fallbackChange, MAX_TEXT, parseChangelog, productChanges, sectionLines, titleQualifies } from '../../../scripts/changelog.mjs'

// The product change log's words (scripts/changelog.mjs): a PR body's "## Changelog" section, the title fallback, and
// ci.yml's check on a PR's body.

test('the section: several lines, each Site, App or Engine, bullets or not, any case', () => {
  const body = 'Some summary.\n\n## Changelog\n- Site: Readers can attach one photo to a comment.\n* App: The fish list opens faster.\n+ engine: Guides keep their photos.\nSite: Shop links fit a small phone.\n\n## Test plan\n- Site: not this one'
  expect(parseChangelog(body)).toEqual({
    found: true, none: false, bad: [],
    entries: [
      { area: 'Site', text: 'Readers can attach one photo to a comment.' },
      { area: 'App', text: 'The fish list opens faster.' },
      { area: 'Engine', text: 'Guides keep their photos.' },
      { area: 'Site', text: 'Shop links fit a small phone.' },
    ],
  })
})

test('the section: odd spacing, Windows line ends, numbered and bold labels, any heading level', () => {
  const body = 'x\r\n###   CHANGELOG  ##\r\n\r\n   -Site:Readers   can   search.  \r\n\t1. **App:** One.\r\n2) __Engine__ :  Two.\r\n- **Site**: Three.'
  expect(parseChangelog(body).entries).toEqual([
    { area: 'Site', text: 'Readers can search.' },
    { area: 'App', text: 'One.' },
    { area: 'Engine', text: 'Two.' },
    { area: 'Site', text: 'Three.' },
  ])
  expect(parseChangelog('#Changelog\n- Site: x').found).toBe(true)
})

test('the section: none, as a bullet or not, any case, with or without a full stop', () => {
  for (const line of ['- none', 'none', '- None.', '* NONE']) {
    expect(parseChangelog(`## Changelog\n${line}\n`), line).toEqual({ found: true, none: true, entries: [], bad: [] })
    expect(sectionLines(`## Changelog\n${line}`), line).toEqual([])
  }
})

test('the section missing, or only in a code block or a comment: not found', () => {
  for (const body of [null, undefined, '', 'Just a summary.', '## Change log notes\n- Site: x', 'Changelog: Site: x',
    '```md\n## Changelog\n- Site: An example of the section.\n```', '~~~\n## Changelog\n- Site: x\n~~~', '<!--\n## Changelog\n- Site: x\n-->',
  ]) {
    expect(parseChangelog(body).found, String(body)).toBe(false)
    expect(sectionLines(body), String(body)).toBeUndefined()
  }
  // The real one after an example of it.
  expect(parseChangelog('```\n## Changelog\n- Site: Example.\n```\n\n## Changelog\n- App: Real.').entries).toEqual([{ area: 'App', text: 'Real.' }])
})

test('the section ends at prose, a rule or a heading: the "Generated with" line under it isn\'t a line of it', () => {
  const tail = '## Changelog\n- Site: One.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'
  expect(parseChangelog(tail)).toEqual({ found: true, none: false, entries: [{ area: 'Site', text: 'One.' }], bad: [] })
  expect(parseChangelog('## Changelog\n- Site: One.\n---\n- Two').entries).toHaveLength(1)
})

test('the section: list items that name no area are bad, and so is an area with nothing after it', () => {
  const c = parseChangelog('## Changelog\n- Fixed the shop links.\n- Site:\n- iOS: x\n- App: Fine.')
  expect(c.bad).toEqual(['- Fixed the shop links.', '- Site:', '- iOS: x'])
  expect(c.entries).toEqual([{ area: 'App', text: 'Fine.' }])
  // Nothing usable: no section to read, so the title falls back.
  expect(sectionLines('## Changelog\n- Fixed it.')).toBeUndefined()
  expect(sectionLines('## Changelog\n')).toBeUndefined()
})

const IOS = ['apps/ios/AquaTome/Views/Home.swift']
const ENGINE = ['packages/engine/src/gallery.ts']
const SITE = ['apps/site/src/pages/index.astro']

test('the fallback: a feat or fix title, its text after type(scope): as a sentence, labelled by the files it touched', () => {
  expect(fallbackChange("feat(ios): the Tìm home lists what's new on the site", IOS)).toEqual({ area: 'App', text: "The Tìm home lists what's new on the site." })
  expect(fallbackChange('fix: shop links fit a 320 px screen', SITE)).toEqual({ area: 'Site', text: 'Shop links fit a 320 px screen.' })
  expect(fallbackChange('feat(photos)!: galleries lead with the best picks.', ENGINE)).toEqual({ area: 'Engine', text: 'Galleries lead with the best picks.' })
  // apps/ios first, then the engine, else the site.
  expect(fallbackChange('feat(x): y', [...SITE, ...ENGINE, ...IOS])!.area).toBe('App')
  expect(fallbackChange('feat(x): y', [...SITE, ...ENGINE])!.area).toBe('Engine')
  expect(fallbackChange('feat(x): y', ['protocols/page.schema.json'])!.area).toBe('Site')
  expect(fallbackChange('feat(x): y', [])!.area).toBe('Site')
})

test('the fallback leaves out every other type, the ci, test, docs and chore scopes, and content pushes', () => {
  for (const title of ['docs(research): smart tanks', 'ci(ios): own Mac', 'test(ios flows): faster', 'chore(engine range): 60 a cycle', 'refactor(languages): one table',
    'content(shop list): Chợ Thủy Sinh joins', 'content: engine pages 2026-11-05', 'feat(ci): a job', 'fix(tests): flaky', 'fix(docs): typo', 'feat(chore, x): y', 'fix(ios tests): z',
    'Update README', 'feat: ', 'fix(x):']) {
    expect(titleQualifies(title), title).toBe(false)
    expect(fallbackChange(title, SITE), title).toBeUndefined()
  }
  // Content, sources and engine state only: the engine's content, whatever the title.
  expect(fallbackChange('fix(photos): the peacock bass loses its market photos', ['content/species/cichla.json', 'engine-state/_photo-rejected.json'])).toBeUndefined()
  expect(fallbackChange('fix(photos): x', ['content/species/cichla.json', ...ENGINE])).toEqual({ area: 'Engine', text: 'X.' })
  expect(titleQualifies('fix(live checks): x')).toBe(true)
})

const pr = (number: number, mergedAt: string, title: string, body: string | null = null) => ({ number, title, body, merged_at: mergedAt })

test('product changes: the section where a PR has one, else the fallback; newest first; a line said twice once, the newest', () => {
  const xs = productChanges([
    pr(1, '2026-11-05T03:00:00Z', 'feat(site): a', '## Changelog\n- Site: Readers can search.\n- App: The app too.'),
    pr(2, '2026-11-05T09:00:00Z', 'fix(ios): the light card shows its outlet', null),
    pr(3, '2026-11-05T06:00:00Z', 'feat(engine): b', '## Changelog\n- none'),
    pr(4, '2026-11-05T08:00:00Z', 'docs: c', null),
    pr(5, '2026-11-05T07:00:00Z', 'feat(x): d', '## Changelog\n- site: readers can search.'),
  ], { 2: IOS })
  expect(xs).toEqual([
    { area: 'App', text: 'The light card shows its outlet.', at: '2026-11-05T09:00:00Z' },
    { area: 'Site', text: 'readers can search.', at: '2026-11-05T07:00:00Z' },
    { area: 'App', text: 'The app too.', at: '2026-11-05T03:00:00Z' },
  ])
  // A PR that says none, or whose title doesn't qualify, adds nothing; nothing merged, nothing to say.
  expect(productChanges([])).toEqual([])
})

test('product changes: a long line is cut with an ellipsis', () => {
  const [x] = productChanges([pr(1, '2026-11-05T03:00:00Z', 'feat: x', `## Changelog\n- Site: ${'a'.repeat(400)}`)])
  expect(x!.text).toHaveLength(MAX_TEXT)
  expect(x!.text.endsWith('…')).toBe(true)
})

const good = '## Summary\nWhy.\n\n## Changelog\n- Site: Readers can attach one photo to a comment.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'

test('the check: a body with the section passes; none passes', () => {
  expect(checkPr({ author: 'deathemperor', title: 'feat(comments): photos', body: good })).toBeUndefined()
  expect(checkPr({ author: 'deathemperor', title: 'ci(ios): x', body: '## Changelog\n- none' })).toBeUndefined()
})

test('the check: missing, empty, bad lines, or none beside changes fail, each saying what to add', () => {
  const fails = (body: string | null) => checkPr({ author: 'deathemperor', title: 'feat(x): y', body, files: SITE })
  expect(fails(null)).toMatch(/^This pull request's body has no "## Changelog" section\./)
  expect(fails('```\n## Changelog\n- Site: x\n```')).toMatch(/no "## Changelog" section/)
  expect(fails('## Changelog\n\n## Test plan')).toMatch(/^The Changelog section is empty\./)
  expect(fails('## Changelog\n- Fixed the shop links.')).toMatch(/^These lines of the Changelog section start with none of Site:, App: or Engine:\n {2}- Fixed the shop links\./)
  expect(fails('## Changelog\n- none\n- Site: x')).toMatch(/says "none" and lists changes too/)
  for (const body of [null, '## Changelog\n- x']) {
    const why = fails(body)!
    expect(why).toContain('## Changelog\n- Site: Readers can attach one photo to a comment.')
    expect(why).toContain('"- none"')
    expect(why).toContain('run this job again')
  }
})

test('the check: the autofixer\'s PRs and the engine\'s content pass as they are', () => {
  for (const author of ['app/github-actions', 'github-actions[bot]']) expect(checkPr({ author, title: 'fix: shop links fit a 320 px screen', body: 'Fixes #576' })).toBeUndefined()
  expect(checkPr({ author: 'deathemperor', title: "content(shop list): Chợ Thủy Sinh's fish join the shop list", body: '## Summary' })).toBeUndefined()
  expect(checkPr({ author: 'deathemperor', title: 'fix(photos): x', body: '', files: ['content/species/a.json', 'engine-state/b.json', 'sources/c.json'] })).toBeUndefined()
  expect(checkPr({ author: 'deathemperor', title: 'fix(photos): x', body: '', files: ['content/species/a.json', 'apps/site/src/x.ts'] })).toBeDefined()
})

const SCRIPT = fileURLToPath(new URL('../../../scripts/changelog.mjs', import.meta.url))
const check = (pr: unknown) => {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT, 'check'], { input: JSON.stringify(pr), encoding: 'utf8' }) }
  } catch (e) {
    const x = e as { status: number; stdout: string }
    return { code: x.status, out: x.stdout }
  }
}

test('the check as ci.yml runs it: gh pr view\'s JSON on stdin, exit 1 with what to add and an annotation', () => {
  const ok = check({ author: { login: 'deathemperor', is_bot: false }, title: 'feat(x): y', body: good, files: [{ path: 'apps/site/x.ts' }] })
  expect(ok.code).toBe(0)
  const bad = check({ author: { login: 'deathemperor', is_bot: false }, title: 'feat(x): y', body: 'Summary only.', files: [{ path: 'apps/site/x.ts' }] })
  expect(bad.code).toBe(1)
  expect(bad.out).toContain('- Site: Readers can attach one photo to a comment.')
  expect(bad.out).toMatch(/^::error title=No product changelog::This pull request's body has no "## Changelog" section\./m)
  expect(check({ author: { login: 'app/github-actions', is_bot: true }, title: 'fix: x', body: 'Fixes #1', files: [] }).code).toBe(0)
})
