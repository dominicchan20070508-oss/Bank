# Architecture facts that decide difficulty

These were verified against the code at v0.2 (October 2026). Paths are relative to `delivery-chaos/`. The code evolves, so spot-check a fact before relying on it for a verdict: grep the cited file.

## Authority and sync
- **Client authority** covers each player's own bike (position, lean, crash) and own cargo integrity. Clients send `state` at about 20 Hz.
- **Server authority** covers the order pool, who carries what, the timer, tips, stats and results. That logic is `GameRoom` in `src/shared/rules.ts`.
  - The same class runs in the browser for solo play (`src/client/net/localTransport.ts`) and on the server (`server/rooms.ts`).
  - Any new rule must live in `rules.ts` so solo and online behave the same.
- **Server tick and snapshots** run at 20 Hz. Remote riders are interpolated 150 ms behind (`INTERP_DELAY` in `src/client/interp.ts`).
- **Hosting:**
  - Render free tier, US Oregon.
  - Measured round trip from a US test machine is about 110 ms; players in Southeast Asia likely see about 200 ms or more.
  - The service sleeps after 15 minutes idle, and the first load then takes about 20–60 s.
- **Validation:** client→server messages are validated and rate-limited in `src/shared/validate.ts` (debris about 15/s, honk about 4/s). New message types need validators and tests.

## Things that do NOT exist (each one is a big cost if an idea needs it)
- **No AI driving, pathfinding or waypoint system.** Nothing in the game moves by itself except physics debris and particles. NPC traffic, autopilot and chasing animals all start from zero.
- **No synchronized physics objects.** Debris (flying pizza boxes, ice-cream scoops, soup blobs) is purely cosmetic:
  - It lives in `src/client/debris.ts`, and each client simulates its own copy from a `debris` event.
  - It lasts 8 s (`VIEW.DEBRIS_LIFETIME`) and the total count is capped.
  - Positions differ between clients, and debris has no IDs.
  - So "pick up dropped cargo" or "push an object together" requires new shared state, rated **中高** at least.
- **No joints or constraints between players.** Bikes don't collide with each other, and debris doesn't collide with bikes.
- **No accounts, database, persistence or leaderboard.** Only localStorage, per device.
- **No voice or text chat.** Communication today is limited to the horn and seeing each other.

## What is cheap because it already exists
- **Seed-deterministic map** (`src/shared/map.ts`, `generateCity(seed)`). Anything placed by seed, such as roadblocks, alleys or static props, is automatically identical for all players: **低–中**.
- **Pure cargo models** (`src/sim/cargo.ts`: soup / pizza / ice cream, with pure update functions and network summaries). A new cargo kind takes:
  - a sim model and tests;
  - a view (`src/client/cargoView.ts`);
  - an order type (`src/shared/orders.ts`);
  - a size bonus (`src/shared/scoring.ts`);
  - i18n strings.
  That is **中** if it reuses the spring/pendulum style, and **高** if it needs new physics such as ropes or snagging on world geometry.
- **Customer requests** are checked in `rules.ts` `onDeliver` (noHorn / gentle / backDoor / rush). A new request that reuses existing signals (honk, crash, door, time) is **低**.
- **Events and broadcasts:** `GameRoom` emits events such as pickup, deliver, honk, crash and debris. Adding a server-adjudicated event that follows the pickup/deliver pattern is **中**.
- **Tuning** all lives in `src/shared/constants.ts`:
  - `STAR_PER_PLAYER: [110, 200, 290]` × players;
  - the order pool is `min(players + 2, 6)`, refilling 3 s after a pickup, with waiting orders expiring at 45 s.
- **i18n** is in `src/client/i18n.ts` (zh/en dictionaries). The server sends codes and params only.
- **Audio** is synthesized with WebAudio in `src/client/audio.ts`, behind a master compressor and soft clipper. New sounds are cheap.

## Current rules that ideas often collide with
- **One order per player at a time** (`RoomPlayer.carrying` in `rules.ts`). Orders are first come, first served; there is no claim or reserve.
- **Pickup/delivery** happens by stopping (speed < 4 m/s for 0.5 s) inside a 5 m zone, with the server checking the reported position.
- **Crash** means 1.8 s of lost control, then auto-recover. Manual reset (R / the touch button) has a 3 s cooldown.
  - Crash cargo penalties: soup ×0.4, all pizza boxes, one scoop.
- **Rounds** last 240 s. Results and awards are computed on the server.
- **Phone layout:**
  - Left: steering pad.
  - Right: GAS, BRAKE, plus three small buttons (reset, horn, drift).
  - Compact HUD when the screen height is ≤ 500 px.
  - HUD panels must never cover touch buttons; `qa/v02.cjs` checks this.

## Constraints from the owner
- Small team (Claude PM plus a Sonnet coder agent), a free server, and low-poly primitive art (no asset pipeline).
- The game must stay 60 fps on a laptop and playable on mid-range phones (DPR cap 1.5, shadows off on touch).
- Every change must keep `npm run typecheck`, `npm test`, `npm run build`, `qa/pm-solo.mjs`, `qa/pm-multi.mjs` and `qa/v02.cjs` passing.

## Added in v0.3 (DESIGN §14)
- **Quick chat** (`src/shared/pings.ts`): six presets. The client sends `quick {id, orderId?}`; the server broadcasts `event ping` as codes. On touch, hold the horn; on desktop, use keys 1–6 or hold H.
  - Claims (`claimedBy` / `claimUntil` on orders) are informational and expire after 15 s. Each rider holds one claim, and only when not carrying.
  - A crash sends an automatic 🆘 to teammates.
  - The phone thumb budget is still 6 visible controls; the wheel reuses the horn button.
- **Salvage zones** are the precedent for *"stop in a zone, the server decides"* applied to a teammate's mishap:
  - the server creates them when a carrying player crashes, in multiplayer only;
  - they last 20 s, and only teammates can collect them;
  - collecting one adds `SALVAGE_TIP` (¥6) to the team.
- **Assists** (`src/client/assist.ts`):
  - touch auto-gas, on by default;
  - auto-slow near the target zone for everyone, which gas or boost overrides;
  - a steadier-rack assist.
  None of them affect rewards.
- **Audio** (`src/client/audio.ts`, `audioSession.ts`):
  - master compressor −12 dB / 6:1 plus a soft clipper;
  - main sounds peak around 0.66–0.71, and the worst-case mix around 0.87;
  - iOS silent-switch handling, a "tap to enable sound" banner, a volume slider, and captions for honks.
- **Ops**:
  - a `/healthz` endpoint, with a wake-up ping on page load;
  - one anonymous JSON summary line per online round in the server log (`src/shared/summary.ts`), with the fields listed in DESIGN §14.4. This is the only telemetry. Use it, plus playtests, before tuning stars or combos.
