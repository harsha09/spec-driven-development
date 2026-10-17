# Acceptance

> **Issue #13: align Node engine requirements and support docs** · `2026-10-12-issue-13-align-node-engine-requirements-and-support-docs`

## Cases

| # | Scenario | Expected (local) |
|---|----------|------------------|
| 1 | Maintained install/support docs and CLI help | Every minimum-version statement says Node 24+; no maintained user-facing page claims Node 20+ support |
| 2 | Package manifests | Root, core, and CLI engine requirements remain `>=24` |
| 3 | `sdd doctor` runtime check | Current runtime under Node 24 is reported unsupported; supported runtime meets the documented minimum |
| 4 | Regression | CLI tests pass and no workflow/doctor behavior unrelated to Node support changes |

## Explicitly not testing

- Builds/tests under Node 24 are not available in this local environment; the active Node 20 runtime is used to verify the project suite while metadata/docs declare the supported minimum.
