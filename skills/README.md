# Skill pack

Product-agnostic procedures for agents that work with **sdd** (Spec-Driven Development CLI, `@structured-vibe-coding/cli`). The pack is MIT, the same license as this repository.

The CLI role files stay short on purpose. They record the job, what the role never does, and the questions a person answers. This pack is the working procedure for a design, an acceptance gate, a smallest change, UX copy, a UI binding, QA scenarios, a constitution interview, and the mapping from those procedures back to the shipped duties.

## Why this directory

`skills/<name>/SKILL.md` is the file an agent loads. It stays at the repository root so that:

- `sdd init` does not copy it into a product. `packages/core/defaults/` is what init copies, and that behavior is unchanged.
- `sdd agents install` does not copy it into a host folder. Host install still writes thin agents only.
- The docs site does not publish the skill front matter as a page. The human map is [docs/guides/skills.md](../docs/guides/skills.md).

The npm package does not include this directory. Use a checkout of the repository, or copy `skills/` next to the agent that should load it. A product that wants one skill points its agent at that `SKILL.md`, or copies that one folder into the agent's skill directory. Product names, extra bans, tools, and commands belong in the product's `.sdd/skill-config.yaml`, not in these files. See [product-config.md](product-config.md).

## Skills

| Skill | Procedure |
| --- | --- |
| [sdd-design-writer](sdd-design-writer/SKILL.md) | Finished `design.md`, including races, edge cases, and risks with mitigations. |
| [sdd-acceptance-gate](sdd-acceptance-gate/SKILL.md) | Compare evidence to acceptance rows. Do not sign. |
| [sdd-smallest-change](sdd-smallest-change/SKILL.md) | Implement only the accepted design. |
| [sdd-ux-writer](sdd-ux-writer/SKILL.md) | States and copy. No component library. |
| [sdd-ui-binder](sdd-ui-binder/SKILL.md) | Bind those states to components the product already listed. |
| [sdd-qa-writer](sdd-qa-writer/SKILL.md) | Scenarios and evidence to attach. The person records the result. |
| [sdd-constitution-interview](sdd-constitution-interview/SKILL.md) | Fill the constitution from the person's answers, one section at a time. |
| [sdd-default-roles](sdd-default-roles/SKILL.md) | Which procedure the shipped planner, architect, builder, and software roles follow. |

## Check a design

From a checkout of this repository:

```bash
node skills/sdd-design-writer/scripts/check-design.mjs path/to/design.md
```

The two hypothetical examples under `skills/sdd-design-writer/examples/` pass. The skeleton `skills/sdd-design-writer/assets/design.md` fails. Re-run the CLI evidence with:

```bash
node skills/sdd-design-writer/scripts/validate-examples.mjs
```

That script needs the built CLI at `packages/cli/dist/index.js`, or `sdd` 0.24.0 on `PATH`. Node 20+ (Node 24 recommended because Node 20 is past upstream end of life).

## Tests

```bash
node --test skills/sdd-design-writer/scripts/check-design.test.mjs
```
