# Brainstorm

> **Issue 63 SHA-bound sign-off** · approaches compared before design. Not a final design, and not an acceptance.

The issue names a generated decisions file, sha-bound reviews, and escalation. The panel compared three ways to meet the decided paragraph.

## A. Check the workflow gate

`gate.approvers` already lists `human` on the hard stages. `sdd next` reads that list and requires `reviews/<stage>-<sha>.md` from a human named in `team.yaml`. Always allow stores the same sha. `sdd role decide` only appends a request.

Chosen. It uses the matrix the workflow already ships.

## B. Generate `.sdd/decisions.yaml` from role files

A second file would copy approvers that the workflow and the role files already store. The two copies would drift. The product owner called a close dishonest if we claimed a matrix we do not check. Checking the workflow list is the check. Generating another file is not this change.

## C. Role signatures on acceptance

The issue example says the product manager, architect, and product owner prepare acceptance, then the person signs. Adding those names to `approvers` without a signature check would look like a rule the code ignores. A role is not allowed to sign. The names stay owner and collaborators. The approver list stays `human`.
