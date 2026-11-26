import { expect, test } from 'vitest'
import { subjectPrompt } from '../src/photo-check'
import { DEAD_SCREEN_PROMPT } from '../src/dead-screen'

// The chief of staff's two sentences for the check's words (20 Nov 2026).
const fish = subjectPrompt({ id: 'trigonostigma-heteromorpha', kind: 'species', sci: 'Trigonostigma heteromorpha', names: [] })
const line = (prompt: string, start: string) => prompt.split('\n').find(l => l.trimStart().startsWith(start)) ?? ''

test('a fish on a hook or a line is a catch, dead, for the check and the dead-fish screen, in the water or not', () => {
  const catchDead = 'A fish on a hook or a line, in the water or not, is a catch: dead.'
  expect(line(fish, '- ok:')).toContain(catchDead)
  expect(line(DEAD_SCREEN_PROMPT, '- dead:')).toContain(catchDead)
  // Every live fish the words let off is one on no hook or line, so no exception takes the hooked fish back: in water,
  // or held in a hand, a net or a bag.
  expect(line(fish, '- ok:')).toContain('a live fish on no hook or line, held briefly in a net or a bag.')
  expect(line(DEAD_SCREEN_PROMPT, '- dead:')).toContain('Not dead: a live fish in water, on no hook or line (')
  expect(line(DEAD_SCREEN_PROMPT, '- dead:')).toContain('a small live fish on no hook or line, held in a hand or a net for a moment,')
})

test('a person seen reflected in the glass is a person, beside one behind it', () => {
  expect(line(fish, '- person:')).toContain('even small, cut off at the edge, blurred or behind the glass; a person seen reflected in the glass, where a person can be made out; false if not.')
})
