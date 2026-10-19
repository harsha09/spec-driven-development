# Local test plan

> **Issue #37: role create, run, and the accuracy loop** · `2026-10-19-issue-37-role-create-run-and-the-accuracy-loop`

## Environment

From the repo root, run `pnpm test`, `pnpm typecheck`, and `pnpm lint`. Node on this machine is v20.19.3. The `EBADENGINE` warning for `engines.node >= 24` is expected. Do not publish, do not call a network, and do not set a real model command. Role tests pass a fake port. The CLI test points `SDD_ROLE_MODEL` at a local node script.

Branch: `feat/issue-37-role-agents` from `050e0b768e8a77c372bcc0f4617855f448ff958b`.

## Cases

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Empty job and illegal name | Create with a blank job, `../builder`, and an 81-character name. | Exit 1, no `.sdd/roles` file. |
| 2 | Hide, pin, duplicate | Pin one role, hide another, duplicate the pinned role after planting conversation and memory. | Default list omits the hidden role and lists the pin first. The copy is `<name> copy` and has no conversation or memory. The hidden file has no paused or routine field. |
| 3 | Delete | Delete one role that has a conversation, memory, and an allow.json key. | That role's files and key are gone. The other role and a product file stay. |
| 4 | Pre-model stops | Run with `--with` equal to the author, a task containing `@X`, `x.com`, or `twitter.com`, and `--kind code` with no accepted section. | No model call and no run file. The section sentence does not offer Allow once, Always allow, or Deny. |
| 5 | Reading | Run with no kind. | The model text is printed. `accepted.md` and `changes/.active` are unchanged. |
| 6 | Accuracy loop | Run `--kind code` with a different role and an accepted section. | Check ids are stored before the first call. Calls are author, critic, author. A bad cite stops at two calls. An empty gap list stops at two. A changed-set mismatch stops at three. Pass 4 does not start. |
| 7 | write_file | Allow once, always, and deny. Repeat the same inputs, then different inputs. Allow `notes/not-accepted.md`. Refuse `accepted.md`, `.active`, `.sdd`, `..`, and an absolute path. | Only a safe relative file is written. Always allow matches sorted JSON inputs. Deny writes nothing. |
| 8 | Ask first and timeout | Match an always-allow rule while ask-first is set. Allow after 10 minutes and with timeout 0. | The action stays stopped. An expired allow does not write a file or a rule. |
| 9 | Forbidden and git names | Return `accept_spec` and the other forbidden names. Allow `commit`, `push`, `tag`, `pull_request`, `merge`, and `deploy`. | Forbidden names are rejected with no pending stop. Git names record unavailable and do not run. |
| 10 | Stop | Apply `write_file`, then `sdd role run --stop`. | The file stays. The latest run gains a stopped line. No extra model call. |
| 11 | CLI | `sdd role create`, `show`, and `run` with `SDD_ROLE_MODEL`. `sdd agents install --help`. | Show prints `builder Builder`. Run prints the fake model's text. Help still says one host. |
| 12 | Init ignore | Fresh init and `--force` merge. | `.sdd/.gitignore` gains `role-runs/` after `models/`. `roles/` is not ignored. |

## Out of scope

- A page, connectors, routines, handoff between roles, and executing git.
- Closing issue #37.
- `packages/core/src/agents.ts`, `packages/core/src/report.ts`, and `createChange`.
