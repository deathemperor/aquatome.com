# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The iOS app (apps/ios, SwiftUI, in progress) follows this record and adds its own platform notes.

## Users

Aquarium and planted-tank hobbyists in Vietnam first, then Indonesia and Thailand, mostly on a phone. Two kinds, served **equally** (owner, 2026-10-31):

- **Beginners**, often next to a first tank: they need plain words, good defaults, guided steps and nothing they can get wrong.
- **Experienced keepers and aquascapers**: they know photoperiods, channel mixing and water figures, and want every control, fast.

Every tool has a simple way through and the full controls. Neither group should feel the product was made for the other.

## Product Purpose

A handbook that answers "how do I keep this fish, plant or tank well". It has species and plant pages, guides, a glossary and tools (tank volume, tank-mates, dosing, light control). It lets hobbyists control their own aquarium equipment from the page or the app.

Success: readers find the answer from search and act on it. Tool users come back and manage their tanks over time. The business runs on traffic, ads, affiliate links to shops, and community (comments, reader photos).

## Positioning

- **Local and sourced.** It is the only Vietnamese-language handbook built from licensed, cited sources (Seriously Fish, Loaches Online, Glaser and others, with permission) plus AquaTome's own guides from teaching videos. Each fact is traceable to its source.
- **Better than the brand apps.** It controls hobby lights (Chihiros first; Week Aqua and others next) from a browser or the app, without the brand apps, which score 1–2.5★.

## Operating Context

- **On a phone beside the tank**, often one-handed. Bluetooth control works from Chrome or Edge (Android and desktop) and from the iOS app; iPhone browsers can't use Bluetooth.
- **Content changes many times a day.** The content engine writes and updates pages every 3 hours, and code ships through PRs (docs/governance.md).
- **Three languages:** Vietnamese first, then Indonesian and Thai.

## Capabilities and Constraints

- **Built:**
  - Astro static site plus a Cloudflare Worker (D1, R2, KV)
  - search and filters, species/plant data cards from several sources, the glossary card on hover or tap
  - in-text photos, comments and reader photos, affiliate links (/go/)
  - Chihiros light control over Web Bluetooth (apps/site/src/scripts/chihiros.ts)
- **In progress:** "Bể của tôi" (saved tanks: devices, schedules, livestock), saved on the device, with an optional sign-in (Apple, Google, passkey/email link) that syncs web ↔ app.
- **Device facts that shape the UI:**
  - Lights run their schedules on their own clock, which a power cut resets.
  - Chihiros can report its saved schedule but not its manual levels, so the product must remember what the user set.
  - Week Aqua lights report nothing.
- **Content rules:** never mention the author, a channel or a video on pages. Photos never show people (hands count), and use open licences or permission. Sources are cited (numbered marks, a source list).

## Brand Commitments

- **Name:** AquaTome; mark: "AT" (apps/site/public/favicon.png).
- **Voice:** an experienced hobbyist explaining to a newer one, in natural Vietnamese:
  - short concrete sentences, with opinions where the source has them
  - hobby words people actually use (set bể, thay nước, châm phân, rêu hại)
  - no translationese or clichés
  - the full style guide is packages/engine/src/prompts/vi-style.md

## Evidence on Hand

- **Content:** 747 species, plants, breeds, 317 guides, a glossary, and photos with credits (content/).
- **Device research:** docs/research/aquarium-device-control.md (brands, protocols, hands-on results with the owner's lights).
- **Not yet existing:** user testimonials, ratings or usage numbers. Never invent them.

## Product Principles

1. **Answer first.** The thing the reader came for is on the first screen, and everything else comes after.
2. **Simple path, full control.** A guided default for beginners, with the advanced controls one step away, never removed.
3. **Show, don't make them imagine.** Schedules, ranges and comparisons are drawn: a timeline, a range bar, a table.
4. **Nothing half-finished ships.** Every state is designed: first visit, empty, loading, connected, lost connection, error, success. Copy names the action and the way out.
5. **Cite everything, quietly.** Sources and credits are always one tap away, never repeated in the reader's way.

## Accessibility & Inclusion

- Phone-first, with touch targets of at least 44px. Keyboard and screen-reader paths work for every control.
- Content works in three languages, and layouts survive longer Indonesian and Thai strings.
