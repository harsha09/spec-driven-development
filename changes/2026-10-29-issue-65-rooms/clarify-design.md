# Clarify design

> **Issue 65 rooms** · `2026-10-29-issue-65-rooms`

This is a proposal. The person has not accepted it.

Where do the lines live? `.sdd/rooms/<change>/<stage>.jsonl`, and one summary line on `decisions.md`.

Which prompts? `critiquePrompt` for every member, and `revisionPrompt` for the owner when an objection is already open. The strings stay as they are.

What does the loop do? It reads a room that is already there and posts on `done`. It does not create the file.
