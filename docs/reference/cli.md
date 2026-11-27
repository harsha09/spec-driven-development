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

## Clarifying questions

The `ask_human_when` entries in a role file are triggers, not questions. `sdd go` asks the role, or the model behind it, to check the request against its triggers and for other real gaps: scope, users, edge cases, acceptance, constraints. A clear request gets no question.

- **Capped and one at a time.** At most `clarify.max_questions` questions in a whole change, set in the workflow file (`hotfix` and `patch` 2, `spike` 3, `feature`, `greenfield`, `enterprise-feature` and `team-software` 5, 3 when a workflow sets none). A team template can carry a fallback in `.sdd/team.yaml` (`clarify.max_questions`, 0 to 5). Each question names its gap and carries a proposed default.
- **Where it runs.** A workflow with a clarify stage runs the check when that stage starts. A workflow without one checks once before its first drafting stage. The stage is skipped, with the reason, when there are no gaps.
- **Confirmed and proposed.** A typed answer or an accepted default is `confirmed`. A default that nobody confirmed, for example after `--no-clarify`, stays `proposed`. The clarify page lists them apart, later prompts flag the unconfirmed ones, and `sdd go` and `sdd gate` print how many are unconfirmed.
- **No repeats.** Questions and answers are kept in `.sdd/role-runs/guide.yaml` and in the change pack as `clarify.yaml`, so a question already answered is never asked again after a restart.
- **`--no-clarify`** skips the check for one run and records the skip.

## Start work: which command?

| Situation | Command |
|-----------|---------|
| Everyday / ad-hoc title (bug, small feature, spike) | **`sdd new "Title"`** (optional `-w hotfix\|feature\|…`) |
| Item from product backlog after greenfield (`F-001`) | **`sdd backlog start F-001`** |
| New product discovery (vision → backlog) | **`sdd greenfield "One-line idea"`** |

`sdd new` and `sdd backlog start` both open a **change pack**. The difference is the **source**: free-form title vs backlog id.
`-w feature` is a **workflow pack name**, not the same as `sdd backlog` / the old `sdd feature` alias.

