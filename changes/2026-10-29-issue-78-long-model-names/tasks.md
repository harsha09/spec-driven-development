# Tasks

> **Issue 78 long model names** · dev-lead proposal from the design seams. Not an acceptance.

1. Change only `containsSecret` in `packages/core/src/role/models/schema.ts`. When an object entry's key is exactly `model` and the value is a string, apply the PEM rule and the assignment rule only. Do not apply the length rule to that string. Every other string keeps all three rules. A `model` value that is not a string keeps the full walk.
2. Do not change `routing.ts`, `team.ts`, the error sentence `models.yaml has a secret value.`, or the CLI. The value is not printed.
3. Keep the existing `command_env` locks in `role-models.test.ts`: PEM, `TOKEN=<token>`, the bare token, and the 31-character allow. Add the long Ollama id on the `model` field, and PEM and `TOKEN=` inside that field.
4. Run `pnpm --filter @structured-vibe-coding/core exec vitest run src/__tests__/role-models.test.ts`.
