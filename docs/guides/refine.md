# Refine a stage

> **Point:** Improve specs by **stage name**, keep the pack consistent, never edit the constitution.

## Problem · Solution · Benefit

| | |
|--|--|
| **Problem** | Artifacts drift; fixing only `design.md` leaves intent wrong. |
| **Solution** | `sdd refine [stage]` writes a brief and launches the agent in refine mode. |
| **Benefit** | Focus stage gets better; prior files get mechanical fixes or explicit highlights. |

## What / When / How

| | |
|--|--|
| **What** | Stage-scoped refine agent (one agent, modes) |
| **When** | Any time before `complete` when docs feel fuzzy |
| **How** | Commands below |

## PREP

**Point:** Address stages, not hard-coded filenames.

**Reason:** Workflows differ (`intent` vs `feature`, `lld` vs `design`).

**Example:**

```bash
sdd refine                 # current stage
sdd refine design          # feature workflow
sdd refine lld             # enterprise-feature workflow
sdd refine --analyze       # report only → quality-report.md
sdd refine --focus-only    # edit focus files only
sdd refine --no-agent      # write brief, open agent yourself
```

**Point:** The brief is always `changes/<id>/refine-brief.md`.

## Rules the agent must follow

1. **Constitution** — read-only (`memory/constitution.md`)  
2. **Focus stage** — primary edits  
3. **Prior artifacts** — impact-scan (`rg`/grep); fix contradictions/term drift; **highlight** scope calls  
4. **Open items** — only when you **explicitly accept** + note  
5. **Never** `sdd next` / rewrite history for fun  
6. **Non-blocking** — refine never fails the pipeline  

## So what / Now what

**So what:** You can iterate specs like Spec Kit clarify — without inventing a second process tool.

**Now what:** Run `sdd refine` on your active change, then re-read the focus artifact and `quality-report.md` if present.

## Related

- [Code context for implement](/guides/code-context)  
- [Agents](/guides/agents)  
