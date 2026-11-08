# Design

> **Validate config with Zod 4** · `2026-11-08-validate-config-with-zod-4`

This is the architect's reading. The person has not signed it.

## Approach

Follow the Zod 4 migration guide for the calls that no longer typecheck or no longer behave the same.

`.default({})` on an object expects the output type, so an empty object is rejected. `.prefault({})` parses that empty object and applies the inner defaults, which is what Zod 3 did. A record default of `{}` stays `.default({})` once the key schema is `z.string()`, because an empty record is a valid output.

`z.record(value)` becomes `z.record(z.string(), value)`. `z.record(workType, id)` becomes `z.partialRecord` so a map may omit work types. `.strict()` becomes `z.strictObject`. A refine that passed `{ message }` passes `{ error }` with the same sentence.

`packages/core/src/zod-v3-messages.ts` installs one `z.config({ customError })` map. It rewrites the sentences people read (`Expected string, received boolean`, `Required`, `Invalid enum value…`, `Unrecognized key(s) in object: '…'`, `Invalid datetime`, `Invalid` for a regex). It does not put `received` back onto the issue object. Zod 4 dropped that field.

## Components / modules

`packages/core/package.json` pins `zod` at 4.6.6. `pnpm-lock.yaml` is the root record of that version, including the MCP SDK peer. Schemas live in `schemas.ts`, `mcp/types.ts`, `generated.ts`, `role/schema.ts`, `role/models/schema.ts`, and the team modules. `zod-compat.test.ts` locks the sentences, the empty-config defaults, the partial work-type map, and the two new rejections.

## Data flow

`loadConfig` still calls `ConfigSchema.parse`. A thrown `ZodError` is still printed as `error.message`. `formatTeamError` still reads `issues[0].message` and the path. The map runs when that message is read.

## Alternatives considered

Leaving the dependency on Zod 3 keeps the build green and leaves #92 failing. Importing `zod/v3` would not be the Zod 4 API the migration guide describes. Passing a fully filled object to `.default()` skips parsing, so a later inner default would not apply.

## Risks

A record key that fails validation is wrapped as `invalid_key`. The map copies the inner Zod 3 sentence onto that wrapper so `team.yaml` still reports the string-length sentence. An integer that does not fit in `Number` is now rejected. `Infinity` is now rejected on a bare number, including `config.version`.
