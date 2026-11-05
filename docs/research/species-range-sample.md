# Where species live: a sample of 20 (2026-11-04)

The engine's new range step (`pnpm engine range`, `packages/engine/src/range.ts`) run on 20 species chosen to stress it, on a
scratch copy of the content. Nothing here is published: the step runs in the engine's rewrite cycle once merged, 20
species a cycle.

Each species gets two parts (`range` in its content, `RangeSchema` in `packages/schema/src/schemas.ts`):

- **native**: the countries and regions its cited sources give as where it lives in the wild. The model reads the
  sources' distribution, habitat, quick facts and notes, and gives each country with the source's sentence. The engine
  keeps a country only when that sentence is in that source's text word for word and names the country (its name, an
  old name like "Siam" or "Burma", or its adjective like "Brazilian"). A lake, basin or island goes in regions, never a
  country it lies in. Specialist sources outrank general pet-care sites (see "Which source counts" below), and a country
  a source that counts calls introduced or misidentified is left out. The species' origin pages (`places`) are
  compared as a check, not used.
- **records**: its wild records on GBIF, open licences only (CC0, CC BY 4.0), no aquarium or fossil specimens,
  coordinates without issues, on GBIF's 1.40625° map squares, each with how many are in a native country (GBIF's
  country field).

## Headline

