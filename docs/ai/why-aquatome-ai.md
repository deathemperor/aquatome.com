# Why a hobbyist would ask AquaTome's AI, not a general chatbot

2026-11-07. The owner: "AI can be very helpful in helping hobbyists in solving hard problems like algae … there must be
reasons users choose us instead."

**The bet.** A general chatbot gives a decent generic answer. It doesn't know your tank or see what your lights do. Its
figures have no source behind them, and it forgets you by next week. Algae, setting up a tank, cycling, sick fish and
stocking all depend on the particular tank and take weeks to fix. That is where we can win.

## What sets us apart

| | Today | Saved by the app, not yet read by the chat | To build |
| --- | --- | --- | --- |
| **Grounded in a cited handbook** | About 900 guides: some 70 on algae, 23 on cycling, 54 on disease, over 100 on light, CO₂ and fertiliser. 747 fish, plants and breeds with sourced figures. The chat answers only from them, and a card's figures come from the page, never from the model. | | The source under each claim. |
| **Knows your tank** | Size, and fish with counts, from "Bể của tôi". | Plants, substrate, notes, each light's schedule with on, off, ramp and levels, and what each plug powers. | The chat reads the whole tank. |
| **Tools a chatbot lacks** | The tank-mates check, which is our code and not the model's guess. Volume, budget at Vietnamese shop prices, fish ID from a photo. | | Algae ID from a photo. Changing a light schedule from the answer once the reader confirms. |
| **Local** | Vietnamese hobby names. "Nuôi ở Việt Nam" notes on every fish for the northern winter, southern cool nights and summer heat. Shop price ranges, Shopee links on equipment. | | Tap water by city. Seasonal advice, since summer heat brings algae and low oxygen. |
| **Follows up over weeks** | A conversation lasts 24 hours and is kept under the account. | | A tank journal of water tests, water changes and photos that the chat reads. Check-ins a week later. |
| **What worked for others** | Nothing yet, and we won't invent it. | | Outcomes readers choose to report, once the owner OKs the privacy side. |

**Today's limit on hard problems.** An answer is two or three sentences plus up to five blocks, such as a card, a guide's
section or a tool, within 5 model calls and 27 seconds. That fits "can a betta live with neons?". "My tank is full of
hair algae" needs a plan in steps that fits the tank. The eval shows it costs us most of the hard questions (below).

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

47 real hard questions, from public Vietnamese hobby forums (reworded, no names) and the existing chat eval. The owner's
own past research comes in if they share it. Our chat and plain Claude each answer every question. Plain Claude is the
same Haiku model with no tools and no handbook. A judge (Opus) sees the two answers without our name, twice with the
order swapped, and a win counts only when both judgements agree. Two conditions are reported apart: the full forum
post given to both, and a short question about a saved tank, where only we have the tank. The eval runs again on every
change to the chat's brain (`docs/review/chat-vs-plain.md`).

**First run, 2026-11-07: plain Claude wins clearly.** Full post: plain 43, ours 4, scores 6.8 and 3.5 out of 10. Saved
tank: plain 36, ours 8, 3 ties, scores 5.5 and 3.9. Ours lost every kind of problem. The judge's reasons agree:
- Ours won't diagnose. Told to answer only from the handbook, it says "the handbook doesn't say, so I can't be sure"
  where plain Claude names the likely cause.
- No plan. Two or three sentences and a pasted guide section, where plain Claude gives ordered steps for this tank.
- It doesn't fit the tank. Today it reads only size and fish, not plants, light, CO₂ or notes.
- Its reading budget runs out on hard questions: 8 of 94 answers failed and most stopped half-read.
- Some errors are our guides' own, such as "90% of hair algae is low CO₂" and "never more than 4 hours of light at a
  stretch". Those go back to the content side.

Next: answer as an expert who has read the handbook. Name the likely cause from the reader's details, then steps in
order, what to watch and when to check back, with figures and doses only from our pages. Read the whole tank, fix the
name search, read more per call. If that still loses, the question for the owner is whether the chat may use general
knowledge beside the handbook: common hobby figures our pages don't give, with a page's figure winning, and medicine
or chemical doses only from a page. I'll bring that with evidence.

## Order of work

1. The eval: done, first result above.
2. Close the gap it shows: expert answers with a plan, the whole tank read, the name search fixed ("cá vàng" finds a
   shrimp before the goldfish), more read per call. The eval runs after each.
3. The algae doctor, with the first equipment action: a shorter light schedule, applied once the reader confirms.
4. Heat and cold warnings, once the owner OKs the region and the forecast service.
5. More equipment actions: dimming, feeding mode, master-button scenes.
6. Setup planner; tank journal with maintenance reminders, cycling steps and check-ins.
7. The tank health review, once the journal gives it something to read, and only if the eval shows a panel beats one
   strong model.
8. A stronger model only for hard-problem flows, and only where the eval shows it pays for itself.
