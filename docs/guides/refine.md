# Refine a stage

> Improve specs by **stage name**, keep the pack consistent, and never edit the constitution.

Artifacts drift. Fixing only the current file often leaves intent or design wrong. `sdd refine [stage]` writes a brief and launches the agent so the focus stage gets better while prior files get mechanical fixes or clear highlights.

## Commands

```bash
sdd refine                 # current stage
sdd refine design          # feature workflow
sdd refine lld             # enterprise-feature workflow
sdd refine --analyze       # report only → quality-report.md
sdd refine --focus-only    # edit focus files only
sdd refine --no-agent      # write brief, open agent yourself
```

The brief is always `changes/<id>/refine-brief.md`. Stages come from the workflow — not hard-coded filenames — because packs differ (`intent` vs `feature`, `lld` vs `design`).

## Rules the agent must follow

1. **Constitution** — read-only (`memory/constitution.md`)  
2. **Focus stage** — primary edits  
3. **Prior artifacts** — impact-scan (`rg`/grep); fix contradictions and term drift; **highlight** scope calls  
4. **Open items** — only when you **explicitly accept** and note them  
5. **Never** run `sdd next` or rewrite history casually  
6. **Non-blocking** — refine never fails the pipeline  

You can iterate specs without inventing a second process tool. Run `sdd refine` on the active change, then re-read the focus artifact and `quality-report.md` if present.

## Related

- [Code context for implement](./code-context)  
- [Agents](./agents)  
