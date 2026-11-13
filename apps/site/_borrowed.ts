import { writeFileSync } from 'node:fs'
import { fitsCard, LANGS } from '@aq/schema'
import { getContent } from './src/lib/content'
import { guideImage, mentionIndex } from './src/lib/mentions'
const out: string[] = []
for (const lang of LANGS) {
  const c = await getContent(lang)
  let borrowed = 0, changed = 0
  const ex: string[] = []
  for (const g of c.guides) {
    const m = mentionIndex(c).guides.get(g.id)
    const sections = (g.video?.figures ?? []).flatMap(f => f.photo ?? []).filter(fitsCard)
    const old = [...g.photos, ...sections, ...(m?.species ?? []).flatMap(s => s.photos[0] ?? []), ...(m?.plants ?? []).flatMap(p => p.photos[0] ?? [])].filter(p => !p.generated)[0]
    if (g.photos.length || sections.length || !old) continue
    borrowed++
    const now = guideImage(c, g)
    if (now?.url !== old.url) {
      changed++
      const who = (u?: string) => [...c.species, ...c.plants].find(x => x.photos[0]?.url === u)?.t.name
      if (ex.length < 40) ex.push(`${g.id} | ${g.t.name} | ${who(old.url)} -> ${who(now?.url)}`)
    }
  }
  out.push(`${lang}: ${borrowed} guides borrow a picture, ${changed} change`, ...ex.map(x => `  ${x}`))
  console.log(out.at(-1 - ex.length))
}
writeFileSync(`${process.env.HOME}/.cache/aquatome/curation/guide-borrowed.txt`, out.join('\n') + '\n')
