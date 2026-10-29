# Feature

> **Roles follow the workflow you name** · `2026-10-29-roles-follow-the-workflow-you-name` · 2026-10-29

This is a proposal. The person has not signed it.

## Problem

A software team is presented as one fixed stage sequence: `team-software`, requirements through acceptance. The shipped routing file sends those stage ids to the six template roles. A role the person creates has no way to follow `feature`, `hotfix`, `patch`, `greenfield`, `spike`, or `enterprise-feature`.

## Users

A person who creates the roles they want and starts a change with `sdd new -w <workflow>`.

## Scope

A role file lists `stages`. `sdd role create` and `sdd role edit` take `--stages`. `sdd role route` uses that list for the active stage of whatever workflow the change uses. Two roles listing the same stage ask the person. When no role lists the stage, a workflow that already names an owner still uses that owner. A room with no workflow owner uses the roles that list the stage. The software template routing file keeps the lead skill and drops the stage-id rules. The docs say `team-software` is one stage pack.

## Out of this change

`team-software.yaml` stays, including its stage owners and hard gates. Issue #88 and issue #54 stay open. No new workflow. No automatic guess that maps a job title onto stage ids.

## Success

On a `feature` change, a role whose stages include `intent` is the route for that stage. The software template no longer routes `implement` by a baked stage rule.
