# Local test plan

> **Hand off work and the task network** · `2026-10-19-hand-off-work-and-the-task-network`

Node v20.19.3. Branch `story/issue-37/S-004` from main `f6dd94b`. The `EBADENGINE` warning for `engines.node >= 24` is expected. No network.

| # | Check | Expected |
|---|--------|----------|
| 1 | Messaging off, then on | Off blocks the handoff with no model call and no conversation file. The timeout value stays. On writes `role_messaging: true`. |
| 2 | Handoff to the same role | Exit 1. `A role cannot hand off to itself.` No model call. |
| 3 | Handoff to the section owner | One model call as the receiver. Both logs share the handoff object. The sender log stores only the summary. The file is not written. Allow can still see the receiver stop. |
| 4 | Receiver is not an owner | `One owner handles this section.` |
| 5 | No service lines | `One scope. No lead.` No plan file. |
| 6 | One service | `Service billing runs billing-builder.` No plan file. |
| 7 | Accepted connection | `Connection hands off. Lead is absent.` Both logs cite the connection decision. `accepted.md` is unchanged. |
| 8 | Depth 3, then a valid plan | The deep reply writes no file. The valid reply waits for accept. Run before accept does not call a specialist. |
| 9 | Run after accept | The child runs, then the parent, in one command. The plan stores summaries and no transcript. The write stays stopped. |
| 10 | Unmet `after` and rebuild | The waiting node is not called. A same-artifact rebuild keeps the nodes and stalls. The next rebuild does not call the model. |
| 11 | Two modules | The model role id is `product-lead`. |
| 12 | Two services and no module | `One scope. No lead.` No model call. |
| 13 | Custom `changes_path` | The layout copy is read. The repo-root copy is not. |
| 14 | CLI | `sdd role messaging off` and a self handoff print the spec sentences. |
| 15 | `pnpm test` | Pass. |
| 16 | Repeated connection owners | Each owner is printed once. The pair is not a handoff to the same role. |
| 17 | A later `service:` id is on the connection | `Connection hands off. Lead is absent.` No model call. |
| 18 | Two module ids, and one service with no module | The model role id is `product-lead`. |
| 19 | Product `lead:` removed before rebuild | `This product needs a lead.` The model is not called again. |
| 20 | Same artifact ids in a different order | `Stopped. The plan made no progress.` The stored node order stays. |
| 21 | One run, then a missing owner | Each ready node is called once. A node that becomes ready still runs. A missing owner keeps the earlier result. |
