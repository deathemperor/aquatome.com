/**
 * Whether a glossary term's facts give a phrase as one of its names. The fact says it is the term's name, as the research
 * is asked to write one ("Name for the term: …"; "Vietnamese name: …", "English name for the term: …"), or that a page
 * names, writes or calls the term so ("a shop writes the term as …"); and it quotes the phrase whole, or as one part of a
 * quoted name ("Màng sinh học (Biofilm)" gives "Biofilm"), before any bracket or semicolon of its own. A phrase a fact only
 * contains ("đông lạnh" inside "Thức Ăn Đông Lạnh"), a kind's or a product's name, a spelling, and a quote in what a fact
 * adds after a bracket are not given. The step keeps a writer's other name only when this holds or the name is the term's
 * English one, and the test over every term holds each other name to the same, or to the names the chief of staff's read
 * kept (18 Nov 2026).
 */
const LABEL = /^(?:(?:vietnamese|english|alternative|other|another)\s+)*names?(?:\s+for the term[^:"“]*)?\s*:/i
const OF_TERM = /\b(?:names?|writes?|calls?) the term\b/i
const QUOTED = /["“]([^"”]+)["”]/g
const PARTS = /\s*[()]\s*|\s+(?:hoặc|or)\s+/u
const fold = (s: string) => s.normalize('NFC').trim().toLowerCase()

/** A fact up to its first bracket or semicolon outside quotes: what it says, not what it adds. */
function said(fact: string): string {
  let quoted = false
  for (let i = 0; i < fact.length; i++) {
    const c = fact[i]
    if (c === '"') quoted = !quoted
    else if (c === '“') quoted = true
    else if (c === '”') quoted = false
    else if (!quoted && (c === '(' || c === ';')) return fact.slice(0, i)
  }
  return fact
}

export function givenAsName(name: string, facts: readonly string[]): boolean {
  const n = fold(name)
  if (!n) return false
  return facts.some(f => {
    const s = said(f)
    const m = LABEL.exec(s) ?? OF_TERM.exec(s)
    return !!m && [...s.slice(m.index + m[0].length).matchAll(QUOTED)].some(q => fold(q[1]!) === n || q[1]!.split(PARTS).some(p => fold(p) === n))
  })
}
