# IDEs & coding agents

Target surfaces for Structured Vibe Coding:

| Surface | How SDD integrates |
|---------|-------------------|
| **CLI** | `sdd` binary |
| **VS Code / Cursor** | Extension (`packages/vscode`) |
| **IntelliJ / WebStorm** | Plugin (`packages/intellij`) → shells out to `sdd` |
| **GitHub Copilot** | `.github/copilot-instructions.md`, `.github/agents/sdd.agent.md`, path instructions |
| **Claude Code** | `.claude/skills/sdd/SKILL.md`, `.claude/CLAUDE.md` |

Shared live context: **`.sdd/active-context.md`** (refresh via `sdd agents refresh`).

---

## Install agent files

After `sdd init` (agents on by default):

```bash
sdd agents install
sdd agents install -t copilot,claude-code
sdd agents install -t intellij --force
sdd agents refresh
```

### GitHub Copilot (VS Code **and** IntelliJ)

Creates:

- `.github/copilot-instructions.md` — workspace rules for Copilot Chat / Edits  
- `.github/agents/sdd.agent.md` — dedicated **sdd** agent definition  
- `.github/instructions/sdd.instructions.md` — path-scoped guidance for `changes/**`  
- `AGENTS.md` — cross-tool agent brief  
- `.sdd/active-context.md` — current change/stage handoff  

**Workflow for engineers using Copilot:**

1. `sdd new "…"` / IDE **New Change**  
2. `sdd agents refresh` (or auto on stage advance)  
3. Open Copilot Chat → use project instructions / **sdd** agent  
4. Implement → `sdd verify` → `sdd complete`  

### Claude Code

Creates:

- `.claude/skills/sdd/SKILL.md` — skill Claude Code loads for SDD work  
- `.claude/CLAUDE.md` — project pointer to the skill  

Run Claude Code in the repo root; the skill tells the agent to read active context and respect stages.

### IntelliJ + Copilot

1. Install SDD plugin (from disk zip) + GitHub Copilot plugin  
2. `npm i -g @structured-vibe-coding/cli` so `sdd` is on PATH  
3. **Tools → SDD → Initialize** / **Install Agent Integrations**  
4. Copilot in IntelliJ picks up `.github/copilot-instructions.md`  

---

## Tests

| Package | What |
|---------|------|
| `packages/core` | Unit tests for agent file install + active context |
| `packages/vscode` | Unit tests for init/new/next/agents paths the extension uses |
| `packages/intellij` | JUnit tests for CLI argv contract (`./gradlew test`) |

These prove **integration contracts** (files + CLI). Full UI automation for every IDE is not required for CI on headless runners; IntelliJ `runIde` is manual.

---

## Init flags

```bash
sdd init                 # includes agent files
sdd init --no-agents     # SDD only
sdd agents install       # add agents later
```
