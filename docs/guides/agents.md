# AI agents (init + hosts)

> Install **one** AI coding agent with `sdd init` and run the everyday agent loop.

People often confuse IDEs with AI agents, or install every host at once. `sdd` follows a Spec Kit–style single host: `--ai grok | copilot | claude | ollama` — clean stubs, one protocol, no extension required.

Agent files, `.sdd/protocol.md`, and live `active-context.md` are set up once at init. Switch later with `sdd agents install`.

**No skills packs.** One playbook, thin role agents, live context.

**IDEs ≠ AI agents.** VS Code, Cursor, and IntelliJ are editors. `sdd init` asks which **AI coding agent** to install files for, not which IDE you use.

| Layer | Path | Size |
|-------|------|------|
| **Protocol** (only full playbook) | `.sdd/protocol.md` | ~1 page |
| **Live task** | `.sdd/active-context.md` | generated |
| **Claude Code agents** | `.claude/agents/*.md` | ~10 lines each |
| **GitHub Copilot agents** | `.github/agents/*.agent.md` | **same text** as Claude agents |
| **Grok Build** | `.grok/rules/sdd.md` + `AGENTS.md` | router rule + pointer |
| **Ollama** | `.ollama/sdd.md` + `AGENTS.md` | local models via CLI |
| **Optional pointer** | `AGENTS.md` | tiny index (all hosts) |

---

## AI agents vs IDEs

| Kind | Examples | What SDD installs |
|------|----------|-------------------|
| **AI coding agent** | GitHub Copilot, Claude Code, Grok Build, **Ollama** | Thin stubs/rules + protocol |
| **IDE** | VS Code, Cursor, IntelliJ, etc. | Nothing — edit files + run `sdd` in a terminal (no extension required) |

| Surface | Integration |
|---------|-------------|
| **CLI** | `sdd` (process owner; Spec Kit–style) |
| **GitHub Copilot** (AI agent) | `.github/agents/*.agent.md` |
| **Claude Code** (AI agent) | `.claude/agents/*.md` |
| **Grok Build** (AI agent) | `.grok/rules/sdd.md` + `AGENTS.md` (Grok auto-loads both) |
| **Ollama** (local AI) | `.ollama/sdd.md` + `AGENTS.md`; launch via `ollama run` |

---

## Roles

| Agent id | Role | Hosts |
|----------|------|--------|
| `sdd` | Router — plan or implement from current stage | Copilot, Claude, Grok, Ollama |
| `sdd-planner` | Specs / design / tasks only | Copilot, Claude |
| `sdd-implementer` | Code for active change | Copilot, Claude |
| `sdd-reviewer` | Check against acceptance before verify | Copilot, Claude |

Bodies are **stubs**: role + “read `active-context.md` then `protocol.md`”.  
All real rules live in **`.sdd/protocol.md` once**.

**Grok / Ollama note:** These hosts use a **single** router brief (not four role files). Pick stage behavior from `active-context.md`. For Ollama set `SDD_OLLAMA_MODEL` (default `llama3.2`) and `ollama pull` that model first.

---

## Setup is one command

**You only need `sdd init`.** It installs SDD **and** the chosen AI agent.  
`sdd agents install` is only for **later** (switch host or reinstall).

```bash
# First-time (pick ONE AI — not all hosts)
sdd init --here --ai grok      # only .grok/rules + shared SDD dirs
sdd init --here --ai copilot   # only .github/agents + shared SDD dirs
sdd init --here --ai claude    # only .claude/agents + shared SDD dirs
sdd init --here --ai ollama    # only .ollama/sdd.md + shared SDD dirs (local models)

# Interactive pick (still one agent)
sdd init --here
```

### What gets created

| Always (shared SDD) | Only for selected `--ai` |
|---------------------|---------------------------|
| `.sdd/`, `memory/`, `changes/`, `domains/` | **grok** → `.grok/rules/sdd.md` |
| `AGENTS.md` when an agent is installed | **copilot** → `.github/agents/*.agent.md` |
| | **claude** → `.claude/agents/*.md` |
| | **ollama** → `.ollama/sdd.md` |

Installing one host **removes** other hosts’ agent directories.

```bash
# Later only
sdd agents install --ai copilot --force   # switch away from grok
sdd agents refresh                        # update active-context.md after stages
```

---

## Engineer workflow (agent after process commands)

**Model:** SDD owns process state; the **AI coding agent from init** does the work.

| After this command… | Agent behavior |
|---------------------|----------------|
| `sdd new` / `next` / `skip` / `use` / `gate` / `verify` / `complete` / `checkout` / `agent` / `agents refresh` / `refine` | Writes `.sdd/handoff.md` + refreshes active-context, then **launches** agent |
| `sdd status` / `doctor` / `context` / `workflows` / `init` | **No** agent launch |

| Configured agent | How it runs |
|------------------|-------------|
| **grok** | CLI spawns `grok -p "…"` (or interactive `grok`) |
| **claude** | CLI spawns `claude -p "…"` |
| **ollama** | CLI spawns `ollama run $SDD_OLLAMA_MODEL "…"` (default model `llama3.2`) |
| **copilot** | Host UI: open Copilot Chat → agent `sdd` (handoff refreshed at `.sdd/handoff.md`) |

Skip launch for one command: `--no-agent` or `SDD_NO_AGENT=1`.

```bash
sdd init --here --ai grok
sdd new "Add feature"
sdd next
sdd verify
```

Stage polish: [Refine a stage](./refine). Full host list: [Available agents](../reference/agents).
