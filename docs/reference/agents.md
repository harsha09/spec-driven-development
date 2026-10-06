---
title: Available AI agents for sdd
description: AI hosts supported by sdd init — GitHub Copilot, Grok Build, Claude Code, and Ollama — install paths and how each launches.
---

# Available AI agents

At **`sdd init`** you install **exactly one** AI coding agent host. Switch later with `sdd agents install --ai <host> --force`.

No host at all is also a valid setup: `sdd init --here --no-agent` writes only `.sdd/`, `memory/`, `changes/` and `domains/`. You get no host files, no `AGENTS.md` and no `.sdd/agents.json`, and it never prompts. With no host configured, process commands write the handoff but never launch an assistant, and `sdd doctor` reports `AI host: none` as info. Use it when you, a script, or an agent outside sdd drives the process. Add a host later with `sdd agents install --ai <host>`.

## Hosts

| Init flag | Product | What gets installed | How you use it |
|-----------|---------|---------------------|----------------|
| `--ai copilot` | **GitHub Copilot** | `.github/agents/*.agent.md`, `AGENTS.md`, `.sdd/protocol.md` | Copilot Chat → agent `sdd` |
| `--ai grok` | **Grok Build** | `.grok/rules/sdd.md`, `AGENTS.md`, `.sdd/protocol.md` | `grok` CLI / Grok Build |
| `--ai claude` | **Claude Code** | `.claude/agents/*.md`, `AGENTS.md`, `.sdd/protocol.md` | `claude` CLI |
| `--ai ollama` | **Ollama (local)** | `.ollama/sdd.md`, `AGENTS.md`, `.sdd/protocol.md` | `ollama run <model>` (local LLM) |
| `--ai kilo` | **Kilo Code** | `.kilo/sdd.md`, `AGENTS.md`, `.sdd/protocol.md` | `kilo` CLI |

Interactive init (no `--ai`) prompts you to pick one of these (including `kilo`).

## Ollama setup

1. Install [Ollama](https://ollama.com) and ensure `ollama` is on `PATH`.
2. Pull a model, e.g. `ollama pull llama3.2` (or any chat model you prefer).
3. Init SDD with Ollama:

```bash
sdd init --here --ai ollama
# optional: export SDD_OLLAMA_MODEL=qwen2.5-coder   # default: llama3.2
sdd new "Fix empty list crash" -w hotfix -y
```

When `sdd` launches the agent it runs roughly:

```bash
ollama run "$SDD_OLLAMA_MODEL" "<kickoff from handoff>"
```

Ollama does **not** auto-load multi-role agent trees like Claude. Project guidance lives in:

- `.ollama/sdd.md` — thin SDD router brief  
- `AGENTS.md` — host pointer  
- `.sdd/handoff.md` + `.sdd/active-context.md` — live task  

Set the model with **`SDD_OLLAMA_MODEL`** or **`OLLAMA_MODEL`** (default `llama3.2`).

## Existing files are safe

Every markdown file sdd generates (`AGENTS.md`, host stubs, `.sdd/protocol.md`, `.sdd/README.md`) carries a marker line with a hash of its content:

```text
<!-- sdd:generated sha256=… (sdd regenerates this file only while it is unchanged; edit freely) -->
```

This protection covers **`AGENTS.md`, host agent files and folders, `.sdd/protocol.md` and `.sdd/README.md`**:

- Without `--force`, `sdd init` and `sdd agents install` never replace one of these files that already exists.
- With `--force`, sdd regenerates a file only if its marker is present and the content still matches the hash. Line endings don't count (a CRLF checkout of an unedited file is still unedited).
- Files with no marker (your own `AGENTS.md`, other tools' files in `.claude/`, `.kilo/`, …) and sdd files you edited are **never overwritten or deleted**, with or without `--force`. sdd prints them as *kept*.
- When you switch hosts, sdd removes the other host's unedited sdd files, lists what it removed, and removes only the folders it emptied. Empty folders you made are left alone. `.github/` itself is never removed.
- sdd never follows symbolic links in host folders: it does not write, read or delete through a link, and does not remove the link. Links are listed as kept. Broken links and link loops are skipped.
- Before writing anything, sdd checks every agent path. A directory where a file goes, an unreadable file, a read-only file it would regenerate, or a folder it cannot write to stops init with a clear message, and nothing is written.
- If you already have an `AGENTS.md`, sdd leaves it alone and prints a short section you can paste into it.
- Files from sdd versions older than this marker count as unmarked. To regenerate one, delete it and re-run.

**Not covered yet (issue #15):** sdd's own state under `.sdd/`. `--force` resets `.sdd/config.yaml` and re-copies `.sdd/workflows/` and `.sdd/templates/`, and rewrites `.sdd/agents.json`. `.sdd/active-context.md` is regenerated on every init. On a fresh init where `.sdd/` exists but `config.yaml` does not, `.sdd/workflows/` and `.sdd/templates/` are copied over existing files even without `--force`. Back up local edits there first.

## Agent roles (stubs)

| Role id | Purpose | Copilot / Claude | Grok / Ollama |
|---------|---------|------------------|---------------|
| `sdd` | Router from current stage | Yes | Single brief file |
| `sdd-planner` | Specs only | Yes | Use router + stage |
| `sdd-implementer` | Code for active change | Yes | Use router + stage |
| `sdd-reviewer` | Check acceptance | Yes | Use router + stage |

Real process rules: **`.sdd/protocol.md`**. Live task: **`.sdd/active-context.md`** / **`.sdd/handoff.md`**.

## Process commands vs agent launch

Most process commands refresh handoff and **launch** the configured agent.  
**Do not launch:** `status`, `init`, `workflows`, `context`, `doctor`.

Skip launch once: `--no-agent` or `SDD_NO_AGENT=1`.

## Switch host later

```bash
sdd agents install --ai ollama --force
sdd agents refresh
```

## Related

- [Simple feature](../guides/simple-feature)  
- [CLI reference](./cli)  
