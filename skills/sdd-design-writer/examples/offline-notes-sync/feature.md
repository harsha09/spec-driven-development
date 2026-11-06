# Feature

> **Hypothetical example.** Offline notes on a phone or tablet. Fiction for the skill pack, not a product spec.

## Problem / opportunity

A person edits a note while the device has no route to the server. A later sync that keeps only the newest timestamp can drop the other device's paragraph.

## Users & value

The person needs the words they typed offline to still be there after a restart, and needs to see both versions when two devices disagreed.

## Scope

Save an edit on the device, push it when a route exists, pull other devices' edits, and keep a visible conflict instead of dropping one side.

## Non-goals

Live cursors, sharing with another account, and rich-text layout are out of this change.

## Success criteria

An offline edit survives a restart. After sync, a second device shows it once. Two offline edits of the same note stay visible until the person chooses.

## Risks / open questions

The product has not named a storage engine. The design describes the log and the conflict, not a vendor.
