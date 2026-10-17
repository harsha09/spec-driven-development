# Intent

> **Issue #6: support a namespaced root for SDD project paths** · `2026-10-12-issue-6-support-a-namespaced-root-for-sdd-project-paths` · 2026-10-12

## Problem

`sdd init` creates `memory/`, `changes/`, and `domains/` at the repository root before users can customize their paths. In brownfield apps this pollutes or merges into an existing `memory/` tree.

## Proposed change

Add `sdd init --root <relative-path>` to place the memory, changes, domains, and archive directories beneath a user-selected namespace such as `.sdd`; keep `.sdd/config.yaml` and workflow/template configuration in their existing locations. Without `--root`, warn when the default memory directory already contains user files.

## Out of scope

Do not change path defaults for existing installations, move existing project data automatically, or change `sdd` runtime path configuration after initialization.

## Local success check

On a brownfield fixture with `memory/PRD.md`, default init preserves the file and clearly reports the collision; `sdd init --root .sdd` creates all four project paths under `.sdd/`, writes those config values before scaffolding, and new/status/next work using them.
