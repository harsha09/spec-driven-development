# Tasks

> **Validate config with Zod 4** · `2026-11-08-validate-config-with-zod-4`

This list is a proposal. The person has not signed it. One developer.

- [x] Pin `zod` at 4.6.6 in `packages/core` and refresh the root lockfile.
- [x] Use `.prefault({})` for empty object defaults and two-argument `z.record` / `z.partialRecord` for maps.
- [x] Replace `.strict()` with `z.strictObject` and keep the printed validation sentences.
- [x] Cover the sentences, the defaults, the partial work-type map, and the two new rejections in Vitest.
