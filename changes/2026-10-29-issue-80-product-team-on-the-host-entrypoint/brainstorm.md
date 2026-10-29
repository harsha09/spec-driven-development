# Brainstorm

> **Issue 80 product team on the host entrypoint** · approaches compared before design. Not a final design, and not an acceptance.

The issue already names three options. This stage was skipped because option 1 is the recommendation.

## A. team.yaml order, otherwise role files by name

The block is generated from `.sdd/team.yaml` when that file loads, and from `.sdd/roles/*.md` in name order when it does not. Each line has the order, the role, its job, who accepts, and the role file.

Chosen. Role files alone do not record order.

## B. Append `sdd role show`, with no order

Enough to list names. Not enough to say who leads or who accepts.

Rejected for this change.

## C. Paste the roster into the constitution

The constitution is already on the required read list. It drifts the next time someone follows the generated protocol.

Rejected. The generated files are the entrypoint.
