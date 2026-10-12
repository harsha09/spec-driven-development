# SDD Friction Log

| Step | Observation | Resolution |
|------|-------------|------------|
| Repository setup | The main checkout contains an unrelated untracked SDD change pack | Use a clean worktree based on the latest `origin/main` (`e687749`) and leave existing state untouched |
| Local CLI invocation | `pnpm sdd -- init --here --no-agent` changes cwd to `packages/cli` | Invoke `node packages/cli/dist/index.js` from the repository root; remove only the accidentally generated nested scaffolding |
| Runtime | The default shell uses Node 20, but packages declare Node 24 | Use the installed Node 24 runtime for validation without changing engine policy (#13 is out of scope) |
| Baseline | `pnpm test` on Node 24 passes 120 core tests and 16 CLI tests before product edits | Add regression cases for each of the six defects rather than relying on the existing suite |
| Verification | The shipped patch workflow has no verify commands | Configure build, typecheck, lint, tests, and CLI smoke as required local checks before running SDD verify |
| Publication | Git over SSH works, but `gh` initially has no authenticated session | GitHub CLI authentication is required to create the requested PR; no credential is stored in the change pack |

Issue #15 is deliberately excluded because PR #18 already exists. Enhancement requests and unrelated existing work are not part of this change.
