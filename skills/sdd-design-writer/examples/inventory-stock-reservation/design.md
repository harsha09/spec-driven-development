# Design

> **Hypothetical example.** Inventory stock reservation for a multi-warehouse service. This design is fiction for the skill pack. It is not a product spec, a customer, or an instruction to build this system.

## Approach

Two buyers can read the same remaining quantity and both be told the sale is allowed. This design stops that by keeping one ledger row per warehouse and SKU, with on-hand units and reserved units, and by changing that row only with a compare-and-set on its version. A reservation is a separate row in the held state, with an expiry and the caller's idempotency key. Reserve increases reserved only when on-hand minus reserved is at least the requested quantity. Commit decreases both on-hand and reserved. Release decreases reserved and leaves on-hand alone. A sweeper releases a hold only when the row is still held and the server clock is past expiry. The same key always returns the first stored result, so a retry cannot move the counts twice. Payment, tax, and shipping stay with the caller. The ledger is the source of truth for availability because a lock on the whole warehouse would block unrelated SKUs, and subtracting from on-hand at reserve time would make a hold look like a completed sale.

## Components / modules

| Component | Responsibility |
| --- | --- |
| Reservation API | Accepts reserve, commit, and release, and stores the first result for each caller key. |
| Ledger row | Holds on-hand, reserved, and a version for one warehouse and one SKU. |
| Reservation row | Holds the quantity, the expiry, the caller key, and the state held, committed, or released. |
| Expiry sweeper | Releases a hold that is still held after its expiry, and does not touch a committed row. |
| Checkout caller | Decides when to commit or release after its own payment step. This design does not build that caller. |

## Data flow

1. The caller sends Reserve with the SKU, the warehouse, the quantity, a caller key, and the hold length in seconds.
2. The service loads the ledger row and rejects the call when on-hand minus reserved is below the quantity, or when the quantity is below one.
3. The service writes the reservation as held and increases reserved in the same compare-and-set, then stores that result under the caller key.
4. The caller later sends Commit or Release with the same key, or the sweeper releases the hold after expiry, and exactly one of those transitions runs.

## Contracts

| Operation | Success | Rejection |
| --- | --- | --- |
| Reserve | A held reservation, the new reserved count, and a stored result for that caller key. | Quantity below one, unknown SKU, unknown warehouse, or not enough available units. |
| Commit | State becomes committed, on-hand decreases by the quantity, and reserved decreases by the same quantity. | The key is unknown, the hold is not in held, or the hold is already expired. |
| Release | State becomes released and reserved decreases by the quantity. On-hand stays the same. | The hold is already committed, so the sale is not undone by release. |
| Repeat of the same key | The stored result is returned and the counts do not move again. | The new body disagrees with the first body for that key, and the first result stays. |

## Alternatives considered

### Lock the whole warehouse

A warehouse lock makes the count update easy to explain, because every reserve would wait its turn. It also stops reserves of other SKUs in that warehouse, including ones that do not share a row. Unrelated checkouts would queue behind one popular SKU.

### Decrement on-hand at reserve time

Subtracting from on-hand when the hold starts looks simple, because available and on-hand would be the same number. A cancelled hold and a finished sale would then look alike, and a report of units still on the shelf would be wrong until release added them back.

### An external lock service

A separate lock service can serialize one SKU, because the ledger would not need a version column. The product has not named such a service. Adding one would invent a dependency and a second failure mode when the lock is held and the process stops.

Chosen: compare-and-set on one ledger row, because a warehouse lock blocks unrelated SKUs and an on-hand decrement makes a hold look like a completed sale.

## Edge cases

| Case | Handling |
| --- | --- |
| Quantity is zero or negative | Reject the reserve. Do not write a reservation row and do not change the ledger. |
| The last unit is reserved at two warehouses | Each warehouse has its own ledger row. One warehouse being empty does not change the other row. |
| The same key is retried with a different quantity | Reject the second body as a mismatch. Keep and return the first stored result. |
| The SKU is removed while a hold is still held | Commit fails closed. The same transaction releases the hold so reserved does not stay raised. |
| A cycle count lowers on-hand below reserved | Reject the count that would make on-hand negative. Keep the hold. Ask the person which count is real. |
| The hold length is zero or longer than one day | Reject the reserve. The caller must send a hold length inside the allowed range. |

## Race conditions

| Race | Parties | Outcome |
| --- | --- | --- |
| Two reserves of the last unit | Checkout A and checkout B | Exactly one compare-and-set wins and holds the unit. The other reserve is rejected and the ledger is unchanged by that call. |
| Commit arrives as the hold expires | The caller and the expiry sweeper | Exactly one transition wins. The loser sees the row already committed or already released and does not move the counts again. |
| Release and commit for one hold | The caller and a second call from the caller | The first state change wins. The second call returns the current state and does not subtract reserved twice. |
| A retry after the first response was lost | The caller and the reservation API | The same key returns the stored result. The retry does not create a second hold and the counts stay unchanged. |

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| A lost response is treated as a failed commit | The caller retries and can move the counts twice if commit is not stored | Store the first result under the caller key and return that result on every repeat with the same body. |
| Server clock skew expires a live hold | The buyer has paid and the later commit is rejected | The caller commits only while the hold is unexpired. The sweeper uses the server clock. Document the maximum skew the caller must tolerate. |
| The sweeper and a commit deadlock | Holds stay reserved and available stock shrinks until a person intervenes | Take the ledger row and then the reservation row, in that order, and use compare-and-set rather than a second lock. |
| Reserved units are left out of the available math | The service oversells the shelf | Available is on-hand minus reserved, and both fields change in the same compare-and-set. |

## Out of scope

- Payment capture, refunds, and the caller's decision after a declined payment.
- Shipping labels, carrier choice, and delivery promises.
- Moving or reallocating units from one warehouse to another.
- Price, tax, and promotions. They do not change the ledger row.

## Acceptance

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Two concurrent reserves of one remaining unit | One hold is stored, the other call is rejected, on-hand is unchanged, and reserved is one. |
| 2 | Commit of a held reservation | The state is committed, on-hand decreases by the quantity, and reserved decreases by the same quantity. |
| 3 | The same commit key is retried after success | The second response equals the stored result and the counts stay unchanged. |
| 4 | The sweeper runs after expiry | The state is released, reserved decreases, and a later commit is rejected. |
| 5 | Reserve more units than are available | The call is rejected, no reservation row is stored, and both counts stay unchanged. |
