# IDEs & coding agents (agents only)

**No skills.** One playbook, thin role agents, live context.

| Layer | Path | Size |
|-------|------|------|
| **Protocol** (only full playbook) | `.sdd/protocol.md` | ~1 page |
| **Live task** | `.sdd/active-context.md` | generated |
| **Claude Code agents** | `.claude/agents/*.md` | ~10 lines each |
| **GitHub Copilot agents** | `.github/agents/*.agent.md` | **same text** as Claude agents |
| **Optional pointer** | `AGENTS.md` | tiny index |

---

## Targets

| Surface | Integration |
|---------|-------------|
| **CLI** | `sdd` |
| **VS Code / Cursor** | Extension + Copilot agents |
| **IntelliJ** | Plugin → `sdd` CLI; Copilot uses `.github/agents/` |
| **GitHub Copilot** | Custom **agents** only (not skills, not fat instructions) |
| **Claude Code** | Custom **agents** in `.claude/agents/` only (not skills) |

---

## Roles (same on both hosts)

| Agent id | Role |
|----------|------|
| `sdd` | Router — plan or implement from current stage |
| `sdd-planner` | Specs / design / tasks only |
| `sdd-implementer` | Code for active change |
| `sdd-reviewer` | Check against acceptance before verify |

Bodies are **stubs**: role + “read `active-context.md` then `protocol.md`”.  
All real rules live in **`.sdd/protocol.md` once**.

---

## Commands

`sdd init` asks **which platform** (like Speckit) — it does **not** install every host by default.

```bash
sdd init                      # interactive: pick copilot | claude-code | intellij | none
sdd init --ai copilot         # non-interactive: GitHub Copilot only
sdd init --ai claude-code     # Claude Code only
sdd init --no-agents          # skip agent files
sdd agents install            # interactive pick (or -t / --ai)
sdd agents install -t copilot
sdd agents install --force -t claude-code
sdd agents refresh            # refresh active-context.md
```

---

## Engineer workflow

1. `sdd new "…"` / IDE New Change  
2. `sdd agents refresh` (also runs on new/next)  
3. Pick agent **sdd** / **sdd-implementer** (Copilot or Claude `/agents`)  
4. Agent reads active-context + protocol  
5. Human: `sdd verify` → `sdd complete`  

---

## Tests

| Package | Coverage |
|---------|----------|
| `core` | protocol + agents-only install; opt-in platforms; no skills; thin body |
| `vscode` unit | init with explicit platform only |
| `vscode` UI | Electron: init installs only selected platform |
| `intellij` | CLI argv for `agents install/refresh` |

```bash
pnpm test
pnpm test:vscode-ui
```
