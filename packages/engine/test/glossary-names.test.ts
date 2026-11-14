import { expect, test } from 'vitest'
import { ruleNumbers } from '../src/glossary-entry'
import { judgeKindNames, kindNames, misfitNote } from '../src/glossary-names'

const taxa = new Map([
  ['Caridina', { genus: 'Caridina', family: 'Atyidae', order: 'Decapoda' }],
  ['Betta', { genus: 'Betta', family: 'Osphronemidae', order: 'Anabantiformes' }],
  ['Aulonocara', { genus: 'Aulonocara', family: 'Cichlidae', order: 'Cichliformes' }],
  ['Macrobrachium', { genus: 'Macrobrachium', family: 'Palaemonidae', order: 'Decapoda' }],
])

// The chief of staff, 14 Nov 2026: "Tép Caridina" passes; "cá trê" on a cichlid still stops (pH's second and third
// tries stopped on "tép Caridina" alone).
test('a kind word straight before a scientific name is judged by the table: tép Caridina fits, cá trê on a cichlid does not', () => {
  const e = {
    definition: 'Tép Caridina ưa nước mềm.',
    body: '<p>Cá trê Aulonocara là tên sai. Cá Betta sống được ở pH thấp, tôm Macrobrachium cũng vậy.</p><ul><li>Các loài cá và Caridina, tép như Caridina, Caridina cantonensis, Neocaridina.</li><li>Một con cá Caridina.</li></ul>',
  }
  const k = kindNames(e, taxa)
  expect(k.fit.map(x => x.name)).toEqual(['Tép Caridina', 'Cá Betta', 'tôm Macrobrachium'])
  expect(k.misfit).toEqual([{ name: 'Cá trê Aulonocara', word: 'trê', family: 'Cichlidae' }, { name: 'cá Caridina', word: 'cá', family: 'Atyidae' }])
})

// The Writing Lead, 14 Nov 2026: the table reads a hyphen or dash between words as a space, and so does this step.
test('a hyphen or dash between a kind word and the name reads as a space, and a naming note on it is matched however it is spaced', () => {
  const k = kindNames({ definition: 'Một câu.', body: '<p>Cá trê-Aulonocara là tên sai. Tép – Caridina thì đúng.</p>' }, taxa)
  expect(k.misfit).toEqual([{ name: 'Cá trê-Aulonocara', word: 'trê', family: 'Cichlidae' }])
  expect(k.fit.map(x => x.name)).toEqual(['Tép – Caridina'])
  expect(judgeKindNames(['Rule 6: "cá trê Aulonocara" in "…": not its page\'s name', 'Rule 6: "tép Caridina" in "…": made up'], k, ruleNumbers)).toEqual([misfitNote(k.misfit[0]!)])
})

test('a naming note on a name the table judged is dropped; one that doesn\'t fit gets the table\'s note; other notes stand', () => {
  const k = { fit: [{ name: 'Tép Caridina', word: 'tép', family: 'Atyidae' }], misfit: [{ name: 'cá trê Aulonocara', word: 'trê', family: 'Cichlidae' }] }
  const notes = [
    'Rule 6: "tép Caridina" in "Tép Caridina ưa nước mềm.": a Vietnamese name the writer made up',
    'Rule 6: "cá trê Aulonocara" in "Cá trê Aulonocara là tên sai.": not the page\'s name',
    'Rules 6 and 12: "tép Caridina": the notes file asks for a link too',
    'Rule 6: "cá mèo" in "Cá mèo ăn tảo.": an English name word for word',
    'Rule 1: "tép Caridina" in "Tép Caridina ưa nước mềm.": contradicts the next line',
  ]
  expect(judgeKindNames(notes, k, ruleNumbers)).toEqual([notes[2], notes[3], notes[4], misfitNote(k.misfit[0]!)])
  expect(misfitNote(k.misfit[0]!)).toBe('Rule 6: "cá trê Aulonocara": "trê" is the word for other animals, not for Cichlidae (the table of kind words).')
})
