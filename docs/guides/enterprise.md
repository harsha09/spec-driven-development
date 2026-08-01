---
title: Enterprise Spec-Driven Development with sdd
description: Run ARB, LLD, DB design, and hard gates with the same local sdd CLI — process encoded in the repo for platform and multi-team work.
---

# Enterprise-level work

Big change. Shared platform. Something people will ask “who approved this?” about.

You still use the **same** `sdd` commands — just a longer path, with **hard stop-points** (gates) and project rules in `memory/`. Everything stays in the repo, on every laptop.

> **You’ll get:** clear design/approval notes in the change folder, then code only after gates pass.

::: tip New to sdd?
Do the [10-minute tutorial](../tutorials/first-change) first so the basic loop feels familiar.
:::

## When to use this path

- Cross-team platform or migration work  
- Architecture review board (ARB) required  
- Explicit design / DB / research before code  
- Reviewable pack for auditors or architects  

::: tip New product first?
If the **product does not exist yet**, start with [Greenfield](./greenfield) for vision + backlog, then use `enterprise-feature` (or set `Workflow: enterprise-feature` on a backlog row) for high-risk delivery packs.
:::

## 1. Init with org defaults

```bash
sdd init --here --ai copilot    # or the host your company standardizes on
```

Fill **`memory/constitution.md`** with non-negotiables (security, data residency, API rules). Agents must honor it; `sdd refine` never rewrites constitution.

Optional: commit a shared `.sdd/workflows/` pack customized for your org (fork of `enterprise-feature`).

## 2. Start an enterprise change

```bash
sdd new "Platform auth migration — ARB required" -w enterprise-feature -y
# or let keywords like arb / migration / epic recommend this pack
```

## 3. Stage map (default `enterprise-feature`)

| Stage | Intent |
|-------|--------|
| `feature` | Problem, users, scope, success, non-goals |
| `hl_arb` | High-level design + ARB packet/decision (**hard gate**) |
| `lld` | Low-level design |
| `db_design` | Data model (skip if N/A) |
| `code_research` | Codebase research notes |
| `stories` | User stories |
| `tasks` | Implementable checklist |
| `implement` | Product code |
| `local_verify` | Local verification |

```bash
# After filling feature.md
sdd next

# hl_arb: fill hl-design, arb-packet, arb-decision — then:
sdd gate approve -n "ARB approved with condition: reuse existing outbox"
sdd next

# Continue through lld → … → implement → verify → complete
sdd skip db_design -r "no schema change"   # when truly N/A
```

## 4. Governance patterns

| Need | Command / practice |
|------|---------------------|
| Hard sign-off | Stage gate `type: hard` + `sdd gate approve` |
| Soft checklist | Soft gates — warnings, not hard blocks |
| N/A stage | `sdd skip <stage> -r "reason"` |
| Scope grew | `sdd use enterprise-feature -r "…"` from a lighter pack |
| Spec quality | `sdd refine` / `sdd refine hl_arb` without advancing |
| Concurrent epics | Multiple change packs + `sdd checkout <id>` |

## 5. What “enterprise” means here

Same laptop CLI, **process encoded in the repo** (YAML + markdown + gates).  
Not a multi-tenant cloud control plane — suitable for regulated *engineering process* next to the code.

## Related

- [What you can achieve](../concepts/what-you-can-achieve)  
- [Built-in workflows](../reference/workflows)  
- [Simple feature](./simple-feature)  
- [Greenfield](./greenfield)  
- [CI/CD for this monorepo](../maintainers/ci-cd)  
