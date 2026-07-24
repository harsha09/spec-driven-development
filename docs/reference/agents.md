# Available AI agents

At **`sdd init`** you install **exactly one** AI coding agent host. Switch later with `sdd agents install --ai <host> --force`.

## Hosts

| Init flag | Product | What gets installed | How you use it |
|-----------|---------|---------------------|----------------|
| `--ai copilot` | **GitHub Copilot** | `.github/agents/*.agent.md`, `AGENTS.md`, `.sdd/protocol.md` | Copilot Chat → agent `sdd` |
| `--ai grok` | **Grok Build** | `.grok/rules/sdd.md`, `AGENTS.md`, `.sdd/protocol.md` | `grok` CLI / Grok Build |
| `--ai claude` | **Claude Code** | `.claude/agents/*.md`, `AGENTS.md`, `.sdd/protocol.md` | `claude` CLI |
| `--ai ollama` | **Ollama (local)** | `.ollama/sdd.md`, `AGENTS.md`, `.sdd/protocol.md` | `ollama run <model>` (local LLM) |

Interactive init (no `--ai`) prompts you to pick one of these.

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

- [Simple feature](/guides/simple-feature)  
- [CLI reference](/reference/cli)  
