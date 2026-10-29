# `@structured-vibe-coding/cli`

**sdd** (**Structured Vibe Coding**) — local **Spec-Driven Development CLI** for you and your **AI coding agent**.

Keep intent, design, and verify notes **in git**, not only in chat. Hotfix, greenfield product spine, or enterprise ARB — same CLI.

**npm:** https://www.npmjs.com/package/@structured-vibe-coding/cli  
**Docs:** https://harsha09.github.io/spec-driven-development/  
**Start:** https://harsha09.github.io/spec-driven-development/tutorials/first-change/

## Install

```bash
npm install -g @structured-vibe-coding/cli
# or
npx @structured-vibe-coding/cli --help
```

Binary: **`sdd`**

## Quick start

```bash
cd my-app
sdd setup --ai copilot          # or grok | claude | ollama | kilo
sdd go "Add expense CSV export"
# answer each question, then the next role drafts its stage
```

`sdd init --here --ai copilot` then `sdd new "…" -w feature -y` is the same host when you want to walk the stages yourself.

Setup writes three roles when the folder has none. The planner plans, the architect names the modules, and the builder builds the change pack. Each one follows the stages of the workflow you name, and `sdd go` hands the next stage to the next role. What they are, why that helps, and how to set up a software team: https://harsha09.github.io/spec-driven-development/guides/roles/

**New product:**

```bash
sdd greenfield "Team expense tracker for remote startups"
sdd backlog list && sdd backlog start F-001
```

## External MCP sources (sdd as client)

Attach org design systems, libraries, or AST engines so **sdd pulls context** at the right stage:

```bash
sdd mcp sources add \
  --id design-system \
  --command npx --arg -y --arg @acme/design-system-mcp \
  --stages design,implement \
  --tool search_components \
  --tool-arg query={{query}}

sdd mcp sources list
sdd mcp fetch --query "primary button"
```

See: https://harsha09.github.io/spec-driven-development/guides/mcp/

## Name a team (optional)

The quick start does not need this.

```bash
sdd team init --template software
sdd team show
sdd role room
sdd role room post "The list stays empty when the query is blank."
```

`sdd role room` prints the active change. `sdd role room --stage=<stage>` prints that stage. A change id in that position is read as a command. On `post`, `--change` and `--stage` select the file. A bot run can read, search, run one allowlisted check, write, and commit on its own branch. The check result is `changes/<id>/evidence/<sha>.json`. Push and merge stay with a person.

https://harsha09.github.io/spec-driven-development/reference/cli/

## Docs

| Topic | Link |
|-------|------|
| Start in 10 minutes | https://harsha09.github.io/spec-driven-development/tutorials/first-change/ |
| MCP sources | https://harsha09.github.io/spec-driven-development/guides/mcp/ |
| Simple feature | https://harsha09.github.io/spec-driven-development/guides/simple-feature/ |
| CLI | https://harsha09.github.io/spec-driven-development/reference/cli/ |
| Roles and duties | https://harsha09.github.io/spec-driven-development/guides/roles/ |

## License

MIT
