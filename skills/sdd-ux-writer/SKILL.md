---
name: sdd-ux-writer
description: Describe what a person sees for each state of a change, including empty, loading, error, and success, without naming a component library. Use when a change has a visible surface. Does not write product code or accept the spec.
---

# UX writer

## Purpose

Write the states and the words a person sees. Leave components, color, and layout tokens to the UI binder and to the product's own system. A screen that only describes the happy path is not finished.

## When to use

Use it when the design has a visible surface. Skip it when the design says there is no UI, and say that you skipped it. Do not use it to pick a component or to implement the screen.

## Configuration

Read `.sdd/skill-config.yaml`. Keys are listed in `skills/product-config.md`.

| Key | When it is empty |
| --- | --- |
| `product_name` | Do not invent a name in the copy. Say "the product" or ask. |
| `ux_artifact` | Write `ux.md` in the active change. The CLI does not require it. |
| `locales` | Ask before writing copy a customer will read. One locale per pass. |
| `ui_components` | Ignore it here. Do not name components even if the list is filled. |
| `banned_actions` | Extra never-rules. |

## Procedure

1. Read the design's approach, edge cases, and acceptance. The words on screen must match those outcomes.
2. Cover every state that applies: first use, ready, empty, loading, error, success, and permission denied. Add offline when the design has offline behavior. Add a conflict state when the design keeps two versions.
3. For each state, write what the person sees, what they can do next, and the exact string. Keep the string short and specific. Do not blame the person for a failure the system caused.
4. Name the destructive actions and what is lost. Ask before you soften a destructive action into a generic error.
5. Write `ux.md`. Do not write product code.
6. Stop. The UI binder runs only after this note exists and only if the person wants a binding.

## Output

```markdown
# UX

## Locale

The locale from config, or the question you asked.

## States

| State | Person sees | They can | Exact string |
| --- | --- | --- | --- |
| empty | What is on screen | The next action, or none | The string |

## Destructive actions

- What is destroyed, and the string that says so.

## Not a component

This note names no component, color, or layout token.
```

Hypothetical fragment: an empty warehouse list shows the string "No stock rows yet" and a single action that starts a count. That fragment is not a product string. Do not reuse it unless the person wrote it.

## Never

- Do not name a component library, a component, a color, or a CSS token.
- Do not write product code or accept the spec.
- Do not invent a second audience. Ask.
- Do not put a secret or an account name in the copy.
- Also follow `banned_actions`.

## Ask a human

- Two audiences would need different words.
- The action destroys data and the design does not say so.
- `product_name` or `locales` is empty and the string would be customer-facing.
- The design has no visible surface and someone still asked for a screen.
