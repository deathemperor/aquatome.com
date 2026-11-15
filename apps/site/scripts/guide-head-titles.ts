// The guides whose title in Indonesian, Thai or Malay names other pages than the Vietnamese title does: a translation
// fault, for Writing (the chief of staff, 15 Nov 2026). Each guide's head is the Vietnamese title's page in every language
// all the same (mentions.ts heads). Prints them, tab-separated, then each language's guides with a head photo.
// `pnpm exec tsx scripts/guide-head-titles.ts [content]`
import { resolve } from 'node:path'
import { loadAll } from '@aq/schema'
import { guideImage, titleFaults, withVietnameseHeads } from '../src/lib/mentions'

const root = resolve(process.argv[2] ?? '../../content')
const load = (lang: 'vi' | 'id' | 'th' | 'ms') => loadAll({ root, lang, publicBuild: true, leaveOutHeld: true })
const vi = await load('vi')
const counts: string[] = [`vi\t${vi.guides.length} guides\t${vi.guides.filter(g => guideImage(vi, g)).length} with a head photo`]
console.log(['lang', 'guide', 'title', 'Vietnamese names', 'this title names'].join('\t'))
for (const lang of ['id', 'th', 'ms'] as const) {
  const own = await load(lang)
  const c = withVietnameseHeads({ ...own }, vi)
  for (const f of titleFaults(c)) console.log([lang, f.id, f.title, f.vi.join(' '), f.own.join(' ')].join('\t'))
  const heads = (x: typeof own) => x.guides.filter(g => guideImage(x, g)).length
  counts.push(`${lang}\t${own.guides.length} guides\t${heads(c)} with a head photo (${heads(own)} by its own title)`)
}
console.log(`\n${counts.join('\n')}`)
