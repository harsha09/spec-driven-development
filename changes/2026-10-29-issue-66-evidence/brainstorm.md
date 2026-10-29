# Brainstorm

> **Issue 66 evidence** · `2026-10-29-issue-66-evidence`

This is a proposal. The person has not signed it.

The issue text asks for read, search, code context, an allowlisted check in a temporary worktree, evidence at the SHA, a refusal of an unsupported pass claim, and a commit on the bot's own branch. Push and merge need a person. The panel kept that set.

A full sandbox with ports, boot, and waiver is issue #54. Putting `Closes #54` on this change would claim those exist. They do not.

Running the check in the live checkout would see uncommitted files and would not be the worktree the issue names. Replacing the evidence file on a second run would hide an earlier exit code, so a later run is appended and the latest exit is the one that counts.

Creating the bot branch from inside the tool would let a commit land somewhere the person did not check out. The tool refuses unless that branch is already current.
