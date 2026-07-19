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
| **IDE** | VS Code, Cursor, IntelliJ | Extension/plugin only — not an agent target |

| Surface | Integration |
|---------|-------------|
| **CLI** | `sdd` |
| **VS Code / Cursor** (IDE) | Extension + pick **Copilot** and/or terminal agents |
| **IntelliJ** (IDE) | Plugin → `sdd` CLI; pick **Copilot** for `.github/agents/` |
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

`sdd init` follows the **GitHub Speckit** install pattern:

1. Project path (`.` / `--here` / name)
2. Choose **one** AI coding agent integration (not an IDE)
3. Install shared infra + that integration’s agent files
4. Non-interactive without `--ai` → defaults to **copilot** (like Speckit)

```bash
# Speckit-like
sdd init                      # current dir; interactive agent pick
sdd init .                    # same as --here
sdd init --here
sdd init my-app               # create/use my-app/
sdd init --here --ai copilot  # GitHub Copilot
sdd init --here --ai claude   # Claude Code
sdd init --here --ai grok     # Grok Build
sdd init --here --integration grok
sdd init --here --no-agents
sdd init --here --ai claude --ignore-agent-tools

sdd agents install --ai grok
sdd agents install --ai copilot --force
sdd agents refresh
```

---

## Engineer workflow

### Copilot / Claude

1. `sdd new "…"` / IDE New Change  
2. `sdd agents refresh` (also runs on new/next)  
3. Pick agent **sdd** / **sdd-implementer**  
4. Agent reads active-context + protocol  
5. Human: `sdd verify` → `sdd complete`  

### Grok Build

1. `sdd init --here --ai grok` (or interactive pick **Grok Build**)  
2. Open the project in Grok Build (loads `AGENTS.md` + `.grok/rules/sdd.md`)  
3. `sdd new "…"` then `sdd agents refresh` when stages change  
4. Ask Grok to follow SDD (or rely on installed rules): implement the active change only  
5. Run in shell (you or Grok): `sdd verify` → `sdd next` / `sdd complete`  

Optional denser brief: `sdd agent` and paste into the chat.

---

## Tests

| Package | Coverage |
|---------|----------|
| `core` | protocol + agents-only; registry (copilot, claude, grok); no IDE targets |
| `vscode` unit | init with explicit AI agent only |
| `vscode` UI | Electron: init installs only selected AI agent |
| `intellij` plugin | CLI argv for `agents install/refresh` (IDE shell) |

```bash
pnpm test
pnpm test:vscode-ui
```
