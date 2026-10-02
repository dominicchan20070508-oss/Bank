# Co-op Interaction Mechanics in Comparable Games — Evidence for 外卖大乱送 / Delivery Chaos Upgrades

Research date: 2026-10-02. Sources: about 30 (developer interviews and blogs, major reviews, Steam-review digests, academic co-op design literature).
Evidence labels:
- **[DEV]**: developer statement.
- **[DATA]**: sales or review-count data.
- **[ACAD]**: peer-reviewed or academic work.
- **[REVIEW]**: critic opinion.
- **[COMMUNITY]**: guides, Steam or Reddit posts; anecdotal.
- **(snippet)**: the claim was seen only in a search-result summary, not in a fetched page, so verify it before quoting.

Dates are given because several key sources are old: Overcooked 2016–18, Natural Selection 2 2012, Artemis 2011–13, Moving Out 2020, Apex 2019.

Internal feasibility facts come from the repo's own reference, `/home/user/Bank/.claude/skills/game-design-review/references/architecture-facts.md` (verified at v0.2):
- Each bike is client-authoritative and sends state at about 20 Hz.
- Remote riders are interpolated 150 ms behind. Round trip is about 110 ms from the US and likely 200 ms or more from SE Asia.
- There are no synchronized physics objects. Debris is cosmetic, simulated per client and has no IDs.
- There are no joints between players, and bikes do not collide with each other.
- There is no voice or text chat; the horn is the only communication.
- Orders are first come, first served, with no claim. A crash costs 1.8 s and then the bike auto-recovers.

---

## Q1. Role division: how do comparable games create natural (unassigned) roles, and does any successful co-op game use an explicit dispatcher / "assign task to teammate" UI?

### Takeaway
The successful party co-op games create roles **implicitly**. They give the team more tasks than players, spread across space, then players self-assign while a shared order queue stays visible to all (Overcooked, Unrailed!).

Explicit command roles do exist, but only in hardcore team games (Natural Selection 2's Commander, Artemis' Captain). Critics there describe them as stressful, blame-attracting or low on hands-on play.

