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

## Tiny fix

```bash
sdd doctor
sdd new "Short title of the work" -w hotfix -y
sdd status
# edit the intent file sdd printed
sdd next
sdd next
sdd complete
```

`sdd verify` only says **PASS** when commands actually ran and all exited 0. With no
`verify.commands` configured (the default `commands: []`) it says **NOT RUN** and exits 1 —
that is not a failure of your code, it means nothing was checked automatically. Complete the
checklist in `local-test-results.md` by hand, or add commands to the stage in
`.sdd/workflows/<workflow>.yaml`. Only verify commands marked `required: true` block `sdd complete`. A required note, and a hard gate, also block it.

Without `-w`, most titles open `feature`. That path is not this two-step `sdd next`. Use [Simple feature](./simple-feature). On `feature`, fill `local-test-plan.md` and `local-test-results.md` before `sdd complete`.

From a product backlog after greenfield:

```bash
sdd backlog list
sdd backlog start F-001
# opens feature by default — fill both test files, then sdd complete
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
