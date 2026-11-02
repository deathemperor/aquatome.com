# Fish ID: accuracy by model

2026-11-02, `packages/engine/scripts/fish-id-accuracy.ts`, seed 1. The tool's own prompt, schema and matching (`apps/site/worker/fishid/`).

200 photos with a known answer, one per page (photo check: shows the page's fish, typically): 25 breeds, 100 popular species, 75 species at random. Each shrunk to 1024 px JPEG, as the page sends a reader's photo.

- **Top-1 / top-3:** the right page is the first guess's / one of the guesses' (a breed's page for a breed).
- **Breed's species:** for breed photos, the guess named the species the breed is a form of, or the breed.
- **Not a fish / can't tell:** verdicts "other" and "unclear" (refusals counted as can't tell), on photos that all show a fish.
- **Cost:** response usage × list price (models.md, 2026-11), per 1,000 photos.

| Model | Answered | Top-1 | Top-3 | Breed's species | Not a fish | Can't tell | Failed | Median latency | Cost / 1,000 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| claude-sonnet-5-5 | 200/200 | 47.0% | 63.0% | 88.0% | 0.0% | 0.0% | 0 | 8.0 s | $6.58 |
| claude-opus-5-5 | 200/200 | 54.5% | 70.0% | 100.0% | 0.0% | 0.0% | 0 | 8.6 s | $13.59 |

Haiku 5.5, in the same test before the breed-matching fix: top-1 20.0%, top-3 31.0%, breed's species 80.0%, $0.42 per 1,000. Sonnet and Opus then were 44.0% / 57.5% and 53.0% / 67.5%; the fix moved both up.

**The tool uses Opus 5.5** (`DEFAULT_MODEL`, apps/site/worker/fishid/claude.ts): right first time on 7 more photos in 100 than Sonnet, at about twice the price (300 photos a day at most: about $4). Most of what it still misses are look-alikes (green neon for neon, Betta brownorum for B. coccina), a breed it can't see (balloon belly), or a page photo it reads as another form (a red-tail golden on the Asian arowana page).

## claude-sonnet-5-5: the 20 worst misses

| Page | Photo | Its answer | Top guess | Sure | Linked to |
| --- | --- | --- | --- | ---: | --- |
| [Cá cầu vồng Celebes](https://aquatome.com/vi/ca/ca-cau-vong-celebes/) | [photo](https://media.aquatome.com/commons/43027cbb342dcc46.webp) | Marosatherina ladigesi | Iriatherina werneri | 0.90 | iriatherina-werneri |
| [Cá neon xanh lục](https://aquatome.com/vi/ca/ca-neon-xanh-luc/) | [photo](https://media.aquatome.com/seriouslyfish/b302817f6d8fa919.webp) | Paracheirodon simulans | Paracheirodon innesi | 0.88 | paracheirodon-innesi |
| [Koi bướm (Butterfly koi)](https://aquatome.com/vi/ca/koi-buom/) | [photo](https://media.aquatome.com/commons/cf5fabd074a8edbc.webp) | breed | Cyprinus rubrofuscus (butterfly koi (long-fin) vàng trắng) | 0.85 | koi |
| [Kim Long Hồng Vĩ (Red-tailed golden arowana)](https://aquatome.com/vi/ca/kim-long-hong-vi/) | [photo](https://media.aquatome.com/commons/8bf5b4bb6789f597.webp) | breed | Scleropages formosus (golden (cá rồng vàng)) | 0.85 | scleropages-formosus |
| [Huyết Long (Super Red Arowana)](https://aquatome.com/vi/ca/huyet-long/) | [photo](https://media.aquatome.com/commons/38ccce4c480fc134.webp) | breed | Scleropages formosus (red arowana) | 0.85 | scleropages-formosus |
| [Ốc ăn ốc](https://aquatome.com/vi/ca/oc-an-oc/) | [photo](https://media.aquatome.com/inaturalist/86335632.webp) | Anentome helena | Clea helena | 0.85 | — |
| [Cá rồng châu Á](https://aquatome.com/vi/ca/ca-rong-chau-a/) | [photo](https://media.aquatome.com/seriouslyfish/25eed079586f976a.webp) | Scleropages formosus | Scleropages formosus (red-tail golden) | 0.85 | red-tailed-golden-arowana |
| [Cá rô phi Mexico Herichthys carpintis](https://aquatome.com/vi/ca/ca-ro-phi-mexico-herichthys-carpintis/) | [photo](https://media.aquatome.com/inaturalist/142764458.webp) | Herichthys carpintis | Herichthys cyanoguttatus | 0.85 | herichthys-cyanoguttatus |
| [Cá chim cánh cụt giả](https://aquatome.com/vi/ca/ca-chim-canh-cut-gia/) | [photo](https://media.aquatome.com/commons/ab85d1d115896b92.webp) | Thayeria boehlkei | Hyphessobrycon herbertaxelrodi | 0.80 | hyphessobrycon-herbertaxelrodi |
| [Cá koi](https://aquatome.com/vi/ca/ca-koi-cyprinus/) | [photo](https://media.aquatome.com/commons/020bdc2d27a445ec.webp) | Cyprinus rubrofuscus | Cyprinus rubrofuscus (kohaku/yellow calico (Yamabuki Ogon)) | 0.80 | koi |
| [Cá chuột panda](https://aquatome.com/vi/ca/ca-chuot-panda/) | [photo](https://media.aquatome.com/commons/4756ceeedd3cc5ce.webp) | Corydoras panda | Corydoras metae | 0.80 | same genus only |
| [Cá chuột Brochis ngọc lục bảo](https://aquatome.com/vi/ca/ca-chuot-brochis-splendens/) | [photo](https://media.aquatome.com/commons/d8d1fa9b5ce8fb68.webp) | Corydoras splendens | Corydoras aeneus | 0.80 | corydoras-aeneus |
| [Cá Jack Dempsey](https://aquatome.com/vi/ca/ca-jack-dempsey/) | [photo](https://media.aquatome.com/seriouslyfish/363884a2cb6d3626.webp) | Rocio octofasciata | Nandopsis octofasciatum (electric blue) | 0.80 | — |
| [Cá thủy tinh Thái](https://aquatome.com/vi/ca/ca-thuy-tinh-thai/) | [photo](https://media.aquatome.com/inaturalist/569827389.webp) | Parambassis siamensis | Parambassis ranga | 0.70 | parambassis-ranga |
| [Cá vàng đầu sư tử (Lionhead)](https://aquatome.com/vi/ca/ca-vang-dau-su-tu/) | [photo](https://media.aquatome.com/commons/8546a77b4bd70737.webp) | breed of Carassius auratus | Carassius auratus (oranda) | 0.60 | oranda-goldfish |
| [Cá neon xanh](https://aquatome.com/vi/ca/ca-neon-xanh/) | [photo](https://media.aquatome.com/inaturalist/67091990.webp) | Paracheirodon innesi | Paracheirodon axelrodi | 0.60 | paracheirodon-axelrodi |
| [Cá rồng Úc](https://aquatome.com/vi/ca/ca-rong-uc/) | [photo](https://media.aquatome.com/commons/aced773c6bfadb18.webp) | Scleropages jardinii | Scleropages formosus (green) | 0.60 | scleropages-formosus |
| [Cá rasbora hengel](https://aquatome.com/vi/ca/ca-tam-giac-den-sang/) | [photo](https://media.aquatome.com/seriouslyfish/800b8549bd6f39a7.webp) | Trigonostigma hengeli | Trigonostigma espei | 0.60 | trigonostigma-espei |
| [Cá aba aba](https://aquatome.com/vi/ca/ca-aba-aba/) | [photo](https://media.aquatome.com/commons/ef4c1680643909ab.webp) | Gymnarchus niloticus | Electrophorus voltai | 0.60 | — |
| [Cá hút bùn buồm Trung Quốc](https://aquatome.com/vi/ca/ca-hong-dao-trung-quoc/) | [photo](https://media.aquatome.com/commons/165e664743accd64.webp) | Myxocyprinus asiaticus | Carassius auratus (ryukin) | 0.60 | ryukin-goldfish |

## claude-opus-5-5: the 20 worst misses

| Page | Photo | Its answer | Top guess | Sure | Linked to |
| --- | --- | --- | --- | ---: | --- |
| [Cá rồng châu Á](https://aquatome.com/vi/ca/ca-rong-chau-a/) | [photo](https://media.aquatome.com/seriouslyfish/25eed079586f976a.webp) | Scleropages formosus | Scleropages formosus (red-tail golden) | 0.80 | red-tailed-golden-arowana |
| [Cá aba aba](https://aquatome.com/vi/ca/ca-aba-aba/) | [photo](https://media.aquatome.com/commons/ef4c1680643909ab.webp) | Gymnarchus niloticus | Electrophorus electricus | 0.80 | — |
| [Cá neon xanh lục](https://aquatome.com/vi/ca/ca-neon-xanh-luc/) | [photo](https://media.aquatome.com/seriouslyfish/b302817f6d8fa919.webp) | Paracheirodon simulans | Paracheirodon innesi | 0.80 | paracheirodon-innesi |
| [Cá đĩa](https://aquatome.com/vi/ca/ca-dia/) | [photo](https://media.aquatome.com/commons/141b5ed40120bdfb.webp) | Symphysodon discus | Symphysodon aequifasciatus (red turquoise) | 0.80 | symphysodon-aequifasciatus |
| [Cá rô phi Mexico Herichthys carpintis](https://aquatome.com/vi/ca/ca-ro-phi-mexico-herichthys-carpintis/) | [photo](https://media.aquatome.com/inaturalist/142764458.webp) | Herichthys carpintis | Herichthys cyanoguttatus | 0.80 | herichthys-cyanoguttatus |
| [Cá rasbora glowlight](https://aquatome.com/vi/ca/ca-rasbora-den-do/) | [photo](https://media.aquatome.com/seriouslyfish/d39e9d8ce6109072.webp) | Trigonopoma pauciperforatum | Rasbora pauciperforata | 0.80 | same genus only |
| [Cá platy](https://aquatome.com/vi/ca/ca-platy/) | [photo](https://media.aquatome.com/commons/d549e6b588815198.webp) | Xiphophorus maculatus | Xiphophorus maculatus (blue mickey/wagtail-type) | 0.75 | mickey-mouse-platy |
| [Cá koi](https://aquatome.com/vi/ca/ca-koi-cyprinus/) | [photo](https://media.aquatome.com/commons/020bdc2d27a445ec.webp) | Cyprinus rubrofuscus | Cyprinus rubrofuscus (Kujaku/Ki Utsuri) | 0.75 | koi |
| [Cá betta Brunei](https://aquatome.com/vi/ca/ca-betta-macrostoma/) | [photo](https://media.aquatome.com/seriouslyfish/5d77165291ef928d.webp) | Betta macrostoma | Betta channoides | 0.75 | betta-channoides |
| [Cá betta brownorum](https://aquatome.com/vi/ca/ca-betta-brownorum/) | [photo](https://media.aquatome.com/seriouslyfish/e02f3c961e8ba97c.webp) | Betta brownorum | Betta coccina | 0.75 | betta-coccina |
| [Cá bình tích balloon (Balloon molly)](https://aquatome.com/vi/ca/ca-binh-tich-balloon/) | [photo](https://media.aquatome.com/commons/1e680554b39cfd22.webp) | breed | Poecilia latipinna (white/silver sailfin) | 0.60 | poecilia-latipinna |
| [Cá vàng đầu sư tử (Lionhead)](https://aquatome.com/vi/ca/ca-vang-dau-su-tu/) | [photo](https://media.aquatome.com/commons/8546a77b4bd70737.webp) | breed of Carassius auratus | Carassius auratus (ranchu) | 0.60 | ranchu-goldfish |
| [Cá betta (cá xiêm)](https://aquatome.com/vi/ca/ca-betta/) | [photo](https://media.aquatome.com/seriouslyfish/abfbe7c7ace162ce.webp) | Betta splendens | Betta smaragdina | 0.60 | betta-smaragdina |
| [Cá rồng Úc](https://aquatome.com/vi/ca/ca-rong-uc/) | [photo](https://media.aquatome.com/commons/aced773c6bfadb18.webp) | Scleropages jardinii | Scleropages formosus (green) | 0.60 | scleropages-formosus |
| [Cá rasbora hengel](https://aquatome.com/vi/ca/ca-tam-giac-den-sang/) | [photo](https://media.aquatome.com/seriouslyfish/800b8549bd6f39a7.webp) | Trigonostigma hengeli | Trigonostigma espei | 0.60 | trigonostigma-espei |
| [Cá hút bùn buồm Trung Quốc](https://aquatome.com/vi/ca/ca-hong-dao-trung-quoc/) | [photo](https://media.aquatome.com/commons/165e664743accd64.webp) | Myxocyprinus asiaticus | Carassius auratus (shubunkin / calico) | 0.60 | carassius-auratus |
| [Cá Tropheus duboisi](https://aquatome.com/vi/ca/ca-tropheus-duboisi/) | [photo](https://media.aquatome.com/commons/61ef762fa6ff6440.webp) | Tropheus duboisi | Tropheus moorii (Yellow Blaze) | 0.60 | same genus only |
| [Cá zebra đỏ](https://aquatome.com/vi/ca/ca-zebra-do/) | [photo](https://media.aquatome.com/commons/1d6bc088d6ebd455.webp) | Maylandia estherae | Labidochromis caeruleus (yellow) | 0.60 | labidochromis-caeruleus |
| [Cá danio phát sáng](https://aquatome.com/vi/ca/ca-danio-phat-sang/) | [photo](https://media.aquatome.com/commons/3beec92879a0b656.webp) | Danio choprae | Devario kakhienensis | 0.60 | same genus only |
| [Cá chó tetra](https://aquatome.com/vi/ca/ca-cho-tetra/) | [photo](https://media.aquatome.com/commons/18c074733142e7dd.webp) | Acestrorhynchus microlepis | Acestrorhynchus falcatus | 0.60 | acestrorhynchus-falcatus |
