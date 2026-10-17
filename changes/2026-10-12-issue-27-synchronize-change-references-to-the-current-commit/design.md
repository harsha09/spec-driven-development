# Design

> **Issue #27: synchronize change references to the current commit** · `2026-10-12-issue-27-synchronize-change-references-to-the-current-commit`

## Approach

Use Git's local `rev-parse HEAD` as the source of truth and extend the repository's existing verification record rather than introducing a second status model. Add an optional `head_sha` to each `verify_results` entry in `meta.yaml`; keep the existing command names and exit codes as the recorded check/count data.

Add `sdd sync <change>` to resolve the current HEAD and update the recorded head reference for that change's existing verify results. It must not run GitHub/network operations or create commits. Add the head SHA to SDD-generated `local-test-results.md` inside a bounded marker so sync can update it without rewriting human-authored notes. If no verify results exist, report that there is nothing to synchronize. If a results file lacks the SDD marker, preserve it and report it as untouched.

Before reporting verification as PASS, `sdd verify` resolves HEAD and checks that existing verification records and any generated SHA marker still name that commit. A mismatch fails with the change, file, expected SHA, and current SHA; the caller runs `sdd sync` to reconcile references. After that check passes, configured commands run normally and the new result record stores the current SHA. Validate a recorded command count against the generated result details so stale or edited rows are not silently accepted.

This product currently has no PR-body, `status.md`, changes-table, or `gates/<sha>.md` artifact contract. Keep the canonical record in `meta.yaml` and generated verify report; do not add those absent files in this change. The hosted PR body remains an explicit external action, as the issue requires.

## Components / modules

- `packages/core/src/schemas.ts`: optional `head_sha` on stored verify results for backward compatibility.
- `packages/core/src/verify.ts`: resolve Git HEAD, detect stale recorded SHA/counts before claiming PASS, and persist the current SHA with new verification results.
- `packages/core/src/change.ts` or a focused `packages/core/src/sync.ts` module: expose `syncChangeHead` to update the canonical reference and generated report marker without changing check results.
- `packages/cli/src/commands.ts`: register `sdd sync <change>` and present updated/skipped paths; keep the operation local and offline.
- `packages/cli/src/__tests__/cli.integration.test.ts` and core verify tests: cover Git errors, no-result sync, successful sync, stale SHA/count diagnostics, and human-authored report preservation.
- `docs/reference/cli.md`: document sync, its local-only behavior, and the separate hosted-PR update step.

## Data flow

1. `sdd verify` resolves one full HEAD SHA for the project and change.
2. Before returning PASS, it compares existing verify-result SHA/count metadata and the generated report marker with HEAD and the recorded command rows.
3. On a clean match, configured commands run; the resulting status, command names/exit codes, timestamp, and current SHA are persisted together.
4. After a new commit, `sdd sync <change>` reads HEAD and updates only the canonical SHA fields and SDD-marked report region. It does not change the recorded checks or call a remote API.
5. `sdd verify` then confirms the synchronized entries match HEAD and the stored result count before passing.

## Alternatives considered

- Automatically update GitHub PR bodies: rejected because it requires credentials/network access and the issue requires the external update to be explicit.
- Add `status.md`, a changes table, and `gates/<sha>.md` to every change pack: rejected because this repo has no such artifact contract; it would duplicate the existing `verify_results` and local results report.
- Rewrite the entire local results report during sync: rejected because users may add human notes; only a bounded SDD marker is safe to update.
- Read `.git` files directly: rejected in favor of `git rev-parse HEAD`, which handles linked worktrees and packed refs correctly.

## Risks

- The machine currently blocks Git commands until the Xcode/Apple SDK license is accepted. Unit tests need a seam for a deterministic HEAD provider; end-to-end Git verification must run where Git is usable.
- SHA synchronization does not rerun tests. As requested, it refreshes references only; documentation must make clear that a sync is not evidence that checks were rerun on the new commit.
- Existing reports may be human-edited. Sync must update only an exact SDD-owned marker and leave unmarked content byte-identical.
- The issue's PR-body/status/table/gate-file surfaces are absent here; this implementation can cover native metadata and generated verify output, not arbitrary external files.
