# Local test plan

> **Issue 80 product team on the host entrypoint** · `2026-10-29-issue-80-product-team-on-the-host-entrypoint`

Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected.

QA proposes these checks. They are not a recorded QA result. The person has not signed them.

| # | Check | Expected |
|---|--------|----------|
| 1 | A repo with role files and a team order, after `sdd agents refresh` | The team block is in `AGENTS.md`, `.sdd/protocol.md`, the installed host rule, and the active-context handoff. `team.yaml` bot order is the line order. A repeated role appears once. |
| 2 | A fresh agent that reads only those files | It can name each role, its job, the order, and who accepts. With no `team.yaml`, names are sorted and a pin does not reorder them. A bot with no role file is `not named`. |
| 3 | The stage hat | The block says the stage hat does not replace this team. The protocol still has `## Stage behavior`. The host rule still has `## Role rules`. |
| 4 | No `.sdd/roles/` and no `.sdd/team.yaml` | With no user team either, those files have no `## Product team`. When only `SDD_HOME` has a role, the block says `Source: user default` and uses a `~/.sdd/roles/<name>.md` path. |
| 5 | A user-global team and a repo team | The repo roster is shown. The global role is absent. There is no user-default line. |
| 6 | Refresh while role files remain | A second refresh keeps the team block in the protocol, active context, and the handoff. A protocol a person edited keeps that edit and does not gain the new role line. |
| 7 | `.sdd/roles/qa.md` is not a role document, and `SDD_HOME` has `global-role` | The protocol lists `` `qa` — not named. Accepts: not named. File: `.sdd/roles/qa.md` ``. It does not contain `global-role` or `user default`. |
| 8 | `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/entrypoint-team.test.ts` | Exit 0. |
| 9 | `pnpm --filter @structured-vibe-coding/core exec tsc --noEmit` | Exit 0. |
| 10 | `sdd verify` | Workspace tests (`pnpm test`) exit 0. |
