import type { Content, GlossaryLinkTerm } from '@aq/schema'

export const glossaryTerms = (c: Content): GlossaryLinkTerm[] =>
  c.glossary.map(g => ({ name: g.t.name, href: `/vi/thuat-ngu/${g.t.slug}/` }))
