# Clarify design

> **Issue 63 SHA-bound sign-off** · architect seams checked against the reading. Not an acceptance.

The leave check parses the review file. Presence alone would let any file at that path open the gate. A role name or a verdict other than accept does not open it. Waive still opens it. Failed still blocks, even when the file is present.

`canLeaveStage` does not load the team for a feature workflow, because those gates do not list `human`. A missing `team.yaml` blocks only a human hard gate.

The architect asked to add the preparing roles to the acceptance approver list and not check them. The reading keeps the list equal to the check.
