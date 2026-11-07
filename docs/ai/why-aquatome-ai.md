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
hair algae" needs a plan in steps that fits the tank. The eval will show how much this costs us.

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

## How we prove it

About 40 real hard questions, from public Vietnamese hobby forums (reworded, no names), the existing chat eval, and the
owner's own past research if they share it. Our chat and plain Claude each answer every question. Plain Claude is the same
Haiku model with no tools and no handbook. A judge sees the two answers in random order, twice with the order swapped,
and a win counts only when both judgements agree. Two conditions are reported apart. In one, both get the full forum
post. In the other, the reader asks a short question about a saved tank, and only we have the tank. Target: a clear win.
The eval runs again on every change to the chat's brain.

## Order of work

1. The eval, now.
2. Whatever the eval shows first. Likely the chat reading the whole tank, then longer step-by-step answers for hard
   problems.
3. Algae doctor, setup planner, tank journal and check-ins, in the order the eval's gaps show.
4. A stronger model only for hard-problem flows, and only where the eval shows it pays for itself.
