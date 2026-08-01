---
title: Everyday sdd loop
description: The daily Spec-Driven Development loop with sdd — new, next, refine, verify, complete — plus greenfield discovery and multi-PR checkout.
---

# Everyday loop

You already know the tool. You do not want to re-open the whole docs site every Monday.

This page is the **fixed rhythm**: same commands, same handoff to the agent, every change.

::: tip First time?
Use the [first change tutorial](../tutorials/first-change) once (includes a paste-ready intent sample), or the [simple feature](./simple-feature) / [enterprise](./enterprise) guides for larger work. **New product?** → [Greenfield](./greenfield).
:::

## The loop (delivery change)

```bash
sdd doctor               # optional: check setup
sdd new "…"              # start pack + handoff to agent
# or: sdd feature start F-001   # from greenfield backlog
sdd status               # where am I? (never launches agent)
# fill stage artifacts (human or agent) — use the path printed after new
sdd next                 # advance when stage is done
sdd refine               # optional: improve current stage + prior impact
# … repeat next until implement / verify …
sdd verify
sdd complete
```

## New product (discovery once)

```bash
sdd greenfield "one-line idea"
# fill vision → sdd next → requirements → features → architecture
sdd complete             # promotes into memory/
sdd feature list
sdd feature start F-001  # then use the delivery loop above
```

### Multiple PRs

```bash
sdd status --list
sdd checkout <change-id>
```

### Escape hatches

```bash
sdd skip design -r "not needed for copy tweak"
sdd use feature -r "scope grew"
sdd next --force   # sparingly
```

## Related

- [Greenfield](./greenfield)  
- [Refine mid-stage](./refine)  
- [CLI reference](../reference/cli)  
