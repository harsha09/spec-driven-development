---
title: sdd CLI reference
description: Friendly sdd command list — what each command does and when to use it. For learning by doing, start with the 10-minute tutorial.
---

# CLI reference

Binary name: **`sdd`**.
Install: **[@structured-vibe-coding/cli on npm](https://www.npmjs.com/package/@structured-vibe-coding/cli)**
Learn by doing: [Start in 10 minutes](../tutorials/first-change).
One command’s flags: `sdd <command> --help`.

Commit `.sdd/config.yaml`, workflows, templates, `protocol.md`, `memory/`, and change packs. Ignore `handoff.md`, `active-context.md`, `index.db`, `index.db-journal`, `index.db-wal`, `index.db-shm`, `models/`, and `<changes_path>/.active`. `sdd init` writes those gitignore rules. On a project that already has `.sdd/config.yaml`, `sdd init --force` appends any missing ignore line and does not replace the file. `sdd status` prints the change path relative to the repo.

---

## Start work: which command?

| Situation | Command |
|-----------|---------|
| Everyday / ad-hoc title (bug, small feature, spike) | **`sdd new "Title"`** (optional `-w hotfix\|feature\|…`) |
| Item from product backlog after greenfield (`F-001`) | **`sdd backlog start F-001`** |
| New product discovery (vision → backlog) | **`sdd greenfield "One-line idea"`** |

`sdd new` and `sdd backlog start` both open a **change pack**. The difference is the **source**: free-form title vs backlog id.
`-w feature` is a **workflow pack name**, not the same as `sdd backlog` / the old `sdd feature` alias.

---

## I want to…

| Goal | Command |
|------|---------|
| Set up this project | `sdd init --here --ai copilot` |
| Set up without any AI host | `sdd init --here --no-agent` |
| Check setup | `sdd doctor` |
| Start small work | `sdd new "Title" -w hotfix -y` |
| Start mid-size work (workflow pack) | `sdd new "Title" -w feature -y` |
| Start a new product | `sdd greenfield "One-line idea"` |
| See product backlog | `sdd backlog list` |
| Build backlog item | `sdd backlog start F-001` |
| See where I am | `sdd status` |
| Sync recorded checks to local HEAD | `sdd sync <change>` |
| Import measured agent token usage | `sdd metrics import <session-log>` |
| Report phase time, tokens, and cost | `sdd report` |
| Report every change that has metrics | `sdd report --all` |
| Print the one-change cost report | `sdd cost` |
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
| `sdd init --force` | Merge current defaults into supported config; refresh only unchanged SDD-generated workflows/templates and agent files | Upgrades |
| `sdd new "title"` | Start a change pack from a free-form title | Everyday work |
| `sdd new … -w <pack>` | Choose path (hotfix, feature, …) | You know the path |
| `sdd new … -y` | Skip confirm prompts | Scripts / CI |
| `sdd greenfield "idea"` | New product plan path | Empty / MVP product |
| `sdd backlog list` | Show F-001… product backlog | After greenfield |
| `sdd backlog start F-001` | Start work from backlog id | Build product items |
| `sdd feature list\|start` | **Alias** for `sdd backlog …` (compat) | Old scripts |
| `sdd status` | Progress (**no** AI) | Anytime |
| `sdd status --list` | All open changes | Several PRs |
| `sdd sync <change>` | Update recorded verification SHAs to local `git rev-parse HEAD` | After a new commit |
| `sdd metrics import <session-log>` | Import measured Claude Code or Codex JSONL, a Grok `usage.json`, or a Grok session directory into the active change; use `--change <id>` for another change | Review token use |
| `sdd report` | Print active time, human wait, measured tokens, and cost for the active change. Use `--change <id>` to select one change. | After metrics exist |
| `sdd report --all` | Print that report for every change that has a metrics.json, sorted by first phase start. | Compare changes |
| `sdd cost` | Print the same one-change report as `sdd report`, including the same cost figures. Use `--change <id>` to select one change. | Check cost |
| `sdd next` | Advance one stage | Step done |
| `sdd next --force` | Bypass checks | Emergency only |
| `sdd skip <stage> -r "…"` | Skip a stage | Not needed |
| `sdd use <workflow>` | Switch path mid-flight | Scope changed |
| `sdd gate approve\|waive\|fail` | Approve / waive / fail a gate | Enterprise gates |
| `sdd verify` | Run the stage's `verify.commands`; PASS (exit 0) only if at least one ran and all exited 0. FAIL (exit 1) if any failed. NOT RUN (exit 1) on a stage without a verify step or with `commands: []` | Before complete |
| `sdd verify --no-run` | Checklist only — records NOT RUN, exits 1 | Manual testing |
| `sdd complete` | Mark done (greenfield also saves to `memory/`) | Finished |
| `sdd refine [stage]` | Improve notes | Spec quality |
| `sdd refine --analyze` | Report only | Audit |
| `sdd context` | Focused code slices under a token budget | Implement |
| `sdd search "<query>"` | Keyword search (`--scope code\|specs\|memory`, optional `--budget`) | Find a symbol without opening AI |
| `sdd mcp sources list/add/test/remove` | External MCPs **sdd calls** | Design system / AST / org lib |
| `sdd mcp fetch` | Pull matching sources for current stage | Enrich handoff / implement |
| `sdd agent` | Refresh brief + open AI | Anytime |
| `sdd role` | Create, list, and run a product role | One job and one stop |
| `sdd checkout <id>` | Switch active change | Multi-PR |
| `sdd workflows` | List paths | Discover |
| `sdd help` | Short overview | First run |
| `sdd doctor` | Health check | Stuck / setup |

### Greenfield / backlog

| Command | Notes |
|---------|--------|
| `sdd greenfield ["idea"]` | Asks for idea if you omit it; supports `--no-agent` |
| `sdd backlog start F-001` | `-w` can override the backlog workflow; supports `--no-agent` |
| `sdd backlog list` | Never opens the AI |
| `sdd feature …` | Same as `sdd backlog …`; prefer **backlog** in new docs and scripts |

---

## About the AI opening

Most process commands refresh a short handoff and may open your AI.
**Never open AI:** `status`, `report`, `cost`, `search`, `init`, `workflows`, `context`, `backlog list`, `help`, `doctor`.

Turn AI off for one command: `--no-agent` or `SDD_NO_AGENT=1`.
Set up with no AI host at all: `sdd init --here --no-agent`. This installs no host files and no `AGENTS.md`, never prompts, and leaves nothing for commands to launch.

Phase timing and token metrics are enabled by default. Disable collection in `.sdd/config.yaml`:

```yaml
metrics:
  enabled: false
  exclude: []
```

`metrics.exclude` lists repo-relative prefixes. Import refuses to read a session log under an excluded prefix. The default is `[]`.

When metrics are disabled, `sdd report` and `sdd cost` print `Metrics are disabled` and exit 0.

Session imports store measured token counts, request IDs, phase names, timestamps, and, for Grok, the model id. The session-log path and prompt/response content are not stored. A Grok usage.json stores one request per turn and model. inputTokens in that file includes cache reads; sdd stores the uncached remainder as input and the cache buckets separately. The model id is stored. Server cost ticks are not imported. When a sibling events.jsonl has turn_started for that turn, that timestamp is the request time; otherwise the turn endedAt is used.

Tools without session logs can use a local proxy that the operator runs; sdd does not read proxy logs in this version.

`.sdd/prices.yaml` holds USD rates per one million tokens and `usd_to_inr` (default 84). `sdd init` writes it only when missing. Cost uses `models.<model>` when the request has a model id and that key exists, otherwise `models.<provider>`, otherwise `models.default`. If the file is missing, every cost is `n/a` and the report says `prices.yaml is missing`. Costs are not written into `metrics.json`.

If a change has no measured requests, the report adds one `estimated (handoff code points / 4)` row from `.sdd/handoff.md` and labels it as an estimate, not a model tokenizer. This version does not include a BPE tokenizer.

Search, context packing, and the handoff retrieved section count tokens with `cl100k_base`. That count is separate from the report estimate.

Embeddings are off by default. Set `embeddings: true` in `.sdd/search.yaml` to download `BAAI/bge-small-en-v1.5` once into `.sdd/models/` and rank with hybrid fusion. A missing model falls back to keyword search.

Related change specs and memory pages can be packed as a short extractive summary. The active change and code stay full. The keyword index is unchanged. Repeated searches are cached in `.sdd/index.db`, and search text does not gain a cache banner.

`sdd sync <change>` only updates local change metadata and SDD-marked verification output. It does not create a commit or update a hosted PR body; verify checks recorded SHA/count references before reporting PASS. Run the relevant checks on the new commit before treating a sync as fresh test evidence.

---

## sdd role

A role file at `.sdd/roles/<name>.md` is the profile a product repo can commit. It is not a host stub from `sdd agents install`. `sdd role run` stops in plain language before it writes a file. Allow once writes only the named file. Always allow remembers that file and those inputs for that role. Connectors are not in this slice.

## Related

- [Everyday loop](../guides/everyday-loop)
- [Greenfield](../guides/greenfield)
- [AI setup](../guides/agents)
- [MCP sources](../guides/mcp)
- [Code context](../guides/code-context)