`sdd setup` is the first-time path. On a terminal it walks folder, workflow, host, roles, model, a check, and an optional first change. Enter initializes the folder, keeps the `feature` workflow, skips the host, and writes planner, architect, and builder when no role file exists yet. Each new duty file lists the stages of the workflow you pass with `-w`. Come back to one piece with `sdd setup --step model` (also `folder`, `workflow`, `host`, `roles`, `check`, or `start`). `sdd setup --yes` keeps the short path: the three duties when the roles folder is empty, a host only with `--ai`, and no model file. What a role and a duty are, why they help, and the setup for each workflow are in [Roles and duties](../guides/roles). `sdd go "I want to build this"` opens the change and runs the role for the current stage. `sdd go` checks the request for real gaps and asks only about those, one question at a time, each with a proposed default. See [Clarifying questions](#clarifying-questions). Answer with `sdd go --answer "..."`, or accept the default with `sdd go --accept-default`. On a terminal, `sdd go` asks in place and Enter accepts the default. When the draft is written, the guide moves to the next stage and hands the work to the role that lists it. Clarify stages run when the request has open questions and are skipped, with the reason, when it has none. Brainstorm stages are skipped. A hard gate that needs you stops and says so. The role does not sign it. A role whose `never` list says `write product code` can write only inside the change pack. Push, a pull request, and merge stay refused.

---

## I want to…

| Goal | Command |
|------|---------|
| Set up this project | `sdd setup` |
| Set up one piece | `sdd setup --step model` |
| Set up and name the AI host | `sdd init --here --ai copilot` |
| Set up without any AI host | `sdd init --here --no-agent` |
| Build something with the roles | `sdd go "I want to build this"` |
| Check setup | `sdd doctor` |
| Start small work | `sdd new "Title" -w hotfix -y` |
| Start mid-size work (workflow pack) | `sdd new "Title" -w feature -y` |
| Start a new product | `sdd greenfield "One-line idea"` |
| See product backlog | `sdd backlog list` |
| Build backlog item | `sdd backlog start F-001` |
| See where I am | `sdd status` |
| List changes | `sdd list` |
| Sync recorded checks to local HEAD | `sdd sync <change>` |
| See measured token usage (sessions found automatically) | `sdd metrics` |
| Import one session log by hand | `sdd metrics import <path>` |
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
| `sdd setup` | Walk setup on a terminal. Enter writes the folder, the feature workflow, and the three duties when no role file exists. `--yes` keeps that short path. `--step` runs one piece | First time, or one missing piece |
| `sdd go "title"` | Open a change, ask each role's questions, draft each required file under its own headings, and hand off to the next role | After setup |
| `sdd go --answer "..."` | Give the answer the current role is waiting for | When a role asks |
| `sdd init` | Create sdd files + one AI setup | Once per app |
| `sdd init --force` | Merge current defaults into supported config; refresh only unchanged SDD-generated workflows/templates and agent files. A file with no manifest hash is recorded as generated when it matches the bundled file | Upgrades |
| `sdd new "title"` | Start a change pack from a free-form title | Everyday work |
| `sdd new … -w <pack>` | Choose path (hotfix, feature, …) | You know the path |
| `sdd new … -y` | Skip confirm prompts | Scripts / CI |
| `sdd greenfield "idea"` | New product plan path | Empty / MVP product |
| `sdd backlog list` | Show F-001… product backlog | After greenfield |
| `sdd backlog start F-001` | Start work from backlog id | Build product items |
| `sdd feature list\|start` | **Alias** for `sdd backlog …` (compat) | Old scripts |
| `sdd status` | Progress for the active change. With no active change, shows the last completed change and says to run `sdd list` (**no** AI) | Anytime |
| `sdd status --list` | All open changes | Several PRs |
| `sdd list` | Ids, titles, and status for open and archived changes | Find an id |
| `sdd list --status completed` | Only changes in that status (`in_progress`, `completed`, `blocked`, `abandoned`) | Filter |
| `sdd sync <change>` | Update recorded verification SHAs to local `git rev-parse HEAD` | After a new commit |
| `sdd metrics` | Find agent session logs for this project in each host's default location (Claude Code `~/.claude/projects/`, Codex `~/.codex/sessions/`, Grok `~/.grok/sessions/`), import only new usage, then print the change report. Matches logs to this repo by working directory and to a change by a recorded session or launch window, then by phase time. Running it twice gives the same totals. `--change <id>` limits it to one change; `--all` covers every change. When nothing is found it lists every place searched. Only usage fields (model, token counts, timestamps, session id) are read; prompt and response text is never read into storage. | Review token use |
| `sdd metrics import <session-log>` | Import measured Claude Code or Codex JSONL, a Grok `usage.json`, or a Grok session directory into the active change; use `--change <id>` for another change | Review token use |
| `sdd report` | Print active time, human wait, measured tokens, and cost for the active change. Use `--change <id>` to select one change. | After metrics exist |
| `sdd report --all` | Print that report for every change that has a metrics.json, sorted by first phase start. | Compare changes |
| `sdd cost` | Print the same one-change report as `sdd report`, including the same cost figures. Use `--change <id>` to select one change. | Check cost |
| `sdd next` | Advance one stage. Leaving `tasks` or `implement` stops when `tasks.md` still has open boxes | Step done |
| `sdd next --allow-unchecked` | Advance anyway, and print the open-task counts | Override |
| `sdd next --strict` | Stop on open tasks even when `.sdd/config.yaml` sets `policy.task_checks: warn` | CI |
| `sdd next --force` | Bypass checks | Emergency only |
| `sdd skip <stage> -r "…"` | Skip a stage | Not needed |
| `sdd use <workflow>` | Switch path mid-flight | Scope changed |
| `sdd gate approve\|waive\|fail` | Approve / waive / fail a stage gate | Enterprise gates |
| `sdd gate status` | List required merge gates against the current HEAD. Exits 1 unless each is a fresh pass | Before merge |
| `sdd gate record --verdict pass --reviewer "Ada Lovelace" --sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --evidence evidence/qa.log review` | Record a verdict pinned to that commit. `pass` and `pass-with-notes` need the SHA and an evidence link | After review or QA |
| `sdd merge --check` | Refuse unless every required gate is a fresh pass on this HEAD. Does not merge | CI |
| `sdd merge [--method merge\|squash\|rebase]` | Same check, then `gh pr merge` with that method (default `merge`) and a head-match guard | Merge the pull request |
| `sdd verify` | Run the stage's `verify.commands`; PASS (exit 0) only if at least one ran and all exited 0. FAIL (exit 1) if any failed. NOT RUN (exit 1) on a stage without a verify step or with `commands: []` | Before complete |
| `sdd verify --no-run` | Checklist only — records NOT RUN, exits 1 | Manual testing |
| `sdd complete` | Mark done (greenfield also saves to `memory/`). Stops when tasks are unchecked or the verify checklist is unticked | Finished |
| `sdd complete --allow-unchecked` | Complete anyway, and print the open counts | Override |
| `sdd refine [stage]` | Improve notes | Spec quality |
| `sdd refine --analyze` | Report only | Audit |
| `sdd context` | Focused code slices under a token budget | Implement |
| `sdd search "<query>"` | Keyword search (`--scope code\|specs\|memory`, optional `--budget`). `provider: mcp` asks one MCP source and falls back to this keyword search. | Find a symbol without opening AI |
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
| `sdd doctor` | Health check, including native modules (`better-sqlite3`, `onnxruntime-node`) and `.sdd/sdd-pin.yaml` when that file exists | Stuck / setup |
| `sdd doctor --strict` | Same check, but a pin that differs from this install exits non-zero | CI |

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
**Never open AI:** `status`, `list`, `report`, `cost`, `search`, `init`, `workflows`, `context`, `backlog list`, `help`, `doctor`, `gate status`, `gate record`, `merge`.

`sdd doctor` loads `better-sqlite3` and `onnxruntime-node`. Current npm skips their install scripts unless you allow them, so a global install can succeed while the native build is missing. When a module is missing or not built, doctor exits 1 and prints:

```bash
npm install -g --allow-scripts=better-sqlite3,onnxruntime-node @structured-vibe-coding/cli
```

To allow the same scripts for later global installs, then install again:

```bash
npm config set allow-scripts=better-sqlite3,onnxruntime-node --location=user
```

`.sdd/sdd-pin.yaml` records the build this repo expects:

```yaml
# sdd --version and sdd doctor compare the installed build with this pin.
version: 0.25.0
```

`sdd --version` adds one line when the pin differs, including the install command. `sdd doctor` prints the same mismatch as a warning. `sdd doctor --strict` exits non-zero on a mismatch. A missing pin is not an error.

`sdd next` out of `tasks` or `implement`, and `sdd complete`, record task and verify-checklist counts on the change and in `sdd status` / `sdd report`. Open tasks or an unticked verify checklist stop the command. Set `policy.task_checks: warn` in `.sdd/config.yaml` to print the counts and continue. `--allow-unchecked` is the one-command override. A clean `git status` while leaving `implement` is a warning, and is skipped outside a git repo.

Turn AI off for one command: `--no-agent` or `SDD_NO_AGENT=1`.
Set up with no AI host at all: `sdd init --here --no-agent`. This installs no host files and no `AGENTS.md`, never prompts, and leaves nothing for commands to launch.

Phase timing and token metrics are enabled by default. Disable collection in `.sdd/config.yaml`:

```yaml
metrics:
  enabled: false
  exclude: []
```

`metrics.exclude` lists repo-relative prefixes. Import refuses to read a session log under an excluded prefix. The default is `[]`.

`metrics.exclude` also applies to auto-discovery: a log under an excluded prefix is skipped and counted.

An agent launched through `sdd` is recorded in `metrics.json` as a host and launch window (never a path or content), so its usage is attributed to that change even when another change was open at the same time.

When metrics are disabled, `sdd report` and `sdd cost` print `Metrics are disabled` and exit 0.

Session imports store measured token counts, request IDs, phase names, timestamps, and, for Grok, the model id. The session-log path and prompt/response content are not stored. A Grok usage.json stores one request per turn and model. inputTokens in that file includes cache reads; sdd stores the uncached remainder as input and the cache buckets separately. The model id is stored. Server cost ticks are not imported. When a sibling events.jsonl has turn_started for that turn, that timestamp is the request time; otherwise the turn endedAt is used.

Tools without session logs can use a local proxy that the operator runs; sdd does not read proxy logs in this version.

`.sdd/prices.yaml` holds USD rates per one million tokens and `usd_to_inr` (default 84). `sdd init` writes it only when missing. Cost uses `models.<model>` when the request has a model id and that key exists, otherwise `models.<provider>`, otherwise `models.default`. If the file is missing, every cost is `n/a` and the report says `prices.yaml is missing`. Costs are not written into `metrics.json`.

If a change has no measured requests, the report adds one `estimated (handoff code points / 4)` row from `.sdd/handoff.md` and labels it as an estimate, not a model tokenizer. This version does not include a BPE tokenizer.

Search, context packing, and the handoff retrieved section count tokens with `cl100k_base`. That count is separate from the report estimate.

`sdd workflows` prints those same cl100k counts for every copied workflow. The workflow line counts the workflow file. Each artifact line counts the template that stage copies. A missing template prints `missing`. When a change is active, a `Change` section counts the artifact files in that change. A file that has not been written prints `not written`. This view has no dollar amount.

Embeddings are off by default. Set `embeddings: true` in `.sdd/search.yaml` to download `BAAI/bge-small-en-v1.5` once into `.sdd/models/` and rank with hybrid fusion. A missing model falls back to keyword search.

`provider: mcp` is also off unless you set it. `sdd search` then calls one source from `.sdd/mcp.yaml` with the query and the scope. A missing or broken source falls back to keyword search. Handoff stays on the built-in index. The language matrix is [Search providers](./search-providers).

Related change specs and memory pages can be packed as a short extractive summary. The active change and code stay full. The keyword index is unchanged. Repeated searches are cached in `.sdd/index.db`, and search text does not gain a cache banner.

`sdd sync <change>` only updates local change metadata and SDD-marked verification output. It does not create a commit or update a hosted PR body; verify checks recorded SHA/count references before reporting PASS. Run the relevant checks on the new commit before treating a sync as fresh test evidence.

## Merge gates

A workflow names the gates that change type needs before merge. `review`, `qa`, and `domain` are the usual names. A workflow that omits `required_gates` does not add any.

`sdd gate record` writes `gate-verdicts.yaml` on the change. Each record stores the gate, the reviewer, the verdict (`pass`, `fail`, or `pass-with-notes`), the exact commit SHA, the time, and evidence links. A pass or a pass-with-notes is refused without the SHA and at least one evidence link. An evidence link is a repo-relative path or an http(s) URL. This is separate from `sdd gate approve`, which signs the current stage gate.

`sdd gate status` compares those records to the local Git HEAD. A required gate is `fresh` when its latest verdict on that SHA is `pass` or `pass-with-notes`, `failed` when that verdict is `fail`, `stale` when the verdict names another SHA, and `missing` when nothing is recorded. A new commit makes the old verdicts stale. The command exits 1 when any required gate is not fresh.

`sdd merge --check` uses the same rule and does not merge. `sdd merge` refuses on a stale, failed, or missing required gate. When every required gate is fresh, it merges that change's pull request with an explicit method (`--method merge`, `squash` or `rebase`, default `merge`, because `gh` cannot prompt for one) and passes the checked SHA as a head-match guard, so a push during the merge fails instead of landing on a different commit. If HEAD moves after the check and before the merge starts, the merge does not run.

---

## sdd role

A role file at `.sdd/roles/<name>.md` is the profile a product repo can commit. It is not a host stub from `sdd agents install`. A shipped template can fill `owns`, `inputs`, `outputs`, `collaborates`, `reviews`, `approvers`, `never`, `ask_human_when`, `skills`, `rules`, and `goals`.

```bash
sdd team init --template software
sdd team show
sdd role create builder --template software/developer
sdd role create analyst --label "Analyst" --job "Write the reading" --stages intent,design
```

`--stages` lists stage ids from the workflow you pass to `sdd new -w`. `sdd role route` uses that list for the active stage. `team-software` stays one stage pack you can name with `-w`. `sdd role edit <name> --stages ...` replaces the list.

`sdd role context <name>` prints that role's context. With no saved context, the role writes one from the repo, the role name, and any knowledge already saved. `sdd role context <name> --text "..."` saves the context you wrote. `sdd role context <name> --knowledge "..."` saves optional knowledge. `sdd role context <name> --generate` writes a new context from the repo, the role name, and that knowledge. `sdd role run` includes the saved context. A context that does not fit the run budget is left out of that run.

`software` ships product-manager, architect, product-owner, dev-lead, developer, and qa. `solo` ships one developer. `research` ships one researcher. `developer` alone is ambiguous. Pass `software/developer` or `solo/developer`. Init writes nothing when `.sdd/team.yaml`, `.sdd/routing.yaml` (when the template ships one), or one of the template's role files already exists. A human approver whose name matches `git config user.name` is marked `(you)`. The rooms commit switch is stored. Shipped templates set it to true, so a new team commits rooms unless that team sets `rooms.commit` to false. The branch pattern includes `{bot}`.

`sdd role route` prints the role, the reason, and the rule for one item. With no flags it uses the active change. Rules in `.sdd/routing.yaml` are tried first. Then one role whose `owns` list names the artifact, or whose `skills` list names the skill. Then one role whose `stages` list contains the stage id. Then the active workflow stage's `owner`, when that role file exists. No match prints `Ask the human.` Two roles that own the item, or two roles that list the stage, also print `Ask the human.` With no `.sdd/models.yaml`, this command does not call a model. When that file exists, only the no-rule ask may call a decider. A matched rule, one owner, a stage list, a stage owner, two owners, or two stage lists do not. `sdd team init` does not write `models.yaml`. Model overrides live in that file, not in `team.yaml`. `sdd role queue` prints each bot inbox at `.sdd/agents/<name>/inbox.jsonl`. `sdd role take` writes one active item onto a bot of that role that is under its `wip` limit and under `role_wip` when the team sets one. A bot at either limit is not given another item. A handoff appends the same typed note to both inboxes. Those notes do not count toward the limit.

A role file at `.sdd/roles/<name>.md` is still not a host stub. The four host stubs (`sdd`, `sdd-planner`, `sdd-implementer`, `sdd-reviewer`) each state what they own, what they never do, what they check, and when they ask. `sdd role run` stops in plain language before it writes a file. Allow once writes only the named file. Always allow remembers that file and those inputs for that role, and only while git HEAD stays the same. With no HEAD, the remembered inputs still apply. `sdd role connector read github-issue <number>` prints that issue's number, title, and state. `sdd role connector seed github-issue <number>` opens one feature change from that title and leaves it at intent. A missing issue is reported and is not invented. `sdd role connector draft slack <text>` and `sdd role connector draft teams <text>` print that one line and `not sent`. The draft is not posted. `sdd role connector read jira <id>`, and the same read for `aha`, `asana`, and `azure-devops`, prints that the record could not be read when no source is connected. A missing record is reported and is not invented. Those reads do not open a change. The connector name `x` is refused. Any other connector, and any action other than that read, that seed, or that draft, does not run in this slice. `sdd role routine run <role> <name>` repeats a read saved on the role file. A routine cannot write a QA result. Edit, pin, hide, and duplicate keep that saved read and do not run it. Hide does not pause it.

`sdd team signoff --note "..."` records the person named by `git config user.name` when that name is listed under humans in `.sdd/team.yaml`. It writes `reviews/<stage>-<sha>.md` on the active change and appends one line to `decisions.md`. A hard gate whose approvers include `human` does not open for `sdd next` until that file matches the current HEAD. `sdd gate waive` still opens it. `sdd role decide --note "..."` appends an unsigned decision request and does not approve a gate.

`sdd fact set <key> <value>` appends one line to `.sdd/facts.jsonl`. `sdd fact get` prints the newest value for that key, and `sdd fact list` prints one newest line per key. A value that repeats a constitution bullet and says to ignore, skip, or override it is not written. `sdd role memory <bot>` prints that bot's memory. `sdd role lesson add <bot> "..."` appends a lesson a person wrote, and the next run for that bot includes it. `sdd team migrate` moves memory and lessons from `.sdd/role-runs/memory/` into `.sdd/agents/<name>/` and prints each move. A run named as a bot uses that brain and a step loop. A run with no team file stays one author call, then critique and revision when a section is in review.

`sdd role room` prints the active change's room for the active stage, `.sdd/rooms/<change>/<stage>.jsonl`. `sdd role room <change-id>` prints that change. `sdd role room --stage <stage>` and `sdd role room --stage=<stage>` print that stage. `sdd role room post "<line>"` appends one line a person wrote. On `post`, `--change` and `--stage` select the file. An objection without a cite is refused. `sdd role review` runs one round for the stage owner and the roles in `collaborates`, at most `limits.room_rounds` rounds and otherwise 2. The round prompt includes the critique lines, and the owner also gets the revision lines when an objection is open. A finished round appends one `room` line to `decisions.md` with who agreed, the SHA, and the open cites. A room that is still open at the cap also appends `decision-needed`. `rooms.commit: false` adds `rooms/` to `.sdd/.gitignore` when the team file is loaded. `rooms.commit: true` removes that line. The stage file is not rewritten, and an open room does not block `sdd next`.

A run named as a bot can read a file, search, ask for code context, run one allowlisted check, write a file, and commit. The prompt for such a run states the reply format (one JSON object per turn: plan, tool, check, ask, or done) and lists these tools with their arguments and the exact allowlisted checks. Both are generated from the loop's schema and the registered tools, so the prompt and the parser stay in step.

**Prompt layout.** Every prompt sdd sends to a model has the same sections in the same order: Role, Scope, Task, Inputs, Guardrails, Style, Output contract. Scope and Inputs are left out when empty. Everything under Inputs (drafts, memory, facts, room lines, tool results, earlier artifacts) is fenced and headed with where it came from, as untrusted data, so text inside it is not read as an instruction. The Output contract comes last. It is generated from the same schema the reply is parsed with, and it shows valid examples and one invalid example with the reason. The role file reaches the model as a short role card (label, job, what the role owns, never does, and asks about), without the screen-only keys `pinned`, `hidden`, and `ask_first`, the approvers, and the YAML punctuation. A reply may arrive in a code fence or after a `<think>` block; sdd strips both before parsing. The shared wording is in `packages/core/src/prompt.ts`; the wording of each prompt is in `packages/core/src/role/prompts.ts` and `packages/core/src/team/brain.ts`. `run_check` runs a command only when that exact string is on the active stage's `verify.commands` or in `.sdd/tools.yaml`. The command runs in a temporary worktree at HEAD, and the result is `changes/<id>/evidence/<sha>.json`. A check, a done line, or a room line that says the work passed, works, or is fixed is refused unless that file's latest run exited 0 at the current HEAD. On a stage that lists verify commands, an agree needs the same cite. A commit runs only when the current branch is already `team.branch` for that bot and change. Push, a pull request, and merge are refused and do not run git. A name that is not a bot still only applies `write_file`.

**Reply kinds.** Every reply a prompt asks for is one JSON object with a `kind`: `draft`, `question`, `critique`, `revision`, `post`, `objection`, `agree`, `block`, `plan`, `tool`, `check`, `ask`, `done` or `plan_tree`. Each prompt offers only its own kinds, and a reply with a kind it did not offer gets one repair try. The old shapes (no `kind`; `type` in a room entry; `step` in a loop step) are still read for one minor release, and each one that is read is logged once per run as a `legacy_shape` line. The list of kinds, the old shapes and where the log lines go are in [Prompts and reply kinds](../maintainers/prompts).

**Loop repair.** When a bot's loop reply is not a valid step, sdd asks once more with a Repair section: the problems (at most three, one line each) and the bad reply, fenced as untrusted data. A repair does not count toward `loop_max_steps`. One run has at most three repairs. After that, or when the repair is also bad, the run stops with `A loop step is not valid.` A model that fails to answer is not repaired. Each repair writes a `repair` line to the run log, and each old step shape that is read (`step`, `stop`, `act`, or a bare `{"text": ...}`) writes a `legacy_shape` line, once per run.

**Draft, hand-off, and plan replies.** An author, a hand-off receiver, and a network owner each reply with `{kind: "draft", text, action?}`. The prompt offers one action name, `write_file`, with `inputs.path` and `inputs.contents`, and a person still approves the write. The parser is unchanged: it takes any non-empty action name, so `commit`, `merge`, and the other names a role must not use still get their `rejected` or `unavailable` log line and message. A lead's plan is `{kind: "plan_tree", text, plan}`; the prompt lists the services, the decisions, and the role names it may use. Each of these replies that is not valid gets one repair try with the problems listed, and if it is still not valid the call ends as before (`bad_call` in the run log, or `The plan is not valid.`). A plan deeper than 2 is not repaired: it ends with `A plan is deeper than 2.` A model that fails to answer is not repaired.

**Boundary.** Each node in a plan has a `boundary`, `ask` or `stop`, that says what its owner does at the edge of its artifact. `stop`: stop and say what change is needed and where. The reply is the node's result. `ask`: ask the person one question and wait. The owner replies with `text` that starts with `Question:`. `sdd role network run` then pauses: the node stays open, the plan stays `open`, nothing after it starts, a `question` line goes to the owner's run log, and the run prints the question and `Answer with: sdd role network run --change <id> --section <id> --answer "..."`. Running it again without `--answer` prints the question again and calls no model. With `--answer`, the node runs again and its prompt includes the answer as untrusted data. A node may ask three questions; a fourth `Question:` reply is taken as its result. An action sent with a question is not recorded. `--answer` with no question waiting fails with `No question is waiting.`

**Critique and revision replies.** When a section is in review, the critic's reply is `{kind: "critique", text, gaps}`. Each gap's `cite` must be one of the section's check ids, or `<section>:<decision>` for a gap that fits no check. A revision reply is `{kind: "revision", text, changed, open?}`. `changed` and `open` together must list every gap cite, each once, and a cite cannot be in both. A critique or revision that is not valid gets one repair try with the problems listed, and a `repair` line goes to the run log. If it is still not valid, the run stops with the first draft, as before. `open` lists gaps the author could not fix. A run with open gaps still finishes: the final text ends with `Open: <cites>`, and an `open_gaps` line goes to the run log.

**Guide replies.** A guide role (`sdd go`) replies with `{kind: "draft", text, parts?}`. When the artifact's template has headings, the prompt lists them under Headings and in the reply shape, and each part's `heading` must be one of them, spelled exactly (spaces around a heading are ignored). When the template has none, the reply is `{kind: "draft", text}` and the draft is `text`. To ask one question, a role sends `{kind: "question", text}` and no parts; sdd stores the question as before, and any parts sent with it are ignored. A reply that is not valid, such as a part with an unknown heading, gets one repair try with the problems listed. If it is still not valid, the run ends with `A draft is not valid.` and the file is not written. A model that fails to answer is not repaired. A reply that leaves a heading empty still stops the guide with `<heading> is still empty.`

**Room replies.** A bot's room entry is one JSON object with a `kind` of `post`, `objection`, `agree`, or `block`, a one-line `text`, and a `cite`. An objection needs a cite. A bot cannot send `decision`; only a person records one, with `sdd role room post "<line>" --type decision`. A reply that is not valid, or that names `decision`, gets one repair try with the problem listed. If it is still not valid, nothing is written and the review stops. A reply that is one line of plain text is still typed by the entry classifier, which can pick `decision` as an option; a bot's entry that the classifier types as `decision` is stored as a `post`. The room prompt shows the stage, the round, whether the role owns the artifact, the draft, the room so far, and for the owner the open objections. When the stage has verify commands it also shows the evidence path for the current commit, or `none`.

`sdd role messaging off` stops a handoff before any model call. `sdd role handoff <from> --to <role> --change <id> --section <id> --task "..."` writes the same handoff record on both conversations and calls only the receiver. `sdd role group --change <id>` lists accepted owners. `sdd role network` prints one service, a connection with the lead absent, or asks the lead for a plan of depth at most 2. Nobody writes until `sdd role network accept`. `sdd role network run` runs a node only after its prerequisites, and the parent stays open until every node has a result.

A local adapter shows the three passes. It reads `{"roleId","prompt"}` and writes one JSON object. It does not call a network. A decide command is separate. Set `SDD_DECIDE_MODEL` to a command that reads `{"mode":"decide","state","question","options"}` and writes `{"pick","probs"}`. The example adapter stays a reason command.

```bash
SDD_ROLE_MODEL="node docs/examples/role-model.mjs" sdd role run builder --kind code --change <id> --section <section> --task "..."
```

A prompt that contains `changed and open together must list every gap cite` (or the older `changed must list every gap cite.`) is the revision. Its `text` is `Revised draft.`, `changed` lists every gap cite, and `action` is `write_file` on `notes/draft.md`. A prompt that has a `Draft` input and a `Cite ids` input (or an older `Check ids:` list, or `Draft:` and `Cite:` lines) is the critique. Its `text` is `Checked the draft.`, and the gap `text` is `The draft misses this check.` The gap cite is the first line of `Cite ids`. Any other prompt is the author pass and returns `Draft from the local example.` The `write_file` action stops for Allow once, Always allow, or Deny.

## Epic stories

`sdd new --epic issue-37 --story S-001` records one vertical slice. `--depends S-001` names a story that must be completed first. `sdd graph --epic issue-37` prints the waves. Stories in one wave can run at the same time. A later wave waits. `sdd branch <name>` creates that branch from `main` when every dependency is completed. `sdd pr` pushes it and opens the pull request. The body does not close an issue unless `--closes` is set. `sdd backlog` remains the greenfield `F-001` list.

## Related

- [Everyday loop](../guides/everyday-loop)
- [Greenfield](../guides/greenfield)
- [AI setup](../guides/agents)
- [MCP sources](../guides/mcp)
- [Code context](../guides/code-context)
