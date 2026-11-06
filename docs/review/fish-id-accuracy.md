# Fish ID: accuracy by model

2026-11-05, `packages/engine/scripts/fish-id-accuracy.ts`, seed 1. The tool's own prompt, schema and matching (`apps/site/worker/fishid/`).

200 photos with a known answer, one per page (photo check: shows the page's fish, typically): 26 breeds, 100 popular species, 74 species at random. Each shrunk to 1024 px JPEG, as the page sends a reader's photo.

- **Top-1 / top-3:** the right page is the first guess's / one of the guesses' (a breed's page for a breed).
- **Breed's species:** for breed photos, the guess named the species the breed is a form of, or the breed.
- **Not a fish / can't tell:** verdicts "other" and "unclear" (refusals counted as can't tell), on photos that all show a fish.
- **Cost:** response usage × list price (models.md and prompt-caching.md, 2026-11; the agent's cache reads and writes at theirs), every call of every photo, per 1,000 photos.
- **Latency:** from the first call to the answer, on this machine (the agent's tools read content/ here, the Worker's its assets).
- **Agent:** the agent the Worker runs with `FISH_ID_AGENT` on (apps/site/worker/fishid/agent.ts), its tools over content/, the test photo itself never among its reference photos. *Calls · tools · photos*: per photo, on average. *Stopped*: how many answered when Claude chose / were forced by the calls, tool-call, time or token limit / fell back to today's single call.

| Run | Answered | Top-1 | Top-3 | Breed's species | Not a fish | Can't tell | Failed | Median latency | p95 latency | Cost / 1,000 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| claude-opus-5-5 | 200/200 | 55.0% | 66.5% | 96.2% | 0.0% | 0.0% | 0 | 5.8 s | 8.7 s | $13.51 |
| claude-opus-5-5, agent, 4 calls | 200/200 | 66.0% | 73.5% | 100.0% | 0.0% | 0.0% | 0 | 9.1 s | 14.0 s | $30.84 |
| claude-opus-5-5, agent, 2 calls | 200/200 | 64.5% | 73.5% | 100.0% | 0.0% | 0.5% | 0 | 8.8 s | 12.2 s | $30.16 |

## The agent

| Run | Calls · tools · photos | Stopped: answer / calls / tools / time / tokens / fallback | Input read from cache | Top-1 against today's call: fixed / broken |
| --- | ---: | --- | ---: | ---: |
| claude-opus-5-5, agent, 4 calls | 2.0 · 1.4 · 1.8 | 198 / 2 / 0 / 0 / 0 / 0 | 42% | 29 / 7 |
| claude-opus-5-5, agent, 2 calls | 1.9 · 1.3 · 1.6 | 24 / 175 / 0 / 0 / 0 / 1 | 40% | 30 / 11 |

**The agent passes the design's rule** (docs/superpowers/specs/2026-11-04-fish-id-agent-design.md), against today's call on the same 200 photos: top-1 55.0% → 66.0% (+11.0 points; the rule asks +5), top-3 66.5% → 73.5% (the rule: no worse), median 9.1 s (≤ 20 s), p95 14.0 s (≤ 40 s), $30.84 per 1,000 photos (≤ $70). It changed 36 first answers: 29 wrong to right, 7 right to wrong. It opens its top guess and the closest look-alikes in one round, then answers: 2.0 calls and 1.8 reference photos a photo on average, and 198 of 200 runs ended when Claude chose. The fixed two-call run (one round of pages, then the answer forced) is 1.5 points lower for about the same cost. `FISH_ID_AGENT` stays off until the site lead decides.

Two things made these numbers kinder than readers' photos will be. The reference photos were the page's other photos, often from the same source as the test photo and sometimes from the same shoot (the test photo itself was never shown): the rerun below leaves those out. And the test photos were picked as typical of their page, which still holds. Latency is from this machine straight to the API; the Worker's calls go through the relay in eastern North America, and its tools read the deploy's assets instead of content/.

## The leak-checked rerun

Later on 2026-11-05, after the review asked for it. The agent is never shown a reference photo from the test photo's source page (`sourceUrl`), nor a near-copy of it (dHash within 10 bits, `content/picture-hashes.json`), as well as the test photo itself. 45 of the 200 test photos had such copies among the reference photos: 90 photos left out. The facts give 6 photos a page here so that 2 are still left after that; the build gives 2. The agent runs as it now ships: a 27 s limit, the next call's size guessed with the last answer and the tool results.

main's content changed between the two runs (the day's engine pages and photo checks), so seed 1 picked a partly different 200. Today's call was run again on the same 200 as the agent:

| Run | Answered | Top-1 | Top-3 | Breed's species | Median latency | p95 latency | Cost / 1,000 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| claude-opus-5-5 | 200/200 | 53.5% | 63.0% | 100.0% | 5.7 s | 8.5 s | $13.58 |
| claude-opus-5-5, agent, 4 calls, leak-checked | 200/200 | 62.5% | 72.0% | 96.2% | 9.1 s | 13.7 s | $30.87 |

The agent averaged 1.9 calls, 1.3 tool calls and 1.6 reference photos a photo; 199 runs ended when Claude chose, 1 on the time limit. 42% of its input came from the cache.

**The agent still passes the rule, by less:** top-1 53.5% → 62.5% (+9.0 points, against +11.0 before the leak check), top-3 63.0% → 72.0%, median 9.1 s, p95 13.7 s, $30.87 per 1,000. The two runs' agent top-1, 66.0% then and 62.5% now, aren't on the same photos; the gain over today's call on the same photos is the number to read. `FISH_ID_AGENT` stays off until the site lead decides.

Earlier runs, 2026-11-02 (the content has changed since, so the same seed picked a slightly different 200: 25 breeds, 75 at random): Sonnet 5.5 47.0% / 63.0%, 8.0 s, $6.58 per 1,000; Opus 5.5 54.5% / 70.0%, 8.6 s, $13.59. Haiku 5.5, before the breed-matching fix: 20.0% / 31.0%, $0.42. **The tool uses Opus 5.5** (`DEFAULT_MODEL`, apps/site/worker/fishid/claude.ts): right first time on 7 more photos in 100 than Sonnet, at about twice the price. Most of what today's call misses are look-alikes (green neon for neon, Betta brownorum for B. coccina), which is what the agent checks.

## The genus's marks and a second look (2026-11-06)

The owner's photo of a Betta macrostoma came back as a coccina-group betta or a licorice gourami, 0.3 to 0.45 sure, in three runs out of three: the handbook has its page, but the agent names a fish from memory and then checks, and it never thought of this one. Two changes:

- **Marks.** Each species' and plant's page carries its sources' sentences on colour and pattern, those that tell it from others first, counts, measures and conservation status left out (`apps/site/worker/fishid/look.ts`): about 200 characters in the page list, 320 on the page. A genus listing shows every species with its marks (up to 80, a query still 12), and a species' page lists the other species of its genus with theirs, once a run. 1,229 of the 1,633 species and plants have marks (plants: 109 of 175, their leaves' colours counting); the page list grows from 420 KB to 643 KB.
- **A second look.** An answer Claude chose with its top guess under 0.6 sure, with 12 s left, is sent back once with the marks of its guesses' genera (two at most; a genus the run has already listed is named, not sent again). It answers again, opening a page first if one fits better. If what follows fails, runs out of time or is cut short, the first answer stands. The log says when it happened (double11), and the dashboard's recent runs show it.

Production's agent against this one, same photos, same keys, the same day. The 200 are seed 1's pick from today's content (a partly different 200 from the runs above):

| Run | Answered | Top-1 | Top-3 | Median latency | p95 latency | Cost / 1,000 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 200 photos, production | 200/200 | 65.5% | 73.0% | 7.7 s | 12.4 s | $29.84 |
| 200 photos, marks and second look | 199/200 | 68.0% | 76.5% | 7.8 s | 16.8 s | $33.54 |
| 40 photos of big genera, production | 40/40 | 47.5% | 52.5% | 8.5 s | 13.2 s | $31.44 |
| 40 photos of big genera, marks only | 40/40 | 52.5% | 60.0% | 9.3 s | 16.4 s | $43.89 |
| 40 photos of big genera, marks and second look | 40/40 | 55.0% | 65.0% | 10.1 s | 20.6 s | $58.44 |

The one of 200 not answered failed on this machine's network (`fetch failed`), not in the agent. The big genera: 40 species at random from Betta, Corydoras, Apistogramma, Hyphessobrycon, Aphyosemion, Rasbora, Channa, Parosphromenus, Pethia, Badis, Melanotaenia and Nannostomus, where a look-alike the agent doesn't think of is likeliest.

**What it buys:** on typical photos, no worse and a little better (top-1 +2.5 points, top-3 +3.5; one photo is 0.5 points, so this is within a sample's noise); on big genera, top-1 +7.5 and top-3 +12.5. Median 7.8 s, p95 16.8 s and $33.54 per 1,000 on the 200, $58 on the big genera, within the design's limits (≤ 20 s, ≤ 40 s, ≤ $70). The owner's photo, four runs: Betta macrostoma first in 3, at 0.80 to 0.85; the fourth opened other Betta pages and stayed with Betta rubra at 0.45. Medium effort did better on the big genera before the second look (55.0% / 65.0% with marks alone) but timed out on 2 of 40 photos; it stays low.

The review of this change found the second look could lose the first answer when the call after it failed, IUCN status lines read as marks ("Red List") on about 80 pages, plants' leaf colours dropped as keeping words, and a genus list sent twice; the runs above are after the fixes. Before them, on the same photos: 69.0% / 77.0% on the 200 for $37.77, 52.5% / 67.5% on the big genera for $68.98, and the owner's photo first in 4 of 4.

Many wrong answers sit at exactly 0.60, just over the line (5 of the big genera's 19 misses listed before the fixes). Moving the line to 0.65 would send those back too, at more cost; not tried. These runs cost about $35 at list price. One of the four eval keys was out of credit throughout and was set aside.

## claude-opus-5-5: the 20 worst misses

| Page | Photo | Its answer | Top guess | Sure | Linked to |
| --- | --- | --- | --- | ---: | --- |
| [Cá betta (cá xiêm)](https://aquatome.com/ca/ca-betta/) | [photo](https://media.aquatome.com/commons/2adae8349e1ed380.webp) | Betta splendens | Betta splendens (halfmoon) | 0.90 | halfmoon-betta |
| [Koi bướm (Butterfly koi)](https://aquatome.com/ca/koi-buom/) | [photo](https://media.aquatome.com/commons/643145c43d453de9.webp) | breed | Cyprinus rubrofuscus (butterfly koi (longfin)) | 0.85 | koi |
| [Cá rồng châu Á](https://aquatome.com/ca/ca-rong-chau-a/) | [photo](https://media.aquatome.com/commons/38ccce4c480fc134.webp) | Scleropages formosus | Scleropages formosus (Super Red) | 0.85 | super-red-arowana |
| [Cá platy](https://aquatome.com/ca/ca-platy/) | [photo](https://media.aquatome.com/commons/d549e6b588815198.webp) | Xiphophorus maculatus | Xiphophorus maculatus (blue mickey / wagtail-like) | 0.80 | mickey-mouse-platy |
| [Cá koi](https://aquatome.com/ca/ca-koi-cyprinus/) | [photo](https://media.aquatome.com/commons/0ec37eb1050a2800.webp) | Cyprinus rubrofuscus | Cyprinus rubrofuscus (doitsu (Yamabuki Doitsu / Kujaku)) | 0.80 | koi |
| [Cá hút bùn buồm Trung Quốc](https://aquatome.com/ca/ca-hong-dao-trung-quoc/) | [photo](https://media.aquatome.com/commons/165e664743accd64.webp) | Myxocyprinus asiaticus | Carassius auratus (calico) | 0.80 | carassius-auratus |
| [Cá pentazona](https://aquatome.com/ca/ca-barb-sau-soc/) | [photo](https://media.aquatome.com/commons/cdc824e83be01b1b.webp) | Desmopuntius hexazona | Desmopuntius pentazona | 0.80 | desmopuntius-pentazona |
| [Cá bowfin](https://aquatome.com/ca/ca-bowfin/) | [photo](https://media.aquatome.com/commons/035a528e609accc0.webp) | Amia calva | Hoplias malabaricus | 0.75 | hoplias-malabaricus |
| [Cá vàng đầu sư tử (Lionhead)](https://aquatome.com/ca/ca-vang-dau-su-tu/) | [photo](https://media.aquatome.com/commons/8546a77b4bd70737.webp) | breed of Carassius auratus | Carassius auratus (ranchu) | 0.60 | ranchu-goldfish |
| [Cá dĩa bồ câu (Pigeon Blood discus)](https://aquatome.com/ca/ca-dia-bo-cau/) | [photo](https://media.aquatome.com/commons/d6e664993c58a1ab.webp) | breed | Symphysodon aequifasciatus (Red Melon / Checkerboard Pigeon) | 0.60 | symphysodon-aequifasciatus |
| [Cá vàng Lưu kim (Ryukin)](https://aquatome.com/ca/ca-vang-luu-kim/) | [photo](https://media.aquatome.com/commons/503d7c93b8f75f8c.webp) | breed of Carassius auratus | Carassius auratus (fantail) | 0.60 | carassius-auratus |
| [Ốc ăn ốc](https://aquatome.com/ca/oc-an-oc/) | [photo](https://media.aquatome.com/inaturalist/98492041.webp) | Anentome helena | Brachygobius doriae | 0.60 | brachygobius-doriae |
| [Cá rồng Úc](https://aquatome.com/ca/ca-rong-uc/) | [photo](https://media.aquatome.com/inaturalist/485318860.webp) | Scleropages jardinii | Scleropages formosus (green) | 0.60 | scleropages-formosus |
| [Cá aba aba](https://aquatome.com/ca/ca-aba-aba/) | [photo](https://media.aquatome.com/commons/fe45718a404011c1.webp) | Gymnarchus niloticus | Anguilla anguilla | 0.60 | — |
| [Cá Tropheus duboisi](https://aquatome.com/ca/ca-tropheus-duboisi/) | [photo](https://media.aquatome.com/commons/7d4c2b3e6182f895.webp) | Tropheus duboisi | Tropheus moorii (Yellow band (Kaiser/Ikola)) | 0.60 | same genus only |
| [Cá neon xanh lục](https://aquatome.com/ca/ca-neon-xanh-luc/) | [photo](https://media.aquatome.com/seriouslyfish/b302817f6d8fa919.webp) | Paracheirodon simulans | Paracheirodon innesi | 0.60 | paracheirodon-innesi |
| [Cá thái hổ Siam](https://aquatome.com/ca/ca-thai-ho-siam/) | [photo](https://media.aquatome.com/commons/8bac445743996b73.webp) | Datnioides pulcher | Datnioides microlepis | 0.60 | datnioides-microlepis |
| [Cá chuột Brochis](https://aquatome.com/ca/ca-chuot-brochis/) | [photo](https://media.aquatome.com/scotcat/29f757c021f23b69.webp) | Brochis multiradiatus | Corydoras aeneus | 0.60 | corydoras-aeneus |
| [Cá chuột serratus](https://aquatome.com/ca/ca-chuot-serratus/) | [photo](https://media.aquatome.com/scotcat/904aebe99f5091de.webp) | Corydoras serratus | Corydoras aeneus | 0.60 | corydoras-aeneus |
| [Cá chó tetra](https://aquatome.com/ca/ca-cho-tetra/) | [photo](https://media.aquatome.com/commons/18c074733142e7dd.webp) | Acestrorhynchus microlepis | Acestrorhynchus falcatus | 0.60 | acestrorhynchus-falcatus |

## claude-opus-5-5, agent, 4 calls: the 20 worst misses

| Page | Photo | Its answer | Top guess | Sure | Linked to |
| --- | --- | --- | --- | ---: | --- |
| [Cá betta (cá xiêm)](https://aquatome.com/ca/ca-betta/) | [photo](https://media.aquatome.com/commons/2adae8349e1ed380.webp) | Betta splendens | Betta splendens (halfmoon) | 0.92 | halfmoon-betta |
| [Cá koi](https://aquatome.com/ca/ca-koi-cyprinus/) | [photo](https://media.aquatome.com/commons/0ec37eb1050a2800.webp) | Cyprinus rubrofuscus | Cyprinus rubrofuscus (doitsu (Kin Showa/Ochiba-like)) | 0.85 | koi |
| [Cá rồng châu Á](https://aquatome.com/ca/ca-rong-chau-a/) | [photo](https://media.aquatome.com/commons/38ccce4c480fc134.webp) | Scleropages formosus | Scleropages formosus (Super Red) | 0.85 | super-red-arowana |
| [Cá hút bùn buồm Trung Quốc](https://aquatome.com/ca/ca-hong-dao-trung-quoc/) | [photo](https://media.aquatome.com/commons/165e664743accd64.webp) | Myxocyprinus asiaticus | Carassius auratus (fantail) | 0.80 | carassius-auratus |
| [Cá chuột serratus](https://aquatome.com/ca/ca-chuot-serratus/) | [photo](https://media.aquatome.com/scotcat/904aebe99f5091de.webp) | Corydoras serratus | Corydoras aeneus | 0.80 | corydoras-aeneus |
| [Cá aba aba](https://aquatome.com/ca/ca-aba-aba/) | [photo](https://media.aquatome.com/commons/fe45718a404011c1.webp) | Gymnarchus niloticus | Anguilla anguilla | 0.75 | — |
| [Cá bowfin](https://aquatome.com/ca/ca-bowfin/) | [photo](https://media.aquatome.com/commons/035a528e609accc0.webp) | Amia calva | Hoplias malabaricus | 0.75 | hoplias-malabaricus |
| [Cá molly](https://aquatome.com/ca/ca-molly/) | [photo](https://media.aquatome.com/inaturalist/6286600.webp) | Poecilia sphenops | Poecilia latipinna | 0.70 | poecilia-latipinna |
| [Cá barb maharaja](https://aquatome.com/ca/ca-barb-maharaja/) | [photo](https://media.aquatome.com/seriouslyfish/f8a183cffe694ca0.webp) | Puntius sahyadriensis | Barbodes semifasciolatus | 0.70 | barbodes-semifasciolatus |
| [Cá Denticetopsis macilenta](https://aquatome.com/ca/ca-denticetopsis-macilenta/) | [photo](https://media.aquatome.com/scotcat/fe863224f3d99f32.webp) | Denticetopsis macilenta | Oncorhynchus mykiss | 0.70 | — |
| [Cá chuột mõm dài phương Bắc](https://aquatome.com/ca/ca-chuot-corydoras-septentrionalis/) | [photo](https://media.aquatome.com/scotcat/644bd59318d5365f.webp) | Corydoras septentrionalis | Corydoras aeneus | 0.70 | corydoras-aeneus |
| [Cá vàng đầu sư tử (Lionhead)](https://aquatome.com/ca/ca-vang-dau-su-tu/) | [photo](https://media.aquatome.com/commons/8546a77b4bd70737.webp) | breed of Carassius auratus | Carassius auratus (ranchu) | 0.60 | ranchu-goldfish |
| [Ốc ăn ốc](https://aquatome.com/ca/oc-an-oc/) | [photo](https://media.aquatome.com/inaturalist/98492041.webp) | Anentome helena | Brachygobius doriae | 0.60 | brachygobius-doriae |
| [Cá quả Trung Quốc](https://aquatome.com/ca/ca-loc-trung-quoc/) | [photo](https://media.aquatome.com/commons/940d5c4b49fcb3d8.webp) | Channa asiatica | Channa pulchra | 0.60 | channa-pulchra |
| [Cá bay cáo](https://aquatome.com/ca/ca-bay-cao/) | [photo](https://media.aquatome.com/glaser/f4914bc51f9efaf3.webp) | Epalzeorhynchos kalopterus | Garra cambodgiensis | 0.60 | same genus only |
| [Cá red devil](https://aquatome.com/ca/ca-red-devil/) | [photo](https://media.aquatome.com/commons/278c3bb48f9cc21a.webp) | Amphilophus labiatus | Heros severus (gold) | 0.60 | heros-severus |
| [Cá trâm](https://aquatome.com/ca/ca-tram/) | [photo](https://media.aquatome.com/seriouslyfish/ee217bcb6a0117d4.webp) | Boraras urophthalmoides | Horadandia atukorali | 0.60 | horadandia-atukorali |
| [Cá tetra hồng](https://aquatome.com/ca/ca-tetra-hong/) | [photo](https://media.aquatome.com/commons/612593bd78747901.webp) | Hyphessobrycon rosaceus | Hyphessobrycon bentosi | 0.60 | same genus only |
| [Cá thái hổ Indonesia](https://aquatome.com/ca/ca-thai-ho-indonesia/) | [photo](https://media.aquatome.com/commons/3c736744cee17c47.webp) | Datnioides microlepis | Datnioides pulcher | 0.60 | datnioides-pulcher |
| [Cá betta foerschi](https://aquatome.com/ca/ca-betta-foerschi/) | [photo](https://media.aquatome.com/seriouslyfish/f54eaa34f53a7a03.webp) | Betta foerschi | Betta smaragdina | 0.60 | betta-smaragdina |

## claude-opus-5-5, agent, 2 calls: the 20 worst misses

| Page | Photo | Its answer | Top guess | Sure | Linked to |
| --- | --- | --- | --- | ---: | --- |
| [Cá betta (cá xiêm)](https://aquatome.com/ca/ca-betta/) | [photo](https://media.aquatome.com/commons/2adae8349e1ed380.webp) | Betta splendens | Betta splendens (halfmoon) | 0.90 | halfmoon-betta |
| [Cá rồng châu Á](https://aquatome.com/ca/ca-rong-chau-a/) | [photo](https://media.aquatome.com/commons/38ccce4c480fc134.webp) | Scleropages formosus | Scleropages formosus (red (super red)) | 0.88 | super-red-arowana |
| [Cá koi](https://aquatome.com/ca/ca-koi-cyprinus/) | [photo](https://media.aquatome.com/commons/0ec37eb1050a2800.webp) | Cyprinus rubrofuscus | Cyprinus rubrofuscus (Doitsu (Kin Showa/Ginrin-like metallic)) | 0.85 | koi |
| [Cá chuột serratus](https://aquatome.com/ca/ca-chuot-serratus/) | [photo](https://media.aquatome.com/scotcat/904aebe99f5091de.webp) | Corydoras serratus | Corydoras aeneus | 0.80 | corydoras-aeneus |
| [Cá rasbora hengel](https://aquatome.com/ca/ca-tam-giac-den-sang/) | [photo](https://media.aquatome.com/commons/69b5033b122b728b.webp) | Trigonostigma hengeli | Trigonostigma somphongsi | 0.75 | trigonostigma-somphongsi |
| [Cá hút bùn buồm Trung Quốc](https://aquatome.com/ca/ca-hong-dao-trung-quoc/) | [photo](https://media.aquatome.com/commons/165e664743accd64.webp) | Myxocyprinus asiaticus | Carassius auratus (comet/common, đang chuyển màu) | 0.75 | carassius-auratus |
| [Cá rasbora espei](https://aquatome.com/ca/ca-rasbora-espei/) | [photo](https://media.aquatome.com/commons/df7054354a59aec1.webp) | Trigonostigma espei | Trigonostigma somphongsi | 0.75 | trigonostigma-somphongsi |
| [Cá quả Trung Quốc](https://aquatome.com/ca/ca-loc-trung-quoc/) | [photo](https://media.aquatome.com/commons/940d5c4b49fcb3d8.webp) | Channa asiatica | Channa pulchra | 0.70 | channa-pulchra |
| [Cá trâm](https://aquatome.com/ca/ca-tram/) | [photo](https://media.aquatome.com/seriouslyfish/ee217bcb6a0117d4.webp) | Boraras urophthalmoides | Horadandia atukorali | 0.70 | horadandia-atukorali |
| [Cá rasbora mắt xanh](https://aquatome.com/ca/ca-thai-hong-dom-mat/) | [photo](https://media.aquatome.com/commons/774dddb37bbec0cf.webp) | Brevibora dorsiocellata | Rasbora dorsiocellata | 0.70 | same genus only |
| [Cá betta Mandor](https://aquatome.com/ca/ca-betta-mandor/) | [photo](https://media.aquatome.com/seriouslyfish/07ff218fd6648c85.webp) | Betta mandor | Betta foerschi | 0.70 | betta-foerschi |
| [Cá chuột Schwartz](https://aquatome.com/ca/ca-chuot-schwartz/) | [photo](https://media.aquatome.com/commons/f1e7a234d0cd9e4a.webp) | Corydoras schwartzi | Corydoras trilineatus | 0.70 | corydoras-trilineatus |
| [Cá tetra barracuda Pantanal](https://aquatome.com/ca/ca-tetra-barracuda-pantanal/) | [photo](https://media.aquatome.com/inaturalist/63958823.webp) | Acestrorhynchus pantaneiro | Acestrorhynchus falcatus | 0.65 | acestrorhynchus-falcatus |
| [Cá bảy màu Full Red (Full Red Guppy)](https://aquatome.com/ca/ca-bay-mau-full-red/) | [photo](https://media.aquatome.com/commons/edf520fcff7bbfbe.webp) | breed of Poecilia reticulata | Poecilia reticulata (red delta tail) | 0.60 | poecilia-reticulata |
| [Cá vàng đầu sư tử (Lionhead)](https://aquatome.com/ca/ca-vang-dau-su-tu/) | [photo](https://media.aquatome.com/commons/8546a77b4bd70737.webp) | breed of Carassius auratus | Carassius auratus (ranchu) | 0.60 | ranchu-goldfish |
| [Cá vàng Lưu kim (Ryukin)](https://aquatome.com/ca/ca-vang-luu-kim/) | [photo](https://media.aquatome.com/commons/503d7c93b8f75f8c.webp) | breed of Carassius auratus | Carassius auratus (fantail) | 0.60 | carassius-auratus |
| [Ốc ăn ốc](https://aquatome.com/ca/oc-an-oc/) | [photo](https://media.aquatome.com/inaturalist/98492041.webp) | Anentome helena | Brachygobius doriae | 0.60 | brachygobius-doriae |
| [Cá molly](https://aquatome.com/ca/ca-molly/) | [photo](https://media.aquatome.com/inaturalist/6286600.webp) | Poecilia sphenops | Poecilia latipinna | 0.60 | poecilia-latipinna |
| [Cá nheo Synodontis petricola](https://aquatome.com/ca/ca-nheo-ren-petricola/) | [photo](https://media.aquatome.com/commons/0729c51cc067b013.webp) | Synodontis petricola | Synodontis multipunctatus | 0.60 | same genus only |
| [Cá rồng Úc](https://aquatome.com/ca/ca-rong-uc/) | [photo](https://media.aquatome.com/inaturalist/485318860.webp) | Scleropages jardinii | Scleropages formosus (green) | 0.60 | scleropages-formosus |
