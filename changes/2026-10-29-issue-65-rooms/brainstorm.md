# Brainstorm

> **Issue 65 rooms** · `2026-10-29-issue-65-rooms` · 2026-10-29

This is a proposal. The person has not accepted it.

Approach A keeps one critic and one revision inside `runRole`. That is the loop that already ships, and it is not a room.

Approach B asks the work router to pick members and stores a `waiting_human` status. The router returns a role, not a bot, and the status is not in the code.

Approach C is the one this change uses. The stage owner and `collaborates` are the members. Rounds stop at `room_rounds`. An open cap appends `decision-needed`. The shipped templates commit rooms unless the switch says otherwise.
