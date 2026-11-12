# Agents

These rules apply to every agent session, local or automated (`/tackle-issues`). The per-change workflow below is the single source of truth. Skills only add to it.

## Every change: issue → worktree → PR

1. **Issue.** A change to behavior (feature or bug) needs an issue, and its acceptance criteria are the definition of done.
   - Ask from a dev without an issue → search the open issues first (`gh issue list --search "<words>"`). If none fits, open one with `scripts/issue.sh new "<title>" <bug|enhancement> "<body with acceptance criteria>"`.
   - Docs, tooling and typo fixes may skip the issue and go straight to a PR.
2. **Claim.** `scripts/issue.sh claim N`. Exit code 2 means another session owns the issue: don't touch it. Never take over an issue that is labeled `in progress`, assigned, or has an open PR. Giving up → `scripts/issue.sh release N "<reason>"`.
3. **Worktree.** Never work in the main checkout. Other sessions and the dev's own dev server use it.
   ```sh
   git fetch origin
   git worktree add .worktrees/issue-N -b fix/issue-N-<slug> origin/main   # feat/ for enhancements
   cd .worktrees/issue-N && npm ci
   ```
   `npm run dev` in a worktree picks the next free port from 5174 (the main checkout keeps 5173).
4. **Implement.** Read the issue and all of its comments. Follow `README.md` and the existing code. Keep the change scoped to the issue.
5. **Done means:**
   - `npm run build` passes. CI (`.github/workflows/ci.yml`) runs build and Vitest on every PR; a red check is not done. The e2e tests run on CI only with the `e2e` label (~5 Actions minutes per run), so run them locally and note the result in the PR body. Add the label (`gh pr edit --add-label e2e`) only when the PR changes the e2e setup itself: `e2e/`, `playwright.config.ts`, the `?test` hook or the CI workflow. Otherwise leave it to the reviewer.
   - `npm test` and `npm run test:e2e` pass, and new or changed behavior has a test named after the `FEATURES.md` id:
     - logic → Vitest, `*.test.ts` next to the code. Logic a test needs is pulled apart from rendering; randomness comes from `src/game/rng.ts` (`setSeed` in tests), never `Math.random()`.
     - interactions and UI (keys, hashes, panels, parts working together) → Playwright, `e2e/*.spec.ts`, reading the game through the `?test` hook (see README).
     - purely visual changes → checked in the browser.
   - Every criterion has been checked in the running app.
   - `FEATURES.md` is updated: add or change the lines for this issue, ending with `(#N)`. Every line you touched still works.
6. **PR.** Rebase first. On conflicts keep both sides' behavior, never just yours, then re-check the affected `FEATURES.md` lines.
   ```sh
   git fetch origin && git rebase origin/main && npm run build && npm test && npm run test:e2e
   git push -u origin HEAD
   gh pr create --base main --assignee @me --title "<imperative summary>" --body "<see below>"
   cd <repo root> && git worktree remove .worktrees/issue-N
   ```
   `--assignee @me` assigns the PR to the dev whose `gh` login runs the session.
   The PR body starts with `Closes #N` on its own line, so merging closes the issue. Then come `## What changed`, `## Acceptance criteria` (checked, with how each was verified) and optionally `## Notes`. See `gh pr view 23`.

## Commits

Small and logical. Short imperative subject in the style of `git log`. Commit, push and open PRs only on a branch, never on `main`. Never merge.

## FEATURES.md

The list of everything that must stay in the game. Read the lines for the areas you touch before changing shared files (`Game.ts`, `Person.ts`, `officeModel.ts`). Never delete a line unless an issue asks for it; in that case move it to "Removed on purpose".
