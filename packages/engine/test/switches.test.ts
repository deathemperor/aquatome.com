import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { fitRewriteKinds, topicCheckLimit, videoCutOn } from '../src/switches'

// The chief of staff, 20 Nov 2026: the cutter, the topic check and the rewrite on guides are off, and the command holds
// the switch, so a step run by hand is off too (the readers of #1698: the script alone left `pnpm engine …` on).
test('the cutter runs only with VIDEO_CUT=on', () => {
  expect(videoCutOn({})).toBe(false)
  expect(videoCutOn({ VIDEO_CUT: 'off' })).toBe(false)
  expect(videoCutOn({ VIDEO_CUT: '1' })).toBe(false)
  expect(videoCutOn({ VIDEO_CUT: 'on' })).toBe(true)
})

test('the topic check reads no guide unless TOPIC_CHECK_LIMIT allows it, and a flag only lowers it', () => {
  expect(topicCheckLimit({})).toBe(0)
  expect(topicCheckLimit({}, '40')).toBe(0)
  expect(topicCheckLimit({ TOPIC_CHECK_LIMIT: '40' })).toBe(40)
  expect(topicCheckLimit({ TOPIC_CHECK_LIMIT: '40' }, '5')).toBe(5)
  expect(topicCheckLimit({ TOPIC_CHECK_LIMIT: '40' }, '0')).toBe(0)
  expect(() => topicCheckLimit({ TOPIC_CHECK_LIMIT: 'lots' })).toThrow(/whole number/)
  expect(() => topicCheckLimit({ TOPIC_CHECK_LIMIT: '40' }, 'x')).toThrow(/whole number/)
  expect(() => topicCheckLimit({ TOPIC_CHECK_LIMIT: '-1' })).toThrow(/whole number/)
})

test('the rewrite takes fish, plants and breeds unless FIT_REWRITE_KINDS names guides, and --kind only narrows', () => {
  expect(fitRewriteKinds({})).toEqual(['species', 'plants', 'breeds'])
  expect(fitRewriteKinds({}, 'guides')).toEqual([])
  expect(fitRewriteKinds({}, 'guides,species')).toEqual(['species'])
  expect(fitRewriteKinds({ FIT_REWRITE_KINDS: 'species,plants,breeds,guides' }, 'guides')).toEqual(['guides'])
  expect(fitRewriteKinds({ FIT_REWRITE_KINDS: 'species,plants,breeds,guides' })).toEqual(['species', 'plants', 'breeds', 'guides'])
})

// #1698's reader: the cycle script reads an exported empty variable as unset (`${X:-default}`), so the command does too;
// and a number too long to hold is refused, not read as no limit at all.
test('an exported empty switch is read as unset, and a limit too large to hold is refused', () => {
  expect(fitRewriteKinds({ FIT_REWRITE_KINDS: '' }, 'species,plants,breeds')).toEqual(['species', 'plants', 'breeds'])
  expect(fitRewriteKinds({ FIT_REWRITE_KINDS: ' ' })).toEqual(['species', 'plants', 'breeds'])
  expect(topicCheckLimit({ TOPIC_CHECK_LIMIT: '' }, '0')).toBe(0)
  expect(topicCheckLimit({ TOPIC_CHECK_LIMIT: '' })).toBe(0)
  expect(() => topicCheckLimit({ TOPIC_CHECK_LIMIT: '9'.repeat(309) })).toThrow(/whole number/)
  expect(() => topicCheckLimit({ TOPIC_CHECK_LIMIT: '40' }, '9007199254740993')).toThrow(/whole number/)
})

// #1698's second reader: the cycle passes the variable as the flag (`--kind "${FIT_REWRITE_KINDS:-…}"`), so a variable
// exported as a space reaches the command as a blank flag, which is no flag: not no kinds at all, nor a refused limit.
test('a blank flag is read as no flag', () => {
  expect(fitRewriteKinds({ FIT_REWRITE_KINDS: ' ' }, ' ')).toEqual(['species', 'plants', 'breeds'])
  expect(fitRewriteKinds({}, '')).toEqual(['species', 'plants', 'breeds'])
  expect(topicCheckLimit({ TOPIC_CHECK_LIMIT: ' ' }, ' ')).toBe(0)
  expect(topicCheckLimit({ TOPIC_CHECK_LIMIT: '40' }, ' ')).toBe(40)
})

// The commands themselves use the switches: the engine's command line reads the owner's files when it starts and writes
// the repository's own state, so a test can't run it; this pins each branch to its switch instead, as photo-privacy's does.
test('video-cut, topic-check and fit-rewrite each take their switch before they do anything', () => {
  const cli = readFileSync(fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'utf8')
  const branch = (cmd: string) => {
    const from = cli.indexOf(`cmd === '${cmd}'`)
    expect(from, cmd).toBeGreaterThan(-1)
    const to = cli.indexOf('} else if (cmd ===', from + 1)
    return cli.slice(from, to < 0 ? undefined : to)
  }
  // The cutter: off, it prints that and calls nothing.
  const cut = branch('video-cut')
  expect(cut.indexOf('if (!videoCutOn(process.env))')).toBeGreaterThan(-1)
  expect(cut.indexOf('if (!videoCutOn(process.env))')).toBeLessThan(cut.indexOf('await videoCut('))
  expect(cut.match(/videoCut\(/g)).toHaveLength(1)
  // The topic check: its one call reads the limit from the switch.
  const topic = branch('topic-check')
  expect(topic.match(/await topicCheck\(/g)).toHaveLength(1)
  expect(topic).toContain('limit: topicCheckLimit(process.env, values.limit)')
  // The rewrite: the pages it may take are the kinds the switch allows, and --only picks among those alone.
  const rewrite = branch('fit-rewrite')
  expect(rewrite).toContain('const kinds = fitRewriteKinds(process.env, values.kind)')
  expect(rewrite).toMatch(/const pages = \(await loadPages\([^\n]*\)\)\.filter\(p => [^\n]*kinds\.includes\(p\.kind\)/)
  expect(rewrite).toContain('only.flatMap(k => pages.filter(p => fitKey(p) === k))')
})
