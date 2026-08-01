---
title: sdd CLI reference
description: Full sdd command reference — init, new, greenfield, feature start, next, verify, complete, refine, context, agents, doctor.
---

# CLI reference

> Look up commands and when to use them. To learn by doing, start with the [tutorial](../tutorials/first-change).

Binary: **`sdd`**. For flags on one command: `sdd <command> --help`.

## Commands

| Command | What it does | When |
|---------|--------------|------|
| `sdd init` | Scaffold `.sdd`, memory, workflows; install **one** AI host | Once per app |
| `sdd init --force` | Re-copy defaults (memory files skip if present) | Upgrades |
| `sdd new "title"` | Create change pack; optional recommend | Start work |
| `sdd new … -w <pack>` | Force workflow | You know the pack |
| `sdd new … -y` | Non-interactive accept | Scripts / CI smoke |
| `sdd greenfield "idea"` | New product pack (vision → … → architecture) | Empty / MVP product |
| `sdd feature list` | Show F-NNN backlog | After greenfield / memory |
| `sdd feature start F-001` | Start change from backlog row | Implement product features |
| `sdd status` | Stage progress | Anytime (**no** agent) |
| `sdd status --list` | Open changes | Multi-PR |
| `sdd next` | Advance stage | Stage done |
| `sdd next --force` | Bypass checks | Emergency |
| `sdd skip <stage> -r "…"` | Skip stage this change | Optional / unneeded |
| `sdd use <workflow>` | Switch pack mid-flight | Scope change |
| `sdd gate approve\|waive\|fail` | Gate actions | Hard/soft gates |
| `sdd verify` | Local verify stage | Before complete |
| `sdd verify --no-run` | Checklist only | Manual verify |
| `sdd complete` | Mark completed in place; greenfield also promotes → `memory/` | Done |
| `sdd refine [stage]` | Stage refine + prior impact | Spec quality |
| `sdd refine --analyze` | Report only | Audit |
| `sdd context` | AST code slices | Implement focus |
| `sdd agent` | Handoff + launch agent | Anytime |
| `sdd checkout <id>` | Set active change | Switch PR |
| `sdd workflows` | List packs | Discover |
| `sdd help` | Overview | First run |
| `sdd doctor` | Check Node, init, AI host, active change | Setup / stuck |

### Greenfield / backlog flags

| Command | Flags |
|---------|--------|
| `sdd greenfield ["idea"]` | `--no-agent` — prompts for idea if omitted |
| `sdd feature start <F-NNN>` | `-w <workflow>` override backlog workflow; `--no-agent` |
| `sdd feature list` | (none) — **does not** launch the agent |

## Agent launch

Most process commands refresh handoff and launch the init-configured agent.  
**No agent:** `status`, `init`, `workflows`, `context`, `feature list`, `help`, `doctor`.

Skip launch elsewhere: `--no-agent` or `SDD_NO_AGENT=1`.

## Related

- [Greenfield guide](../guides/greenfield)  
- [Everyday loop](../guides/everyday-loop)  
- [Refine](../guides/refine)  
- [Code context](../guides/code-context)  
