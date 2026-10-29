# Brainstorm

> **Issue 78 long model names** · approaches compared before design. Not a final design, and not an acceptance.

The issue names the field and the two shapes that must stay rejected. This stage records that comparison. The `model` key is the one this change builds.

## A. Skip the length rule on the `model` key

PEM and `name=value` stay on every string. The 32-character rule stays on every other field.

Chosen. The long Ollama id loads. A PEM or an assignment in that field still fails.

## B. Raise the 32-character bound

A higher bound would also let a longer token through on `command_env` and every other field. Issue #62 locked 32 so the check stays testable.

Rejected for this change.

## C. Drop the length rule

PEM and assignments would remain. A bare token of 32 characters would load in any field.

Rejected. The existing token test stays.
