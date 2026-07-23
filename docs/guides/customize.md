# Customize workflows

> **How-to:** Change process shape without forking the engine.

## Problem · Solution · Benefit

| | |
|--|--|
| **Problem** | One fixed pipeline is either too heavy or too light. |
| **Solution** | YAML packs in `.sdd/workflows/` + per-change `skip` / `use`. |
| **Benefit** | Hotfix stays short; enterprise can keep ARB. |

## What / When / How

| | |
|--|--|
| **What** | Workflow YAML, config, per-change overrides |
| **When** | Team process differs from defaults |
| **How** | Edit `.sdd/workflows/*.yaml` or `sdd skip` / `sdd use` |

## Minimal example

```bash
# This change only
sdd skip clarify_intent -r "scope clear"
sdd use feature -r "grew past hotfix"
```

Project defaults live in `.sdd/config.yaml` (paths, archive_on_complete, recommend).

Ship your own pack by copying a default workflow and editing stages/artifacts.

## Now what

- [Layout reference](/reference/layout)  
- [First change tutorial](/tutorials/first-change)  
