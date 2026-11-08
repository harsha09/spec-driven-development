# Feature

> **Validate config with Zod 4** · `2026-11-08-validate-config-with-zod-4` · 2026-11-08

This is the product manager's reading. The person has not signed it. A role does not accept it.

## Problem / opportunity

Dependabot pull request #92 moves `zod` from 3.25.76 to 4.6.6. The declaration build of `@structured-vibe-coding/core` fails, so the package never reaches tests. Config, workflow, and team files still have to parse to the same values, and the sentences people already see have to stay.

## Users & value

A person who keeps a `.sdd/config.yaml`, a workflow, or a `team.yaml`. An empty config still fills the same defaults. A bad value still prints the same sentence, such as `Expected string, received boolean` or `team.yaml is invalid: …`.

## Scope

`packages/core` depends on `zod` 4.6.6. The root `pnpm-lock.yaml` records that same version for core and for `@modelcontextprotocol/sdk`. Empty object defaults use `.prefault({})`. `z.record` takes a key schema and a value schema. A work-type map stays partial. Strict objects use `z.strictObject`. Zod 4 issue sentences are rewritten to the Zod 3 wording before they are printed.

## Non-goals

Closing #92. Publishing npm. Tagging a release. Adding `z.string().email()`, `.catch()`, `.passthrough()`, `.format()`, or `.flatten()`. Accepting the spec.

## Success criteria

- `pnpm build` emits `packages/core/dist/index.d.ts`.
- `pnpm typecheck` and `pnpm test` pass. Existing tests stay unchanged.
- `ConfigSchema.parse({})` returns the same defaults as Zod 3.
- A bad `memory_path` still says `Expected string, received boolean`.
- The licence of `zod@4.6.6` is still MIT.

## Risks / open questions

Zod 4 issue objects do not include `received`. The printed JSON around a config error therefore differs even when the sentence matches. `z.number()` now rejects `Infinity`, and `z.number().int()` rejects an integer past `Number.MAX_SAFE_INTEGER`. Those two rejections are covered by a test.
