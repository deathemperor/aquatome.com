/**
 * Guides taken off the site for good, each address forwarding (the chief of staff, 14 Nov 2026): the gallery posts of
 * other people's tanks, whose photos we can't show, and the seller-site notices the 13 Nov sheet found nothing lasting in.
 * Their files stay, held by hand in every language (the engine's gate), so nothing writes them back; each language's
 * address forwards to its fish's page in that language, or to the guides list where there is none, or it's held there.
 */
export type RetiredTo = { kind: 'species' | 'breeds' | 'plants'; id: string } | 'guides'

const fish = (id: string): RetiredTo => ({ kind: 'species', id })

/** The seller-site notices to go off (the 13 Nov sheet's "Off" and "Forward"), each to the first fish page the sheet names. */
export const RETIRED_GUIDES: Readonly<Record<string, RetiredTo>> = {
  'glaser-en-07-carp-like-fishes-1-loaches-a-new-ornate-hillstream-loach-en': fish('sewellia-lineolata'),
  'glaser-en-10-catfishes-10a-catfishes-corydoras-co-the-cory-season-has-started-en': fish('corydoras-aeneus'),
  'glaser-en-08-carp-like-fishes-2-barbs-minnows-carps-goldfish-etc-small-goldfish-ranchu-mixed-colours': { kind: 'breeds', id: 'ranchu-goldfish' },
  'glaser-en-09-characoids-tetra-relationship-myleus-sp-second-take-en': 'guides',
  'glaser-en-10-catfishes-10a-catfishes-corydoras-co-new-rare-corys-en': fish('corydoras-burgessi'),
  'glaser-en-10-catfishes-10a-catfishes-corydoras-co-once-more-four-corydoras-from-peru-en': fish('corydoras-leucomelas'),
  'glaser-en-10-catfishes-10b-catfishes-suckermouths-plecos-and-l-numbers-three-new-chaetostoma-from-peru-en': 'guides',
  'glaser-en-18-toothcarps-killis-and-livebearers-dwarf-lampeyes-fluviphylax-from-venezuela-en': 'guides',
  'glaser-en-fisharchive-black-winged-dwarf-hatchets-carnegiella-marthae-and-c-schereri': fish('carnegiella-marthae'),
  'glaser-en-01-rays-stingray-babies': 'guides',
  'glaser-en-09-characoids-tetra-relationship-distichodus-noboli-and-d-affinis-en': fish('distichodus-affinis'),
  'glaser-en-10-catfishes-10b-catfishes-suckermouths-plecos-and-l-numbers-hemiloricaria-bycatches': fish('rineloricaria-platyura'),
  'glaser-en-25-perchlike-fishes-25a-perchlike-fishes-1-labyrinth-fishes-anabas-en': fish('anabas-testudineus'),
  'glaser-en-25-perchlike-fishes-25d-perchlike-fishes-4-south-american-dwarf-cichlids-biotoecus-special-en': fish('biotoecus-opercularis'),
  'glaser-en-25-perchlike-fishes-25d-perchlike-fishes-4-south-american-dwarf-cichlids-many-fantastic-apistogramma-arrived-en': fish('apistogramma-diplotaenia'),
  'glaser-en-25-perchlike-fishes-25e-perchlike-fishes-5-remaining-cichlids-from-south-and-central-america-brown-red-discus-madeira-nova-olinda-do-norte-en': fish('symphysodon-aequifasciatus'),
  'glaser-en-25-perchlike-fishes-25g-perchlike-fishes-7-remaining-groups-sunfish-special-en': fish('enneacanthus-gloriosus'),
  'glaser-en-32-all-the-rest-drought-in-singapore-and-malaysia': 'guides',
  'glaser-en-32-all-the-rest-guinea-import-arrived-en': fish('ladigesia-roloffi'),
  // The sheet's "forward": each one's lasting fact is on its fish's page now, under the dealer's name and the notice's
  // address, fixed (the chief of staff, 14 Nov 2026), or was there already (Sturisoma's nose). The Cichla hybrid notice
  // stays on until a ruling on the lines no fish page has yet (how the hybrids look, the genus grown from five species to
  // 15). The eques and Sturisoma notices go off on the Writing Lead's rulings of 15 Nov 2026: the genus's and C. armatus's
  // name meanings are shaky as the notice gives them, the gold spot is the batch's fish, and the page's later article
  // names no sex for the Sturisoma nose, so none of those lines goes on a page.
  'glaser-en-10-catfishes-10a-catfishes-corydoras-co-corydoras-eques-c-sp-aff-armatus-and-corydoras-duplicareus-en': fish('corydoras-eques'),
  'glaser-en-03-bony-tongues-scleropages-jardinii-and-s-leichardti-en': fish('scleropages-leichardti'),
  'glaser-en-10-catfishes-10b-catfishes-suckermouths-plecos-and-l-numbers-sturisoma-arrived-en': fish('sturisoma-nigrirostrum'),
  'glaser-en-18-toothcarps-killis-and-livebearers-limia-special-en': fish('limia-perugiae'),
  'glaser-en-fisharchive-hyphessobrycon-pyrrhonotus-juvenile': fish('hyphessobrycon-pyrrhonotus'),
  'glaser-en-32-all-the-rest-congo-importation-arrived-en': fish('distichodus-sexfasciatus'),
  'glaser-en-32-all-the-rest-finally-an-import-from-guinea-en': fish('pelvicachromis-rubrolabiatus'),
  // The Writing Lead's rulings of 15 Nov 2026 on the four held back: the hatchetfish imports' size and C. myersi's males,
  // A. adonis's 1 m as "is said to" are on their pages. The C. narcissus and lungfish notices stay on until a ruling on a
  // line each has that no page has: C. robustus's sexes told apart by the ventral fins, and P. aethiopicus's and
  // P. annectens's bites often a mistake for food (the lungfish's daily watch and wool method are on P. dolloi's page).
  'glaser-en-09-characoids-tetra-relationship-thoracocharax-stellatus-gasteropelecus-maculatus-jumbo-carnegiella-myersi-carnegiella-strigata-2': fish('thoracocharax-stellatus'),
  'glaser-en-10-catfishes-10b-catfishes-suckermouths-plecos-and-l-numbers-huge-acanthicus-adonis-arrived-en': fish('acanthicus-adonis'),
}

/** 2hraquarist's gallery posts of other people's tanks: every one, those written later too, off to the guides list. */
export const GALLERY_POST = /^2hraquarist-blogs-aquascaping-ideas-/

/** Where a retired guide's addresses forward, or undefined for a guide that stays. */
export const retiredTo = (id: string): RetiredTo | undefined => RETIRED_GUIDES[id] ?? (GALLERY_POST.test(id) ? 'guides' : undefined)

/** The hold a retired guide carries in every language (the engine's gate), the same each run. */
export const RETIRED_HOLD = { checks: ['off'], at: '2026-11-15' } as const
