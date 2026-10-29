# Design

> **Accept a change id on sdd role room** · `2026-10-29-accept-a-change-id-on-sdd-role-room`

The architect proposes these seams. The person has not signed this change.

## Module

`packages/cli/src/role-cmd.ts` owns the command. `showRoom` and `postRoom` stay as they are. Citty treats the first bare word after a command that has subcommands as a subcommand name. `room` drops that subcommand list. The first positional is a change id, or the word `post`. The second positional is the line. `--stage`, `--change`, `--type`, and `--cite` stay flags.

## Forms

`sdd role room` calls `showRoom` with the active change. `sdd role room <change-id>` passes that id. `sdd role room --stage <stage>` passes that stage either as `--stage <stage>` or `--stage=<stage>`. When the first word is `post` and the line is empty, the command exits 1 with `Missing required positional argument: TEXT`. When the first word is `post` and the line is present, the command calls `postRoom`.

## Out of this design

No merge command. No sandbox. No change to `reviewRoom`.
