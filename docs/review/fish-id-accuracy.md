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

Two things make these numbers kinder than readers' photos will be. The reference photos are the page's other photos, often from the same source as the test photo and sometimes from the same shoot (the test photo itself is never shown). And the test photos were picked as typical of their page. Latency is from this machine straight to the API; the Worker's calls go through the relay in eastern North America, and its tools read the deploy's assets instead of content/.

Earlier runs, 2026-11-02 (the content has changed since, so the same seed picked a slightly different 200: 25 breeds, 75 at random): Sonnet 5.5 47.0% / 63.0%, 8.0 s, $6.58 per 1,000; Opus 5.5 54.5% / 70.0%, 8.6 s, $13.59. Haiku 5.5, before the breed-matching fix: 20.0% / 31.0%, $0.42. **The tool uses Opus 5.5** (`DEFAULT_MODEL`, apps/site/worker/fishid/claude.ts): right first time on 7 more photos in 100 than Sonnet, at about twice the price. Most of what today's call misses are look-alikes (green neon for neon, Betta brownorum for B. coccina), which is what the agent checks.

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
