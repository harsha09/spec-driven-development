# sdd — Spec-Driven Development CLI for AI coding agents

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/harsha09)

sdd keeps a short note in the project, so the reason for a change is a file you can reopen. Copilot, Claude Code, Grok, Ollama, or Kilo Code can follow that folder later. Chat can help along the way.

**sdd** (**Structured Vibe Coding**, npm `@structured-vibe-coding/cli`) is a local Spec-Driven Development CLI. You set up a folder, start a change, write the note, move stage by stage, and finish.

| | |
|---|---|
| **Start here** | [First change](docs/tutorials/first-change.md) — one loop, about 10 minutes |
| **Docs site** | https://harsha09.github.io/spec-driven-development/ |
| **npm** | https://www.npmjs.com/package/@structured-vibe-coding/cli |
| **Needs** | Node 20+ (24 recommended) · about 10 minutes for the first loop |

This page matches CLI **0.25.0** (`sdd --version`). `npm view @structured-vibe-coding/cli version` prints the current npm release.

## Install and check the version

```bash
node --version
```

Node 20+ (24 recommended). `engines.node` is `>=20`. `sdd doctor` fails below Node 20. On Node 20–23 it warns and does not fail: Node 20–23 works but isn't recommended; Node 24 is recommended. This is not long-term support for Node 20. CI runs the test suite on Node 20 and Node 24.

Install once. This command follows the current npm release and is also the upgrade.

```bash
npm install -g --allow-scripts=better-sqlite3,onnxruntime-node @structured-vibe-coding/cli
```

Current npm skips dependency install scripts unless you allow them. Search needs `better-sqlite3`, and embeddings need `onnxruntime-node`. Without those scripts the packages install, but the native build is missing, and later commands fail with an error that does not mention npm. `sdd doctor` loads both modules and prints this install command when either one is missing or not built.

On Linux x64, `onnxruntime-node` also runs an installer that downloads an optional GPU archive. That archive can return 404. The CPU build is already in the package, and a failed GPU download does not stop this install. If `sdd doctor` still reports `onnxruntime-node` missing, reinstall the CPU build:

```bash
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install -g --allow-scripts=better-sqlite3,onnxruntime-node @structured-vibe-coding/cli
```

To allow the same scripts for later global installs, then install again:

```bash
npm config set allow-scripts=better-sqlite3,onnxruntime-node --location=user
```

The release this page was checked against:

```bash
npm install -g @structured-vibe-coding/cli@0.25.0
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
