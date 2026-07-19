# IDEs & coding agents (agents only)

**No skills.** One playbook, thin role agents, live context.

**IDEs ≠ AI agents.** VS Code, Cursor, and IntelliJ are editors. `sdd init` asks which **AI coding agent** to install files for (GitHub Copilot or Claude Code), not which IDE you use.

| Layer | Path | Size |
|-------|------|------|
| **Protocol** (only full playbook) | `.sdd/protocol.md` | ~1 page |
| **Live task** | `.sdd/active-context.md` | generated |
| **Claude Code agents** | `.claude/agents/*.md` | ~10 lines each |
| **GitHub Copilot agents** | `.github/agents/*.agent.md` | **same text** as Claude agents |
| **Optional pointer** | `AGENTS.md` | tiny index |

---

## AI agents vs IDEs

| Kind | Examples | What SDD installs |
|------|----------|-------------------|
| **AI coding agent** | GitHub Copilot, Claude Code | Thin role agents + protocol |
| **IDE** | VS Code, Cursor, IntelliJ | Extension/plugin only — runs `sdd`; does **not** get its own agent target |

| Surface | Integration |
|---------|-------------|
| **CLI** | `sdd` |
| **VS Code / Cursor** (IDE) | Extension + pick **Copilot** and/or use **Claude Code** terminal |
| **IntelliJ** (IDE) | Plugin → `sdd` CLI; pick **Copilot** for `.github/agents/` |
| **GitHub Copilot** (AI agent) | Custom **agents** only (not skills, not fat instructions) |
| **Claude Code** (AI agent) | Custom **agents** in `.claude/agents/` only (not skills) |

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
sdd init --here --ai copilot  # non-interactive Copilot
sdd init --here --ai claude   # Claude Code (Speckit key: claude)
sdd init --here --integration claude   # Speckit --integration alias
sdd init --here --no-agents
sdd init --here --ai claude --ignore-agent-tools

sdd agents install --ai copilot
sdd agents install --ai claude --force
sdd agents refresh
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
| `core` | protocol + agents-only; AI agents only (not IDEs); thin body |
| `vscode` unit | init with explicit AI agent only |
| `vscode` UI | Electron: init installs only selected AI agent |
| `intellij` plugin | CLI argv for `agents install/refresh` (IDE shell) |

```bash
pnpm test
pnpm test:vscode-ui
```
