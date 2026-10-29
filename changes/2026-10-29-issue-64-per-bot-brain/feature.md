# Feature

> **Issue 64 per-bot brain** · `2026-10-29-issue-64-per-bot-brain` · 2026-10-29

## Reading

A bot with a parsed `.sdd/team.yaml` gets a brain and a step loop. The brain is the role file, `.sdd/agents/<bot>/memory.md`, the newest lessons in `lessons.jsonl`, and shared facts that share a word with the task. The loop steps are `plan`, `tool`, `check`, `ask`, and `done`. `understand`, `reflect`, `act`, and `stop` are accepted as well. Each step is logged. The loop stops at `limits.loop_max_steps` (default 8) by asking the person. A tool step does not write a file.

Shared facts live in `.sdd/facts.jsonl`. `sdd fact set`, `get`, and `list` keep every line and return the newest value for a key. A value that repeats a constitution bullet and says to ignore, skip, or override it is not written. When a change is active, that refusal appends one unsigned `decision-needed` line.

`sdd role lesson add` records a lesson a person wrote. The next run for that bot includes it. `sdd role memory` prints the bot's memory. `sdd team migrate` moves legacy memory into the bot directory and prints each move.

A run with no team file stays one author call, then critique and revision when a section is in review. A name that is not a bot stays on that path too.

## Source

Issue #64 and the implementation plan on that issue. The research assistant, product manager, product owner, architect, dev lead, and QA proposed pieces of this reading. It is not an acceptance. The person accepts or corrects it.

## Product owner

The smaller reading, which left memory under `.sdd/role-runs/` and kept the critique path for every run, does not match the issue. This reading uses `.sdd/agents/<bot>/` for a bot's memory and replaces draft, critique, and revision only when the run is a bot.

Proposed checks, not a recorded decision: an empty fact is refused; a second set keeps the first line; a contradicting fact writes nothing; a lesson added once is in the next prompt; the loop logs its steps and asks at the step limit; a tool writes no file; old mode stays one author call; migrate moves a legacy file and leaves the inbox; delete removes the brain files and leaves the inbox.

## Non-goals

- Rooms (#65), evidence by SHA (#66), and the 13-stage sequence (#74).
- A bot tool that writes a product file or a fact. The tool step is a stub.
- Search hits inside the brain. The budget number comes from the search config. The pack does not open the search index.
- A model that decides whether a fact contradicts the constitution. The check is the bullet-and-word rule above. A paraphrase is stored.
- Rewriting solo, research, or `team-software.yaml`.
