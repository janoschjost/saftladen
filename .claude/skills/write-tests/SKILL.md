---
name: write-tests
description: How to write and change tests in this repo - which kind (Vitest for logic and simulation, Playwright for what only a browser shows), the Playwright helpers in e2e/game.ts (openGame, read, until, freeStations), frozen game time under ?test, setting a scene, checking for flakes, and adapting older specs on a rebase. Load before writing, changing or fixing any *.test.ts or e2e/*.spec.ts, and when a test fails or is flaky.
---

# Write tests

`AGENTS.md` ("Writing tests") says which kind of test a change needs and the rules that always hold. This is the how.

## Vitest: logic and simulation

Build the part with plain data and step it by hand: `setSeed(n)`, then `update(1 / 60)` in a loop until the state is there (`Meeting.test.ts`, `Presence.test.ts`, `Walker.test.ts`). Randomness comes from `src/game/rng.ts`, never `Math.random()`. A part that cannot be built without a canvas: pull the logic out first.

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
- Set the scene, don't hope for it: `?event=<id>` in `query`, `dev.forceState(id, state)`, `freeStations(page)` right before an action that needs the printer or the coffee machine. After an `until` somebody may stand there again.
- A `url:` in `FEATURES.md` must start every `event=` / `action=` it names; `feature-urls.spec.ts` fails otherwise.

## Before the PR

`npm run test:e2e`, and for a new or changed spec `npx playwright test <file> --repeat-each 5`. A spec that fails once in five is not done.

## Rebasing a branch with older specs

Its waits assumed the game runs by itself. Change the import to `./game`; replace `expect.poll` / `toPass` / `setInterval` on game state with `until` (or `g.tickers`); drop hand-written `page.goto('/?test…')` in favour of `openGame`; remove waits that were only there "because CI is slow".

## When a test fails

- "not reached within N game seconds": the state never came. Read the predicate in the message; the game ran N seconds of simulation, a slow machine is not the reason. Usually the scene was not set (somebody at the printer, the person not in the office).
- Fails once in a few runs: something still depends on wall time or on a second read after the world moved. Find it; do not raise a timeout and do not add a retry.
- Fails on `main` too: say so in the PR body and link its issue (open one if there is none).
- CI only: the e2e job uploads `test-results/` (trace of the failed test) as the artifact `playwright-traces`.
