# Design

> **Issue 74 AIDLC sign-off sequence before merge**

The architect proposes these seams. The person has not signed them.

## Modules

| Piece | Change |
|-------|--------|
| `packages/core/defaults/workflows/team-software.yaml` | Twelve stages. Every gate is `type: hard` and `approvers: [human]`. |
| `packages/core/defaults/templates/qa-testing.md` | The QA testing note. It does not record a pass. |
| `packages/core/defaults/templates/signoff.md` | The page a role prepares for QA sign-off and product-owner sign-off. |
| `packages/core/src/role/signoff.ts` | Unchanged. The existing SHA check is the gate. |
| `docs/reference/workflows.md` | The stage list and the sign-off sentence. |

## Owners

product-manager owns requirements and clarifications. The architect owns hld, lld, and pr_review. The dev lead owns plan. QA owns test_plan, qa_testing, and qa_signoff. The developer owns implement. The product owner owns po_review and po_signoff. Collaborators do not sign.

## Leave a stage

Required artifacts must be substantive. Then `reviews/<stage>-<sha>.md` must match HEAD and name a human from `team.yaml`. `sdd gate approve` does not open the gate. `sdd gate waive` still does. A new commit voids the sign-off.

## Not in this change

Routing rules stay the skill rule only. Shipped role templates do not gain a stage list. The feature workflow used to build this change stays soft.
