import { linkTerms, type Content } from '@aq/schema'
import { creditsFor } from './credits'
import { normKeyword, type CategoryUse } from './equipment'
import { categoryLabel, goLink } from './format'
import { creatorsUse } from './gear'
import { translator, type Lang } from './i18n'
import { kitPictures, speciesListPhotos, speciesLists } from './list-data'
import { guideImages, guidesMentioning, mentionIndex } from './mentions'
import { pagePictures, takeEach } from './pictures'
import { productHref } from './products'
import { PAGE } from '../scripts/filter-list'

/**
 * What an equipment category's page shows, put together once for the page (pages/thiet-bi/[category].astro) and for the
 * app's copy of it (lib/app-page.ts), so the two can't differ. Shop links, shop searches and the gear Vietnamese videos
 * use are for the Vietnamese market: that page only (`vn`). Every shop link is written for Shopee; the page's picker
 * rewrites them.
 */
export function equipmentParts(lang: Lang, c: Content, u: CategoryUse) {
  const t = translator(lang)
  const vn = lang === 'vi'
  // Every picture once, in page order (lib/list-data.ts kitPictures): the kit's, each type's, the fish beside each type,
  // the plants, then the fish list's first page as its data file has it, then the guides.
  const { g, types, plants, typePhotos, whoPhotos, plantPhotos, above } = kitPictures(lang, c, u.category)
  const label = g?.name ?? t(categoryLabel(u.category))
  const entity = `equipment:${u.category}`
  const guides = guidesMentioning(c, entity).slice(0, 6)
  // The species suggesting this kit, a page at a time (components/PagedSpecies).
  const users = speciesLists(lang, c).get(`thiet-bi/${u.category}`) ?? []
  const plantsPage = u.category === 'cay-thuy-sinh'
  const needCo2 = plants.filter(p => p.co2 === 'required').length
  // Editorial text links glossary terms, species and other equipment once each, never this page: in page order.
  const targets = mentionIndex(c).targets
  const seen = new Set([entity])
  const link = (html: string) => linkTerms(html, targets, 'ml', seen).html
  const intro = g ? link(g.intro) : ''
  const go = (k: string) => goLink('shopee', k, u.category, entity)
  const kinds = types.map((ty, k) => ({
    id: ty.id,
    name: ty.name,
    photo: typePhotos[k] ?? null,
    desc: link(ty.desc),
    pick: ty.pick,
    // Products with their own page (engine product), per type of this kit.
    picks: c.products.filter(p => p.category === u.category && p.type === ty.id).map(p => ({ name: `${p.brand} ${p.model}`, href: productHref(p) })),
    buy: vn ? { text: ty.buy, href: go(ty.buy) } : null,
    searches: vn && ty.keywords.length > 1 ? ty.keywords.filter(x => x !== ty.buy).slice(0, 4).map(x => ({ text: x, href: go(x) })) : [],
    who: ty.species.slice(0, 6).map((s, i) => ({ s, photo: whoPhotos[k]![i] ?? null })),
    whoMore: Math.max(0, ty.species.length - 6),
    whoTitle: t('Loài dùng {name}', { name: ty.name.toLowerCase() }),
  }))
  const choose = g?.choose.map(link) ?? []
  const mistakes = g?.mistakes.map(link) ?? []
  const faq = g?.faq.map(f => ({ q: f.q, a: f.a, html: link(f.a) })) ?? []
  // Brands and models the video guides use for this kind of kit (engine video-items).
  const creators = vn ? creatorsUse(lang, c, u.category).slice(0, 10).map(x => ({ name: x.name, product: x.product, count: x.guides.length, guides: x.guides.slice(0, 3) })) : []
  // The shop searches the most species and plants suggest, most first: a page of them (each species and plant page lists
  // its own). Every one any of them suggests made the list grow with the catalogue.
  const suggested = new Map<string, number>()
  for (const x of [...c.species, ...c.plants]) for (const k of new Set(x.productSlots.filter(s => s.category === u.category).flatMap(s => s.keywords.map(normKeyword)))) suggested.set(k, (suggested.get(k) ?? 0) + 1)
  const keywords = [...suggested].sort((a, b) => b[1] - a[1]).slice(0, PAGE).map(([k]) => k)
  const userPhotos = plantsPage ? [] : speciesListPhotos(lang, c, `thiet-bi/${u.category}`, users).slice(0, PAGE)
  const pics = pagePictures(c)
  for (const p of [...above, ...userPhotos]) pics.add(p?.url)
  const guidePhotos = takeEach(pics, guides, x => guideImages(c, x))
  return {
    g,
    vn,
    label,
    entity,
    intro,
    // The chips under the lead.
    chips: g ? [
      ...(users.length > 0 ? [t('{n} loài cá cần', { n: users.length })] : []),
      ...(plants.length > 0 ? [t('{n} loài cây', { n: plants.length })] : []),
      t('{n} loại', { n: g.types.length }),
      ...(guides.length > 0 ? [t('{n} bài viết', { n: guides.length })] : []),
    ] : [],
    kindsTitle: t('Các loại {label}', { label: label.toLowerCase() }),
    kinds,
    choose,
    mistakes,
    faq,
    creators,
    plantsTitle: plantsPage ? t('Cây thủy sinh trên AquaTome') : t('Cây cần CO2'),
    plants: plants.slice(0, PAGE).map((p, i) => ({ p, photo: plantPhotos[i] ?? null })),
    plantsMore: plants.length > PAGE && (plantsPage || needCo2 > 0)
      ? { text: plantsPage ? t('Xem cả {n} loài cây', { n: plants.length }) : t('Xem cả {n} loài cây bắt buộc có CO₂', { n: needCo2 }), href: plantsPage ? '/vi/cay/' : '/vi/cay/?co2=required' }
      : null,
    // The fish list: the plants' page lists plants instead.
    users: plantsPage ? [] : users,
    usersTitle: t('Loài cá cần {label}', { label: label.toLowerCase() }),
    userPhotos,
    guides: guides.map((x, i) => ({ g: x, photo: guidePhotos[i] ?? null })),
    keywords,
    keywordsTitle: t('Gợi ý mua hay gặp ({n})', { n: keywords.length }),
    keywordLinks: keywords.map(k => ({ text: k, href: go(k) })),
    credits: creditsFor([g?.hero, ...typePhotos, ...whoPhotos.flat(), ...plantPhotos, ...userPhotos, ...guidePhotos].map(p => p ?? undefined)),
  }
}
