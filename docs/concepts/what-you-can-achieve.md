---
title: What you can achieve with sdd
description: Practical outcomes with sdd — paper trail per change, new product plan, AI handoffs in git, light or heavy process on one CLI.
---

# What you can achieve with sdd

Not a feature list — **things you’ll notice in the repo** after a week.

## Outcomes

| Goal | How sdd helps |
|------|----------------|
| **Leave a paper trail** | Each task gets a short folder: intent, design, tasks, verify notes |
| **Start a new product** | One idea → vision, requirements, feature list, architecture in `memory/` |
| **Use AI without losing decisions** | The AI reads the same notes you commit |
| **Match process to risk** | Tiny fix stays short; big work can go deeper |
| **Stay local** | No cloud account for the process tool |
| **Share process with the team** | Workflows are files in git you can change |

## Day-to-day moves

- Start work: `sdd new "…"` or `sdd greenfield "…"`  
- Move on: fill a short file → `sdd next`  
- Check setup: `sdd doctor`  
- Finish: `sdd verify` → `sdd complete`  
- Switch work: `sdd checkout <id>`  

## By team size

| Context | Typical use |
|---------|-------------|
| **Solo / small** | Hotfix and features; optional greenfield for a personal MVP |
| **Product team** | Greenfield once for the product spine; then shared feature packs |
| **Enterprise** | Longer path with hard gates when you need them |

Same CLI — different paths.

## Related

- [Start in 10 minutes](../tutorials/first-change)  
- [New product](../guides/greenfield)  
- [Simple feature](../guides/simple-feature)  
- [Enterprise](../guides/enterprise)  
