---
name: refine-issues
description: Refine the parked GitHub issues of this repo (labeled `question` or `blocked`) together with a dev - one at a time, summarize, ask the open questions with a recommendation, write the decisions into the issue and hand it back to /tackle-issues. Use when asked to refine, groom or unblock issues, or to go through the open questions.
argument-hint: "[issue numbers] (default: all `question` and `blocked` issues, oldest first)"
---

# Refine issues

Interactive only: a dev answers the questions. Never run this unattended and never decide a product question yourself.

Invoking this skill authorizes claiming, commenting on, editing the body and labels of, and (after the dev confirms) splitting and closing the issues it refines. It does not authorize code changes, branches, PRs or merges.

Args: `$ARGUMENTS`. Issue numbers restrict the run to those issues. Empty = every open issue labeled `question` or `blocked`, oldest first:

```sh
gh issue list --state open --limit 100 --search 'sort:created-asc label:question,blocked' --json number -q '.[].number'
```

## Loop

For each issue:

1. **Claim** it: `scripts/issue.sh claim N`. This sets `in progress` and the lock, so `/tackle-issues` and other refinement sessions keep off. Exit 2 → skip it.
2. **Prepare.** Read the issue, all of its comments, the `FEATURES.md` lines of the areas it touches and the relevant code. Tell the dev in a few lines: what the issue wants, what is open, what already exists.
3. **`blocked`:** check what it waits on: the native "blocked by" links (`gh api repos/{owner}/{repo}/issues/N/dependencies/blocked_by -q '.[] | "\(.number) \(.state)"'`) and the latest `⏸ Blocked` comment (`gh pr view M --json state` / `gh issue view M --json state`).
   - Merged or closed → no question needed, go to step 5.
   - Still open → recommend one of: keep waiting, split off the part that doesn't depend on it, or get the blocking PR reviewed and merged first. Ask the dev.
4. **`question`:** ask the open questions with `AskUserQuestion`, at most 4 per round, your recommendation first and marked `(Recommended)`, each question understandable on its own. Also ask what the open questions imply but don't say (scope, edge cases, how to see it in the app). Repeat until every criterion can be checked.
   - Too broad for one PR → propose a split into concrete issues and ask the dev to confirm it.
5. **Write it into the issue.**
   - Rewrite the body (`gh issue edit N --body-file <file>`): keep the original request, then `## Acceptance criteria` as a checkable list, and `## Decisions` with what was decided in this session. The acceptance criteria are the definition of done (`AGENTS.md`), so they must be complete without the comments.
   - Split confirmed → open each part with `scripts/issue.sh new` and make them sub-issues of the original: `scripts/issue.sh sub N A B`. A part that builds on another → `scripts/issue.sh block B "<reason>" A`. The original stays open as the parent: rewrite its body to the overall goal and the list of parts (no acceptance criteria of its own; each part has them), comment "Split into #A, #B", release it (`scripts/issue.sh release N "split"`). `/tackle-issues` works the parts and closes the parent when the last one is done.
   - Set the `model:*` label (each split-off issue gets its own). Estimate it with the table in the `create-issue` skill (step 5), from the code you read. Clear-cut → set it (`gh issue edit N --add-label model:<x>`, removing any other `model:*` label) and tell the dev with a one-line reason; they can overrule it. Unsure between two → ask in the last question round, the higher one first and marked `(Recommended)`, and set the answer. A refined issue never goes without one.
   - Then `scripts/issue.sh refined N "<short summary of the decisions>"`: comments, removes `question`/`blocked` and releases the claim. The issue is now eligible for `/tackle-issues`.
6. **Not settled** (dev unsure, wants to ask someone, still waiting on the dependency) → keep it parked: `scripts/issue.sh ask N "<what is still open>"` or `scripts/issue.sh block N "<reason>" [M]` (M = the issue it waits on, for the native link). Both release the claim.
7. The dev wants to stop → finish the current issue with step 5 or 6 first. Never leave an issue claimed.

At the end, report per issue: refined (link, `model:*` label), split into which issues, or still parked and why.
