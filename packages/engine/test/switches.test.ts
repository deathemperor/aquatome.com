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
