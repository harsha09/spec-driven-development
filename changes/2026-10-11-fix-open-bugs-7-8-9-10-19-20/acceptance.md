# Acceptance

> **Fix open bugs #7 #8 #9 #10 #19 #20** · `2026-10-11-fix-open-bugs-7-8-9-10-19-20`

## Cases

| # | Scenario | Expected (local) |
|---|----------|------------------|
| 1 | Initialize a project whose `memory_path` and `changes_path` are non-default, then refresh its generated guidance and handoff | Protocol, host guidance, README, memory index, handoff, and refine guidance point to the configured paths and do not direct agents to the default folders (#7) |
| 2 | Check artifact content consisting of a completed Markdown acceptance table | Meaningful table cell text is substantive; table headers, separators, blank cells, and placeholder row numbers alone are not (#8) |
| 3 | Check every unchanged Markdown template shipped under `packages/core/defaults/templates` | Every untouched template is rejected as incomplete, while completed artifacts still pass (#20) |
| 4 | Run `sdd new "Fix lagna list" </dev/null` without `-y` or `-w` | No TTY prompt is opened; the recommended workflow is selected with a non-interactive notice and the change is created (#9) |
| 5 | Run `sdd new </dev/null` without a title | The command exits cleanly with an actionable instruction to pass a title instead of throwing a TTY initialization error (#9) |
| 6 | Slugify a title longer than 60 characters with a trailing `(#152)` | The slug stays within 60 characters, ends on token boundaries, preserves `-152`, and never corrupts it to `-15` (#10) |
| 7 | Run `sdd verify --no-run` for a verify stage whose command creates a marker file | No verify command runs, no marker is created, status is `NOT RUN`, and the CLI exits non-zero (#19) |
| 8 | Run repository validation | Typecheck, lint, all core/CLI tests, and the CLI smoke script pass |

## Explicitly not testing

- Backward compatibility for already-created, truncated change IDs.
- Interactive prompt styling or workflow recommendation heuristics.
- Custom user templates that are not the unchanged shipped defaults.
- Issue #15 and other issues with an existing branch or pull request.
