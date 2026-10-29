# Feature

> **Accept a change id on sdd role room** · `2026-10-29-accept-a-change-id-on-sdd-role-room`

The product manager proposes this reading. The person has not signed it.

## Problem

`sdd role room` prints the active room. `sdd role room <change-id>` and `sdd role room --stage <stage>` stop with `Unknown command`. `post` is registered as a subcommand, so the first bare word is taken as a command name. This is issue #88.

## Scope

`sdd role room <change-id>` prints that change's room. `sdd role room --stage <stage>` and `sdd role room --stage=<stage>` print that stage. `sdd role room` with no extra words still prints the active room. `sdd role room post "<line>"` still appends a line. On `post`, `--change` and `--stage` still select the file. A post with no line still asks for TEXT and does not say `Unknown command`.

## Non-goals

No sandbox. No change to room review, evidence, or commit rules. Issue #54 stays open.

## Success

A room line can be printed by change id and by `--stage` as its own word. A post with no line still names TEXT.

## Reading

This file is a proposal. It is not an acceptance.
