# Documentation map

Parent page for **stable** project docs. Humans and coding agents: start here, then open only what you need.

| Kind | Where | Lifetime |
|------|--------|----------|
| **This map + memory** | `memory/*.md` | Long-lived |
| **Active change** | `changes/<id>/` (see `.sdd/active-context.md`) | Until complete |
| **Finished work** | `changes/<id>/` with `status: completed` | History (pack stays in place; archive is opt-in) |
| **Optional domains** | `domains/` | Long-lived by area |

## Stable docs

| Topic | File |
|-------|------|
| Product / vision | [product.md](product.md) |
| Constitution (non-negotiables) | [constitution.md](constitution.md) |
| Architecture | [architecture.md](architecture.md) |
| Coding & process conventions | [conventions.md](conventions.md) |

Add rows here when you introduce new durable docs (e.g. `security.md`, `ops.md`).

## Active work

1. Run `sdd status` (or open `.sdd/active-context.md`).
2. Read stage artifacts under the active change folder only.
3. Prefer small updates to change packs; **promote** lasting decisions into `memory/` after `sdd complete`.

## Ownership (suggested)

| Area | Owner |
|------|--------|
| `memory/*` | Tech lead / architect |
| Current `changes/<id>/` | Author of the change (PR owner) |
| `domains/<name>/` | Domain owner (if used) |

Keep this map short. Link out; do not paste large designs here.
