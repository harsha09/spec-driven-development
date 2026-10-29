<!-- sdd:verify-report:start -->

# Local verify results

> Change: Issue 80 product team on the host entrypoint
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="9b11cde7029d9366fcc66bde5c836576f876a6b2" result_count="1" -->
> At: 2026-10-29T05:59:58.175Z
> Overall: PASS

## Commands

### Workspace tests
- Command: `pnpm test`
- Exit: 0

## Checklist

- [ ] Happy path verified locally
- [ ] Key edge cases covered or waived with notes

## Notes

QA proposes this result. The person has not recorded it. A role does not accept the spec.

| # | Result |
|---|--------|
| 1 | PASS. With a team file, `AGENTS.md`, `.sdd/protocol.md`, and `.grok/rules/sdd.md` use bot order. A repeated role appears once. `entrypoint-team.test.ts` covers this. |
| 2 | PASS. A line is order, name, job, who accepts, and the role path. With no team file, names are sorted and a pin does not reorder them. A missing role file is `not named`. |
| 3 | PASS. The block says the stage hat does not replace this team. The protocol still has `## Stage behavior`. The host rule still has `## Role rules`. |
| 4 | PASS. No repo team and no user team leaves those files without `## Product team`. A user role alone prints `Source: user default` and a `~/.sdd/roles/<name>.md` path. |
| 5 | PASS. A repo team hides `global-role`. There is no user-default line. |
| 6 | PASS. A second refresh keeps the block in the protocol, active context, and the handoff. An edited protocol keeps the edit and does not gain the new role line. |
| 7 | PASS. `.sdd/roles/qa.md` containing `not a role` is listed as `` `qa` — not named. Accepts: not named. File: `.sdd/roles/qa.md` ``. `global-role` and `user default` are absent. |
| 8 | PASS. `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/entrypoint-team.test.ts`: 7 tests, exit 0. |
| 9 | PASS. `pnpm --filter @structured-vibe-coding/core exec tsc --noEmit` exit 0. `biome check` on the edited sources exit 0. |
| 10 | PASS. The workspace command is the verify stamp above. `pnpm test` exit 0. |

Node v20.19.3. `EBADENGINE` warnings for `engines.node >= 24` are expected.

<!-- sdd:verify-report:end -->
