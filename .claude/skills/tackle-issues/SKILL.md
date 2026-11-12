---
name: tackle-issues
description: Work through open GitHub issues of this repo in a loop - claim one so no other session takes it, implement it in an isolated worktree, open a PR that closes it, then take the next. Use when asked to tackle/work on/fix open issues, or a specific issue number.
argument-hint: "[issue numbers or label, e.g. '3 5' or 'bug'] (default: all eligible, oldest first)"
---

# Tackle issues

Invoking this skill authorizes, for claimed issues only: creating branches, commits, pushes, PRs, and issue labels/comments/assignees. Nothing else (no merging, no pushing to `main`, no closing issues by hand).

Args: `$ARGUMENTS` — issue numbers to restrict to, or a label to filter by. Empty = every eligible issue, oldest first.

## Loop

Repeat until no eligible issue is left, then report a summary (issue → PR link, plus skipped issues and why):

1. **Pick** the next eligible issue (see below).
2. **Claim** it (see below). Lost the claim → go back to 1.
3. **Implement** in a fresh worktree.
4. **Open the PR**, then go back to 1. Don't wait for review or merge.

Skip (and don't claim) an issue that is unclear, needs a product decision, or depends on an unmerged PR: leave a short comment with the open question instead and move on.

## 1. Pick

Eligible = open, no `in progress` label, no assignee, no open PR linked to it, not labeled `question`, `wontfix`, `duplicate`, `invalid`.

```sh
gh issue list --state open --limit 100 --search "sort:created-asc -label:\"in progress\" no:assignee -label:question -label:wontfix -label:duplicate -label:invalid" --json number,title,labels
# per candidate, must print 0 (no PR already closes it):
gh issue view N --json closedByPullRequestsReferences -q '[.closedByPullRequestsReferences[]] | length'
```

## 2. Claim (lock against other sessions)

The label + assignee make the claim visible; the claim comment is the actual lock — GitHub orders comments by creation time, so the earliest claim comment wins a race.

```sh
gh label create "in progress" --color FBCA04 --description "Claimed by an agent session, PR coming" 2>/dev/null || true
TOKEN=$(uuidgen)
gh issue comment N --body "🔒 claim $TOKEN — working on this, PR follows."
gh issue edit N --add-label "in progress" --add-assignee @me
# verify: first claim comment after the latest release must be ours
WINNER=$(gh issue view N --json comments -q '[.comments[].body | select(startswith("🔒 claim ") or startswith("🔓 release"))] | (map(startswith("🔓")) | rindex(true)) as $r | .[(if $r == null then 0 else $r + 1 end):] | map(select(startswith("🔒")))[0] | split(" ")[2]')
[ "$WINNER" = "$TOKEN" ] || echo LOST
```

- `LOST` → another session owns it. Delete your own claim comment, leave label/assignee alone, pick another issue.
- Giving up on a claimed issue (blocked, turns out unclear) → comment `🔓 release — <reason>`, remove the label and yourself as assignee.
- Never take over an issue labeled `in progress`, even if it looks stale. Humans unclaim stale ones by removing the label (and posting `🔓 release` if they want it re-picked).

## 3. Implement

Each issue gets its own worktree so parallel sessions never share a checkout:

```sh
git fetch origin
git worktree add .worktrees/issue-N -b fix/issue-N-<short-slug> origin/main
cd .worktrees/issue-N && npm ci
```

Branch prefix: `fix/` for bugs, `feat/` for enhancements.

- Read the issue body and all comments first; treat acceptance criteria in the issue as the definition of done.
- Follow the repo conventions in `README.md` and existing code. Keep the change scoped to the issue.
- Read `FEATURES.md` lines for the areas you touch; they must all still work afterwards. Add/update lines for what this issue adds or changes, in the same PR.
- Done means: `npm run build` passes, and visible behavior was checked in the running app (`npm run dev`, browser) for every acceptance criterion. Do not move on with a half-working change — if you can't get it right, release the claim (see above).
- Commits: small and logical, message style per `git log` (short imperative subject, e.g. `Fix flickering glass door frame`).

## 4. PR

Before pushing, rebase onto the latest main and re-run the build. On conflicts keep both sides' behavior, never just yours, then re-check the affected `FEATURES.md` lines:

```sh
git fetch origin && git rebase origin/main && npm run build
git push -u origin HEAD
gh pr create --base main --title "<imperative summary>" --body "$BODY"
```

Body format (see existing PRs, e.g. `gh pr view 23`):

```
Closes #N

## What changed
- ...

## Acceptance criteria
- [x] <criterion from issue> — how it was verified

## Notes
- follow-ups, known gaps (omit section if none)
```

`Closes #N` (or `Fixes #N` for bugs) must be on its own line so the merge closes the issue. Keep the `in progress` label — the issue closes on merge anyway.

Then clean up and continue the loop:

```sh
cd <repo root> && git worktree remove .worktrees/issue-N
```
