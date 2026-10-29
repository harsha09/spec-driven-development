# Clarify design

> **Issue 78 long model names** · architect seams checked against the reading. Not an acceptance.

The change is the object walk in `containsSecret`. `routing.ts` and `team.ts` stay. A long token in the `model` field would load. A PEM or a `TOKEN=value` assignment in that field still fails.
