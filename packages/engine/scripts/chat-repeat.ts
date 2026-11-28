import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { countContradictions, groupRepeats, repeatedTurns, repeatPages, repeatReview } from './chat-repeat-lib'

// Offline only. With no review, prepare the three answers for a reader. With a review, count the backed claims.
const { values: { dir, arms, review, pages, out } } = parseArgs({ options: {
  dir: { type: 'string' }, arms: { type: 'string' }, review: { type: 'string' }, pages: { type: 'string' }, out: { type: 'string' },
} })
const names = arms?.split(',') ?? []
const [one, two, three] = names
if (!dir || names.length !== 3 || !one || !two || !three || names.some(n => !/^[a-z0-9][a-z0-9._-]*$/i.test(n))) {
  throw new Error('Use --dir <board directory> --arms <first,second,third>.')
}
const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'))
const readArm = async (name: string) => ({ name, turns: repeatedTurns.parse(await json(join(dir, name, 'turns.json'))) })
const repeats = groupRepeats(await Promise.all([readArm(one), readArm(two), readArm(three)]))
const result = review
  ? countContradictions(repeats, repeatReview.parse(await json(review)), pages ? repeatPages.parse(await json(pages)) : {})
  : repeats
const output = JSON.stringify(result, null, 2) + '\n'
if (out) await writeFile(out, output)
else process.stdout.write(output)
