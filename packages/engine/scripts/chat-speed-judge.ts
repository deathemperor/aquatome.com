/**
 * Did a change to the chat for speed cost answers? Two runs of chat-speed.ts on the same hard problems, judged against
 * each other: the change's answer (`--b`) against the run before it (`--a`), each as the reader sees it, text, blocks
 * and suggestions (chat-vs-plain-lib.ts `seenOurs`), by chat-vs-plain's judge and rubric, in both orders. A side wins a
 * question only when both orders pick it. The bar: the change loses no more questions than it wins.
 *
 * Only the questions kept for tuning (`--split dev`, the default): the holdout is read once, for a result. `--sets
 * hard,everyday` judges the everyday questions too (short, in four languages, some from a species page or fish ID), each
 * in its language. The result is given for each group (whole posts, short questions with a saved tank, without) and over all.
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
import { JUDGE_SCHEMA, JUDGE_SYSTEM, judgePrompt, judgePromptIn, judgeSystemIn, outcome, RUBRIC_VERSION, seenOurs, tankFacts, unbrand, type HardQuestion, type PostTank, type ReaderLang, type Verdict } from './chat-vs-plain-lib'
import { pool, retry } from './eval-lib'

const { values: args } = parseArgs({
  options: {
    a: { type: 'string' },
    b: { type: 'string' },
    questions: { type: 'string', default: join(import.meta.dirname, 'hard-questions.vi.json') },
    everyday: { type: 'string', default: join(import.meta.dirname, 'everyday-questions.json') },
    sets: { type: 'string', default: 'hard' },
    // Every question's verdict, its scores and the errors quoted on each side, as JSON.
    out: { type: 'string' },
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
  const sets = args.sets!.split(',')
  const read = async (dir: string) => new Map((JSON.parse(await readFile(join(dir, 'turns.json'), 'utf8')) as Turn[]).filter(t => sets.includes(t.set)).map(t => [t.id, t]))
  const [a, b] = await Promise.all([read(args.a), read(args.b)])
  const questions = JSON.parse(await readFile(args.questions!, 'utf8')) as HardQuestion[]
  const kept = questions.filter(q => args.split === 'all' || (args.split === 'holdout') === Boolean(q.holdout))
  await mkdir(args.cache!, { recursive: true })
  const seen = (t: Turn, lang?: ReaderLang) => seenOurs(t.text ?? '', t.blocks ?? [], t.suggestions ?? [], lang)
  const judgeOnce = async (prompt: string, system = JUDGE_SYSTEM) => {
    const file = join(args.cache!, `${args.judge}-v${RUBRIC_VERSION}-${system === JUDGE_SYSTEM ? hash(prompt) : hash(system, prompt)}.json`)
    try { return JSON.parse(await readFile(file, 'utf8')) as Verdict } catch { /* not yet */ }
    const v = await retry(() => claudeCli<Verdict>({ system, prompt, schema: JUDGE_SCHEMA, model: args.judge }))
    await writeFile(file, JSON.stringify(v, null, 2))
    return v
  }
  type Pair = { id: string; group: 'post' | 'tank' | 'everyday' | 'everyday-tank'; prompt: (x: string, y: string) => string; system?: string; lang?: ReaderLang }
  const pairs: Pair[] = sets.includes('hard') ? kept.flatMap(q => (['post', 'tank'] as const).map(c => ({
    id: `${q.id}-${c}`, group: c, prompt: (x: string, y: string) => judgePrompt(c === 'post' ? q.post : q.short, c === 'tank' && q.tank ? tankFacts(q.tank) : null, x, y),
  }))) : []
  if (sets.includes('everyday')) {
    type Everyday = { id: string; lang: ReaderLang; q: string; tank?: PostTank; start?: { from?: string; about?: string; identified?: { results: { scientificName: string; confidence: number }[] } } }
    const named = (id: string) => id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())
    for (const q of JSON.parse(await readFile(args.everyday!, 'utf8')) as Everyday[]) {
      const s = q.start
      const context = q.tank ? `What is true about their tank (their app holds it; they didn't type it, and the assistant could read it):\n${tankFacts(q.tank)}` : s?.from === 'fish-id' && s.identified
        ? `They asked right after the app's fish ID named their photo: ${s.identified.results.map(r => `${r.scientificName} (${Math.round(r.confidence * 100)}%)`).join(', ')}. The assistant knew this.`
        : s?.from === 'species' && s.about ? `They asked from the handbook's page on ${named(s.about)}: "this fish" is that one, and the assistant knew it.` : null
      pairs.push({ id: q.id, group: q.tank ? 'everyday-tank' : 'everyday', prompt: (x, y) => judgePromptIn(q.lang, q.q, context, x, y), system: judgeSystemIn(q.lang), lang: q.lang })
    }
  }
  const failed = pairs.filter(p => !a.get(p.id)?.text || !b.get(p.id)?.text)
  const results = await pool(pairs.filter(p => a.get(p.id)?.text && b.get(p.id)?.text).map(p => async () => {
    const x = unbrand(seen(b.get(p.id)!, p.lang))
    const y = unbrand(seen(a.get(p.id)!, p.lang))
    // `outcome` reads the first order's X and the second's Y as "ours": here, the change.
    const [first, second] = await Promise.all([judgeOnce(p.prompt(x, y), p.system), judgeOnce(p.prompt(y, x), p.system)])
    const r = outcome({ first, second })
    console.log(`${p.id}: ${r.better === 'ours' ? 'the change' : r.better === 'plain' ? 'before' : 'tie'} (${r.ours.toFixed(1)} against ${r.plain.toFixed(1)})`)
    return { id: p.id, group: p.group, ...r }
  }), Number(args.judges))
  if (args.out) await writeFile(args.out, JSON.stringify(results, null, 1))
  const n = (w: string) => results.filter(r => r.better === w).length
  const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / (xs.length || 1)).toFixed(2)
  const errs = (k: 'errorsOurs' | 'errorsPlain') => results.reduce((s, r) => s + r[k].length, 0)
  console.log(`\n${results.length} questions (${args.split}), judged by ${args.judge} in both orders${failed.length ? `; ${failed.length} left out, failed on a side: ${failed.map(p => p.id).join(', ')}` : ''}.`)
  console.log(`The change better: ${n('ours')}. Before better: ${n('plain')}. Tie or split: ${n('tie')}. Score: the change ${avg(results.map(r => r.ours))}, before ${avg(results.map(r => r.plain))}. Errors quoted: the change ${errs('errorsOurs')}, before ${errs('errorsPlain')}.`)
  console.log(n('ours') >= n('plain') ? 'Held: the change loses no more than it wins.' : 'Dropped: the change loses more than it wins.')
  const groups = [['post', 'Whole posts'], ['tank', 'Short questions with a saved tank'], ['everyday', 'Short questions without one (everyday, four languages)'], ['everyday-tank', 'Everyday questions with a saved tank']] as const
  for (const [g, name] of groups) {
    const rs = results.filter(r => r.group === g)
    if (!rs.length) continue
    const k = (w: string) => rs.filter(r => r.better === w).length
    console.log(`${name}: ${rs.length}; the change better ${k('ours')}, before ${k('plain')}, tie ${k('tie')}; score ${avg(rs.map(r => r.ours))} against ${avg(rs.map(r => r.plain))}; ${k('ours') >= k('plain') ? 'held' : 'dropped'}.`)
  }
}

await main()
