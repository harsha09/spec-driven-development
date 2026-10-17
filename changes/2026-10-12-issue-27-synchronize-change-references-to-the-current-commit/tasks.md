# Tasks

> **Issue #27: synchronize change references to the current commit** · `2026-10-12-issue-27-synchronize-change-references-to-the-current-commit`

## Breakdown

- [x] Add optional `head_sha` to verification metadata and a focused Git HEAD resolver; preserve older metadata and test hash validation through a deterministic injected SHA.
- [x] Add `syncChangeHead` to update prior verification references without changing command results/counts; update only the SDD-marked results-file region and preserve unmarked user content.
- [x] Make local verification detect stale SHA/count references with file-specific diagnostics before reporting PASS, then persist the current head SHA with successful fresh results.
- [x] Register `sdd sync <change>`, print what was updated or preserved, and keep the operation offline with no commit creation or hosted PR writes.
- [x] Add core/CLI tests for stale/missing/current SHAs, count drift, no-result sync, Git errors, and report preservation; document sync and its external PR-body boundary.

## Traceability

| Task | Story / design ref |
|------|--------------------|
| Verify metadata and Git head | Design: canonical head SHA and backward compatibility |
| Sync persistence | Design: local-only update of canonical metadata and generated marker |
| Stale verification | Design: fail before PASS on SHA/count mismatch |
| CLI command | Design: explicit change selection, no external writes |
| Tests and docs | Issue #27 acceptance; design: native artifact limits |
