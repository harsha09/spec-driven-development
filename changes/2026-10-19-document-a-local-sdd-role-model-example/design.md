# Design

> **Document a local SDD_ROLE_MODEL example** · `2026-10-19-document-a-local-sdd-role-model-example`

The sentences in `feature.md` are the contract.

## Script

`docs/examples/role-model.mjs` is a Node script. It reads stdin, parses one JSON object, and writes one JSON object. Branch on the prompt text in the feature.md order. Check ids are the non-empty lines after `Check ids:` and before the next label line. Gap cites are the text before `:` on each line under `Gaps:`.

## Docs and test

Add the command and the three rules to the `sdd role` section of `docs/reference/cli.md`. Do not edit the gitignore paragraph.

`packages/cli/src/__tests__/role-model-example.test.ts` spawns `node` on the script with three stdin payloads and asserts the JSON. It does not spawn `sdd`.
