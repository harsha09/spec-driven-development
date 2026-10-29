# Clarify design

> **Issue 66 evidence** · `2026-10-29-issue-66-evidence`

One module, `packages/core/src/team/tools.ts`, owns the allowlist, the worktree, and the evidence file. The loop and the room call it. `run.ts` and `verify.ts` stay put.
