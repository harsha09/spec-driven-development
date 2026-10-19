# Local test results

> **Hand off work and the task network** · `2026-10-19-hand-off-work-and-the-task-network`

| # | Result |
|---|--------|
| 1 | PASS. Messaging off writes no conversation and keeps `approval_timeout_minutes: 10`. |
| 2 | PASS. Same-role handoff exits 1 and calls no model. |
| 3 | PASS. Receiver call, shared handoff object, sender summary, and deny on the shared run id. |
| 4 | PASS. `One owner handles this section.` |
| 5 | PASS. Frontend and backend prose prints `One scope. No lead.` |
| 6 | PASS. `Service billing runs billing-builder.` and no plan file. |
| 7 | PASS. Connection owners and the `D-link` handoff object. Decision text is unchanged. |
| 8 | PASS. Depth 3 writes no file. Accept is required before a specialist call. |
| 9 | PASS. Child then parent. The plan file has the two summaries and no transcript. `notes/child.md` is absent. |
| 10 | PASS. Waiting sentence, stalled plan, second rebuild refused. |
| 11 | PASS in the product-lead test. The model role id is `product-lead`. |
| 12 | PASS. Two services with no module do not call the model. |
| 13 | PASS. `changes_path: .sdd/changes` supplies the owner. |
| 14 | PASS. CLI messaging off and the self handoff sentence. |
| 15 | PASS. `pnpm test` exited 0 under `sdd verify`. |
| 16 | PASS. Duplicate `owner:` lines print once, and the billing log has one handoff. |
| 17 | PASS. `service: billing` after `service: other` selects the connection and calls no model. |
| 18 | PASS. A service with no module still asks `product-lead` when two module ids are present. |
| 19 | PASS. Rebuild prints `This product needs a lead.` and does not call the model. |
| 20 | PASS. Swapped artifact ids stall and leave `notes/a.md` before `notes/b.md`. |
| 21 | PASS. The side node is called once, the billing node still runs, and a missing owner keeps `exp done`. |

---

## Latest run (2026-10-19T15:10:29.096Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="f6dd94b4ab8cf453a78372743512d04b10b79ab3" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)

---

## Latest run (2026-10-19T15:25:08.731Z)

> Overall: PASS
> Stage: local_verify
<!-- sdd:verify stage="local_verify" head_sha="f6dd94b4ab8cf453a78372743512d04b10b79ab3" result_count="1" -->

- **Workspace tests**: exit 0 (`pnpm test`)
