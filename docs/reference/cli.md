---
title: sdd CLI reference
description: Friendly sdd command list — what each command does and when to use it. For learning by doing, start with the 10-minute tutorial.
---

# CLI reference

Binary name: **`sdd`**.  
Install: **[@structured-vibe-coding/cli on npm](https://www.npmjs.com/package/@structured-vibe-coding/cli)**  
Learn by doing: [Start in 10 minutes](../tutorials/first-change).  
One command’s flags: `sdd <command> --help`.

---

## I want to…

| Goal | Command |
|------|---------|
| Set up this project | `sdd init --here --ai copilot` |
| Check setup | `sdd doctor` |
| Start small work | `sdd new "Title" -w hotfix -y` |
| Start a feature | `sdd new "Title" -w feature -y` |
| Start a new product | `sdd greenfield "One-line idea"` |
| See my feature list | `sdd feature list` |
| Build backlog item | `sdd feature start F-001` |
| See where I am | `sdd status` |
| Move to next step | `sdd next` |
| Finish work | `sdd complete` |
| Check the change works | `sdd verify` |
| Improve current notes | `sdd refine` |
| Get help from AI now | `sdd agent` |
| Don’t open AI this time | add `--no-agent` |

---

## All commands

| Command | What it does | When |
|---------|--------------|------|
| `sdd init` | Create sdd files + one AI setup | Once per app |
| `sdd init --force` | Refresh defaults (keeps your memory files) | Upgrades |
| `sdd new "title"` | Start a change pack | Start work |
| `sdd new … -w <pack>` | Choose path (hotfix, feature, …) | You know the path |
| `sdd new … -y` | Skip confirm prompts | Scripts / CI |
| `sdd greenfield "idea"` | New product plan path | Empty / MVP product |
| `sdd feature list` | Show F-001… backlog | After greenfield |
| `sdd feature start F-001` | Start work from backlog | Build product items |
| `sdd status` | Progress (**no** AI) | Anytime |
| `sdd status --list` | All open changes | Several PRs |
| `sdd next` | Advance one stage | Step done |
| `sdd next --force` | Bypass checks | Emergency only |
| `sdd skip <stage> -r "…"` | Skip a stage | Not needed |
| `sdd use <workflow>` | Switch path mid-flight | Scope changed |
| `sdd gate approve\|waive\|fail` | Approve / waive / fail a gate | Enterprise gates |
| `sdd verify` | Local check step | Before complete |
| `sdd verify --no-run` | Checklist only | Manual testing |
| `sdd complete` | Mark done (greenfield also saves to `memory/`) | Finished |
| `sdd refine [stage]` | Improve notes | Spec quality |
| `sdd refine --analyze` | Report only | Audit |
| `sdd context` | Focused AST code slices | Implement |
| `sdd mcp` | MCP server in this CLI (process + AST tools) | Claude/Cursor/VS Code agents |
| `sdd agent` | Refresh brief + open AI | Anytime |
| `sdd checkout <id>` | Switch active change | Multi-PR |
| `sdd workflows` | List paths | Discover |
| `sdd help` | Short overview | First run |
| `sdd doctor` | Health check | Stuck / setup |

### Greenfield / backlog

| Command | Notes |
|---------|--------|
| `sdd greenfield ["idea"]` | Asks for idea if you omit it; supports `--no-agent` |
| `sdd feature start F-001` | `-w` can override the backlog workflow; supports `--no-agent` |
| `sdd feature list` | Never opens the AI |

---

## About the AI opening

Most process commands refresh a short handoff and may open your AI.  
**Never open AI:** `status`, `init`, `workflows`, `context`, `feature list`, `help`, `doctor`.

Turn AI off for one command: `--no-agent` or `SDD_NO_AGENT=1`.

---

## Related

- [Everyday loop](../guides/everyday-loop)  
- [Greenfield](../guides/greenfield)  
- [AI setup](../guides/agents)  
