# Everyday loop

> Run the normal change lifecycle without rereading the whole site.

You shouldn’t have to relearn which command comes after implement. Use one fixed loop so handoffs stay consistent for you and the agent.

## The loop

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

## Related

- [Refine mid-stage](/guides/refine)  
- [CLI reference](/reference/cli)  
