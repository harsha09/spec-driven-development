# Design

> **Issue 78 long model names** · `2026-10-29-issue-78-long-model-names`

## Approach

Change only the object walk in `containsSecret` in `packages/core/src/role/models/schema.ts`. Today that walk uses `Object.values`, so it never sees keys, and every string goes through all three `looksSecret` rules before schema parse.

When the walk sees an entry whose key is exactly `model` and whose value is a string, apply the PEM rule and the assignment rule only. Every other string keeps all three rules. A `model` value that is not a string is walked with the full check.

`loadModels` still returns `{ error: "models.yaml has a secret value." }` before schema parse, and the value stays out of that sentence. `checkTeam` and `routeRole` stay callers.

## Seams

| Piece | Change |
|---|---|
| `containsSecret` | Object entries, not `Object.values`. Key `model` plus a string: PEM and assignment only |
| `looksSecret` | Unchanged for every other string |
| `loadModels` | Same sentence, still before schema parse |
| `checkTeam` and `routeRole` | Unchanged. A secret is still exit 1 |
| `role-models.test.ts` | Keep the command_env locks. Add the long model id, and PEM and `TOKEN=` inside `model` |

## Risks

A long token stored in the `model` field would now load. The exemption is the key name `model` anywhere in the raw document, because the check runs before the schema and does not know `provider`. A PEM or a `TOKEN=value` assignment in the `model` field still fails, and the value is still not in the message. A long id copied into any other string still fails the length rule.
