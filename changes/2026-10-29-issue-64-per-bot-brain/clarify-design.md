# Clarify design

> **Issue 64 per-bot brain** · seams checked against the reading. Not an acceptance.

The brain does not import `packHits` or the search index. It uses `countTokens` and the search budget number. `deleteRole` does not remove `inbox.jsonl`. `setFact` returns a command result and does not call `decide()`. Ask does not set a gate.
