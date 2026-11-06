# Feature

> **Hypothetical example.** A multi-warehouse inventory service. Fiction for the skill pack, not a product spec.

## Problem / opportunity

Two checkouts can read the same remaining quantity and both be told the sale is allowed. The buyer then pays for a unit the warehouse no longer has.

## Users & value

A warehouse operator needs the available count to stay honest. A checkout caller needs a hold that either becomes a sale or returns the units.

## Scope

Reserve a quantity of one SKU at one warehouse, commit that hold, or release it. Retries of the same caller key return the first result.

## Non-goals

Payment, tax, shipping labels, and moving stock between warehouses are out of this change.

## Success criteria

One of two concurrent reserves of the last unit is held. The other is rejected. A retry does not move the counts a second time. An expired hold can be released once.

## Risks / open questions

The caller owns payment. This change does not decide what the caller does after a late commit fails.
