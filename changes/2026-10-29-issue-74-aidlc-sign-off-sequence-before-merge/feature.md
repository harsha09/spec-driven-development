# Feature

> **Issue 74 AIDLC sign-off sequence before merge** · `2026-10-29-issue-74-aidlc-sign-off-sequence-before-merge`

The product manager proposes this reading. The person has not signed it.

## Problem

`team-software` stops for a person on requirements and on acceptance. Clarifications, high-level design, low-level design, plan approval, the test plan, development, pull-request review, QA testing, QA sign-off, and the product-owner review do not each wait for that person's words on the current commit.

## Scope

Extend `team-software` so the stages are, in order: requirements, clarifications, hld, lld, plan, test_plan, implement, pr_review, qa_testing, qa_signoff, po_review, po_signoff. Each gate is hard and its approver is `human`. `sdd next` leaves a stage only after `sdd team signoff` matches HEAD. QA sign-off and product-owner sign-off store that person's words and the git SHA. A role prepares the page and does not sign. The plan stage still writes `tasks/T-001.md`, and implement still opens one item per task file. Merge stays a person action after `po_signoff`.

## Non-goals

No new workflow. `enterprise-feature` stays the ARB pack. No sandbox, so issue #54 stays open. Issue #88 stays open. A role does not merge.

## Success

A change on `team-software` cannot leave any stage until the named person signs that commit. The review file `reviews/R-001.md` stays intact when the sign-off file is written beside it.

## Reading

Issue #74, as filed. Research, the product manager, the product owner, the architect, the dev lead, and QA each have a stage in this sequence. This file is not an acceptance.
