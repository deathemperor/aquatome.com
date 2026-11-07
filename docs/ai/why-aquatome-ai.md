# Why a hobbyist would ask AquaTome's AI, not a general chatbot

2026-11-07. The owner: "AI can be very helpful in helping hobbyists in solving hard problems like algae … there must be
reasons users choose us instead."

**The bet.** A general chatbot gives a decent generic answer. It doesn't know your tank or see what your lights do. Its
figures have no source behind them, and it forgets you by next week. Algae, setting up a tank, cycling, sick fish and
stocking all depend on the particular tank and take weeks to fix. That is where we can win.

## What sets us apart

| | Today | To build |
| --- | --- | --- |
| **Grounded in a cited handbook** | About 900 guides: some 70 on algae, 23 on cycling, 54 on disease, over 100 on light, CO₂ and fertiliser. 747 fish, plants and breeds with sourced figures. The chat starts from them and uses common hobby practice where they stop. A page's figure wins, a medicine's or chemical's dose comes only from a page, and a card's figures are the page's, never the model's. | The source under each claim. |
| **Knows your tank** | Everything in "Bể của tôi": size, fish with counts, plants, substrate, notes, each light's schedule with on, off, ramp and levels, and what each plug powers. | |
| **Tools a chatbot lacks** | The tank-mates check, which is our code and not the model's guess. Volume, budget at Vietnamese shop prices, fish ID from a photo. | Algae ID from a photo. Changing a light schedule from the answer once the reader confirms. |
| **Local** | Vietnamese hobby names. "Nuôi ở Việt Nam" notes on every fish for the northern winter, southern cool nights and summer heat. Shop price ranges, Shopee links on equipment. | Tap water by city. Seasonal advice, since summer heat brings algae and low oxygen. |
| **Follows up over weeks** | A conversation lasts 24 hours and is kept under the account. | Past conversations to reopen and carry on. A tank journal of water tests, water changes and photos that the chat reads. Check-ins a week later. |
| **What worked for others** | Nothing yet, and we won't invent it. | Outcomes readers choose to report, once the owner OKs the privacy side. |

**Fishkeeping only.** The owner's condition for general knowledge: "just don't let them ask about football." Anything
that isn't fish, shrimp, snails, plants, their tanks, ponds, water or gear gets one fixed line in the reader's language.
It costs about $0.0006 and doesn't count toward the reader's 30.

**Today's limit on hard problems.** An answer to a problem is its likely cause, the steps one a line, then what to watch,
within 5 model calls, 8 tool calls and 27 seconds. Most hard questions use up that budget before the chat has read all
it wanted, and a few run out of time with no answer at all (below).

## The five hard problems, and how we solve each

1. **Algae.** Name the algae from a photo, with fish ID's pipeline and an algae catalogue built from our guides. Read the
   tank: light hours from the saved schedule, CO₂ plug times, plants, tank age. Give a step plan from our algae guides
   that fits that tank ("your light runs 10 hours at full power, and the guide says…"), and offer to change the
   schedule. Check back in a week with a new photo.
2. **Setting up a tank.** A planner. Size, budget and style give the kit at Vietnamese price ranges from the budget
   tool, plants and fish that fit by the tank-mates check and climate notes, and a cycling plan. It saves as a tank in
   "Bể của tôi".
3. **Cycling a new tank.** A day-by-day plan from our cycling guides, reminders to test and change water, and readings
   kept in the journal. The chat answers "can I add fish now?" from the reader's own readings.
4. **Sick fish.** Symptoms and a photo lead to the likely causes from our disease guides, then first aid and quarantine.
   Doses only as a guide gives them, never made up. It asks what changed in the tank lately, then checks back.
5. **Stocking.** Our strongest today. The tank-mates check runs on the reader's own tank and says how full it is. Next,
   add adult size and the climate notes, and suggest fish from the handbook that fit.

## The owner's three later ideas

Equipment control, a council-style tank review, and proactive care. Each one's place is in the order of work below.

