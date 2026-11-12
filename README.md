# Saftladen

Isometric low-poly agency office game (Three.js + TypeScript + Vite).
Current state: the real office (reconstructed from walkthrough photos, 41 x 15 m; R toggles the roof, `EXACT` in `officeModel.ts` switches between the exact standalone model and the scaled game version) with all team members and two dogs wandering around, sitting at desks and chatting.

## Run

```
nvm use                # Node version from .nvmrc
npm install
npm run dev            # http://localhost:5173
npm run build
npm test               # vitest: simulation tests (src/**/*.test.ts), deterministic via a fixed seed
npm run test:e2e       # playwright: browser smoke tests (e2e/), headless Chromium against its own dev server on :5199
npm run fetch-team     # re-scrape https://vitamin2.ch/agentur (names, roles, portraits -> public/team, src/data/team.raw.json)
```

## Tests

- Logic → Vitest (`src/**/*.test.ts`, Node, no browser).
- Interactions and UI (keys, URL hashes, panels, how the parts work together) → Playwright (`e2e/*.spec.ts`). First time: `npx playwright install chromium`. Each test opens `/?test&seed=1&time=11`: `?test` exposes the game as `window.__game` (dev server only, not in the production bundle) and renders without shadows and antialiasing (software WebGL is far too slow otherwise), the seed and the frozen clock make the start the same every run. Tests read the game state through that hook (`read()` / `until()` in `e2e/game.ts`) and wait for states, never for fixed times. `npx playwright test --ui` to debug, traces of failures land in `test-results/`.
- Purely visual changes → check them in the browser (no screenshot tests yet).

Feature URLs: each `FEATURES.md` line can carry a `url:`, a dev-server path that shows the feature right away, e.g. `http://localhost:5173/?seed=1&time=11&event=meeting-room`. Dev-only params (see `src/game/debugParams.ts`): `?seed=<n>` same start, `&time=<h>` frozen clock, `#iso` `#orbit` `#plan` `#walk[@x,z,yaw]` view, `#homes` all home offices taken, `?day[=id]` day mode, `?snack[=id]&follow` chips run, and `?event=<id>` runs a dev-panel event at start (ids: `dev.list()` in the console; repeatable, retried until it can run, an unknown id only warns). `e2e/feature-urls.spec.ts` opens every `url:`, so they don't rot. PRs list the URLs of the lines they touch under `## Try it`.

CI runs build and Vitest on every push. The Playwright job costs about 5 Actions minutes, so it only runs on pull requests labeled `e2e` (again on each push while the label is on) or when started by hand (Actions → CI → Run workflow). That is why `npm run test:e2e` must pass locally before every PR.

## Structure

- `src/game/rng.ts` – the one source of randomness: `random()` for the simulation (seedable, `?seed=<n>` in dev replays a start), `fxRandom()` for per-frame visuals, `seeded(n)` for fixed looks. Never use `Math.random()`

- `src/data/team.ts` – hand-annotated look per person (hair, glasses, beard, clothes) derived from the portraits
- `src/render/characterBuilder.ts` – builds the low-poly character from a `Look`
- `src/render/officeModel.ts` – the office itself (walls, rooms, desks, furniture, roof), ported from `office-model/index.html`; also yields the desk placements and walking blockers
- `src/render/Views.ts` – view modes: Orbit (2, default), Iso (1), Plan (3), Walk (4, WASD + drag to look, collides with the nav grid; roof shown); deep links `#orbit`, `#plan`, `#walk@x,z,yaw`
- `src/render/World.ts`, `IsoCamera.ts` – parquet slab, light, iso camera (drag = pan, wheel = zoom)
- `office-model/index.html` – standalone first-person 3D viewer of the same office (reference)
- `src/render/officeBuilder.ts` – monitor screen textures
- `src/game/Office.ts` – every desk of the model is a workplace, desk claim/release
- `src/game/` – fixed-step loop, A* nav grid, wandering people and dogs; people sometimes claim a desk, sit down, work, then stand up and wander again (`Person.ts`)
- `src/game/Traffic.ts`, `Passages.ts` – crowd-aware routing; doorways, corridors and gaps between desks (found from the nav grid) carry one direction at a time: oncoming walkers wait beside the entrance, the two sides take turns, and whoever waits too long detours, gives way or finally pushes through
- `src/game/Presence.ts`, `Door.ts` – office hours: core time is 08:00 - 17:30, but everybody has their own habitual `arrive` / `leave` / `lunch` hour and `nightOwlChance` (`schedule` per person in `src/data/team.ts`, missing values fall back to `CORE_HOURS`). Every day at 04:00 each person gets a fresh plan with some jitter around those times; now and then somebody stays for a night shift (desk lamp on, `nightHome` = from the home office) and on some days a crunch keeps a few more in. During their hours people still pop out: lunch at their own hour, errands (25-70 s) or home office (90-220 s); at most 15 are in the office at once. `H` sends the selected person home / back, `#homes` in the URL fills all 8 home offices. Today's plans: `__game.presence.schedule` in the console (with `?time=…`)
- `src/data/homeAssignments.ts` – who owns which home office room (set per person in the character view, saved in localStorage; Marco has his own special room)
- `src/render/homeOffice.ts` – 8 home office rooms seen through a webcam; drawn into the main canvas behind the feed tiles (`ui/Feeds.ts`); `ui/Roster.ts` lists who is not in the office
- `src/ui/Overlay.ts` – tooltip (hover/click) and name labels (N)

New team members: run `fetch-team`, then add a look for the new id in `src/data/team.ts`.
