/**
 * Did a change to the chat for speed cost answers? Two runs of chat-speed.ts on the same hard problems, judged against
 * each other: the change's answer (`--b`) against the run before it (`--a`), each as the reader sees it, text, blocks
 * and suggestions (chat-vs-plain-lib.ts `seenOurs`), by chat-vs-plain's judge and rubric, in both orders. A side wins a
 * question only when both orders pick it. The bar: the change loses no more questions than it wins.
 *
 * Only the questions kept for tuning (`--split dev`, the default): the holdout is read once, for a result.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/chat-speed-judge.ts --a ~/.cache/aquatome/evals/speed/<control> --b <variant>
 *   … --judge claude-opus-5-5 --judges 3 --split dev|holdout|all
 *
 * The judge runs on the owner's Claude accounts through the CLI (src/claude.ts). Verdicts are kept in
 * ~/.cache/aquatome/evals/speed/judge/, under what was judged, so a rerun judges only what is new.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { ChatBlock } from '../../../apps/site/worker/chat/answer'
import { claudeCli } from '../src/claude'
import { JUDGE_SCHEMA, JUDGE_SYSTEM, judgePrompt, outcome, RUBRIC_VERSION, seenOurs, tankFacts, unbrand, type HardQuestion, type Verdict } from './chat-vs-plain-lib'
import { pool, retry } from './eval-lib'

const { values: args } = parseArgs({
  options: {
    a: { type: 'string' },
    b: { type: 'string' },
    questions: { type: 'string', default: join(import.meta.dirname, 'hard-questions.vi.json') },
    split: { type: 'string', default: 'dev' },
    judge: { type: 'string', default: 'claude-opus-5-5' },
    judges: { type: 'string', default: '3' },
    cache: { type: 'string', default: join(homedir(), '.cache/aquatome/evals/speed/judge') },
  },
})
type Turn = { id: string; set: string; kind: string; text?: string; blocks?: ChatBlock[]; suggestions?: string[]; failed?: string }
const hash = (...xs: unknown[]) => createHash('sha256').update(JSON.stringify(xs)).digest('hex').slice(0, 16)

async function main() {
  if (!args.a || !args.b) throw new Error('--a and --b: the two runs\' folders')
  const read = async (dir: string) => new Map((JSON.parse(await readFile(join(dir, 'turns.json'), 'utf8')) as Turn[]).filter(t => t.set === 'hard').map(t => [t.id, t]))
  const [a, b] = await Promise.all([read(args.a), read(args.b)])
  const questions = JSON.parse(await readFile(args.questions!, 'utf8')) as HardQuestion[]
  const kept = questions.filter(q => args.split === 'all' || (args.split === 'holdout') === Boolean(q.holdout))
  await mkdir(args.cache!, { recursive: true })
  const seen = (t: Turn) => seenOurs(t.text ?? '', t.blocks ?? [], t.suggestions ?? [])
  const judgeOnce = async (prompt: string) => {
    const file = join(args.cache!, `${args.judge}-v${RUBRIC_VERSION}-${hash(prompt)}.json`)
    try { return JSON.parse(await readFile(file, 'utf8')) as Verdict } catch { /* not yet */ }
    const v = await retry(() => claudeCli<Verdict>({ system: JUDGE_SYSTEM, prompt, schema: JUDGE_SCHEMA, model: args.judge }))
    await writeFile(file, JSON.stringify(v, null, 2))
    return v
  }
  const pairs = kept.flatMap(q => (['post', 'tank'] as const).map(c => ({ q, c, id: `${q.id}-${c}` })))
  const failed = pairs.filter(p => !a.get(p.id)?.text || !b.get(p.id)?.text)
  const results = await pool(pairs.filter(p => a.get(p.id)?.text && b.get(p.id)?.text).map(p => async () => {
    const question = p.c === 'post' ? p.q.post : p.q.short
    const tank = p.c === 'tank' && p.q.tank ? tankFacts(p.q.tank) : null
    const x = unbrand(seen(b.get(p.id)!))
    const y = unbrand(seen(a.get(p.id)!))
    // `outcome` reads the first order's X and the second's Y as "ours": here, the change.
    const [first, second] = await Promise.all([judgeOnce(judgePrompt(question, tank, x, y)), judgeOnce(judgePrompt(question, tank, y, x))])
    const r = outcome({ first, second })
    console.log(`${p.id}: ${r.better === 'ours' ? 'the change' : r.better === 'plain' ? 'before' : 'tie'} (${r.ours.toFixed(1)} against ${r.plain.toFixed(1)})`)
    return { id: p.id, ...r }
  }), Number(args.judges))
  const n = (w: string) => results.filter(r => r.better === w).length
  const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / (xs.length || 1)).toFixed(2)
  const errs = (k: 'errorsOurs' | 'errorsPlain') => results.reduce((s, r) => s + r[k].length, 0)
  console.log(`\n${results.length} questions (${args.split}), judged by ${args.judge} in both orders${failed.length ? `; ${failed.length} left out, failed on a side: ${failed.map(p => p.id).join(', ')}` : ''}.`)
  console.log(`The change better: ${n('ours')}. Before better: ${n('plain')}. Tie or split: ${n('tie')}. Score: the change ${avg(results.map(r => r.ours))}, before ${avg(results.map(r => r.plain))}. Errors quoted: the change ${errs('errorsOurs')}, before ${errs('errorsPlain')}.`)
  console.log(n('ours') >= n('plain') ? 'Held: the change loses no more than it wins.' : 'Dropped: the change loses more than it wins.')
}

await main()
