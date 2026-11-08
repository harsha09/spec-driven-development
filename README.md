# sdd — Spec-Driven Development CLI for AI coding agents

sdd keeps a short note in the project, so the reason for a change is a file you can reopen. Copilot, Claude Code, Grok, Ollama, or Kilo Code can follow that folder later. Chat can help along the way.

**sdd** (**Structured Vibe Coding**, npm `@structured-vibe-coding/cli`) is a local Spec-Driven Development CLI. You set up a folder, start a change, write the note, move stage by stage, and finish.

| | |
|---|---|
| **Start here** | [First change](docs/tutorials/first-change.md) — one loop, about 10 minutes |
| **Docs site** | https://harsha09.github.io/spec-driven-development/ |
| **npm** | https://www.npmjs.com/package/@structured-vibe-coding/cli |
| **Needs** | CLI 0.24.0: Node 24+. Next release: Node 20–23 works but isn't recommended; Node 24 is recommended · about 10 minutes for the first loop |

This page was checked against CLI **0.24.0** (`sdd --version`) on Node.js **24.22.2**, from source `9e96194ee002d434cb9f19f1e7109fad57343fc5`. `npm view @structured-vibe-coding/cli version` prints the current npm release. During the check it printed `0.24.0`. A later release can change that number.

## Install and check the version

```bash
node --version
```

**CLI 0.24.0, checked here.** `engines.node` is `>=24`. `sdd doctor` fails the Node line when the major is below 24. The detail is `v<version> (24+ required)`. Node.js v24.22.2 passed that line. Replace this paragraph when a released CLI changes the check.

Next release, not in CLI 0.24.0: Node 20–23 works but isn't recommended; Node 24 is recommended. Doctor warns on that range and fails only below Node 20. engines.node becomes `>=20`. The test suite runs on Node 20. This is not long-term support for Node 20. CI runs that suite on Node 20 and Node 24.

Install once. The first command follows the current npm release and is also the upgrade. The second command installs the release this page was checked against.

```bash
npm install -g @structured-vibe-coding/cli
```

```bash
npm install -g @structured-vibe-coding/cli@0.24.0
```

Then confirm what you have, and what the registry currently marks as latest:

```bash
sdd --version
npm view @structured-vibe-coding/cli version
```

Without a global install, run `npx @structured-vibe-coding/cli` wherever these pages say `sdd`.

## Who should open what next

### A person learning the process

Finish one small change with no AI window.

1. Follow [First change](docs/tutorials/first-change.md) once. It uses `--no-agent` the whole way.
2. After that, the everyday commands are `sdd status`, `sdd next`, and `sdd complete`.
3. When you want an AI host, install one: `sdd agents install --ai copilot` (or `grok`, `claude`, `ollama`, `kilo`).

### A coding bot, or a person driving one

Read the files. The change folder and the handoff are the record for the next session.

1. Read `changes/<id>/` and `.sdd/handoff.md`. Stage commands rewrite the handoff. `sdd setup` lists `handoff.md` in `.sdd/.gitignore`. The [first-change check](docs/tutorials/first-change.md) used a folder that was not a git repository and did not commit anything.
2. Run that same tutorial with `--no-agent` until the folder is set up. The change in the tutorial is simulated: no application code is edited, and verify records **NOT RUN**.
3. An AI **host** (Copilot, Grok, Claude, Ollama, or Kilo) is separate from `SDD_ROLE_MODEL`. The host is what `sdd agents install` prepares. `SDD_ROLE_MODEL` is an optional environment command a **role** can use when it should draft a stage note. The first tutorial needs neither.
4. Read flags in the [CLI reference](docs/reference/cli.md) before adding options. `sdd <command> --help` prints the flags for that command.

## Other pages

| I want to… | Open |
|------------|------|
| Finish the first loop | [First change](docs/tutorials/first-change.md) |
| Use the daily commands | [Everyday loop](docs/guides/everyday-loop.md) |
| Ship a normal feature | [Simple feature](docs/guides/simple-feature.md) |
| Start a product from one sentence | [Greenfield](docs/guides/greenfield.md) |
| Understand planner, architect, and builder | [Roles and duties](docs/guides/roles.md) |
| Look up a command | [CLI reference](docs/reference/cli.md) |
| Attach org MCP sources | [MCP guide](docs/guides/mcp.md) |
| Load the repository skill pack | [Skill pack](docs/guides/skills.md) |
| Read the roadmap | [ROADMAP.md](./ROADMAP.md) |
| Follow the enterprise path | [Enterprise](docs/guides/enterprise.md) |
| Build this repository | [Maintainer CI](docs/maintainers/ci-cd.md) |

Roles, team templates, and rooms wait until the first change is done. The roadmap, enterprise guide, and maintainer notes are linked above for later.

The skill pack is optional. It is the `skills/` directory in this repository. The npm package includes `dist`, the package readme, `package.json`, and `LICENSE`. `sdd init` and `sdd agents install` do not copy `skills/` into a project or a host folder. [Skill pack](docs/guides/skills.md) is the map.

## License

MIT
