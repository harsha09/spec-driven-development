# What is sdd?

**Structured Vibe Coding (`sdd`)** is a **local Spec-Driven Development** tool for software engineers.

It is a **CLI process coach** that lives in your application repository. It does not replace your stack (React, Java, Python, …). It adds:

1. **Workflows** — ordered stages (intent → design → tasks → implement → verify, or lighter/heavier packs)  
2. **Change packs** — a folder per unit of work under `changes/<id>/` with markdown specs and `meta.yaml`  
3. **AI agent wiring** — thin stubs for **one** coding agent (Copilot, Grok, or Claude) plus a single playbook (`.sdd/protocol.md`)  
4. **Local verify & complete** — check work on your machine, mark the change done in place  

## How it fits together

| Piece | Role |
|-------|------|
| **You** | Decide scope, approve quality, run `sdd` |
| **`sdd` CLI** | Process state: stages, gates, handoff files |
| **AI coding agent** | Write/refine specs and product code |
| **Your editor** | Edit files (no special IDE extension required) |

## What it is not

- Not a required VS Code / IntelliJ extension  
- Not a hosted multi-tenant SaaS  
- Not a replacement for Jira/Git as your company system of record  
- Not “install every AI host at once” — you pick **one** at `sdd init`

## Related

- [What you can achieve](./what-you-can-achieve)  
- [Built-in workflows](../reference/workflows)  
- [Available agents](../reference/agents)  