**Ask the AI to run the equipment.** "Dim the lights", "feeding mode", "run my master button". Only our app drives the
reader's lights and plugs, so no general chatbot can do this.
- How. The chat proposes one action in its answer: a light's schedule, its levels for a while, back to its schedule,
  an outlet on or off (for some minutes), or a master-button scene by its id. The Worker checks it against the
  reader's synced devices and outlet roles. The app shows what changes, from what to what ("Filter: on → off for 10
  min"), and nothing happens until the reader taps to confirm. The app's action layer then checks it all again on the
  phone, as the last gate, and carries it out. Done, failed, cancelled or "not in range" (a Bluetooth light must be
  nearby and connected) goes with the reader's next question, so the chat hears it only when it matters.
- Safety. Life support is a heater, filter or air pump switched off, or CO₂ switched on outside the light hours. Either
  needs its own second confirmation and a warning, and the app's action layer enforces it, so no card can skip it. A
  timed action such as feeding mode is offered only on a plug that runs its own countdown, so the filter comes back on
  even if the phone is gone. Web Bluetooth can't run on an iPhone browser, so there the card says to open the app.
- Cost. No extra model spend: it happens inside the chat turn, about a third of a cent. The work is a new answer block
  in the contract, the Worker's checks, and the app's confirm card. The iOS lead owns the app side.
- Where. Its first use is in the algae doctor, which proposes a shorter light schedule and applies it once the reader
  confirms. Dimming, feeding mode and master-button scenes follow. It waits on the app's action layer, which the app
  lead is building with the master button.

**A tank health review, council style.** Several reviewers read one tank, each through its own lens: water and
cycling, plants and algae, fish and stocking. They read its photos, water tests, fish, light hours, plants and history,
then agree a health score and the top issues, each with its fix from our guides.
- How. It runs weekly or when the reader asks, never on every message. Where reviewers disagree, the review says so
  rather than averaging it away.
- Which models. Readers' traffic runs on our Anthropic keys, so the panel is Anthropic models with different lenses. The
  owner's Cursor plan can't serve readers, and another provider's API would be a new vendor (cost and privacy), which is
  the owner's call.
- Cost. A tank's file is about 20,000 tokens with three photos. Three Sonnet lenses sharing a cached copy, plus a
  summary, cost about $0.13 a review. Opus plus two Sonnet lenses cost about $0.24. A weekly review of 1,000 tanks would
  run about 140 a day, $19–34, most of the $50 cap. So: on request, at most one a tank a week, inside its own slice of
  the cap (say $10 a day, 40–75 reviews).
- Prove it first. The eval runs a panel against one Opus pass on the same tanks, judged blind. If the panel doesn't
  clearly win, one strong model does the review at a third of the cost.
- Where. After the tank journal: without water tests and photos over time there is little for a panel to review.

**Proactive care.** The app nudges the reader before trouble, from the tank's own data: size, fish, plants, devices,
the journal, plus the reader's region and its weather.
- Maintenance. Water changes, filter cleaning and plant trimming, at the intervals our guides give for that tank's
  size, stock and plants. While a new tank cycles, it says what to test on which day, and when the readings say it's
  safe to add fish.
- Seasons. A heat wave whose forecast beats the top temperature of a fish in the tank brings a warning: fans, a
  chiller, shorter light hours, the last one offered as an equipment action. A cold snap in the north warns tanks whose
  fish need more than unheated water gives. The rainy season warns about tap water changes, and the start of a
  species' breeding season says what to expect.
- How often, without nagging.
  - One weekly digest per reader, all tanks together, at an hour they pick.
  - Urgent warnings (heat or cold within 48 hours that the tank's fish can't take, a cycling test due today) come on
    their own, at most one a day, never between 22:00 and 07:00.
  - Each nudge has "Done" and "Later". "Done" goes into the journal, and a task the journal already shows done is
    never sent.
  - Three ignored in a row halves that kind's frequency. A tank not opened for 30 days gets only severe weather.
  - Every kind can be switched off per tank. Weather and cycling start on; routine maintenance is the reader's choice.
