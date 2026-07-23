# Everyday loop

> **How-to:** Run the normal change lifecycle without rereading the whole README.

## Problem · Solution · Benefit

| | |
|--|--|
| **Problem** | You forget which command comes after implement. |
| **Solution** | A fixed loop: `new` → work → `next` → `verify` → `complete`. |
| **Benefit** | Muscle memory; agents get consistent handoffs. |

## What / When / How

| | |
|--|--|
| **What** | Process commands (`status` is inspect-only) |
| **When** | Every change pack |
| **How** | Shell commands below |

## Loop

```bash
sdd new "…"              # start pack (+ agent unless --no-agent)
sdd status               # where am I? (never launches agent)
# fill stage artifacts (human or agent)
sdd next                 # advance when stage is done
sdd refine               # optional: improve current stage + prior impact
# … repeat next until implement / verify …
sdd verify
sdd complete
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

## Now what

- [Refine mid-stage](/guides/refine)  
- [CLI reference](/reference/cli)  
