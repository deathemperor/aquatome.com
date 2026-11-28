import { expect, test } from 'vitest'
import { countContradictions, groupRepeats, repeatedTurns, repeatReview } from '../scripts/chat-repeat-lib'

const inputHash = '0123456789abcdef'
const page = '/vi/cay/rong-duoi-chon/'
const noRoots = 'Rong đuôi chồn không có rễ thật.'
const hasRoots = 'Rong đuôi chồn lấy chất dinh dưỡng qua rễ.'
const noAnswer = 'Bạn đo lại nước và xem lá có rụng không.'
const row = (id: string, text?: string) => ({ id, post: id, form: 'post', inputHash, text })
const arm = (name: string, ...rows: unknown[]) => ({ name, turns: repeatedTurns.parse(rows) })
const claim = (value: string, quote: string) => ({ value, quote })

test('three answers must be complete and come from the same post, form and input', () => {
  const repeats = groupRepeats([
    arm('one', row('ok', noRoots), row('failed', noRoots), row('changed', noRoots), row('old', noRoots), row('form', noRoots)),
    arm('two', row('ok', hasRoots), { ...row('failed'), failed: 'out of time' }, row('changed', hasRoots), row('old', hasRoots), { ...row('form', hasRoots), form: 'tank' }),
    arm('three', { ...row('ok', noAnswer), named: [page] }, { ...row('changed', noAnswer), inputHash: 'fedcba9876543210' }, { ...row('old', noAnswer), inputHash: undefined }, row('form', noAnswer)),
  ])
  expect(repeats.complete).toEqual([{
    id: 'ok', post: 'ok', form: 'post', inputHash,
    answers: [{ text: noRoots, named: [] }, { text: hasRoots, named: [] }, { text: noAnswer, named: [page] }],
  }])
  expect(repeats.incomplete.map(c => [c.id, c.reason])).toEqual([
    ['changed', 'missing or different input fingerprints'],
    ['failed', 'missing or failed answer'],
    ['form', 'different post or question form'],
    ['old', 'missing or different input fingerprints'],
  ])
  expect(repeats.incomplete.find(c => c.id === 'failed')!.arms).toEqual(['two', 'three'])
})

test('the report counts a conflicting answer once per category and keeps omitted claims and unreviewed cases visible', () => {
  const repeats = groupRepeats([
    arm('one', row('roots', noRoots), row('unreviewed', noRoots), row('page-only', hasRoots)),
    arm('two', row('roots', hasRoots), row('unreviewed', noRoots), row('page-only', hasRoots)),
    arm('three', row('roots', noAnswer), row('unreviewed', noRoots), row('page-only', noAnswer)),
  ])
  const reference = { ...claim('no', noRoots), path: page }
  const roots = { fact: 'true roots', answers: [claim('no', noRoots), claim('yes', hasRoots), null], page: reference }
  const review = repeatReview.parse([
    { id: 'roots', facts: [roots, { ...roots, fact: 'second recorded claim' }] },
    { id: 'page-only', facts: [{ ...roots, answers: [claim('yes', hasRoots), claim('yes', hasRoots), null] }] },
  ])
  const report = countContradictions(repeats, review, { [page]: `Mô tả. ${noRoots} Cách trồng.` })
  expect(report).toMatchObject({
    arms: ['one', 'two', 'three'], completeCases: 3, reviewedCases: 2, reviewedAnswers: 6,
    unreviewed: ['unreviewed'], betweenAnswers: 2, againstPage: 3, either: 4,
  })
  expect(report.findings).toContainEqual({ id: 'roots', fact: 'true roots', between: [['one', 'two']], againstPage: ['two'], page })
  expect(report.findings).toContainEqual({ id: 'page-only', fact: 'true roots', between: [], againstPage: ['one', 'two'], page })
})

test('only a complete set and quotes from the actual records can support a review', () => {
  const a = arm('one', row('roots', noRoots))
  const b = arm('two', row('roots', hasRoots))
  const c = arm('three', row('roots', noAnswer))
  const repeats = groupRepeats([a, b, c])
  const facts = [{ fact: 'true roots', answers: [claim('no', noRoots), null, null], page: { ...claim('no', noRoots), path: page } }]
  const review = repeatReview.parse([{ id: 'roots', facts }])
  expect(() => groupRepeats([a, a, c])).toThrow('three distinct arms')
  expect(() => groupRepeats([arm('one', row('roots', noRoots), row('roots', noRoots)), b, c])).toThrow('Duplicate turn')
  expect(() => countContradictions(groupRepeats([a, b, arm('three')]), review, {})).toThrow('No complete set')
  expect(() => countContradictions(repeats, review, { [page]: 'Wrong snapshot.' })).toThrow("doesn't contain the quote")
  const mistaken = repeatReview.parse([{ id: 'roots', facts: [{ ...facts[0], answers: [claim('yes', hasRoots), null, null] }] }])
  expect(() => countContradictions(repeats, mistaken, { [page]: noRoots })).toThrow("Answer 1 doesn't contain the quote")
})
