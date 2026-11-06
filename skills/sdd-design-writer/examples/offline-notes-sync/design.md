# Design

> **Hypothetical example.** Offline notes and later sync. This design is fiction for the skill pack. It is not a product spec, a customer, or an instruction to build this app.

## Approach

A person edits a note while the device has no network route. This design stores each note as a current snapshot plus an append-only operation log on the device. Each operation has a device id, a per-device sequence, and a wall time used only for display. Sync pushes the unacknowledged prefix of that device's log and pulls operations from other devices after a cursor. The server stores the log and refuses a gap in the sequence or a duplicate sequence whose body differs. A text operation whose base version is not the snapshot on the receiving device becomes a conflict record. The app shows both versions. It does not drop one. Delete wins over an edit that was based on the pre-delete snapshot. A later recreate that names the delete version starts a new snapshot. An edit that names an older version stays a conflict. Attachment bytes are named by a content hash and travel separately from the text log. The operation log with a visible conflict is the choice because a silent newest-timestamp rule deletes words the person typed, and this product has not named a merge library.

## Components / modules

| Component | Responsibility |
| --- | --- |
| Local note store | Keeps the snapshot, the operation log, and the unacknowledged prefix across a restart. |
| Sync client | Pushes the unacknowledged prefix and pulls operations after the cursor when a route exists. |
| Server log | Stores operations in sequence per device and rejects a gap or a mismatched duplicate. |
| Conflict record | Holds both versions until the person writes a resolve operation. It is not a silent merge. |
| Attachment store | Stores bytes by content hash. A missing hash does not block the text log. |

## Data flow

1. An edit appends one operation to the local log, updates the snapshot, and marks that sequence unacknowledged before the edit call returns.
2. When a route exists, the client pushes only the unacknowledged prefix, in sequence order, for that device.
3. The server accepts a contiguous prefix, stores it, and returns the acknowledgement plus operations this device has not applied.
4. The client applies a remote operation whose base matches the snapshot. A remote operation with a different base becomes a conflict record instead of an overwrite.
5. The person resolves a conflict by writing a new operation that names the conflict and the chosen text. That operation syncs like any other edit.

## Contracts

| Operation | Success | Rejection |
| --- | --- | --- |
| Append local edit | The operation is durable in the log and the snapshot shows the new text before the call returns. | The device cannot store the operation. No partial operation is left in the log. |
| Push prefix | The server acknowledges through a sequence and the client may drop those sequences from the unacknowledged prefix. | The prefix has a gap, or a sequence repeats with a different body. The stored log stays unchanged. |
| Pull after cursor | The client receives operations it has not applied and advances the cursor only after they are durable locally. | The cursor names a device the server no longer has. The client asks the person before dropping local history. |
| Put attachment | The bytes are stored under the content hash that the client computed. | The hash does not match the bytes, or the bytes exceed the size the person already set. |
| Resolve conflict | A new operation naming that conflict is stored and both old versions stay readable. | The conflict id is unknown. Neither version is deleted. |

## Alternatives considered

### Newest timestamp wins

Keeping the note with the later wall clock is short to explain, because the server stores one blob. A device whose clock is ahead can erase a paragraph typed offline on the other device, and the person never sees the lost text.

### Require a merge library

A character-level merge can combine two offline edits, because both sets of characters survive without a conflict screen. This product has not named that library in its configuration or its constitution. Requiring one would invent a dependency.

### Block editing while offline

Refusing edits without a route avoids conflicts, because there is only one writer. It also throws away the reason the person opened the note on the road. The offline edit has to be allowed.

Chosen: an operation log with a visible conflict, because a newest-timestamp rule can drop typed words and this product has not named a merge library.

## Edge cases

| Case | Handling |
| --- | --- |
| The person edits offline and the app is killed | The operation is durable before the edit call returns, so the text is still there after restart. |
| The note body is empty | The note still has an id and a log. Empty text is a real operation, not a missing note. |
| One device deletes the note and the other edits it | Both results stay visible as a conflict. Neither side is applied as the only copy. |
| The same device retries a push | The same sequence and the same body are acknowledged once. A different body for that sequence is rejected. |
| The device has no room for another operation | The edit is rejected locally. The log does not gain a partial operation. |
| The device clock jumps backwards | The per-device sequence still orders the log. Wall time is display only and does not decide a winner. |
| The text arrives and the attachment hash is not stored yet | The text syncs. The note shows the attachment as pending. The text is not rolled back. |

## Race conditions

| Race | Parties | Outcome |
| --- | --- | --- |
| Two devices edit the same note offline | Device A and device B | Both operations are stored. The receiver shows a conflict when the base versions differ and does not drop either text. |
| Push and pull overlap | The sync client and the server | The push sends only the unacknowledged prefix. The pull cursor does not move past operations this device has not stored. |
| Delete and a later recreate | Device A and device B | A recreate that names the delete version starts a new snapshot. A recreate that names an older version stays a visible conflict. |
| A retry races the first push | The sync client and the server | The matching duplicate is acknowledged once. The log does not store a second copy and the snapshot stays unchanged. |

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| A sync rule keeps only the newest blob | The person loses a paragraph typed on the other device | Store both operations and show a conflict until a resolve operation names the chosen text. |
| The unacknowledged prefix grows without a limit | The device fills and later edits fail | Cap the prefix and ask the person. Do not drop an unacknowledged operation to make room. |
| The server accepts a gap in the sequence | A later pull cannot rebuild the note | Reject a prefix that skips a sequence. Leave the stored log unchanged. |
| Text names an attachment hash that was never stored | The note looks complete while the bytes are missing | Sync the text anyway and show the attachment as pending until the hash is stored and checked. |

## Out of scope

- Live cursors, presence, and character-by-character collaboration.
- Sharing a note with a second account, and recovering a lost account.
- Rich-text layout, embedded apps, and plugin blocks.
- Choosing a storage engine or a vendor. The product configuration has not named one.

## Acceptance

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Edit with no route, force the app to quit, and open it again | The typed text is present and exactly one operation is unacknowledged. |
| 2 | A second device gains a route after that edit | The operation appears there once and a second pull does not duplicate it. |
| 3 | Both devices edit the same sentence while offline | Both versions stay visible. Neither version is dropped automatically. |
| 4 | The same push is retried with the same body | The server stores one operation and acknowledges it once. |
| 5 | One device deletes the note and the other edits it | A conflict is visible and both the delete and the edit can still be read. |
