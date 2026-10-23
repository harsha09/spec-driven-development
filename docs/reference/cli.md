---
title: sdd CLI reference
description: Friendly sdd command list — what each command does and when to use it. For learning by doing, start with the 10-minute tutorial.
---

# CLI reference

Binary name: **`sdd`**.
Install: **[@structured-vibe-coding/cli on npm](https://www.npmjs.com/package/@structured-vibe-coding/cli)**
Learn by doing: [Start in 10 minutes](../tutorials/first-change).
One command’s flags: `sdd <command> --help`.

Commit `.sdd/config.yaml`, workflows, templates, `protocol.md`, `memory/`, and change packs. Ignore `handoff.md`, `active-context.md`, `index.db`, `index.db-journal`, `index.db-wal`, `index.db-shm`, `models/`, `role-runs/`, and `<changes_path>/.active`. `sdd init` writes those gitignore rules. On a project that already has `.sdd/config.yaml`, `sdd init` without `--force` appends any missing ignore line and does not rewrite config, memory, or workflows. `sdd init --force` still refreshes unchanged generated files. A file with no manifest hash is recorded as generated when it matches the bundled file, and left in place when it differs. `sdd workflows` names bundled workflows that are not copied yet. `sdd status` prints the change path relative to the repo.

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
| `sdd init --force` | Merge current defaults into supported config; refresh only unchanged SDD-generated workflows/templates and agent files. A file with no manifest hash is recorded as generated when it matches the bundled file | Upgrades |
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
| `sdd role` | Create, list, and run a product role. `sdd role create <name> --template software/developer` copies a shipped role | One job and one stop |
| `sdd team init --template software` | Write `.sdd/team.yaml`, that template's roles, and `routing.yaml` when the template has one. Also `solo` and `research`. Does not overwrite | Model a team |
| `sdd team show` | Print bots, human approvers, the rooms commit switch, and the branch pattern | See the team |
| `sdd team check` | Read `team.yaml`, then reject a literal secret in `.sdd/models.yaml`. A missing models file is allowed. An env-var name is allowed | Before a team runs |
| `sdd models show` | Print each model and which work type uses it | See the pick |
| `sdd models which --work-type draft` | Print the model for one work type. `--bot` beats `--stage`, which beats `--role` | Explain one slot |
| `sdd graph --epic <key>` | Print which stories can run together and which must wait | Epic planning |
| `sdd branch <name>` | Create that story branch from `main` | Start one story |
| `sdd pr` | Push the change branch and open a pull request | Story is ready |
| `sdd checkout <id>` | Switch active change | Multi-PR |
| `sdd workflows` | List project workflows, name bundled workflows that are not copied yet, and print cl100k token counts for each workflow file and artifact | Discover |
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

`sdd workflows` prints those same cl100k counts for every copied workflow. The workflow line counts the workflow file. Each artifact line counts the template that stage copies. A missing template prints `missing`. When a change is active, a `Change` section counts the artifact files in that change. A file that has not been written prints `not written`. This view has no dollar amount.

Embeddings are off by default. Set `embeddings: true` in `.sdd/search.yaml` to download `BAAI/bge-small-en-v1.5` once into `.sdd/models/` and rank with hybrid fusion. A missing model falls back to keyword search.

Related change specs and memory pages can be packed as a short extractive summary. The active change and code stay full. The keyword index is unchanged. Repeated searches are cached in `.sdd/index.db`, and search text does not gain a cache banner.

`sdd sync <change>` only updates local change metadata and SDD-marked verification output. It does not create a commit or update a hosted PR body; verify checks recorded SHA/count references before reporting PASS. Run the relevant checks on the new commit before treating a sync as fresh test evidence.

---

## sdd role

A role file at `.sdd/roles/<name>.md` is the profile a product repo can commit. It is not a host stub from `sdd agents install`. A shipped template can fill `owns`, `inputs`, `outputs`, `collaborates`, `reviews`, `approvers`, `never`, `ask_human_when`, `skills`, `rules`, and `goals`.

```bash
sdd team init --template software
sdd team show
sdd role create builder --template software/developer
```

`software` ships product-manager, architect, product-owner, dev-lead, and developer. `solo` ships one developer. `research` ships one researcher. `developer` alone is ambiguous. Pass `software/developer` or `solo/developer`. Init writes nothing when `.sdd/team.yaml`, `.sdd/routing.yaml` (when the template ships one), or one of the template's role files already exists. A human approver whose name matches `git config user.name` is marked `(you)`. The rooms commit switch is stored and stays off in the shipped templates. The branch pattern includes `{bot}`.

`sdd role route` prints the role, the reason, and the rule for one item. With no flags it uses the active change. Rules in `.sdd/routing.yaml` are tried first. Then one role whose `owns` list names the artifact, or whose `skills` list names the skill. Then the active workflow stage's `owner`, when that role file exists. No match prints `Ask the human.` With no `.sdd/models.yaml`, this command does not call a model. When that file exists, only the no-rule ask may call a decider. A matched rule, one owner, a stage owner, or two owners do not. `sdd team init` does not write `models.yaml`. Model overrides live in that file, not in `team.yaml`. `sdd role queue` prints each bot inbox at `.sdd/agents/<name>/inbox.jsonl`. `sdd role take` writes one active item onto a bot of that role that is under its `wip` limit and under `role_wip` when the team sets one. A bot at either limit is not given another item. A handoff appends the same typed note to both inboxes. Those notes do not count toward the limit.

A role file at `.sdd/roles/<name>.md` is still not a host stub. The four host stubs (`sdd`, `sdd-planner`, `sdd-implementer`, `sdd-reviewer`) each state what they own, what they never do, what they check, and when they ask. `sdd role run` stops in plain language before it writes a file. Allow once writes only the named file. Always allow remembers that file and those inputs for that role. Connectors and routines are not in this slice.

`sdd role messaging off` stops a handoff before any model call. `sdd role handoff <from> --to <role> --change <id> --section <id> --task "..."` writes the same handoff record on both conversations and calls only the receiver. `sdd role group --change <id>` lists accepted owners. `sdd role network` prints one service, a connection with the lead absent, or asks the lead for a plan of depth at most 2. Nobody writes until `sdd role network accept`. `sdd role network run` runs a node only after its prerequisites, and the parent stays open until every node has a result.

A local adapter shows the three passes. It reads `{"roleId","prompt"}` and writes one JSON object. It does not call a network. A decide command is separate. Set `SDD_DECIDE_MODEL` to a command that reads `{"mode":"decide","state","question","options"}` and writes `{"pick","probs"}`. The example adapter stays a reason command.

```bash
SDD_ROLE_MODEL="node docs/examples/role-model.mjs" sdd role run builder --kind code --change <id> --section <section> --task "..."
```

A prompt that contains `changed must list every gap cite.` is the revision. Its `text` is `Revised draft.`, `changed` lists every gap cite, and `action` is `write_file` on `notes/draft.md`. A prompt that contains `Draft:` and `Cite:` is the critique. Its `text` is `Checked the draft.`, and the gap `text` is `The draft misses this check.` The gap cite is the first check id under `Check ids:`. Any other prompt is the author pass and returns `Draft from the local example.` The `write_file` action stops for Allow once, Always allow, or Deny.

## Epic stories

`sdd new --epic issue-37 --story S-001` records one vertical slice. `--depends S-001` names a story that must be completed first. `sdd graph --epic issue-37` prints the waves. Stories in one wave can run at the same time. A later wave waits. `sdd branch <name>` creates that branch from `main` when every dependency is completed. `sdd pr` pushes it and opens the pull request. The body does not close an issue unless `--closes` is set. `sdd backlog` remains the greenfield `F-001` list.

## Related

- [Everyday loop](../guides/everyday-loop)
- [Greenfield](../guides/greenfield)
- [AI setup](../guides/agents)
- [MCP sources](../guides/mcp)
- [Code context](../guides/code-context)
