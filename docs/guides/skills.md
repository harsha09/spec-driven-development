---
title: Skill pack
description: Where the product-agnostic sdd skill pack lives, how a product supplies its own names and commands, and which procedures the shipped roles follow.
---

# Skill pack

The skill pack is a set of procedures an agent can follow when a change needs more than the short role file. The role files stay the routing contract. The pack does not replace them.

The recorded validation in `skills/sdd-design-writer/VALIDATION.md` used CLI **0.24.0** on Node.js **v24.22.2**. That run advanced the design examples with `sdd next` on a feature change. This page did not re-run it. The record is that runtime, not coverage of Node 20 or of every later Node release.

## Where it lives

The files are under `skills/` at the repository root. Each procedure is `skills/<name>/SKILL.md`.

That directory is the home for three reasons:

- **Init stays the same.** `packages/core/defaults/` is what `sdd init` copies into a product. The pack is optional, so it is not in defaults and init does not write `.sdd/skill-config.yaml`.
- **Host install stays the same.** `sdd agents install` still writes thin agents only. It does not copy this pack into a host skill folder.
- **The site stays the map.** A `SKILL.md` has its own front matter and is what an agent loads. This page is the human index. The skill text is not published as a second copy.

Start at `skills/README.md`. The npm package does not include that directory. Use a checkout of this repository, or copy the `skills/` folder next to the agent that should load it.

## What a product fills in

Names, extra bans, tools, component lists, and commands stay in the product repository, in `.sdd/skill-config.yaml`. The empty example is `skills/product-config.example.yaml`. Leave a key empty when you do not know it. The skill asks. The only assumed default is `authority: human`, which means the person, the same approver the shipped role files already use.

## Procedures

| Procedure | Use it when |
| --- | --- |
| `sdd-design-writer` | The stage is design, architecture, hld, or lld. The note must include contracts, edge cases, races, risks with mitigations, out of scope, and acceptance. |
| `sdd-acceptance-gate` | Implementation is done and someone must compare evidence to those acceptance rows. It does not sign. |
| `sdd-smallest-change` | The implement stage should change only what the accepted design requires. |
| `sdd-ux-writer` | A person will see the change. States and copy only. |
| `sdd-ui-binder` | Those states should be bound to components the product already listed. |
| `sdd-qa-writer` | Someone needs scenarios and the evidence to attach. The person records the result. |
| `sdd-constitution-interview` | The constitution is still a skeleton, or the person named one section to revise. |
| `sdd-default-roles` | You need to know which procedure the shipped planner, architect, builder, or software-team role follows. |

`sdd-default-roles` does not rewrite `.sdd/roles`. Planner, architect, and builder are still written by `sdd setup` when that folder is empty. Their `never` lists still hold: the planner and architect do not write product code, and the builder does not generate a release.

## Design writer

The bundled template remains approach, components, data flow, alternatives, and risks. The design writer keeps that material and requires the longer note. `sdd next` still only checks that the file is substantive. The pack's checker checks the headings and the tables:

```bash
node skills/sdd-design-writer/scripts/check-design.mjs path/to/design.md
```

Two hypothetical notes are checked in:

- `skills/sdd-design-writer/examples/inventory-stock-reservation/design.md`
- `skills/sdd-design-writer/examples/offline-notes-sync/design.md`

They are fiction. Do not copy one into a product and treat it as that product's design. The skeleton at `skills/sdd-design-writer/assets/design.md` fails the checker on purpose. Copy that skeleton over `.sdd/templates/design.md` only when the product wants new changes to start from it, and never over a template the product has already edited.

## Related

- [Roles and duties](./roles)
- [Simple feature](./simple-feature)
- [Folders](../reference/layout)
