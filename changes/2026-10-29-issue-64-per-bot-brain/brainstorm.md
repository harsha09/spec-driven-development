# Brainstorm

> **Issue 64 per-bot brain** · approaches. Not an acceptance.

## A. Facts and a prompt prefix only

Keep one model call. Store facts. Put memory in front of the author prompt. Leave critique in place for every run.

Rejected for the close. The issue asks for a loop, and the product owner said this would not match the request.

## B. Replace critique for every run

Every `runRole` becomes the step loop, including projects with no team file.

Rejected. `role.test.ts` locks the one-call reading and the critique prompt. The implementation plan says old mode stays.

## C. Team mode uses the loop

No team file keeps today's path. A bot loads `.sdd/agents/<bot>/` memory, facts, and lessons, then runs the step loop. Migrate moves the legacy files.

Chosen. It matches the implementation plan on the issue and leaves the old tests on the old path.
