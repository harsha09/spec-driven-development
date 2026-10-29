# Feature

> **Issue 80 product team on the host entrypoint** · `2026-10-29-issue-80-product-team-on-the-host-entrypoint` · 2026-10-29

## Reading

When a repo has product roles, the files a fresh agent is told to read list each role, its one job, the order to run them, who accepts, and the role file. The person does not repeat the roster. The list comes from `.sdd/team.yaml` when that file exists, and from `.sdd/roles/*.md` in name order when it does not. The planner, implementer, and reviewer hats stay, and the text says they do not replace the team. A personal default team is used only when that repo has no team, and it does not replace a team the repo committed. A repo with no roles and no team file keeps today's entry. A later refresh keeps the team block while the role files remain. A hand edit is not required, because those generated files are filled in again only while they are still the tool's own text.

A role file that is present but cannot be read still counts as the repo's team. It is listed as not named, and a personal default does not step in.

## Source

Issue #80, as filed. The research assistant checked the files. The product manager proposes this reading. The product owner and the architect reviewed the same brief. It is not an acceptance. The person accepts or corrects it.

## Product owner

The issue already names the four files, the line, the stage hat, and the rule that a user-global team must not override a committed team. That request is one product.

Proposed checks, not a recorded decision:

- A repo with role files and a team order, after `sdd agents refresh`, has the team block in `AGENTS.md`, `.sdd/protocol.md`, the installed host rule, and the active-context handoff.
- A fresh agent that reads only those files can name each role, its job, the order, and who accepts.
- The stage hat is still described, and the text says it does not replace the team.
- A repo with no `.sdd/roles/` and no `.sdd/team.yaml` keeps today's entrypoint. A user default may apply only in that case.
- A user-global team does not override a repo team, including a role file that does not parse.
- Regenerating an unmodified protocol does not drop the team block while the role files remain. An edited generated file is left alone.

## Non-goals

- No new role runner. This does not reopen #37, #58, or #61.
- Host stubs and product roles stay two lists.
- This change does not choose a product's roster. The product repo commits its own `team.yaml` and role files.
- A role still cannot accept a spec, record a QA result, or generate a release.
