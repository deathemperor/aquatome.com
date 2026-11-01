import type { Content } from '@aq/schema'

/** Each kind's section in the address, and its word on the page. */
export const KIND = { species: ['ca', 'Loài'], plant: ['cay', 'Cây'], guide: ['huong-dan', 'Hướng dẫn'] } as const

/**
 * Entries a page of /vi/moi-cap-nhat/: the newest there, older ones on its numbered pages (/vi/moi-cap-nhat/trang/2/…).
 * The engine keeps 500, which as one list was 2,641 page elements (2026-11-01).
 */
export const PER = 100

/** The changelog's entries whose page exists, newest first, with the page's address and name. */
export function changelogEntries(c: Content) {
  const pools = { species: c.species, plant: c.plants, guide: c.guides }
  return c.changelog.flatMap(e => {
    const item = (pools[e.kind] as { id: string; t: { slug: string; name: string } }[]).find(x => x.id === e.id)
    return item ? [{ ...e, href: `/vi/${KIND[e.kind][0]}/${item.t.slug}/`, name: item.t.name }] : []
  })
}
