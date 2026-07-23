# CLI reference

> **Look up** commands and when to use them. For learning, start with the [tutorial](/tutorials/first-change).

## What / When / How

| | |
|--|--|
| **What** | Binary `sdd` |
| **When** | Process changes on a laptop |
| **How** | `sdd <command> --help` for flags |

## Commands

| Command | What | When |
|---------|------|------|
| `sdd init` | Scaffold `.sdd`, memory, workflows; install **one** AI host | Once per app |
| `sdd init --force` | Re-copy defaults (memory files skip if present) | Upgrades |
| `sdd new "title"` | Create change pack; optional recommend | Start work |
| `sdd new … -w <pack>` | Force workflow | You know the pack |
| `sdd new … -y` | Non-interactive accept | Scripts / CI smoke |
| `sdd status` | Stage progress | Anytime (**no** agent) |
| `sdd status --list` | Open changes | Multi-PR |
| `sdd next` | Advance stage | Stage done |
| `sdd next --force` | Bypass checks | Emergency |
| `sdd skip <stage> -r "…"` | Skip stage this change | Optional/unneeded |
| `sdd use <workflow>` | Switch pack mid-flight | Scope change |
| `sdd gate approve\|waive\|fail` | Gate actions | Hard/soft gates |
| `sdd verify` | Local verify stage | Before complete |
| `sdd verify --no-run` | Checklist only | Manual verify |
| `sdd complete` | Mark completed in place | Done |
| `sdd refine [stage]` | Stage refine + prior impact | Spec quality |
| `sdd refine --analyze` | Report only | Audit |
| `sdd context` | AST code slices | Implement focus |
| `sdd agent` | Handoff + launch agent | Anytime |
| `sdd checkout <id>` | Set active change | Switch PR |
| `sdd workflows` | List packs | Discover |
| `sdd help` | Overview | First run |

## Agent launch

Most process commands refresh handoff and launch the init-configured agent.  
**Exceptions:** `status`, `init`, `workflows`, `context` (no agent).

Skip launch: `--no-agent` or `SDD_NO_AGENT=1`.

## Related

- [Everyday loop](/guides/everyday-loop)  
- [Refine](/guides/refine)  
- [Code context](/guides/code-context)  
