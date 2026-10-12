# Intent

> **Fix open bugs #7 #8 #9 #10 #19 #20** · `2026-10-11-fix-open-bugs-7-8-9-10-19-20` · 2026-10-11

## Problem

- Generated agent guidance hard-codes `memory/` and `changes/` even when the project config uses different paths (#7).
- The required-artifact gate rejects substantive Markdown table rows, while eight untouched shipped templates incorrectly pass the same gate (#8, #20).
- `sdd new` tries to open TTY prompts in non-interactive shells instead of choosing or clearly requiring non-interactive inputs (#9).
- Long change slugs are cut in the middle of tokens and can corrupt a trailing issue number (#10).
- `sdd verify --no-run` is parsed as `run: false`, but the CLI checks only `no-run`, so commands still execute (#19).

## Proposed change

- Render all generated path guidance from the configured memory and changes paths.
- Make artifact-content detection retain meaningful table cells and reject every unchanged shipped template.
- Guard `sdd new` prompts when stdin is not a TTY, retaining the recommended workflow when the title is supplied and returning an actionable error when it is not.
- Truncate slugs only at token boundaries while preserving a trailing issue reference when one fits the configured limit.
- Normalize the negated verify flag the same way as the existing `--no-agent` handling.
- Add focused core and CLI regression coverage for every issue.

## Out of scope

- Issue #15, because PR #18 already exists for it.
- Open enhancements, search/metrics work, and the Node-version documentation decision in #13.
- Changing configured paths, existing change IDs, workflow semantics, or verification gate policy beyond the listed defects.

## Local success check

- The new regression tests reproduce each reported failure before the fix and pass afterward.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `bash scripts/cli-smoke.sh` pass.
- The local SDD workflow reaches `local_verify`, runs its configured checks, and records the results in this change pack.