The asymmetric roles that are loved (Keep Talking, Lethal Company's terminal) work for two reasons:
- **Information asymmetry** forces talk, and **both sides still act**.
- The role is **optional and emergent**, not a mandatory seat.

I found no successful casual or party co-op game whose core loop is one player assigning tasks to others through a UI.

### Cited Findings
**Overcooked: shared tickets, self-assignment, deliberate overload**
- Phil Duncan (Ghost Town Games): the core principle was that "all players are equally responsible for the success of the team." They wanted to avoid one player who "could carry the rest of the team." [DEV, Feb 2017, older] — [Game Developer, Road to the IGF: Overcooked](https://gamedeveloper.com/design/road-to-the-igf-ghost-town-games-i-overcooked-i-)
- Duncan on the source of chaos: "The very basic design of the game is having too many tasks with the amount of players you have, and then these upper-level nuances that bring about that panic." [DEV, Jun 2017] — [MCV/Develop post-mortem](https://mcvuk.com/development-news/the-develop-post-mortem-overcooked/)
- Oli De-Vine: "You want people to have to change around what they're doing a little bit during the level." The team "did a lot to disrupt the players" so that fixed roles would not settle into routine. [DEV] — [MCV/Develop](https://mcvuk.com/development-news/the-develop-post-mortem-overcooked/)
- De-Vine on the order UI: "We were trying to find a way of communicating recipes efficiently to players, without them having to refer to a lot of steps." This is the shared-ticket design: everyone sees the same queue, and nobody owns it. [DEV] — [MCV/Develop](https://mcvuk.com/development-news/the-develop-post-mortem-overcooked/)
- Freedom-versus-restriction tuning: early unlimited ingredients frustrated players, so the team "was constantly adjusting the ratio of freedom and restriction." [DEV] — [Game Developer](https://gamedeveloper.com/design/road-to-the-igf-ghost-town-games-i-overcooked-i-)
- The playtest success metric was "when our friends still wanted to play the game without us having to bribe them with pizza." [DEV] — [Game Developer](https://gamedeveloper.com/design/road-to-the-igf-ghost-town-games-i-overcooked-i-)

**Unrailed!: separate resource tasks, no communication support**
- Reviewers' teams "had the most success assigning themselves roles – a lumberjack, a miner, and builder/fire marshall." Roles emerge from separate resource tasks.
- However, "Communication is key… but the game does very little to facilitate this." [REVIEW] (snippet) — [Nintendo World Report](https://nintendoworldreport.com/review/55152); [GamingTrend](https://gamingtrend.com/reviews/mine-build-place-or-kiss-your-caboose-goodbye-unrailed-review/)

**Lethal Company: an optional information role**
- The player who stays at the ship terminal has value through "information asymmetry": a full radar, remote door and turret toggles, and `switch <player>` to follow a teammate. Ground players see only a flashlight cone.
- The game does not enforce this role; teams choose it. [COMMUNITY guide] — [Prima Games](https://primagames.com/tips/how-to-play-the-ship-duty-role-in-lethal-company)
- One guide claims assigned teams extract "2-3x more scrap". This is **unsourced; treat it as opinion**. — [Switchblade Gaming](https://www.switchbladegaming.com/co-op-games/lethal-company-team-roles/)

**Natural Selection 2: an explicit Commander (top-down RTS view ordering first-person teammates)** [REVIEW, 2012, older] (snippet)
- "A bit of a stressful position… if you screw up in this one, your units will probably start trash-talking you."
- "Lead your team in the wrong direction and they will let you know."
- The game "needs players who are willing to hop into the commander role."
- Sources: [GameSpot review](https://www.gamespot.com/reviews/natural-selection-2-review/1900-6399998/); [Big Shiny Robot](https://bigshinyrobot.com/video-games/review-natural-selection-2-pc/)

**Artemis Spaceship Bridge Simulator: a dispatcher-like Captain**
- The Captain sees ship-wide information and shouts orders but "doesn't get to play with any computers." Reviewers call it the least hands-on seat. [REVIEW, 2011–13, older] (snippet) — [PC Gamer](https://www.pcgamer.com/2011/10/27/all-hands-on-desk-pcg-plays-the-best-star-trek-game-youve-never-heard-of-artemis-spaceship-bridge-simulator/); [Board Game Quest](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/)
- By contrast, in Spaceteam every player both receives instructions and shouts them. There is no central dispatcher; the "dispatch" is distributed across everyone. (snippet) — same sources.

**Keep Talking and Nobody Explodes: asymmetry that requires both sides**
- Steel Crate's GDC talk ("Designing Asymmetric Gameplay", Ben Kane): neither side can see what the other sees. Puzzles were tuned "to keep players talking in ways that encourage tension, mistakes, hilarity", and the game was designed to be fun for spectators too. [DEV] (snippet) — [GDC Vault](https://gdcvault.com/play/1023113/Designing-Asymmetric-Gameplay-For-Keep)

**Academic patterns** [ACAD]
- Rocha, Mascarenhas & Prada (2008), "Game Mechanics for Cooperative Games", catalogued co-op patterns such as complementarity, synergies between abilities, and shared goals. — [INESC-ID GAIPS](https://gaips.inesc-id.pt/component/gaips/publications/showPublication/3/87)
- El-Nasr et al. (CHI 2010) added patterns and the Cooperative Performance Metrics (CPMs):
  - positive: "Laughter or Excitement Together", "Worked out Strategies", "Helping";
  - negative: "Waited for Each Other", "Got in Each Other's Way".
  - A split screen and a camera led by player 1 caused waiting and getting in each other's way. [ACAD, 2010] — [UCC CORA thesis on CPM](https://cora.ucc.ie/items/c67dbd86-907f-49e7-9268-1cfbffe8ca49/full); [Chalmers thesis](https://odr.chalmers.se/items/7c133781-5540-46ab-8f25-399686df9b9b/full)
- A 2017 study combined pairs of patterns (complementarity, interacting with the same object, limited resources). The combinations "has shown no effect on player experience" in its test games. [ACAD, small study] — [AUC / USC conference paper](https://auc.edu.au/2017/11/combining-cooperative-design-patterns-to-improve-player-experience/)

### Inferences
- The pattern that transfers to Delivery Chaos is the Overcooked one:
  - more orders than riders (the pool is already `min(players+2, 6)`);
  - orders spread across the city, with a shared visible queue;
  - mild disruptions (rush customers, expiring orders) that break routines.
- Riders will self-specialize by geography (north side vs. south side) and by cargo (one player gets good at soup) without any assignment UI.
- An explicit dispatcher seat in a 4-minute physics-comedy game would combine the NS2 and Artemis problems:
  - the dispatcher loses the bike, which is the comedy engine;
  - the dispatcher becomes the natural target for blame ("you sent me across the map").
  - This works against the "co-op over competition" and "funny not annoying" pillars.
- What players actually need is a way to **signal intent** ("I'm taking that one") so first-come-first-served stops feeling like sniping. A claim ping does that (see Q4) without creating a boss.
- If an asymmetric role is wanted, the Lethal Company model fits better: optional and emergent, for example a player who just delivered or crashed can glance at a map overview. A mandatory seat does not fit.

### Gaps
- I found no developer statement or data on how often players volunteer for command roles (NS2, Battlefield 4 Commander Mode, Hell Let Loose), or on their retention. The evidence is critic opinion only.
- PlateUp! and R.E.P.O. role division were not researched in depth; I found no developer statements on either.
- I found no casual or party co-op game with an explicit "assign order to teammate" UI, so its reception cannot be measured directly. That absence is itself weak evidence.

---

## Q2. Item hand-off and throwing (Overcooked 2, Moving Out, Human: Fall Flat, Chained Together)

### Takeaway
Throwing and catching is consistently praised as a strategy multiplier and a "satisfying" coordination beat. Every praised example is **local or same-screen, between mostly stationary players, on a fixed-camera map**.

The complaints all concern unreliability: "throwing doesn't always seem to work correctly", invisible barriers, flailing controls. Unreliability is what turns comedy into blame.

### Cited Findings
- **Overcooked 2**: throwing ingredients "has a surprisingly huge effect on the strategies that can be used to master a stage". Later stages demand "a kind of dexterity that the original game didn't require." 8/10. [REVIEW, Mitch Vogel, 7 Aug 2018] — [Nintendo Life](https://www.nintendolife.com/reviews/nintendo-switch/overcooked_2)
- Press framed throwing as a new feature that also helps balance the harder, dynamic Overcooked 2 maps. [REVIEW/DEV interview] (snippet) — [Red Bull interview](https://www.redbull.com/int-en/overcooked-2-ghost-town-games-interview); [Push Square interview](https://pushsquare.com/news/2018/08/interview_chewing_the_fat_with_overcooked_2_developer_ghost_town_games)
- **Moving Out**: "Smaller items can not only be thrown, but caught… grabbing each end of a sofa with a partner and giving it the old 1-2-3-throw is unendingly satisfying." [REVIEW] (snippet) — [Film Stories](https://filmstories.co.uk/reviews/moving-out-review-sofa-surfing/)
- Moving Out's assist mode includes "tap to start the aiming process rather than holding to aim" for throws. This is an accessibility concession on aiming. [DEV feature list] (snippet) — [DualShockers](https://www.dualshockers.com/moving-out-accessibility-assist-mode-features-showcased-in-trailer/)
- Moving Out negatives:
  - "success is unpredictable. Maybe you'll get hung up on an invisible barrier around a doorway";
  - "inconsistent controls add a layer of aggravation likely to test friendships, marriages, and parent-child relationships." 6.5/10. [REVIEW, Jeff Cork, 30 Apr 2020] — [Game Informer](https://www.gameinformer.com/review/moving-out/moving-out-review-packed-with-frustration)
- **Human: Fall Flat**: "The simple act of lifting a pole becomes a mess of uncoordinated flailing." Some players "purposefully derail progress by grabbing ahold of others." Reviewers still found co-op "hilarious", and puzzles become "dramatically harder with more than one person." [REVIEW, 2016, older] (snippet) — [Co-Optimus review](https://www.co-optimus.com/review/1867/page/1/human-fall-flat-co-op-review.html)
- **Chained Together**: "you can blame anyone after you die… there's no way to verify who was the actual reason behind the downfall." It is marketed and received as "friendship-ruining", and players lean into the blame as the joke. [COMMUNITY Steam-review roundup / REVIEW] (snippet) — [Sportskeeda](https://sportskeeda.com/esports/hilarious-chained-together-reviews-steam-perfectly-sum-game); [Spin.ph](https://www.spin.ph/gaming/try-chained-together-a-game-designed-to-ruin-friendships-a4858-20240628)
- **Overcooked 2 online**: players communicate only through "emotes and pre-set messages". Reviewers note this sits uneasily with an experience built on "hollering with someone next to you." [REVIEW] — [Nintendo Life](https://www.nintendolife.com/reviews/nintendo-switch/overcooked_2)

### Inferences
- In Overcooked and Moving Out, the thrower and catcher share **one camera and near-zero latency**. Delivery Chaos is online and client-authoritative, with 150 ms interpolation plus 110–200 ms or more of round trip.
- A throw between two **moving** bikes would therefore often look caught on one screen and missed on the other. That is the "no way to verify who caused it" condition from Chained Together, which violates the "failures visible, predictable, attributable" pillar.
- Chained Together turns unattributable blame into its brand. Delivery Chaos explicitly wants the opposite.
- A **stationary** hand-off (both riders stopped close together), or a drop point where one rider leaves an order and another collects it, is the Overcooked "counter pass" equivalent. It keeps the strategic benefit (relay across the map) and stays server-adjudicable.

### Gaps
- I found no developer postmortem quantifying how online latency affected Overcooked 2's or Moving Out's throwing. Whether online players use throws less is unknown.
- I found no evidence on throw or aim usability on phone touch screens in co-op games.

---

## Q3. Rescue and revive: does rescue make failure feel cooperative rather than punishing? (Peak, R.E.P.O., Lethal Company, Human: Fall Flat)

### Takeaway
Yes, when rescue is **a chance to help, not a mandatory wait**. In the 2023–25 "friendslop" hits, a teammate's failure becomes a group event:
- Peak: friends haul you up or revive you.
- Lethal Company: retrieve the body to cut the fine.
- R.E.P.O.: carry your head back to extraction.

Critics consistently describe that failure as hilarious, not punishing. The main risk is downtime for the fallen player and difficulty for small or solo groups (R.E.P.O.'s top Steam complaint).

### Cited Findings
**Peak** (Aggro Crab + Landfall, 16–18 Jun 2025)
- "if stamina reaches zero, you fall unconscious, and your friends must save or revive you."
- Ropes, pitons and chain launchers "create life-saving shortcuts when you don't have the stamina to climb."
- "Seeing a friend confidently miscalculate a fatal jump is always hilarious."
- "hearing their screams slowly fade thanks to proximity chat."
- Score 9/10. [REVIEW, Alex Van Aken, 10 Jul 2025] — [Game Informer](https://gameinformer.com/review/peak/a-brilliant-co-op-climbing-adventure)

**Peak sales and reception** [DATA/DEV]
- 2 million copies sold in nine days; made in about a month for under $200k. — [Inverse interview with Nick Kaman](https://www.inverse.com/gaming/peak-steam-landcrab-friendslop-update-interview-nick-kaman-pc)
- Overwhelmingly Positive on Steam, about 296k reviews at the time of indexing (snippet). — [Wikipedia: Peak](https://en.wikipedia.org/wiki/Peak_(video_game))
- Kaman: "Isn't it a great thing to goof around with your friends?" The team chose a "low-key hangout vibe" over competition. [DEV] — [Inverse](https://www.inverse.com/gaming/peak-steam-landcrab-friendslop-update-interview-nick-kaman-pc)
- Peak's store copy (snippet) asks you to "Help each other up ledges, or place ropes and climbing spikes to make the way easier for those who come after." [DEV marketing] (snippet; exact page attribution uncertain, likely store/press copy) — [Aggro Crab/Landfall press release](https://gamespress.westeu-v2.propressroom.com/AGGRO-CRAB-LANDFALL-ANNOUNCE-PEAK---RELEASES-TODAY)

**R.E.P.O.** (semiwork, Early Access Feb 2025)
- A dead player is revived when teammates carry their head to the extraction point and the quota completes. They return with 1 HP. [COMMUNITY guide] (snippet) — [Dot Esports](https://dotesports.com/indies/news/how-to-revive-your-teammates-in-r-e-p-o)
- Steam digest: 77% positive.
  - Top positives: "Fun with friends", "Funny physics system".
  - Top negatives: "Difficult solo play and high artificial difficulty", "Repetitive maps", physics bugs. [DATA, aggregated] — [Vaporlens](https://vaporlens.app/app/3241660/r_e_p_o)

**Lethal Company**
- A dead crewmate costs the team a fine; recovering the body avoids or reduces it. **Sources conflict on the amount**: one says the fine is avoided, another says it is reduced by 50%. [COMMUNITY guide] (snippet) — [GamesRadar money guide](https://gamesradar.com/lethal-company-money)
- Proximity chat plus walkie-talkies make silence alarming and distant advice valuable. Critics praise Zeekerss' comic and horror timing. [REVIEW] (snippet) — [CogConnected](https://cogconnected.com/feature/what-makes-lethal-company-so-good/)

**Chained Together**: the counter-example. Failure is collective and unattributable, so the fun is shared blame. It works as a brand ("ruin friendships") but is the opposite of a "funny not annoying" goal. — [Sportskeeda](https://sportskeeda.com/esports/hilarious-chained-together-reviews-steam-perfectly-sum-game)

**Academic** [ACAD]: El-Nasr et al.'s CPMs list "Helping" alongside "Laughter or Excitement Together" as markers of good co-op, and "Waited for Each Other" as a negative. — [UCC CORA](https://cora.ucc.ie/items/c67dbd86-907f-49e7-9268-1cfbffe8ca49/full)

### Inferences
- Rescue works because it turns a failure into a **reason for teammates to converge and react together**, which is where laughter happens.
- In Delivery Chaos a crash already auto-recovers in 1.8 s. A rescue that the crashed player *waits* for would add downtime (a negative CPM) and make a 2-player round worse. The R.E.P.O. lesson: a game tuned around being rescued punishes small groups.
- The transferable form is **salvage**: the spill becomes a visible, time-limited bonus that any teammate can recover. Examples are Lethal Company's body retrieval and Peak's ropes left for those who come after.
- The crashed player is never blocked; the helper gets credit, for example a "Good Samaritan" or "Soup Rescuer" award next to "Crash King".

### Gaps
- I found no developer statements from semiwork or Zeekerss on why they chose head-carry or body-retrieval designs.
- I found no quantitative data on whether revive mechanics change retention or session length.

---

## Q4. Text-free communication: pings, quick chat, emotes, proximity voice. What is the evidence for strangers and phone players?

### Takeaway
There is strong, convergent industry evidence that **contextual one-tap pings** improve coordination among strangers and players without voice:
- Respawn designed and playtested Apex specifically with voice off.
- Blizzard built Overwatch 2's ping around "Every Voice Matters".
- EA pledged the ping patent royalty-free as an accessibility technology.
- Among Us added a quick-chat wheel because typing on mobile was awkward.

The academic evidence is that ping *styles* matter for performance, not just volume. The documented failure mode is **sarcastic or spam use of canned phrases** (Rocket League's "What a save!"), which requires phrase curation, rate limits and mute.

### Cited Findings
**Apex Legends (Feb 2019)**
- Respawn playtested for about a month **with voice comms off and fake names** to simulate random teammates (Respawn shared this on Twitter, Feb 2019). [DEV, reported] — [WN Hub](https://wnhub.io/news/other/item-15272); [Mein-MMO](https://mein-mmo.de/en/the-ping-system-of-apex-legends-is-so-good-that-other-shooters-want-to-copy-it,331956/)
- Pings are contextual: ping an enemy and your character calls it out; ping loot and teammates can call "dibs" (a claim marker). The system works "across abilities and languages." [REVIEW/wiki] (snippet) — [PC Gamer](https://www.pcgamer.com/au/apex-legends-ping-system-is-a-tiny-miracle-for-fps-teamwork-and-communication/); [Apex wiki: Ping](https://apexlegends.wiki.gg/wiki/Ping)
- Rainbow Six Siege developers publicly said they wanted an Apex-style contextual ping, and Fortnite adopted one. [DEV/REVIEW] (snippet) — [Stevivor interview](https://stevivor.com/features/interviews/rainbow-six-siege-wants-an-apex-legends-contextual-ping-system)
- **EA Patent Pledge (Aug 2021)**: EA made five accessibility patents free for any studio. The first is the "Ping System that allows players to transmit contextually aware audio and visual communications generated via mappable controller inputs." [DATA/DEV] — [VGC](https://www.videogameschronicle.com/news/ea-has-made-five-of-its-accessibility-patents-free-for-any-studio-to-use)

**Overwatch 2 (2022)**
- Systems designer Gavin Winter: "One of our goals was to augment speech and give people a way to visually interpret voice communication… support all voices and create a system to communicate for players that would prefer to avoid voice chat."
- Principal designer Adam Puhl: pings are "a more accurate, clear, and understandable way of communicating rather than hearing someone yell, 'Reaper behind'."
- Anti-toxicity measures: "heavy spam protection" and a block or squelch option. [DEV] — [Blizzard: An inside look at the ping system](https://overwatch.blizzard.com/en-us/news/23785337/an-inside-look-at-the-ping-system-in-overwatch-2/)

**Among Us (v2021.2.21)**
- Added a Quickchat wheel of 7 categories (accusation, crew, systems, location, statements, question, response) for common phrases such as "I was with X". The aim was to fix awkward typing on mobile and with strangers.
- An "Under 18" setting restricts children to quick chat only. [DEV patch notes / REVIEW] (snippet) — [TheGamer](https://www.thegamer.com/among-us-adds-quickchat-feature/); [PCGamesN](https://www.pcgamesn.com/among-us/update-quickchat); [Byteside](https://byteside.com/2021/03/new-among-us-update-brings-quickchat-a-great-family-friendly-addition)

**Overcooked 2 online**: emotes and pre-set messages exist (for example, signalling that you are cooking or washing). Reviewers found them insufficient for intent: players "will have to assume the other player's intentions." [REVIEW, 2018] — [Nintendo Life](https://www.nintendolife.com/reviews/nintendo-switch/overcooked_2); (snippet) [Push Square review](https://pushsquare.com/reviews/ps4/overcooked_2)

**Rocket League quick chat: the failure mode**
- "What a save!" is widely used sarcastically or spammed after a teammate's mistake.
- Players debate removing toxic presets versus muting; a quick-chat-only option exists. [COMMUNITY] (snippet) — [The Loadout: toxicity problem](https://www.theloadout.com/rocket-league/toxicity-problem); [Gfinity: most toxic quick chats](https://www.gfinityesports.com/rocket-league/rocket-league-the-5-most-toxic-quick-chats)

**Academic** [ACAD]
- Leavitt, Keegan & Clark, "Ping to Win? Non-Verbal Communication and Team Performance in Competitive Online Multiplayer Games", CHI 2016, DOI 10.1145/2858036.2858132. — [CU Boulder record](https://vivo-cub.colorado.edu/display/pubid_147303)
- Secondary summaries say players adopt distinct pinging styles with **different effects on team performance**; pings are "lean" communication suited to high-tempo play. (snippet; the full abstract was not retrieved, so do not quote specific effect directions.)

**Proximity voice** (Lethal Company, R.E.P.O., Peak) is credited by reviewers as a major comedy source: fading screams, silence as a warning. [REVIEW] — [Game Informer Peak](https://gameinformer.com/review/peak/a-brilliant-co-op-climbing-adventure); [CogConnected](https://cogconnected.com/feature/what-makes-lethal-company-so-good/)

### Inferences
- Delivery Chaos has every condition that pings were invented for:
  - strangers or friends without voice;
  - phone players who cannot type mid-ride;
  - a mixed zh/en audience.
- The server already sends codes and params only, so pings render in each client's language. This is the Apex "across languages" benefit almost for free.
- Proximity voice is the comedy engine of the friendslop hits, but it requires voice infrastructure and moderation, which the "free server, no accounts" constraint rules out. Canned phrases with synthesized voice or sound stingers are the transferable substitute.
- The phrase list should avoid lines that can be aimed at a teammate sarcastically ("What a save!"), so that the "co-op over competition" pillar is not undermined. Prefer self-directed or positive lines such as "Sorry!", "Thanks!", "Nice!", "Help!" and "On it!". Rate-limit them, since the honk already has a validator at about 4/s.

### Gaps
- I could not retrieve the full abstract or effect sizes of Leavitt et al. (2016). No study was found that directly measures ping effects in casual co-op or on mobile.
- I found no Respawn data, such as ping usage rates or win-rate correlation, released publicly; the evidence is the developer's design-process statement.

---

## Q5. Jointly carried items (Moving Out couches, R.E.P.O. heavy valuables, Peak carrying teammates)

### Takeaway
Two-person carrying is the single most-cited comedy beat in Moving Out ("1-2-3-throw" sofas). It works best when it is **short, visible and optional**.

It frustrates when physics or level geometry make success unpredictable: "invisible barrier around a doorway", doorways "just barely wide enough". It also frustrates when the two carriers cannot tell who caused the failure.

### Cited Findings
- **Moving Out**: heavy items such as beds and fridges need two players, who can "work together to swing and throw these items." Grabbing each end of a sofa and throwing it is "unendingly satisfying." [REVIEW] (snippet) — [Film Stories](https://filmstories.co.uk/reviews/moving-out-review-sofa-surfing/)
- **Moving Out** (Game Informer 6.5) praises the "heave ho" stacking but criticizes the rest:
  - "Even the early moves seem designed to be as maddening as possible. Doorways are just barely wide enough to accommodate larger pieces of furniture";
  - "If you aren't a patient person… avoid this game." [REVIEW, Apr 2020] — [Game Informer](https://www.gameinformer.com/review/moving-out/moving-out-review-packed-with-frustration)
- Moving Out's **Assist Mode** offers extended timers (+35 s for gold, +50 s for silver, +120 s for bronze), removal of dangerous obstacles, and tap-to-aim throwing. It is evidence that the base co-op difficulty was a known pain point. [DEV feature list] (snippet) — [DualShockers](https://www.dualshockers.com/moving-out-accessibility-assist-mode-features-showcased-in-trailer/)
- **R.E.P.O.**: larger fragile valuables (vases, computers) "require coordination between the players"; any bump reduces their value. Physics chaos is the top-cited positive on Steam, and physics bugs a top negative. [COMMUNITY/DATA] — [GamingOnLinux](https://www.gamingonlinux.com/2025/03/r-e-p-o-is-a-new-co-op-horror-game-with-silly-physics-currently-exploding-on-steam/page=1/) (snippet); [Vaporlens](https://vaporlens.app/app/3241660/r_e_p_o)
- **Totally Reliable Delivery Service**, the closest genre comparable (ragdoll delivery, 4-player co-op):
  - one reviewer laughed "so hard with tears rolling down their faces";
  - another found that multiplayer "feels more like coexisting than cooperating";
  - fragility penalties are "nearly impossible [to avoid] unless you can master the physics";
  - fun "swiftly turns into frustration with the unwieldy controls." [REVIEW] (snippet) — [CogConnected](https://cogconnected.com/review/working-totally-reliable-delivery-service-review/); [Nintendo World Report](https://www.nintendoworldreport.com/review/53513)
- **Human: Fall Flat**: jointly lifting an object becomes "a mess of uncoordinated flailing", which is funny with friends. [REVIEW] (snippet) — [Co-Optimus](https://www.co-optimus.com/review/1867/page/1/human-fall-flat-co-op-review.html)

### Inferences
- The TRDS warning, "coexisting rather than cooperating", is the closest analogue to the current Delivery Chaos risk: riders deliver solo orders side by side. A rare joint order is a direct fix for that.
- Every praised joint carry happens in **local co-op on one screen or one physics simulation**. Delivery Chaos has no joints, no bike-to-bike collision, client-authoritative bikes and 150 ms or more of lag. A physical rope or plank between two bikes would jitter and produce disputed failures.
- A "soft tether" adaptation keeps the comedy without real constraint physics:
  - both riders must stay within N metres;
  - a stretch meter is visible to both;
  - the cargo shakes visibly as the distance grows;
  - the server adjudicates failure and names who strayed.

### Gaps
- I found no developer commentary (SMG Studio, semiwork) on tuning two-person carries. The SMG interview pages were not retrievable (403, or an empty page).
- I found no online-latency postmortem for jointly carried objects.

---

## Q6. Assessment of candidate upgrades for Delivery Chaos

### Takeaway
Ranked by evidence-weighted payoff against cost and pillar risk:
1. **(8) Quick-chat / ping wheel**: strongest evidence, low cost, unlocks coordination for the others.
2. **(1) Crash rescue + spilled-cargo salvage**, in an optional "salvage" form.
3. **(4) Giant joint order**, only as a soft-tether "convoy" order, rare and short.
4. **(2) Dispatcher UI**: replace it with a claim ping plus shared order board; drop the "1 dispatcher + 3 riders" seat.
5. **(3) In-motion relay throw**: replace it with a stationary hand-off or drop point; in-motion throws conflict with the attributable-failure pillar under current netcode.

### Cited Findings and Assessment per Upgrade

**(8) Quick-chat / ping wheel**

*Fun payoff*
- Strangers and phone players coordinate without typing, as with Apex playtested without voice ([WN Hub](https://wnhub.io/news/other/item-15272)) and Among Us quick chat for mobile ([TheGamer](https://www.thegamer.com/among-us-adds-quickchat-feature/)).
- It is inclusive by design: Overwatch's "Every Voice Matters" ([Blizzard](https://overwatch.blizzard.com/en-us/news/23785337/an-inside-look-at-the-ping-system-in-overwatch-2/)).
- Character barks such as "Sorry!!" after a soup spill add comedy and attribution.
- The highest-value variant is **contextual**: tap an order card or map pin to say "I'm taking this" (Apex "dibs"), tap your own crash to say "Help/sorry", tap a location to say "Here!".

*Pitfalls*
- Sarcasm and spam, as with Rocket League's "What a save!" ([The Loadout](https://www.theloadout.com/rocket-league/toxicity-problem)). Mitigate with self-directed or positive phrases, rate limits (Overwatch's "heavy spam protection") and per-player mute.
- Overcooked 2's emote set was judged too thin to convey intent ([Nintendo Life](https://www.nintendolife.com/reviews/nintendo-switch/overcooked_2)), so include intent pings, not just emotes.
- Phone HUD space: the wheel must not cover the touch buttons (the repo's QA already enforces this).

*Precedent*: Apex; Overwatch 2; Fortnite; Among Us; Rocket League (cautionary); Overcooked 2 emotes (insufficient on their own).

*Cost (internal)*: low to medium. It reuses the event-broadcast and i18n-code pattern and needs a new validated message type.

---

**(1) Crash rescue + picking up spilled cargo**

*Fun payoff*
- Turns a single rider's failure into a team moment and the El-Nasr "Helping" and "Laughter Together" CPMs ([UCC CORA](https://cora.ucc.ie/items/c67dbd86-907f-49e7-9268-1cfbffe8ca49/full)).
- Mirrors the 2025 hits: Peak friends revive or haul you ([Game Informer](https://gameinformer.com/review/peak/a-brilliant-co-op-climbing-adventure)), and R.E.P.O. head-carry revive ([Dot Esports](https://dotesports.com/indies/news/how-to-revive-your-teammates-in-r-e-p-o)).
- Lethal Company body retrieval converts a death into a recovery mission ([GamesRadar](https://gamesradar.com/lethal-company-money)).
- It also creates a new joke award, such as "Soup Rescuer".

*Pitfalls*
- A mandatory rescue means the crashed player **waits**, a negative CPM. The crash already auto-recovers in 1.8 s, so a rescue gate adds downtime.
- On a 5×5 map with 2 players, a helper is usually far away. That is the R.E.P.O. lesson that small groups and solo players suffer ([Vaporlens](https://vaporlens.app/app/3241660/r_e_p_o)).
- "Pick up spilled cargo" with real debris needs new synchronized objects; debris is currently client-cosmetic with no IDs (internal: medium-high).

*Recommended form*
- On a crash, the server spawns one visible **spill marker** with a timer, worth X% of the lost value.
- Anyone, including the crasher, who stops in it recovers the value, using the existing stop-in-zone pickup pattern.
- Optional "shove upright": a teammate stopping next to a crashed bike cancels the remaining recovery time.
- Credit the helper in the awards.

*Precedent*: Peak (revive, ropes for those behind); R.E.P.O. (head to extraction); Lethal Company (body retrieval reduces the fine; sources conflict on the amount); Human: Fall Flat (pulling teammates up).

---

**(4) Giant order carried jointly by two bikes**

*Fun payoff*
- It is the Moving Out couch: the most-quoted joyful moment in that genre ("unendingly satisfying", [Film Stories](https://filmstories.co.uk/reviews/moving-out-review-sofa-surfing/)).
- It directly fixes the TRDS "coexisting rather than cooperating" risk ([CogConnected](https://cogconnected.com/review/working-totally-reliable-delivery-service-review/)).
- It forces convergence and talk, which suits ping callouts.

*Pitfalls*
- Moving Out's "success is unpredictable… invisible barrier around a doorway" and friendship-testing frustration ([Game Informer](https://www.gameinformer.com/review/moving-out/moving-out-review-packed-with-frustration)).
- Joint failure risks the Chained Together "no way to verify who" blame ([Sportskeeda](https://sportskeeda.com/esports/hilarious-chained-together-reviews-steam-perfectly-sum-game)).
- Netcode: no joints, no bike collision, and lag. A real rope or plank between client-authoritative bikes would be jittery and disputed (internal: high).
- In 2-player games it locks the whole team onto one order.

*Recommended form*
- A rare "big order" (for example a wedding cake or sofa), at most 1 per round and short-haul.
- Implemented as a **soft tether**: both riders must stay within N metres, with a shared stretch meter visible to both.
- Server-adjudicated failure names who broke the tether or crashed, keeping it attributable.
- Generous bonus; opt-in, never required for stars.

*Precedent*: Moving Out (two-person heavy items), R.E.P.O. (large fragile valuables), Peak (carrying unconscious friends).

---

**(2) Dispatcher / order-assignment UI, with a "1 dispatcher + 3 riders" option**

*Fun payoff*
- Could reduce order-sniping under first come, first served.
- Could give a less dexterous player (for example a child, or a phone player on a weak device) a meaningful seat, as with the Lethal Company terminal operator's information role ([Prima Games](https://primagames.com/tips/how-to-play-the-ship-duty-role-in-lethal-company)).

*Pitfalls*
- No successful party co-op precedent was found.
- The command roles that do exist are described as stressful and blame-magnets, as with NS2's Commander and "your units will probably start trash-talking you" ([GameSpot](https://www.gamespot.com/reviews/natural-selection-2-review/1900-6399998/)).
- They can also feel least hands-on, as with Artemis' Captain, who "doesn't get to play with any computers" ([PC Gamer](https://www.pcgamer.com/2011/10/27/all-hands-on-desk-pcg-plays-the-best-star-trek-game-youve-never-heard-of-artemis-spaceship-bridge-simulator/)).
- Overcooked's designers explicitly wanted "all players… equally responsible" ([Game Developer](https://gamedeveloper.com/design/road-to-the-igf-ghost-town-games-i-overcooked-i-)).
- The dispatcher loses the bike, which is the game's comedy engine. Assignment also adds UI that is not "understandable at a glance", and with 2 players it degenerates to 1+1.

*Recommended alternative*
- A **claim ping** on order cards (Apex "dibs"): a soft reservation for about 10 s, visible to all and server-validated.
- A shared order board showing which rider is heading where (Overcooked shared tickets).
- If an asymmetric seat is still wanted, make it emergent and optional, for example a map overview for whoever is between orders. Do not add a lobby role.

*Precedent*: Overcooked (shared tickets, no assignment), Apex (dibs), Lethal Company (optional terminal), Keep Talking (asymmetry where both sides act); NS2 and Artemis (cautionary).

---

**(3) In-motion cargo hand-off / relay throw between bikes**

*Fun payoff*
- Overcooked 2's throwing "has a surprisingly huge effect on the strategies" ([Nintendo Life](https://www.nintendolife.com/reviews/nintendo-switch/overcooked_2)).
- Moving Out's throw-and-catch is "satisfying" ([Film Stories](https://filmstories.co.uk/reviews/moving-out-review-sofa-surfing/)).
- Relay chains across the city would be spectacular, highlight-worthy moments.

*Pitfalls*
- All praised precedents are same-screen and stationary. Even there, "throwing doesn't always seem to work correctly" (snippet from a Moving Out review search; exact outlet uncertain, possibly [AV Club](https://www.avclub.com/moving-out-review)) and aim needed an assist (tap-to-aim, [DualShockers](https://www.dualshockers.com/moving-out-accessibility-assist-mode-features-showcased-in-trailer/)).
- Under 150 ms interpolation plus 110–200 ms of round trip, moving catches will disagree between clients, producing unattributable failure that breaks the pillar.
- Aiming while steering with touch on a phone is hard.
- Needs synchronized flying objects, which do not exist (internal: high).

*Recommended alternative*
- A **stationary hand-off**: both riders stopped within about 5 m, one tap to "pass". It is server-adjudicated and uses the existing stop rule.
- Or a **relay drop point**: leave the order at any curb as a temporary pickup zone, like an Overcooked counter.
- Either keeps the relay strategy and the "co-op over competition" feel without latency disputes.

*Precedent*: Overcooked 2 (throwing, counters), Moving Out (throw and catch), Human: Fall Flat (grab chaos, griefing risk).

### Inferences
- Upgrades (8) and (1) reinforce each other. A "Help!" ping on a crash plus a salvage marker creates a full loop: visible failure, call for help, teammate converges, credit and laughter. This is the pattern behind the Peak and R.E.P.O. moments, at low or medium cost.
- (2) and (3) are attractive on paper but import the two worst-documented co-op frictions:
  - a blame-magnet boss role (NS2, Artemis);
  - unreliable or unattributable physics hand-offs (Moving Out, Chained Together).
- Cheaper, pillar-safe substitutes deliver most of the value: the claim ping and the stationary pass or drop point.
- (4) is the highest-comedy, highest-risk item. Ship it only as a soft tether after (8) exists, so that pairs can coordinate.

### Gaps
- I found no evidence specific to **browser or phone** co-op games. All precedents are PC or console titles, so assumptions about touch usability are inferred, not evidenced.
- I found no quantitative data on how claim or dibs markers change conflict over shared resources.
- I found no developer postmortem from SMG Studio, semiwork or Zeekerss on mechanic-level tuning. Several primary interview pages were unreachable (403, empty, or a PDF without text extraction), including GameSpot's SMG inclusivity interview, the Red Bull SMG interview, the ACM DL page for Leavitt et al. and the SFU thesis by El-Nasr's co-author.
