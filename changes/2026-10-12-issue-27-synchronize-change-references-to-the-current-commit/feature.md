# Feature

> **Issue #27: synchronize change references to the current commit** · `2026-10-12-issue-27-synchronize-change-references-to-the-current-commit` · 2026-10-12

## Problem / opportunity

The head commit SHA is copied by hand into a change pack's PR body, status, changes table, and gate records. Each new commit makes those references stale, and `sdd verify` currently cannot detect stale SHAs or counts.

## Users & value

Contributors and reviewers need commit references and recorded check results to stay consistent across a change pack, with an offline, repeatable sync and a verifier that identifies stale entries precisely.

## Scope

- Add `sdd sync <change>` to read the current repository HEAD and synchronize the change's persisted commit references and recorded check details.
- Keep one canonical SHA in the PR-body artifact and link per-check details to `status.md` and `gates/` where the existing pack format allows it.
- Make `sdd verify` fail on a stale SHA or check count and identify the affected file and line.
- Keep any update outside the repository, such as editing a hosted PR body, a separate explicit action.
- Support offline operation and test SHA/count drift in each supported location.

## Non-goals

- No automatic GitHub API writes, network calls, or PR-body updates as a side effect of sync.
- Do not create commits or modify the repository's HEAD.

## Success criteria

- After a new commit, `sdd sync` updates all repository-owned SHA entries and `sdd verify` passes.
- A stale SHA or mismatched recorded count in each supported location causes verification to fail with its file and line.
- Sync works offline and only an explicitly requested external step may edit a hosted PR body.
- Existing packs without sync metadata remain valid until the command is used.

## Risks / open questions

- The repo may not yet define the proposed PR-body, status, changes-table, or `gates/<sha>.md` layout; design must align with actual artifacts rather than add parallel files blindly.
- Git commands can fail outside a repository or when Git is unavailable; report this without changing files.
- Local verification is currently blocked by the machine's unaccepted Xcode/Apple SDK license, so any real Git integration check may require user setup.
