# Customize workflows

> Change process shape without forking the engine.

One fixed pipeline is either too heavy or too light. YAML packs in `.sdd/workflows/` plus per-change `skip` / `use` keep hotfixes short and let enterprise keep ARB when needed.

## This change only

```bash
sdd skip clarify_intent -r "scope clear"
sdd use feature -r "grew past hotfix"
```

## Project defaults

`.sdd/config.yaml` holds paths, `archive_on_complete`, and recommend settings.

Ship your own pack by copying a default workflow and editing stages and artifacts.

## Related

- [Layout reference](../reference/layout)  
- [First change tutorial](../tutorials/first-change)  
