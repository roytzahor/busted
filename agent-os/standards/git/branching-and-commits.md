# Branching, Commits, and PR Discipline

This repo is worked by several agent sessions at once against one shared
working tree. Most of the rules below exist because that has already gone
wrong at least once.

## Branch naming

`<type>/<subject>` — `type` matches the commit types below. The branch name
must describe the work, not the ticket that prompted it. A branch called
`fix/presence-tier-threshold-collision` that accumulates 12 commits of design
phases and eval fixes is a lie by the third commit; open a new branch instead
of widening an old one.

Never commit to `main` directly.

## Commits are grouped by SUBJECT, not by session or by file

One commit does one thing and says why. A file touched by two subjects is
split across two commits — reconstruct the intermediate state and stage that,
rather than dumping the whole file into whichever commit happens to be first.
`CLAUDE.md`, `app/globals.css`, `.claude/lessons.md` and `package.json` are the
usual offenders: they are shared surfaces and almost always carry more than one
subject at a time.

Types: `feat` `fix` `refactor` `docs` `chore` `test` `perf`.

The body carries the reasoning — what was wrong, why this fix and not another,
and what was deliberately left alone. A message that only restates the diff is
wasted.

## Never commit another session's in-flight work blind

Before staging anything you did not write this session:

1. `npx tsc --noEmit` **after deleting `tsconfig.tsbuildinfo`**, or `npm run
   build` — incremental typecheck skips unchanged files and will pass on
   genuinely broken code.
2. Confirm every file the staged code imports is itself tracked or staged. A
   commit importing an untracked module resolves fine locally (Next reads the
   working tree) and fails on a fresh checkout.
3. If it is mid-refactor, either take the whole coherent unit or none of it.
   Half a refactor is worse than an uncommitted one.

**Never use `git stash` to tidy a shared tree.** Another session writing during
the stash window produces divergent stash entries that silently drop each
other's work on pop. Verify commits in a throwaway worktree
(`git worktree add --detach`) instead — it also gives you a clean checkout,
which is the only honest test of point 2.

## Verify in a worktree, not in your working tree

Your working tree contains other sessions' uncommitted changes, which mask
exactly the failures you are testing for. Run the CI steps against a detached
worktree at the commit you are about to push.

## Pull requests

- The PR body states what was verified and **how**, not that it was verified.
- Bugs found but deliberately not fixed are listed explicitly, with the reason.
  A filed bug is a contribution; a silently-swallowed one is not.
- Fix a bug rather than filing it when the code contradicts itself — a rule
  stated in a file and violated a few lines below it is not a design decision.
- **Self-review every PR after opening it** (`/code-review high <range>`), and
  act on your own findings before asking anyone else to look. Reviewing your
  own diff has repeatedly caught commits whose message contradicted their
  content.
- A PR is done when CI is green on the current head, there is no merge
  conflict, and every review thread is addressed. A red or conflicted head is
  never "waiting on review".

## Anti-goals

| Never | Why |
|---|---|
| `git stash` on a shared tree | Divergent entries silently drop peer work |
| Rebase/amend/force-push another session's branch | Invalidates their checkout |
| Squash a subject-grouped branch | Destroys the grouping the rules above bought |
| Empty commit or close/reopen to kick CI | Hides the real failure |
| Skip/disable/quarantine a test to get green | The test is the product |
| Commit generated artifacts or machine state | `skills-lock.json`, `graft/`, `.agents/` — see `.gitignore` |
