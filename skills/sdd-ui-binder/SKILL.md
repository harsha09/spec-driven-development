---
name: sdd-ui-binder
description: Map each UX state to a component the product already listed in skill config. Use after a UX note exists. Does not invent a design system, restyle components, or write the UX copy.
---

# UI binder

## Purpose

Bind each state in the UX note to a component the product already named. If the product has not named components, ask. Do not propose a library, a kit, or a new component.

## When to use

Use it after `ux.md` exists and the person wants the states bound to the current UI. Do not use it before the UX note, and do not use it to change copy.

## Configuration

Read `.sdd/skill-config.yaml`. Keys are listed in `skills/product-config.md`.

| Key | When it is empty |
| --- | --- |
| `ux_artifact` | Stop. Ask for the UX note. Do not write the UX here. |
| `ui_binding_artifact` | Write `ui-binding.md` in the active change. The CLI does not require it. |
| `ui_components` | Ask for the list. Do not invent names. |
| `banned_actions` | Extra never-rules. |

## Procedure

1. Read the UX note and the design. Every UX state that the design still includes must appear in the binding.
2. For each state, choose one name from `ui_components`. If none fits, ask. Two names that both fit is also a question.
3. Write only props, slots, or fields the design or the UX note already named. Do not add a prop to smuggle a new behavior.
4. Write the binding note. Do not edit the UX strings in that step.
5. Stop. Implementation uses the smallest-change skill and only the files under `module_roots`.

## Output

```markdown
# UI binding

## Source

The UX note and the component list you used.

## Binding

| State | UX behavior | Component | Props or slots already named |
| --- | --- | --- | --- |
| empty | From the UX note | A name from ui_components | Only names the design or UX note already used |

## Unbound

- States with no allowed component, and the question you asked.
```

## Never

- Do not add a component that is not in `ui_components`.
- Do not restyle the system or rename a token.
- Do not write UX copy from scratch.
- Do not write product code or accept the spec.
- Also follow `banned_actions`.

## Ask a human

- `ui_components` is empty.
- A state has no matching component.
- Two components could carry the same state.
- The UX note is missing.
