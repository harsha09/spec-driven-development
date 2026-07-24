# Available AI agents

At **`sdd init`** you install **exactly one** AI coding agent host. You can switch later with `sdd agents install --ai <host> --force`.

## Hosts

| Init flag | Product | What gets installed | How you use it |
|-----------|---------|---------------------|----------------|
| `--ai copilot` | **GitHub Copilot** | `.github/agents/*.agent.md`, `AGENTS.md`, `.sdd/protocol.md` | Copilot Chat in VS Code / Cursor → agent `sdd` |
| `--ai grok` | **Grok Build** | `.grok/rules/sdd.md`, `AGENTS.md`, `.sdd/protocol.md` | `grok` CLI / Grok Build in the project |
| `--ai claude` | **Claude Code** | `.claude/agents/*.md`, `AGENTS.md`, `.sdd/protocol.md` | `claude` CLI |

Interactive init (no `--ai`) prompts you to pick one of these three. There is no “skip agents” path at init.

## Agent roles (stubs)

Bodies are thin. Real process rules live in **`.sdd/protocol.md`**. Live task state is **`.sdd/active-context.md`** and **`.sdd/handoff.md`**.

| Role id | Purpose | Copilot / Claude | Grok |
|---------|---------|------------------|------|
| `sdd` | Router — plan or implement from current stage | Yes | Yes (`.grok/rules/sdd.md`) |
| `sdd-planner` | Specs / design / tasks only | Yes | Use router + stage context |
| `sdd-implementer` | Code for the active change | Yes | Use router + stage context |
| `sdd-reviewer` | Check against acceptance before verify | Yes | Use router + stage context |

## Process commands vs agent launch

Most process commands refresh handoff and **launch** the configured agent.  
**Do not launch:** `status`, `init`, `workflows`, `context`, `doctor`.

Skip launch on a single command: `--no-agent` or `SDD_NO_AGENT=1` (process only).

## Switch host later

```bash
sdd agents install --ai claude --force
sdd agents refresh
```

## Related

- [Simple feature](/guides/simple-feature)  
- [CLI reference](/reference/cli)  
