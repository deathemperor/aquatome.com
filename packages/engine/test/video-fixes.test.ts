import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import type { Translation } from '@aq/schema'

// Video guides fixed by hand in the real content/, each against its transcript: the line as the video has it, in the body
// and the FAQ, and the marks that keep a rewrite from putting the old line back (bodyFixed, faqFixed). A video written again
// keeps a fixed body's summary too; the old line is held out of it as well, so a summary that brought it back fails here.
const guide = async (id: string) => JSON.parse(await readFile(fileURLToPath(new URL(`../../../content/guides/${id}/vi.json`, import.meta.url)), 'utf8')) as Translation
const answers = (t: Translation) => (t.faq ?? []).map(f => f.a).join('\n')
const summary = (t: Translation) => (t.summary ?? []).join('\n')

// The video tests ammonia and nitrite. Its captions write the second "nitrate ... five milligrams per liter that is
// definitely toxic", and a review on 2026-11-07 had the editor write nitrate: 5 mg/l of nitrate is harmless.
test('the no-filter guppy tank guide calls 5 mg/l of nitrite toxic, not nitrate, in its text and its FAQ', async () => {
  const t = await guide('youtube-ZtRNkpEKYrE')
  expect(t.bodyFixed).toBe(true)
  expect(t.faqFixed).toBe(true)
  for (const [where, text] of [['body', t.body!], ['faq', answers(t)]] as const) {
    expect(text, where).toMatch(/nitrit[^.]*5 mg\/l/u)
    expect(text, where).not.toMatch(/nitrat(?!e)/iu)
  }
  expect(summary(t)).not.toMatch(/nitrat(?!e)/iu)
})

// The video: "Thật may là cá ốc tép trong bể của mình vẫn an toàn". The guide had "Với lịch này, cá, ốc và tép trong bể
// vẫn an toàn" and, in the FAQ, "Sau đợt điều trị bằng thuốc, cá, ốc và tép trong bể vẫn ổn": one tank's luck as a promise.
test('the algae medicine guide says the fish were unharmed that once, by luck, in its text and its FAQ', async () => {
  const t = await guide('youtube-tau-i3HxVFQ')
  expect(t.bodyFixed).toBe(true)
  expect(t.faqFixed).toBe(true)
  for (const [where, text] of [['body', t.body!], ['faq', answers(t)]] as const) {
    expect(text, where).toMatch(/may là cá, ốc và tép trong bể vẫn an toàn/u)
    expect(text, where).not.toMatch(/Với lịch này, cá|trong bể vẫn ổn/u)
  }
  // The summary says nothing of how the animals fared: a line that does, without the luck, is the promise again.
  expect(summary(t)).not.toMatch(/(?<!may là )cá, ốc và tép[^.]*(?:an toàn|vẫn ổn)/u)
})

// What put "nitrat" on that page: the reviewer read the captions' spelling and the editor followed its note.
test.each(['video-guide.md', 'video-fix.md', 'video-review.md'])('%s says captions confuse nitrite and nitrate', async file => {
  const prompt = await readFile(fileURLToPath(new URL(`../src/prompts/${file}`, import.meta.url)), 'utf8')
  expect(prompt).toMatch(/"nitrite".*"nitrate"/u)
})
