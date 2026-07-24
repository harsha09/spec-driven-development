# What you can achieve with sdd

## For any team size

| Goal | How sdd helps |
|------|----------------|
| **Ship with a paper trail** | Each PR/task gets a change pack: intent, design, tasks, verify notes |
| **Use AI without losing decisions** | Agents read live context + protocol; specs stay in git |
| **Match ceremony to risk** | Hotfix in 3 stages; full feature or enterprise ARB when needed |
| **Stay local** | No cloud account for the process tool itself |
| **Standardize process in the repo** | Workflows are YAML your org can fork and version |

## Concrete outcomes

- Start a change: `sdd new "…"` → recommended or chosen workflow  
- Move through stages: fill markdown → `sdd next`  
- Improve specs anytime: `sdd refine` (stage-scoped; constitution read-only)  
- Give agents focused code: `sdd context` (AST slices for TS/JS)  
- Verify on the laptop: `sdd verify`  
- Close work: `sdd complete` (pack stays under `changes/` by default)  
- Switch concurrent work: `sdd checkout <id>`  
- Check setup: `sdd doctor`  

## Solo vs product team vs enterprise

| Context | Typical use |
|---------|-------------|
| **Solo / small team** | `hotfix` or `feature`, optional agent launch, light memory |
| **Product team** | Shared `feature` / `patch` packs, constitution in `memory/`, PR review of packs |
| **Enterprise** | `enterprise-feature` (ARB, LLD, DB, research, stories), hard gates, skip flags for N/A stages |

Same CLI — different **workflow packs** and policy in YAML.

## Related

- [Simple feature](../guides/simple-feature)  
- [Enterprise path](../guides/enterprise)  
- [Built-in workflows](../reference/workflows)  
