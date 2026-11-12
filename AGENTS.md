# Agents

- Build check: `npm run build` (tsc + vite). Check visible changes in the running app (`npm run dev`).
- Issue workflow: one issue → one branch `fix/issue-N-slug` / `feat/issue-N-slug` → one PR whose body starts with `Closes #N`.
- Issues labeled `in progress` (or assigned, or with a linked open PR) are claimed by someone else — don't touch them.
- Claude Code: full claim/loop procedure in `.claude/skills/tackle-issues/SKILL.md` (`/tackle-issues`).
- `FEATURES.md` lists every feature that must stay in. Read it before changing shared files (`Game.ts`, `Person.ts`, `officeModel.ts`). Each PR updates it; never drop a line without an issue asking for it.
- Before opening a PR, rebase onto the latest `origin/main`. When resolving conflicts, keep both sides, never just yours, and check the affected `FEATURES.md` lines still work.
