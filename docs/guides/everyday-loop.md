---
title: Everyday sdd loop
description: Daily commands for sdd — start work, check status, move stages, verify, and finish. Simple cheat sheet.
---

# Everyday loop

A one-page cheat sheet. Same commands every day.

::: tip First time here?
Do the [10-minute tutorial](../tutorials/first-change) once first. It includes a paste-ready example.
:::

---

## Normal work (a fix or a feature)

```bash
sdd doctor                    # optional: is my setup ok?
sdd new "Short title of the work" -y
sdd status                    # where am I? (never opens the AI)

# Open the file path sdd printed. Write a few real sentences.
# Or let the AI draft them if it opened.

sdd next                      # move to the next step when ready
# … repeat sdd next as stages complete …

sdd verify                    # when you’re on the verify step
sdd complete                  # mark this work done
```

From a product backlog after greenfield:

```bash
sdd backlog list
sdd backlog start F-001
# then the same next → verify → complete loop
```

(`sdd new "…"` is for free-form titles; `sdd backlog start` is only for `F-001` rows in `memory/features.md`.)

---

## New product (once)

```bash
sdd greenfield "One sentence product idea"
# fill vision → sdd next → requirements → features → architecture
sdd complete
sdd backlog list
sdd backlog start F-001
```

Details: [Greenfield guide](./greenfield).

---

## Several things at once

```bash
sdd status --list             # see open work
sdd checkout <change-id>      # switch which one is active
```

---

## Escape hatches

```bash
sdd skip design -r "not needed for this small change"
sdd use feature -r "this grew bigger than a hotfix"
sdd next --force              # rare: skip checks (use carefully)
sdd next --no-agent           # move stages without launching AI
```

---

## Related

- [Simple feature](./simple-feature)  
- [Greenfield](./greenfield)  
- [CLI reference](../reference/cli)  
