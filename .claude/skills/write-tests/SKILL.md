---
name: write-tests
description: How to write and change tests in this repo - which kind (Vitest for logic and simulation, Playwright for what only a browser shows), the Playwright helpers in e2e/game.ts (openGame, read, until, scene), frozen game time under ?test, setting a scene, checking for flakes, and adapting older specs on a rebase. Load before writing, changing or fixing any *.test.ts or e2e/*.spec.ts, and when a test fails or is flaky.
---

# Write tests

`AGENTS.md` ("Writing tests") says which kind of test a change needs and the rules that always hold. This is the how.

## Vitest: logic and simulation

Build the part with plain data and step it by hand: `setSeed(n)`, then `update(1 / 60)` in a loop until the state is there (`Meeting.test.ts`, `Presence.test.ts`, `Walker.test.ts`). Randomness comes from `src/game/rng.ts`, never `Math.random()`. A part that cannot be built without a canvas: pull the logic out first.

The whole office runs in Node too: `new Sim()` (`src/game/Sim.ts`) is the real layout, nav grid, people and pets without a renderer, `sim.step(1 / 60)` moves it on. Call `installHeadlessDom()` (`src/test/headlessDom.ts`) at the top of such a test file: the builders paint textures on canvases, and that gives them one that draws nothing. See `Sim.test.ts`. Use it for what several parts do together over time (somebody walks to a meeting, a pet follows its owner out); a single part stays a test of that part.

## Set the scene, don't find one

Never pick "whoever happens to be free" or a seed where somebody happens to be in. Say who is where, with `sim.scenario` (`src/game/Scenario.ts`; examples in `Scenario.test.ts`):

- `put(id, where, hold)`: `where` is `'desk'`, a point `{ x, z }`, `'errand'` or `'home'`. It happens at once: no walk, somebody who is out is in (pets too), somebody in is gone.
- `hold` says how firmly: `'pin'` (default) exactly as put, nothing moves them; `'stay'` in the office (or out) for good, but inside they live on, so use it when they must still do something (pet, chat, walk to a meeting); `'free'` put once, the simulation takes over.
- `release(id)` lets go. `clear('printer', 'coffee', 'kitchen', 'meeting', 'wc')` empties places at once.
- An unknown id throws. Ids are the ones of `src/data/team.ts` (`donata-manser`).

A scene rolls no dice of the simulation, so it does not reshuffle everybody else at that moment. From then on the people you placed act differently, and so does whoever meets them: hold everybody the test looks at, not just one.

`dev.forceState(id, state)` is something else: it asks the way the dev panel does (they walk there, it can be refused, nothing holds them). Use it only to test that panel.

## Playwright: what only a browser shows

The tests run against a bundle (`vite build --mode e2e`), opened with `?test`. That mode has three properties, and every rule below follows from them:

1. **Time stands still.** The game only moves when the test fast-forwards it. Nothing changes between two steps of a test, on any machine.
2. **Nothing is drawn.** No test may look at pixels of the office. One smoke test opens `?test&draw` and draws it the way players see it.
3. **Seed, hour and date are pinned** (`seed=1`, `time=11`, a day in June).

Rules:

- Import `test`, `expect`, `openGame`, `read`, `until` from `./game`, never `test` from `@playwright/test` (that one does not pin the date).
- Start with `openGame(page, hash, hour, query, seed)`. It returns the console errors: end the test with `expect(errors).toEqual([])`.
- Let time pass with `until(page, (g, arg) => state, arg, gameMs)`. It fast-forwards until the state is there and **returns it**. The timeout is game time. For a fixed stretch: `read(page, (g) => g.advance(seconds))`.
- Use what `until` returns. A second `read` afterwards is fine (time stands still), but after the next `until` the world has moved on.
- Never wait in wall time for the game: no `waitForTimeout`, no `expect.poll` or `toPass` on game state, no `setInterval` in the page. They hang, because the game does not move by itself. To watch every simulation step: `g.tickers.add(() => …)`. (`expect.poll` on the DOM, which follows the browser, is fine.)
- The function given to `read` / `until` runs in the page: it sees `g` and `arg`, nothing from the spec file.
- Set the scene, don't hope for it (see above): `await scene(page, (s) => s.put('donata-manser', 'desk', 'stay'))`, `scene(page, (s) => s.clear('printer', 'coffee', 'kitchen'))` right before an action that needs the place, `?event=<id>` in `query` to start an event. After an `until` only what is held is still as you put it.
- A `url:` in `FEATURES.md` must start every `event=` / `action=` it names; `feature-urls.spec.ts` fails otherwise.

## What the linter checks

`npm run lint` (oxlint, `.oxlintrc.json`) fails on: `test` / `expect` imported from `@playwright/test` in a spec, `waitForTimeout`, `test.only` / `describe.only`, a promise that is neither awaited nor marked `void` (a forgotten `await` before `until(...)` or `read(...)`), unused imports and variables, and `Math.random()` anywhere but `src/game/rng.ts`. It does not see the rest: `expect.poll` / `toPass` on game state, `setInterval` in the page, a title without its `FEATURES.md` id. Those stay yours.

## Before the PR

`npm run lint`, `npm run test:e2e`, and for a new or changed spec `npx playwright test <file> --repeat-each 5`. A spec that fails once in five is not done.

## Rebasing a branch with older specs

Its waits assumed the game runs by itself. Change the import to `./game`; replace `expect.poll` / `toPass` / `setInterval` on game state with `until` (or `g.tickers`); drop hand-written `page.goto('/?test…')` in favour of `openGame`; remove waits that were only there "because CI is slow".

## When a test fails

- "not reached within N game seconds": the state never came. Read the predicate in the message; the game ran N seconds of simulation, a slow machine is not the reason. Usually the scene was not set (somebody at the printer, the person not in the office).
- Fails once in a few runs: something still depends on wall time or on a second read after the world moved. Find it; do not raise a timeout and do not add a retry.
- Fails on `main` too: say so in the PR body and link its issue (open one if there is none).
- CI only: the e2e job uploads `test-results/` as the artifact `playwright-traces`: the error context of every failure, and a trace of the second attempt (CI records no trace on the first run, it doubles the run time). A test that passed on the second attempt is flaky and still fails the run; reproduce it locally with `--repeat-each`, where every failure has a trace.
