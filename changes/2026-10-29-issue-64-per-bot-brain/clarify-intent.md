# Clarify intent

> **Issue 64 per-bot brain** · questions against the issue text. Not an acceptance.

## Q1. Where does memory live?

The issue names `.sdd/agents/<name>/memory.md` and also `memoryDir`, which is `.sdd/role-runs/memory/<name>`. Team mode uses the agents directory. The legacy path stays for a project with no team file. `sdd team migrate` moves the old files.

## Q2. Does the loop replace critique?

For a bot, yes. With no team file, critique and revision stay. The critique prompt text is unchanged.

## Q3. What is a contradicting fact?

A constitution bullet of at least 12 characters is inside the value, and the value says ignore, skip, or override. Anything else is stored. The check does not call a model.
