# Tasks

> **Issue 59 role and team config** · `2026-10-23-issue-59-role-and-team-config`

1. Add the role list fields to the parser and the renderer. Omit empty lists.
2. Add `TeamSchema` and `sdd team init` / `sdd team show`.
3. Ship the software, solo, and research templates under `packages/core/defaults/teams/`.
4. Add `sdd role create <name> --template <id>`, including the ambiguous `developer` name.
5. Add Owns, Never, Checks, and Ask when to the four host stubs.
6. Cover init, refuse-on-existing, template create, plain roles, invalid team files, and the stub lines with Vitest. Document the commands in `docs/reference/cli.md`.