- **15 of 20 got a native range**: 14 with countries, 1 with a lake only (*Labidochromis caeruleus*: "Endemic to Lake
  Malawi."). The other 5 have sources that say nothing about where they live (the two shrimp, *Protocheirodon pi*), or
  only where a shipment came from (*Pyrrhulina spilota*, "imported from Peru"; *Monodactylus argenteus*, "caught near
  Java"), which the step doesn't count as a range.
- **Look wrong: none include a wrong country; 3 miss one, left as they are by decision.**
  - The two wrong countries of the first passes are gone under the source ranking: China for *Betta splendens* and
    Malaysia for the clown loach rested on The Spruce Pets alone, and Seriously Fish says where both live. Each is
    logged in engine-state with its sentence.
  - Missed, and kept that way (no inference beyond the sources): Malawi for *Labidochromis caeruleus* (its one source
    names only the lake); Venezuela for *Hypancistrus inspector* (Glaser: "the Rio Negro in Brazil"; 6 of its 8 GBIF
    records are up the same river in Venezuela and Colombia); Venezuela for the neon tetra (12 of its 39 records; the
    sources name the Orinoco basin, not Venezuela).
- **The disputes come out right.** *Betta splendens* is Thailand without Cambodia, Indonesia, Malaysia or Vietnam: The
  Spruce Pets calls them native, Seriously Fish calls them other species or feral populations. The dwarf gourami
  loses Nepal and Myanmar (Seriously Fish: misidentification) and the Nepalese rivers Aquarium Breeder names with them.
- **Records**: all 20 names matched GBIF exactly; 19 have open records (*Caridina logemanni* has none). The share
  inside the native countries runs from 100% (*Ancistrus dolichopterus*, *Nothobranchius rachovii*) down to 27% for the
  goldfish and 9% for the guppy, whose open records are mostly feral populations (Brazil, Japan, Taiwan). A map of
  records must show inside and outside apart, or it shows the guppy as a Brazilian and Japanese fish.
- **Stable**: four passes (the last with the source ranking) gave the same countries for the 18 the later rules didn't
  touch. Which tributaries make the region list varies a little between passes.
- **Origin pages disagree on 10 species.** On 8 they list more: the countries a dispute, the source ranking or the
  naming rule leaves out (Cambodia, Indonesia, Malaysia, Vietnam and China for the betta; Malaysia for the clown loach;
  Nepal and Myanmar for the dwarf gourami; Nepal for *Botia almorhae*, "possibly Nepal"; Malawi for *Labidochromis*;
  Angola for *Aphyosemion australe*), or where a shipment came from (Thailand and Indonesia for *Monodactylus*, Peru for
  *Pyrrhulina*). On 2 the sources add one (Ecuador for the
  neon tetra, South Korea for the goldfish). The step never copies the origin pages: they came from the same model
  reading, without a quote.

| Species | Native countries | Regions | GBIF records | Inside native |
| --- | --- | --- | --- | --- |
| *Betta splendens* | TH | Chao Phraya, Malay Peninsula | 427 | 83% |
| *Paracheirodon innesi* | CO, BR, PE, EC | Amazon, Orinoco, Putumayo, Solimões, Purus, Marañon | 39 | 69% |
| *Poecilia reticulata* | VE, GY, SR, GF, TT, BB, AG | Guayre River, Trinidad, Tobago | 8249 | 9% |
| *Pterophyllum scalare* | BR, CO, GY, SR, GF, PE | Amazon, Essequibo, Oyapock, Rio Negro, Rio Ucayali, Rio Solimões | 310 | 95% |
| *Trichogaster lalius* | PK, IN, BD | – | 67 | 88% |
| *Labidochromis caeruleus* | – | Lake Malawi | 9 | – |
| *Maylandia estherae* | MZ, MW | Lake Malawi | 15 | 93% |
| *Chromobotia macracanthus* | ID | Borneo, Sumatra, Kapuas, Kayan, Batang Hari, Musi | 15 | 60% |
| *Botia almorhae* | IN | Ganges, Kosi, Yamuna, Alaknanda | 10 | 60% |
| *Ancistrus dolichopterus* | BR | Rio Negro | 40 | 100% |
| *Hypancistrus inspector* | BR | Rio Negro | 8 | 25% |
| *Nothobranchius rachovii* | MZ | Zambezi, Pungwe | 13 | 100% |
| *Aphyosemion australe* | GA, CG | Ogooué | 20 | 95% |
| *Neocaridina davidi* | – | – | 212 | – |
| *Caridina logemanni* | – | – | 0 | – |
| *Carassius auratus* | CN, KR, JP, RU | – | 46615 | 27% |
| *Monodactylus argenteus* | – | – | 1985 | – |
| *Pyrrhulina spilota* | – | – | 28 | – |
| *Protocheirodon pi* | – | – | 52 | – |
| *Acanthocobitis rubidipinnis* | MM | Irrawaddy | 15 | 100% |

## Which source counts (decided 2026-11-04)

- Each source in the engine's registry (`packages/engine/src/sources.ts`) has a tier. `specialist`: a species database
  or a scientific or aquarium-specialist site (Seriously Fish, PlanetCatfish, Loaches Online, ScotCat, Glaser, Aquarium
  Breeder, Aquarium Co-op, BW Aquatics, 2Hr Aquarist, Tropica). `general`: a general pet-care site (The Spruce Pets).
  A source the registry doesn't list counts as general.
- When a specialist source says where the species lives (a country or a region, such as "Endemic to Lake Malawi."),
  the native countries come from specialist sources only. A country only a general site gives is dropped and logged
  in `engine-state/range/<id>.json` (`outranked`, with its sentence). Its introduced or doubtful claims don't count
  either.
- General sites count only for a species no specialist covers. Their regions (the Orinoco for the neon tetra) still
  count: the rule is about countries.
- In this sample it dropped two countries, China for the betta and Malaysia for the clown loach, and changed nothing
  else.

## Cost per species

- **Model**: one call when the sources say anything about where it lives (none otherwise), on the engine's default
  model (Sonnet) through the subscription accounts. Measured over 62 calls: 12 s and about 1,500 output tokens on
  average; the CLI's own API-price figure averaged $0.025 a call (most $0.08, the guppy and neon tetra's long texts).
- **GBIF**: 12 requests on average (2 for a species with no open records, 18 for the guppy): the name match, one count
  with the records by country and by dataset, the 8 map tiles of the world, and the tiles that have records again for
  the native countries. About 0.85 s a request with the 300 ms gap between them; the responses are small (a tile is
  0–5 KB).
- **A cycle** (`RANGE_LIMIT` 20 model calls, `RANGE_RECORDS` 20 species): about 4 minutes of model calls and 240 GBIF
  requests over 3–4 minutes. The 1,383 species take about 9 days at 8 cycles a day; after that, each species' records
  are fetched again 30 days after the last time, about 45 a day, and its native part only when its sources' text
  changes.

## Found on the way

- **GBIF's map tiles are exact from zoom 1.** At zoom 0 GBIF gathers points coarser than the squares it draws: 12
  squares for the 41 cells *Betta splendens*'s 427 records fill. At zoom 1 and 2 every square matched binning the 427
  records themselves, cell for cell. The step reads zoom 1 (8 tiles), and fails a species whose squares don't add up to
  the search's count; none did. An empty tile comes back as 204 or as 400 "missing the expected layer".
- **Open licences cost iNaturalist.** Most iNaturalist research-grade records on GBIF are CC BY-NC: of *Betta
  splendens*'s 719 records, 115 are NC, and they are left out.
- **Names two countries share.** "Congo" and "Korea" stand for either country, as the model reads the sentence ("Congo
  which borders Gabon to the south"): the first pass refused them, losing the Republic of the Congo for *Aphyosemion
  australe* (9 of its 20 records) and South Korea for the goldfish (10,532 records).
- **Regions.** The first pass took provinces at the ends of a range ("from Chiang Rai province … to Surat Thani") and
  rivers of a country a source disputes. Regions are now river systems, lakes, islands and wider natural regions, at
  most 6, and one the quote puts in a disputed country goes with it.

## For the owner

1. **A species with only a lake or a basin** (Lake Malawi) has no countries, so its records have no inside or outside.
   Mapping a lake to its countries would come from the model's knowledge, which the rules forbid. Left as it is
   (decided 2026-11-04), as is Venezuela for the neon tetra.
2. **The GBIF credit.** GBIF asks that data used from its API be cited with a DOI. For data not from one download, it
   mints one for a *derived dataset*: a list of the datasets used and how many records each gave. The step keeps each
   species' datasets and counts (`engine-state/range/<id>.json`, `datasets`), so after the first full pass the owner
   can register one derived dataset for the site (gbif.org/derived-dataset/register, a free GBIF account) and the
   credit can read "GBIF.org (date) … https://doi.org/…" beside "GBIF.org, n records, CC BY 4.0". Worth it: CC BY
   needs the publishers credited, and the DOI is how GBIF does that. It needs no change to the step.
3. **What a page shows.** Native countries and regions in words, a map of records with inside and outside apart, and
   the GBIF credit. The app index carries the words and the counts (`protocols/range-vectors.json`); the cells stay in
   the content until a map is designed (the sample's species have 13 cells at the median and 95 on average, which over
   1,383 species would add a few megabytes to an index phones download).

## Per species

### Betta splendens (`betta-splendens`)

Sources read: bwaquatics, sprucepets, seriouslyfish.

**Native countries**

- TH Thailand: sprucepets: "Bettas are native to Thailand (formerly Siam), Indonesia, Malaysia, Vietnam, and parts of China." · seriouslyfish: "Occurs naturally throughout central Thailand, from Chiang Rai province in the north to Surat Thani and Phang Nga provinces at the northern extremity of the Malay Peninsula, just below the Isthmus of Kra."

**Regions**

- Chao Phraya: seriouslyfish: "Type locality is 'Menam River, Thailand', which refers to the Chao Phraya river basin."
- Malay Peninsula: seriouslyfish: "Occurs naturally throughout central Thailand, from Chiang Rai province in the north to Surat Thani and Phang Nga provinces at the northern extremity of the Malay Peninsula, just below the Isthmus of Kra."

**Left out (a source that counts calls them introduced or doubtful)**

- KH Cambodia: native per sprucepets: "Origin: Cambodia, Thailand" · doubtful per seriouslyfish: "Records from the remainder of southern (peninsular) Thailand, and the Mekong River basin in eastern Thailand, Laos, Vietnam, and Cambodia refer to other species or introduced populations."
- ID Indonesia: native per sprucepets: "Bettas are native to Thailand (formerly Siam), Indonesia, Malaysia, Vietnam, and parts of China." · introduced per seriouslyfish: "It has been introduced to several countries, largely as a result of escape from ornamental fish farms, with known feral populations established in Singapore, Malaysia, Indonesia, Brazil, Colombia, and the Dominican Republic."
- MY Malaysia: native per sprucepets: "Bettas are native to Thailand (formerly Siam), Indonesia, Malaysia, Vietnam, and parts of China." · introduced per seriouslyfish: "It has been introduced to several countries, largely as a result of escape from ornamental fish farms, with known feral populations established in Singapore, Malaysia, Indonesia, Brazil, Colombia, and the Dominican Republic."
- VN Vietnam: native per sprucepets: "Bettas are native to Thailand (formerly Siam), Indonesia, Malaysia, Vietnam, and parts of China." · doubtful per seriouslyfish: "Records from the remainder of southern (peninsular) Thailand, and the Mekong River basin in eastern Thailand, Laos, Vietnam, and Cambodia refer to other species or introduced populations."

**Dropped: only a general site gives them, and a specialist says where it lives**

- CN China: sprucepets: "Bettas are native to Thailand (formerly Siam), Indonesia, Malaysia, Vietnam, and parts of China."

**Origin pages check:** origin pages only: KH Cambodia, ID Indonesia, MY Malaysia, VN Vietnam, CN China; sources only: none.

**GBIF:** taxonKey 2393998 (Betta splendens), 427 records in 46 cells; inside the native countries 353 (83%), outside 74 (17%). 16 requests.
Top outside: Australia 23, Vietnam 13, Malaysia 7, Indonesia 6, Cambodia 5.

### Paracheirodon innesi (`paracheirodon-innesi`)

Sources read: sprucepets, seriouslyfish.

**Native countries**

- CO Colombia: sprucepets: "Origin: Southeastern Colombia, eastern Peru, western Brazil" · seriouslyfish: "The neon tetra, Paracheirodon innesi, is a small characid from the Amazon basin in Colombia, Brazil and Peru, found in acidic forest streams." · sprucepets: "Neon tetras originated from the clear water and blackwater streams and tributaries in the Orinoco and Amazon river basins in Brazil, Columbia, and Peru." · seriouslyfish: "Confirmed records suggest it to occur in several geographically-disparate areas, the first of which is the area around Leticia, Colombia and Tabatinga, Brazil, an area known as the 'Três Fronteiras'."
- BR Brazil: sprucepets: "Origin: Southeastern Colombia, eastern Peru, western Brazil" · seriouslyfish: "The neon tetra, Paracheirodon innesi, is a small characid from the Amazon basin in Colombia, Brazil and Peru, found in acidic forest streams." · sprucepets: "Neon tetras originated from the clear water and blackwater streams and tributaries in the Orinoco and Amazon river basins in Brazil, Columbia, and Peru." · seriouslyfish: "Confirmed records suggest it to occur in several geographically-disparate areas, the first of which is the area around Leticia, Colombia and Tabatinga, Brazil, an area known as the 'Três Fronteiras'."
- PE Peru: sprucepets: "Origin: Southeastern Colombia, eastern Peru, western Brazil" · seriouslyfish: "The neon tetra, Paracheirodon innesi, is a small characid from the Amazon basin in Colombia, Brazil and Peru, found in acidic forest streams." · sprucepets: "Neon tetras originated from the clear water and blackwater streams and tributaries in the Orinoco and Amazon river basins in Brazil, Columbia, and Peru." · seriouslyfish: "The type locality was originally given as 'near Iquitos', referring to the city of that name in the rainforest of Loreto region, Peru, although the specimens themselves derived from an aquarium import, and even today the true extent of its distribution remains unclear."
- EC Ecuador: seriouslyfish: "These records include occurrences in Jenaro Herrera District, Requena province (Río Ucayali drainage) and the Río Marañon in Peru, rio Japurá (known as the Río Caquetá in Colombia) in Colombia and Brazil, rio Javary (aka Yavarí) in Brazil, plus the ríos Curaray and Mazán (both tributary drainages of the Río Napo in Ecuador and Peru, respectively)."

**Regions**

- Amazon: seriouslyfish: "The neon tetra, Paracheirodon innesi, is a small characid from the Amazon basin in Colombia, Brazil and Peru, found in acidic forest streams."
- Orinoco: sprucepets: "Neon tetras originated from the clear water and blackwater streams and tributaries in the Orinoco and Amazon river basins in Brazil, Columbia, and Peru."
- Putumayo: seriouslyfish: "Here P. innesi is known from the lower rio Putumayo (aka Içá) and some small streams flowing into the rio Solimões downstream of Leticia."
- Solimões: seriouslyfish: "Here P. innesi is known from the lower rio Putumayo (aka Içá) and some small streams flowing into the rio Solimões downstream of Leticia."
- Purus: seriouslyfish: "The second cluster of populations occur several hundred kilometers to the east in the area around Codajás in Amazonas state, Brazil, plus the rio Purus, a tributary of the Amazon with its mouth located downstream of Codajás."
- Marañon: seriouslyfish: "These records include occurrences in Jenaro Herrera District, Requena province (Río Ucayali drainage) and the Río Marañon in Peru, rio Japurá (known as the Río Caquetá in Colombia) in Colombia and Brazil, rio Javary (aka Yavarí) in Brazil, plus the ríos Curaray and Mazán (both tributary drainages of the Río Napo in Ecuador and Peru, respectively)."

**Origin pages check:** origin pages only: none; sources only: EC Ecuador.

**GBIF:** taxonKey 2353909 (Paracheirodon innesi), 39 records in 13 cells; inside the native countries 27 (69%), outside 12 (31%). 12 requests.
Top outside: Venezuela 12.

### Poecilia reticulata (`poecilia-reticulata`)

Sources read: sprucepets, seriouslyfish.

**Native countries**

- VE Venezuela: sprucepets: "They are native to freshwater streams in the north of South America, including Suriname, Guyana, and Venezuela, and the Caribbean islands, including Barbados and Trinidad and Tobago." · seriouslyfish: "The guppy, Poecilia reticulata, is a livebearer native to northeastern South America and the southern Caribbean, including Venezuela and Trinidad."
- GY Guyana: sprucepets: "They are native to freshwater streams in the north of South America, including Suriname, Guyana, and Venezuela, and the Caribbean islands, including Barbados and Trinidad and Tobago." · seriouslyfish: "Native to northeastern South America and the southern Caribbean with its original range considered to cover Venezuela, Guyana, Suriname, French Guiana plus the islands of Trinidad and Tobago, Barbados, Antigua and Barbuda and the Netherlands Antilles."
- SR Suriname: sprucepets: "They are native to freshwater streams in the north of South America, including Suriname, Guyana, and Venezuela, and the Caribbean islands, including Barbados and Trinidad and Tobago." · seriouslyfish: "Native to northeastern South America and the southern Caribbean with its original range considered to cover Venezuela, Guyana, Suriname, French Guiana plus the islands of Trinidad and Tobago, Barbados, Antigua and Barbuda and the Netherlands Antilles."
- GF French Guiana: seriouslyfish: "Native to northeastern South America and the southern Caribbean with its original range considered to cover Venezuela, Guyana, Suriname, French Guiana plus the islands of Trinidad and Tobago, Barbados, Antigua and Barbuda and the Netherlands Antilles."
- TT Trinidad & Tobago: sprucepets: "They are native to freshwater streams in the north of South America, including Suriname, Guyana, and Venezuela, and the Caribbean islands, including Barbados and Trinidad and Tobago." · seriouslyfish: "Native to northeastern South America and the southern Caribbean with its original range considered to cover Venezuela, Guyana, Suriname, French Guiana plus the islands of Trinidad and Tobago, Barbados, Antigua and Barbuda and the Netherlands Antilles."
- BB Barbados: sprucepets: "They are native to freshwater streams in the north of South America, including Suriname, Guyana, and Venezuela, and the Caribbean islands, including Barbados and Trinidad and Tobago." · seriouslyfish: "Native to northeastern South America and the southern Caribbean with its original range considered to cover Venezuela, Guyana, Suriname, French Guiana plus the islands of Trinidad and Tobago, Barbados, Antigua and Barbuda and the Netherlands Antilles."
- AG Antigua & Barbuda: seriouslyfish: "Native to northeastern South America and the southern Caribbean with its original range considered to cover Venezuela, Guyana, Suriname, French Guiana plus the islands of Trinidad and Tobago, Barbados, Antigua and Barbuda and the Netherlands Antilles."

**Regions**

- Guayre River: seriouslyfish: "Type locality is 'Guayre River, Caracas, Venezuela'."
- Trinidad: sprucepets: "They are named for Robert John Lechmere Guppy who collected these fish on the island of Trinidad in 1866."
- Tobago: seriouslyfish: "Native to northeastern South America and the southern Caribbean with its original range considered to cover Venezuela, Guyana, Suriname, French Guiana plus the islands of Trinidad and Tobago, Barbados, Antigua and Barbuda and the Netherlands Antilles."

**Refused by the checks**

- Barbados (region, sprucepets): a country. "They are native to freshwater streams in the north of South America, including Suriname, Guyana, and Venezuela, and the Caribbean islands, including Barbados and Trinidad and Tobago."

**Origin pages check:** origin pages only: none; sources only: none.

**GBIF:** taxonKey 2350050 (Poecilia reticulata), 8249 records in 449 cells; inside the native countries 717 (9%), outside 7532 (91%); 2 with no country. 18 requests.
Top outside: Brazil 1698, Japan 1638, Taiwan 1018, Colombia 726, Australia 375.

### Pterophyllum scalare (`pterophyllum-scalare`)

Sources read: glaser, seriouslyfish.

**Native countries**

- BR Brazil: glaser: "Origin: Brazil" · glaser: "Wild-collected angelfish from the municipality of Santa Isabel on the Rio Negro, Brazil." · seriouslyfish: "The natural range of this species covers parts of Colombia, Guyana, Suriname, French Guiana, Peru and Brazil."
- CO Colombia: seriouslyfish: "The natural range of this species covers parts of Colombia, Guyana, Suriname, French Guiana, Peru and Brazil."
- GY Guyana: seriouslyfish: "The natural range of this species covers parts of Colombia, Guyana, Suriname, French Guiana, Peru and Brazil."
- SR Suriname: seriouslyfish: "The natural range of this species covers parts of Colombia, Guyana, Suriname, French Guiana, Peru and Brazil."
- GF French Guiana: seriouslyfish: "The natural range of this species covers parts of Colombia, Guyana, Suriname, French Guiana, Peru and Brazil."
- PE Peru: seriouslyfish: "The natural range of this species covers parts of Colombia, Guyana, Suriname, French Guiana, Peru and Brazil."

**Regions**

- Amazon: seriouslyfish: "The angelfish, Pterophyllum scalare, is a cichlid from the Amazon, Essequibo, Oyapock and other rivers of northern South America."
- Essequibo: seriouslyfish: "The angelfish, Pterophyllum scalare, is a cichlid from the Amazon, Essequibo, Oyapock and other rivers of northern South America."
- Oyapock: seriouslyfish: "The angelfish, Pterophyllum scalare, is a cichlid from the Amazon, Essequibo, Oyapock and other rivers of northern South America."
- Rio Negro: glaser: "Wild-collected angelfish from the municipality of Santa Isabel on the Rio Negro, Brazil."
- Rio Ucayali: seriouslyfish: "It's found in numerous river systems, including the Rio Oyapock, Rio Essequibo, Rio Ucayali, Rio Solimões and the main Amazon drainage."
- Rio Solimões: seriouslyfish: "It's found in numerous river systems, including the Rio Oyapock, Rio Essequibo, Rio Ucayali, Rio Solimões and the main Amazon drainage."

**Origin pages check:** origin pages only: none; sources only: none.

**GBIF:** taxonKey 5208518 (Pterophyllum scalare), 310 records in 65 cells; inside the native countries 296 (95%), outside 14 (5%). 15 requests.
Top outside: Canada 7, Namibia 3, Bahamas 1, India 1, Norway 1.

### Trichogaster lalius (`trichogaster-lalius`)

Sources read: seriouslyfish, sprucepets, aquariumbreeder.

**Native countries**

- PK Pakistan: seriouslyfish: "Widely distributed through Pakistan, northern India and Bangladesh." · aquariumbreeder: "It is widely distributed in Nepal (Koshi, Narayani and Karnali rivers), India (West Bengal), Pakistan, Myanmar and Bangladesh."
- IN India: seriouslyfish: "Widely distributed through Pakistan, northern India and Bangladesh." · sprucepets: "Originating in India (West Bengal and Assam) and Bangladesh, the dwarf gourami is native to thickly vegetated waters." · aquariumbreeder: "It is widely distributed in Nepal (Koshi, Narayani and Karnali rivers), India (West Bengal), Pakistan, Myanmar and Bangladesh."
- BD Bangladesh: seriouslyfish: "Widely distributed through Pakistan, northern India and Bangladesh." · sprucepets: "Originating in India (West Bengal and Assam) and Bangladesh, the dwarf gourami is native to thickly vegetated waters." · aquariumbreeder: "It is widely distributed in Nepal (Koshi, Narayani and Karnali rivers), India (West Bengal), Pakistan, Myanmar and Bangladesh."

**Left out (a source that counts calls them introduced or doubtful)**

- NP Nepal: doubtful per seriouslyfish: "Apparent occurences in Nepal and Myanmar are now thought to be as a result of misidentification." · native per aquariumbreeder: "It is widely distributed in Nepal (Koshi, Narayani and Karnali rivers), India (West Bengal), Pakistan, Myanmar and Bangladesh."
- MM Myanmar (Burma): doubtful per seriouslyfish: "Apparent occurences in Nepal and Myanmar are now thought to be as a result of misidentification." · native per aquariumbreeder: "It is widely distributed in Nepal (Koshi, Narayani and Karnali rivers), India (West Bengal), Pakistan, Myanmar and Bangladesh."

**Refused by the checks**

- Koshi (region, aquariumbreeder): in NP, which a source calls introduced or doubtful. "It is widely distributed in Nepal (Koshi, Narayani and Karnali rivers), India (West Bengal), Pakistan, Myanmar and Bangladesh."
- Narayani (region, aquariumbreeder): in NP, which a source calls introduced or doubtful. "It is widely distributed in Nepal (Koshi, Narayani and Karnali rivers), India (West Bengal), Pakistan, Myanmar and Bangladesh."
- Karnali (region, aquariumbreeder): in NP, which a source calls introduced or doubtful. "It is widely distributed in Nepal (Koshi, Narayani and Karnali rivers), India (West Bengal), Pakistan, Myanmar and Bangladesh."

**Origin pages check:** origin pages only: NP Nepal, MM Myanmar (Burma); sources only: none.

**GBIF:** taxonKey 5211200 (Trichogaster lalius), 67 records in 27 cells; inside the native countries 59 (88%), outside 8 (12%). 14 requests.
Top outside: Mexico 4, Brazil 1, Canada 1, Myanmar (Burma) 1, Nepal 1.

### Labidochromis caeruleus (`labidochromis-caeruleus`)

Sources read: seriouslyfish.

**Native countries:** none.

**Regions**

- Lake Malawi: seriouslyfish: "Endemic to Lake Malawi."

**Origin pages check:** origin pages only: MW Malawi; sources only: none.

**GBIF:** taxonKey 2371661 (Labidochromis caeruleus), 9 records in 3 cells; no native countries, so no inside or outside. 10 requests.
Top countries: Malawi 5, Tanzania 3, Austria 1.

### Maylandia estherae (`maylandia-estherae`)

Sources read: seriouslyfish.

**Native countries**

- MZ Mozambique: seriouslyfish: "The red zebra, Maylandia estherae, is a mbuna endemic to Lake Malawi, found along the Mozambique and Malawi coasts from Metangula to Gome." · seriouslyfish: "It occurs along the coasts of Mozambique and Malawi, from Metangula and Minos Reef to Gome."
- MW Malawi: seriouslyfish: "The red zebra, Maylandia estherae, is a mbuna endemic to Lake Malawi, found along the Mozambique and Malawi coasts from Metangula to Gome." · seriouslyfish: "It occurs along the coasts of Mozambique and Malawi, from Metangula and Minos Reef to Gome."

**Regions**

- Lake Malawi: seriouslyfish: "Endemic to Lake Malawi."

**Origin pages check:** origin pages only: none; sources only: none.

**GBIF:** taxonKey 2372994 (Maylandia estherae), 15 records in 2 cells; inside the native countries 14 (93%), outside 1 (7%). 12 requests.
Top outside: United States 1.

### Chromobotia macracanthus (`chromobotia-macracanthus`)

Sources read: sprucepets, seriouslyfish.

**Native countries**

- ID Indonesia: sprucepets: "They are native to Indonesia and prefer shaded, slow-moving waters with plenty of hiding spots." · seriouslyfish: "In the former it's restricted to river systems of Kalimantan Barat (West Kalimantan), Kalimantan Tengah (Central Kalimantan) and Kalimantan Timur (East Kalimantan) provinces in the Indonesian portion including the Kapuas and Kayan."

**Regions**

- Borneo: seriouslyfish: "Native to the Greater Sunda Islands of Borneo and Sumatra."
- Sumatra: seriouslyfish: "Native to the Greater Sunda Islands of Borneo and Sumatra."
- Kapuas: seriouslyfish: "In the former it's restricted to river systems of Kalimantan Barat (West Kalimantan), Kalimantan Tengah (Central Kalimantan) and Kalimantan Timur (East Kalimantan) provinces in the Indonesian portion including the Kapuas and Kayan."
- Kayan: seriouslyfish: "In the former it's restricted to river systems of Kalimantan Barat (West Kalimantan), Kalimantan Tengah (Central Kalimantan) and Kalimantan Timur (East Kalimantan) provinces in the Indonesian portion including the Kapuas and Kayan."
- Batang Hari: seriouslyfish: "In Sumatra it's found in eastern and southern drainages of Jambi, Sumatera Selatan (South Sumatra) and Lampung provinces including the Batang Hari, Musi and Tulang Bawang."
- Musi: seriouslyfish: "In Sumatra it's found in eastern and southern drainages of Jambi, Sumatera Selatan (South Sumatra) and Lampung provinces including the Batang Hari, Musi and Tulang Bawang."

**Dropped: only a general site gives them, and a specialist says where it lives**

- MY Malaysia: sprucepets: "The clown loach hails from the rivers and tributaries of Malaysia, Borneo, Sumatra, and Kalimantan."

**Origin pages check:** origin pages only: MY Malaysia; sources only: none.

**GBIF:** taxonKey 2367815 (Chromobotia macracanthus), 15 records in 8 cells; inside the native countries 9 (60%), outside 6 (40%). 14 requests.
Top outside: Malaysia 3, India 2, Canada 1.

### Botia almorhae (`botia-almorhae`)

Sources read: seriouslyfish.

**Native countries**

- IN India: seriouslyfish: "B. almorhae Gray, 1831 - This species is often referred to as the 'Pakistani' loach which is a misnomer since it's restricted to parts of the Ganges River drainage in northern India and possibly Nepal."

**Regions**

- Ganges: seriouslyfish: "B. almorhae Gray, 1831 - This species is often referred to as the 'Pakistani' loach which is a misnomer since it's restricted to parts of the Ganges River drainage in northern India and possibly Nepal."
- Kosi: seriouslyfish: "The description by Gray (1831) gives the type locality simply as 'Almorah' which corresponds to Almora district, Uttarakhand State, India and means the holotype could have derived from either the Kosi River or Sot River (Grant, 2007)."
- Yamuna: seriouslyfish: "In the Kosi drainage it's been collected close to the cities of Roorkee and Kashipur (both Uttarakhand State) and has also been recorded from the Yamuna River (Delhi State), Alaknanda River (Uttarakhand State), Markanda River (tributary of the Yamuna in Himachal Pradesh and Haryana States), Ghugger River (Himachal Pradesh State), Kali River (near the city of Meerut and in Muzaffarnagar and Bijnour districts, Uttar Pradesh State), Gambhir River (Sawai Madhopur district, Rajasthan State) and Chambal River (Kota district, Rajasthan State)."
- Alaknanda: seriouslyfish: "In the Kosi drainage it's been collected close to the cities of Roorkee and Kashipur (both Uttarakhand State) and has also been recorded from the Yamuna River (Delhi State), Alaknanda River (Uttarakhand State), Markanda River (tributary of the Yamuna in Himachal Pradesh and Haryana States), Ghugger River (Himachal Pradesh State), Kali River (near the city of Meerut and in Muzaffarnagar and Bijnour districts, Uttar Pradesh State), Gambhir River (Sawai Madhopur district, Rajasthan State) and Chambal River (Kota district, Rajasthan State)."

**Origin pages check:** origin pages only: NP Nepal; sources only: none.

**GBIF:** taxonKey 2368023 (Botia almorhae), 10 records in 8 cells; inside the native countries 6 (60%), outside 4 (40%). 12 requests.
Top outside: Nepal 3, Pakistan 1.

### Ancistrus dolichopterus (`ancistrus-dolichopterus`)

Sources read: seriouslyfish.

**Native countries**

- BR Brazil: seriouslyfish: "Ancistrus dolichopterus, the starlight ancistrus (L183), is a bristlenose catfish most likely endemic to the middle and lower rio Negro, Brazil."

**Regions**

- Rio Negro: seriouslyfish: "Ancistrus dolichopterus, the starlight ancistrus (L183), is a bristlenose catfish most likely endemic to the middle and lower rio Negro, Brazil."

**Origin pages check:** origin pages only: none; sources only: none.

**GBIF:** taxonKey 5961451 (Ancistrus dolichopterus), 40 records in 18 cells; inside the native countries 40 (100%), outside 0 (0%). 12 requests.
Top outside: none.

### Hypancistrus inspector (`hypancistrus-inspector`)

Sources read: glaser.

**Native countries**

- BR Brazil: glaser: "The species comes from the Rio Negro in Brazil."

**Regions**

- Rio Negro: glaser: "The species comes from the Rio Negro in Brazil."

**Origin pages check:** origin pages only: none; sources only: none.

**GBIF:** taxonKey 2339300 (Hypancistrus inspector), 8 records in 6 cells; inside the native countries 2 (25%), outside 6 (75%). 12 requests.
Top outside: Venezuela 5, Colombia 1.

### Nothobranchius rachovii (`nothobranchius-rachovii`)

Sources read: aquariumbreeder.

**Native countries**

- MZ Mozambique: aquariumbreeder: "This species is endemic to Mozambique."

**Regions**

- Zambezi: aquariumbreeder: "It inhabits the lower Zambezi and lower Pungwe River systems in Mozambique."
- Pungwe: aquariumbreeder: "It inhabits the lower Zambezi and lower Pungwe River systems in Mozambique."

**Origin pages check:** origin pages only: none; sources only: none.

**GBIF:** taxonKey 2348625 (Nothobranchius rachovii), 13 records in 5 cells; inside the native countries 13 (100%), outside 0 (0%). 11 requests.
Top outside: none.

### Aphyosemion australe (`aphyosemion-australe`)

Sources read: seriouslyfish.

**Native countries**

- GA Gabon: seriouslyfish: "Described from 'Cap Gentil', now known as Cape Lopez, close to the mouth of the Ogooué River, Gabon and is distributed in lowland areas along much of the country's coastline plus that of Congo which borders Gabon to the south."
- CG Congo - Brazzaville: seriouslyfish: "Described from 'Cap Gentil', now known as Cape Lopez, close to the mouth of the Ogooué River, Gabon and is distributed in lowland areas along much of the country's coastline plus that of Congo which borders Gabon to the south."

**Regions**

- Ogooué: seriouslyfish: "Described from 'Cap Gentil', now known as Cape Lopez, close to the mouth of the Ogooué River, Gabon and is distributed in lowland areas along much of the country's coastline plus that of Congo which borders Gabon to the south."

**Origin pages check:** origin pages only: AO Angola; sources only: none.

**GBIF:** taxonKey 2348299 (Aphyosemion australe), 20 records in 7 cells; inside the native countries 19 (95%), outside 1 (5%). 12 requests.
Top outside: Germany 1.

### Neocaridina davidi (`neocaridina-davidi`)

Sources read: aquariumcoop.

**Native countries:** none.

**Origin pages check:** origin pages only: none; sources only: none.

**GBIF:** taxonKey 11689892 (Neocaridina davidi), 212 records in 27 cells; no native countries, so no inside or outside. 10 requests.
Top countries: Taiwan 90, Japan 76, United States 17, Canada 7, Poland 7.

### Caridina logemanni (`caridina-logemanni`)

Sources read: glaser.

**Native countries:** none.

**Origin pages check:** origin pages only: none; sources only: none.

**GBIF:** taxonKey 8468716 (Caridina logemanni), 0 records in 0 cells; no native countries, so no inside or outside. 2 requests.
Top countries: none.

### Carassius auratus (`carassius-auratus`)

Sources read: glaser, aquariumbreeder, sprucepets.

**Native countries**

- CN China: aquariumbreeder: "Originally native to East Asia, including areas of China, Korea, Japan, and eastern Russia, these fish are now widespread all over the world through releases from captivity and aquaculture escapees."
- KR South Korea: aquariumbreeder: "Originally native to East Asia, including areas of China, Korea, Japan, and eastern Russia, these fish are now widespread all over the world through releases from captivity and aquaculture escapees."
- JP Japan: aquariumbreeder: "Originally native to East Asia, including areas of China, Korea, Japan, and eastern Russia, these fish are now widespread all over the world through releases from captivity and aquaculture escapees."
- RU Russia: aquariumbreeder: "Originally native to East Asia, including areas of China, Korea, Japan, and eastern Russia, these fish are now widespread all over the world through releases from captivity and aquaculture escapees."

**Origin pages check:** origin pages only: none; sources only: KR South Korea.

**GBIF:** taxonKey 4286942 (Carassius auratus), 46615 records in 968 cells; inside the native countries 12790 (27%), outside 33825 (73%). 17 requests.
Top outside: Australia 12177, United States 7627, Ukraine 3682, Germany 2286, France 1763.

### Monodactylus argenteus (`monodactylus-argenteus`)

Sources read: glaser.

**Native countries:** none.

**Origin pages check:** origin pages only: TH Thailand, ID Indonesia; sources only: none.

**GBIF:** taxonKey 5211117 (Monodactylus argenteus), 1985 records in 210 cells; no native countries, so no inside or outside. 10 requests.
Top countries: Australia 588, South Africa 564, Mozambique 221, Seychelles 126, Japan 67.

### Pyrrhulina spilota (`pyrrhulina-spilota`)

Sources read: glaser.

**Native countries:** none.

**Origin pages check:** origin pages only: PE Peru; sources only: none.

**GBIF:** taxonKey 2355683 (Pyrrhulina spilota), 28 records in 2 cells; no native countries, so no inside or outside. 10 requests.
Top countries: Peru 26, Brazil 2.

### Protocheirodon pi (`protocheirodon-pi`)

Sources read: glaser.

**Native countries:** none.

**Origin pages check:** origin pages only: none; sources only: none.

**GBIF:** taxonKey 9741842 (Protocheirodon pi), 52 records in 19 cells; no native countries, so no inside or outside. 10 requests.
Top countries: Brazil 25, Peru 25, Colombia 2.

### Acanthocobitis rubidipinnis (`acanthocobitis-rubidipinnis`)

Sources read: glaser.

**Native countries**

- MM Myanmar (Burma): glaser: "This beautiful loach comes from Burma, where it is found in the Irrawaddy system."

**Regions**

- Irrawaddy: glaser: "This beautiful loach comes from Burma, where it is found in the Irrawaddy system."

**Origin pages check:** origin pages only: none; sources only: none.

**GBIF:** taxonKey 2358635 (Acanthocobitis rubidipinnis), 15 records in 7 cells; inside the native countries 15 (100%), outside 0 (0%). 11 requests.
Top outside: none.

