# IDEs & coding agents (agents only)

**No skills.** One playbook, thin role agents, live context.

**IDEs ≠ AI agents.** VS Code, Cursor, and IntelliJ are editors. `sdd init` asks which **AI coding agent** to install files for, not which IDE you use.

| Layer | Path | Size |
|-------|------|------|
| **Protocol** (only full playbook) | `.sdd/protocol.md` | ~1 page |
| **Live task** | `.sdd/active-context.md` | generated |
| **Claude Code agents** | `.claude/agents/*.md` | ~10 lines each |
| **GitHub Copilot agents** | `.github/agents/*.agent.md` | **same text** as Claude agents |
| **Grok Build** | `.grok/rules/sdd.md` + `AGENTS.md` | router rule + pointer |
| **Optional pointer** | `AGENTS.md` | tiny index (all hosts) |

---

## AI agents vs IDEs

| Kind | Examples | What SDD installs |
|------|----------|-------------------|
| **AI coding agent** | GitHub Copilot, Claude Code, **Grok Build** | Thin stubs/rules + protocol |
| **IDE** | VS Code, Cursor, IntelliJ, etc. | Nothing — edit files + run `sdd` in a terminal (no extension required) |

| Surface | Integration |
|---------|-------------|
| **CLI** | `sdd` (process owner; Spec Kit–style) |
| **GitHub Copilot** (AI agent) | `.github/agents/*.agent.md` |
| **Claude Code** (AI agent) | `.claude/agents/*.md` |
| **Grok Build** (AI agent) | `.grok/rules/sdd.md` + `AGENTS.md` (Grok auto-loads both) |

---

## Roles

| Agent id | Role | Hosts |
|----------|------|--------|
| `sdd` | Router — plan or implement from current stage | Copilot, Claude, **Grok** |
| `sdd-planner` | Specs / design / tasks only | Copilot, Claude |
| `sdd-implementer` | Code for active change | Copilot, Claude |
| `sdd-reviewer` | Check against acceptance before verify | Copilot, Claude |

Bodies are **stubs**: role + “read `active-context.md` then `protocol.md`”.  
All real rules live in **`.sdd/protocol.md` once**.

**Grok note:** Grok Build loads **every** `*.md` under `.grok/rules/`. SDD installs only **`sdd`** there so planner/implementer stubs do not conflict. Pick stage behavior from `active-context.md` (router role).

---

## Commands

## Setup is one command

**You only need `sdd init`.** It installs SDD **and** the chosen AI agent.  
`sdd agents install` is only for **later** (switch host or reinstall).

```bash
# First-time (pick ONE AI — not all hosts)
sdd init --here --ai grok      # only .grok/rules + shared SDD dirs
sdd init --here --ai copilot   # only .github/agents + shared SDD dirs
sdd init --here --ai claude    # only .claude/agents + shared SDD dirs

# Interactive pick (still one agent)
sdd init --here

# Skip agent files
sdd init --here --no-agents
```

### What gets created

| Always (shared SDD — not “AI platforms”) | Only for selected `--ai` |
|------------------------------------------|---------------------------|
| `.sdd/` (config, workflows, templates, protocol) | **grok** → `.grok/rules/sdd.md` |
| `memory/` (incl. `index.md`) | **copilot** → `.github/agents/*.agent.md` |
| `changes/`, `domains/` | **claude** → `.claude/agents/*.md` |
| `AGENTS.md` when an agent is installed | |

**Not created for `--ai grok`:** `.github/agents`, `.claude/agents`, `.idea/sdd-agent-notes.md`.  
Installing one host **removes** other hosts’ agent directories (so leftover multi-host installs get cleaned up).

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
| `sdd new` / `next` / `skip` / `use` / `gate` / `verify` / `complete` / `checkout` / `agent` / `agents refresh` | Writes `.sdd/handoff.md` + refreshes active-context, then **launches** agent |
| `sdd status` | Shows active-change progress only (**no** agent launch) |
| `sdd init` | Installs agent files only (no launch) |
| `sdd workflows` | List only (no launch) |

| Configured agent | How it runs |
|------------------|-------------|
| **grok** | CLI spawns `grok -p "…"` (or interactive `grok`) |
| **claude** | CLI spawns `claude -p "…"` |
| **copilot** | Host UI: open Copilot Chat → agent `sdd` (handoff file refreshed for you) |

Skip launch anytime: `--no-agent` or `SDD_NO_AGENT=1`.

```bash
sdd init --here --ai grok
sdd new "Add feature"          # launches Grok
sdd next                       # launches Grok again for new stage
sdd refine                     # refine current stage (+ prior pack impact)
sdd refine design              # refine a named stage
sdd refine --analyze           # report only → quality-report.md
sdd verify                     # launches Grok with verify context
sdd next --no-agent            # process only
```

### Refine (stage-scoped, anytime)

`sdd refine [stage]` writes `changes/<id>/refine-brief.md` and launches the agent in **refine** mode:

| Rule | Behavior |
|------|----------|
| Address by **stage** | Resolves files from the workflow (not hard-coded paths) |
| Constitution | **Read-only** — never edit |
| Focus stage | Primary edit target |
| Prior artifacts | Auto impact-scan (`rg`/grep); fix mechanical inconsistencies; **highlight** scope/judgment calls |
| Open items | Only when human **explicitly accepts** + notes (else “proposed” in report) |
| Process | Never blocks `next` / `complete`; agent must not run `sdd next` |

```bash
sdd refine                 # current stage
sdd refine design          # named stage
sdd refine --focus-only    # edit focus files only (still read prior)
sdd refine --analyze       # quality-report.md only
sdd refine --no-agent      # brief only
```

---

## Tests

| Package | Coverage |
|---------|----------|
| `core` | protocol + agents-only; registry (copilot, claude, grok) |
| `cli` | init / new / status / next integration |

```bash
pnpm test
```
