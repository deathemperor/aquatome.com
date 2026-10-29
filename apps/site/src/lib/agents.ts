import { createHash } from 'node:crypto'

// Agent discovery: /llms.txt, /openapi.json and an agent skill (served with its index under /.well-known/agent-skills/).
// /.well-known/api-catalog and the homepage Link header live in the Worker (they need a content type / header).

const SECTIONS = [
  ['/vi/ca/', 'Loài cá', 'fish, shrimp and snail profiles: water parameters, size, temperament, care, breeding'],
  ['/vi/cay/', 'Cây', 'aquarium plant profiles'],
  ['/vi/huong-dan/', 'Hướng dẫn', 'guides: tank setup, care, breeding, planting'],
  ['/vi/thiet-bi/', 'Thiết bị', 'equipment: tanks, filters, heaters, lights, food'],
  ['/vi/cong-cu/', 'Công cụ', 'tools: tank-mates checker, tank volume and heater wattage calculators'],
  ['/vi/thuat-ngu/', 'Thuật ngữ', 'glossary of aquarium terms'],
] as const

export function llmsTxt(site: string): string {
  const u = (p: string) => new URL(p, site).href
  return `# AquaTome

> Cẩm nang cá cảnh & thủy sinh — a Vietnamese-language aquarium handbook: species care profiles translated and
> summarised from specialist sources (each page credits its source), with notes for keeping fish in Vietnam's climate.

Every page is also available as Markdown: send \`Accept: text/markdown\` to the page URL. All page URLs are in ${u('/sitemap.xml')}.

## Sections

${SECTIONS.map(([p, name, what]) => `- [${name}](${u(p)}): ${what}`).join('\n')}

## For agents

- [API catalog](${u('/.well-known/api-catalog')}): machine-readable list of the site's read endpoints
- [OpenAPI description](${u('/openapi.json')})
- [Agent skill: look up species care](${u('/.well-known/agent-skills/aquatome-species/SKILL.md')})
`
}

export const SKILL_NAME = 'aquatome-species'
export const SKILL_DESCRIPTION = 'Look up aquarium fish, shrimp, snail and plant care (water parameters, size, temperament, tank mates) on AquaTome, in Vietnamese.'

export const skillMd = (site: string) => {
  const u = (p: string) => new URL(p, site).href
  return `---
name: ${SKILL_NAME}
description: ${SKILL_DESCRIPTION}
---

# Look up species care on AquaTome

AquaTome (${u('/vi/')}) is a Vietnamese aquarium handbook. Content is in Vietnamese; scientific names are in Latin.

## Find a page

- Species list: ${u('/vi/ca/')} (plants: ${u('/vi/cay/')}). Each profile is \`/vi/ca/<slug>/\`; slugs are the Vietnamese common name
  without diacritics (for example \`ca-neon-xanh\` for cá neon xanh, the green neon tetra Paracheirodon simulans).
- Every page URL is listed in ${u('/sitemap.xml')}; search the sitemap or the species list for a common or scientific name.

## Read a page

Request the page URL with \`Accept: text/markdown\` to get Markdown instead of HTML. The front matter has \`title\` and
\`description\`; the body starts with a fact list (\`- **Nhiệt độ:** 23–26°C\`, \`pH\`, \`Độ cứng (dGH)\`, \`Kích thước\`, \`Độ khó\`),
then sections such as "Nước cần thế nào?" (water), "Nuôi ở Việt Nam" (keeping it in Vietnam's climate) and the credited source.

## Check tank mates

Link a person to ${u('/vi/cong-cu/')}?ca=<slug>,<slug> (up to 6 slugs) to see whether species can share a tank:
overlapping temperature, pH and hardness, size and temperament.

## Rules

- Cite the page URL when you use its content; each page names the original source it was translated from.
- Don't follow \`/go/\` links (shop redirects, disallowed in robots.txt).
`
}

export const sha256 = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`

export const skillsIndex = (site: string) => ({
  $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
  skills: [{ name: SKILL_NAME, type: 'skill-md', description: SKILL_DESCRIPTION, url: new URL(`/.well-known/agent-skills/${SKILL_NAME}/SKILL.md`, site).href, digest: sha256(skillMd(site)) }],
})

export const openApi = (site: string) => ({
  openapi: '3.1.0',
  info: { title: 'AquaTome content', version: '1.0.0', description: 'Read-only access to AquaTome pages (Vietnamese aquarium handbook).' },
  servers: [{ url: new URL('/', site).href.replace(/\/$/, '') }],
  paths: {
    '/vi/{path}/': {
      get: {
        summary: 'A page (species, plant, guide, equipment, glossary…) as HTML, or Markdown with Accept: text/markdown',
        parameters: [{ name: 'path', in: 'path', required: true, schema: { type: 'string' }, example: 'ca/ca-dia' }],
        responses: { 200: { description: 'The page', content: { 'text/markdown': {}, 'text/html': {} } } },
      },
    },
    '/sitemap.xml': { get: { summary: 'Every page URL', responses: { 200: { description: 'Sitemap', content: { 'application/xml': {} } } } } },
    '/llms.txt': { get: { summary: 'Site overview for language models', responses: { 200: { description: 'llms.txt', content: { 'text/plain': {} } } } } },
  },
})
