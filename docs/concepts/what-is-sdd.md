# What is sdd?

**Structured Vibe Coding (`sdd`)** is a **local Spec-Driven Development** tool for software engineers.

It is a **CLI process coach** that lives in your application repository. It does not replace your stack (React, Java, Python, …). It adds:

1. **Workflows** — ordered stages (hotfix, feature, **greenfield**, enterprise ARB, …)  
2. **Change packs** — a folder per unit of work under `changes/<id>/` with markdown specs and `meta.yaml`  
3. **Product memory** — stable docs under `memory/` (constitution, vision/backlog after greenfield, architecture)  
4. **AI agent wiring** — thin stubs for **one** coding agent (Copilot, Grok, Claude, or Ollama) plus a single playbook (`.sdd/protocol.md`)  
5. **Local verify & complete** — check work on your machine, mark the change done in place  

## How it fits together

| Piece | Role |
|-------|------|
| **You** | Decide scope, approve quality, run `sdd` |
| **`sdd` CLI** | Process state: stages, gates, handoff files |
| **AI coding agent** | Write/refine specs and product code |
| **Your editor** | Edit files (no special IDE extension required) |

## Three common entry points

| Entry | Command | Outcome |
|-------|---------|---------|
| Small fix | `sdd new "…" -w hotfix` | Fast path to code + verify |
| Existing product feature | `sdd new "…" -w feature` | Spec → design → implement |
| **New product** | `sdd greenfield "one-line idea"` | Vision → backlog → architecture → `sdd feature start F-001` |

## What it is not

- Not a required VS Code / IntelliJ extension  
- Not a hosted multi-tenant SaaS  
- Not a replacement for Jira/Git as your company system of record  
- Not “install every AI host at once” — you pick **one** at `sdd init`

## Related

- [What you can achieve](./what-you-can-achieve)  
- [Greenfield (new product)](../guides/greenfield)  
- [Built-in workflows](../reference/workflows)  
- [Available agents](../reference/agents)  
