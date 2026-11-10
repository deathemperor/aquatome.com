/**
 * The chat on a page that disagrees with itself: a made-up fish whose water section says two things, a card with its
 * figures, and a guide on making soft water. Run against the real model, so it costs about a cent a run and stays out
 * of CI. It fails, naming what the answer did, when an answer talks about the pages instead of the fish, leaves out the
 * card's figures or the method, sends a care question to someone else or points at an earlier answer; and when fewer
 * than half the runs file the two places word for word.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/chat-answer-check.ts [--runs 3]
 *
 * Keys: ~/.config/aquatome/anthropic-keys, never printed.
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { PageDoc } from '@aq/schema/app-page'
import { answerQuestion, type ChatOptions, type Earlier } from '../../../apps/site/worker/chat/agent'
import { checkedClashes } from '../../../apps/site/worker/chat/clashes'
import type { Handbook, Item } from '../../../apps/site/worker/chat/handbook'
import { clientFor } from '../../../apps/site/worker/fishid/claude'
import { healthyKeys, loadKeys, memoryHealth, rotate } from '../../../apps/site/worker/fishid/keys'

const { values: args } = parseArgs({ options: { runs: { type: 'string', default: '3' } } })
const MODEL = 'claude-haiku-5-5'
const FISH = '/vi/ca/ca-ong-tien-thu/'
const GUIDE = '/vi/huong-dan/cach-lam-mem-nuoc-cho-be-ca/'
const page = (kind: PageDoc['kind'], title: string, sections: [string, string, string[]][]) =>
  ({ kind, title, blocks: sections.flatMap(([text, id, ps]) => [{ t: 'h', text, id }, ...ps.map(p => ({ t: 'p', c: [p] }))]) }) as unknown as PageDoc
const pages: Record<string, PageDoc> = {
  [FISH]: page('fish', 'Cá ông tiên thử', [
    ['Nước cần thế nào?', 'muc-waterConditions', [
      'Nếu chỉ nuôi thì nước cứng vừa, pH trung tính là đủ. Còn muốn thử cho cá sinh sản thì nước phải gần như không còn khoáng, pH quanh mức 5.',
      'Nhiệt độ: Cao, từ 28 đến 32°C.',
      'pH: 4,8-6,2. Nước kém chua hơn mức này thì cá thường sống không ổn chút nào.',
      'Độ cứng: 0-5°H. Nuôi loài này bắt buộc phải có nước mềm, độ cứng thấp đến mức gần như đo không ra.',
    ]],
    ['Cần bể bao lớn?', 'muc-aquariumSize', ['Bể nên cao ít nhất 70 cm.']],
  ]),
  [GUIDE]: page('guide', 'Cách làm mềm nước cho bể cá', [
    ['Pha nước RO hoặc nước mưa', 'pha-nuoc', [
      'Nước máy cứng thì pha một phần nước máy với ba phần nước RO hoặc nước mưa sạch, rồi đo GH và pH của nước đã pha.',
      'Đo bằng bộ test GH và pH. Tăng hay giảm phần nước RO đến khi GH vào mức cá cần.',
    ]],
    ['Giữ nước mềm ổn định', 'giu-on-dinh', [
      'Mỗi tuần thay khoảng 20% bằng nước đã pha sẵn, cùng GH và pH với bể. Lũa và lá bàng giúp pH xuống nhẹ.',
      'Nước cứng hơn mức cá cần thì cá yếu dần, dễ bệnh và khó sinh sản.',
    ]],
  ]),
}
const items = [
  { kind: 'fish', id: 'pterophyllum-probatum', name: 'Cá ông tiên thử', sub: 'Pterophyllum probatum', path: FISH, tempC: { min: 28, max: 32 }, ph: { min: 4.8, max: 6.2 }, gh: { min: 0, max: 5 }, sizeCm: 18 },
  { kind: 'guide', name: 'Nước mềm, độ cứng và pH: cách làm mềm nước cho bể cá', path: GUIDE },
] as Item[]
const handbook: Handbook = { lang: 'vi', items, byPath: p => items.find(i => i.path === p), byId: id => items.find(i => i.id === id), page: async p => pages[p], topics: async () => null }

const WATER = 'Cá ông tiên thử cần nước mềm như thế nào?'
const SICK = 'Cá ông tiên thử của mình mấy hôm nay bỏ ăn, bơi lờ đờ, phải làm sao?'
const earlier: Earlier[] = [{ question: 'Cá ông tiên thử nuôi có khó không?', text: 'Loài này khó nuôi vừa phải: nước mềm, pH 4,8-6,2, độ cứng 0-5°H, nhiệt độ 28-32°C, bể cao từ 70 cm.', blocks: [] }]

const TALK = /hai ý|chưa khớp|không khớp|mâu thuẫn|trái ngược|không thống nhất|chưa thống nhất|nói khác|ghi khác|có chỗ ghi|hai nguồn|hai con số/iu
const ABOVE = /ở trên|phía trên|như (?:mình )?đã nói|như (?:mình )?đã trả lời/iu
const HANDED = /(?:hỏi|nhờ|liên hệ|kiểm tra thêm với|tham khảo)[^.!?\n]{0,40}(?:người (?:nuôi|bán|có)|cửa hàng|shop|tiệm|chuyên gia|diễn đàn|hội |nhóm)/iu
const VET = /bác sĩ|thú y/iu
const STEP = /kiểm tra|thay|tách|đo |cách ly|giảm|tăng|dùng|tắm|ngừng|xử lý/iu
const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/u).map(s => s.trim()).filter(Boolean)
const reads = (h: { role: string; content: unknown }[]) => h.flatMap(m => (Array.isArray(m.content) ? m.content : []) as { type: string; name?: string; input?: { path?: string } }[]).filter(b => b.type === 'tool_use' && b.name === 'read_page').map(b => b.input?.path)

const asked = (h: { role: string; content: unknown }[]) => h.flatMap(m => (Array.isArray(m.content) ? m.content : []) as { type: string; name?: string; input?: unknown }[]).filter(b => b.type === 'tool_use').map(b => `${b.name} ${JSON.stringify(b.input)}`)

const { keys } = await loadKeys(await readFile(join(homedir(), '.config/aquatome/anthropic-keys'), 'utf8'))
if (!keys.length) throw new Error('No key in ~/.config/aquatome/anthropic-keys')
const store = memoryHealth()
async function ask(question: string, before: Earlier[]) {
  const healthy = await healthyKeys(keys, store, Date.now())
  const send: ChatOptions['send'] = async (b, o) => {
    const r = await rotate(healthy, store, async (k, left) => (await clientFor(k)).messages.create(b, { timeout: Math.min(left, o.timeoutMs) }), { budgetMs: o.timeoutMs })
    if (!r.ok) throw new Error(`no key answered: ${r.reason}`)
    return r.value
  }
  return answerQuestion({ send, model: MODEL, lang: 'vi', question, earlier: before, start: {}, handbook, tanks: async () => [] })
}

let filed = 0
const handedOn = (text: string) => sentences(text).filter(s => HANDED.test(s) || (VET.test(s) && !STEP.test(s)))

async function checkWater(): Promise<string[]> {
  const run = await ask(WATER, earlier)
  const text = run.answer?.text
  if (!text) return [`no answer (${run.stopped})`]
  const bad: string[] = []
  if (TALK.test(text)) bad.push(`talks about the pages disagreeing: "${text.match(TALK)![0]}"`)
  if (!/4[,.]8/u.test(text) || !/6[,.]2/u.test(text)) bad.push('leaves out the card\'s pH')
  if (!/0\s*(?:-|–|đến|tới)\s*5/u.test(text)) bad.push('leaves out the card\'s hardness')
  if (!/\bRO\b|nước mưa/iu.test(text)) bad.push('gives no way to make soft water')
  if (!reads(run.history).includes(GUIDE)) bad.push(`did not read the guide (it asked: ${asked(run.history).join('; ')})`)
  if (ABOVE.test(text)) bad.push(`points at an earlier answer: "${text.match(ABOVE)![0]}"`)
  if (handedOn(text).length) bad.push(`hands the question on: "${handedOn(text)[0]}"`)
  if ((await checkedClashes(handbook, run.answer!.clashes ?? [])).length) filed++
  return bad
}
async function checkSick(): Promise<string[]> {
  const run = await ask(SICK, [])
  const text = run.answer?.text
  if (!text) return [`no answer (${run.stopped})`]
  return handedOn(text).map(s => `hands the question on: "${s}"`)
}

let failed = 0
const runs = Number(args.runs)
for (let i = 1; i <= runs; i++) {
  for (const [name, check] of [['soft water', checkWater], ['sick fish', checkSick]] as const) {
    const bad = await check()
    if (bad.length) failed++
    console.log(`run ${i}, ${name}: ${bad.length ? `FAILED\n  ${bad.join('\n  ')}` : 'ok'}`)
  }
}
// Filing can miss now and then without the reader seeing anything, so it fails only when it stops happening.
console.log(`Filed the two places word for word in ${filed} of ${runs}.`)
if (filed * 2 < runs) failed++
console.log(failed ? `${failed} failed.` : 'All held.')
process.exit(failed ? 1 : 0)