- Cost. Almost no AI: rules and our guides' intervals choose the nudge, and the AI answers only when the reader taps
  through to the chat. Pushes go through the app's existing notifications. The weather comes from a free forecast
  service at city level. That is a new outside service, and with the reader's region it needs the owner's OK.
- Where. Heat and cold warnings come early, right after the algae doctor: they need only the region and the fish's
  temperatures, which we have, and heat is the season's biggest killer. Maintenance reminders and cycling come with
  the tank journal, since they need to know what was done.

## How we prove it, and where we stand

48 real hard questions, from public Vietnamese hobby forums (reworded, no names) and the existing chat eval. The owner's
own past research comes in if they share it. Our chat and plain Claude each answer every question. Plain Claude is the
same Haiku model with no tools and no handbook. A judge (Opus) sees the two answers without our name, twice with the
order swapped, and a win counts only when both judgements agree. Two conditions are reported apart: the full forum
post given to both, and a short question about a saved tank, where only we have the tank. The eval runs again on every
change to the chat's brain (`docs/review/chat-vs-plain.md`).

| Wins, ours to plain | Full post | Saved tank |
| --- | ---: | ---: |
| First run: handbook only, two or three sentences, size and fish only | 4–43 | 8–36 |
| Expert answers with steps, the whole tank read | 8–38 | 23–21 |
| General knowledge beside the handbook, fishkeeping only | 13–33 | 28–17 |

**Where that leaves us.** We now win when we know the reader's tank: 28 to 17, scores 6.0 and 5.0. By problem that's
algae 9–3, stocking 7–2, sick fish 5–4, cycling 4–3, and setting up a tank 3–5, the one we still lose. Give both the whole
post and plain Claude still wins 33 to 13, scores 6.6 and 5.7, though we lead on sick fish, 6–3. The judge says we use
less of what the post tells us (tank-fit 37 times) and are too thin (24), and it marks plain Claude too long 34 times
but picks it anyway. On the grounded count we lead on both: 20–10 and 19–11.

**What still costs us.**
- The budget. 70 of 96 answers stop at a limit rather than when the chat is done.
- Time. 4 of 96 ran out the 27 seconds during a model call, so that reader gets an error. They count as losses, and they
  are the next fix.
- Some errors are our guides' own, such as "90% of hair algae is low CO₂". Those went to the writing lead, and the guides
  written from one video stay out of the chat until they are re-checked.

**The owner's rules, checked.** The off-topic set is 53 questions in Vietnamese, Indonesian and Thai: football and other
plain off-topic, cooking and catching fish, jailbreaks (including instructions planted in a saved tank's notes), mixed
questions, and fishkeeping at the edge such as stands, electrics and ponds. It passes 53 of 53 and has to stay there
(`docs/review/chat-offtopic.md`). In the 96 answers, every medicine or chemical dose my search found was on a page the
chat had read. The search looks for common units, so it could miss an odd wording.

## Order of work

1. The eval: done, and it runs on every change.
2. Close the gap it shows: expert answers with a plan, the whole tank read, the name search fixed ("cá vàng" found a
   shrimp before the goldfish) and general knowledge are all done. Loosening the reading budget didn't change wins, so I
   dropped it. Next is the answers that time out.
3. The stop button and past conversations, which the owner approved. The contract is written. The server needs the
   owner's OK for one new database table.
4. The algae doctor, with the first equipment action: a shorter light schedule, applied once the reader confirms.
5. Heat and cold warnings, once the owner OKs the region and the forecast service.
6. More equipment actions: dimming, feeding mode, master-button scenes.
7. Setup planner; tank journal with maintenance reminders, cycling steps and check-ins.
8. The tank health review, once the journal gives it something to read, and only if the eval shows a panel beats one
   strong model.
9. A stronger model only for hard-problem flows, and only where the eval shows it pays for itself.
