# CI/CD

GitHub Actions pipelines for continuous integration and **manual-only npm releases**. No push, merge, tag or GitHub Release ever publishes to npm.

## Runtime

- **Node.js 24** everywhere: app `engines` (`>=24`), local develop, and GitHub Actions
- Actions: `actions/setup-node@v5`, `actions/checkout@v5`, `upload-artifact@v5`, `softprops/action-gh-release@v3` (Node 24 runtimes)
- **pnpm**: `pnpm/action-setup@v4` **before** `setup-node`, with `package-manager-cache: false`  
  (`setup-node@v5` otherwise looks for `pnpm` too early and fails with “Unable to locate executable file: pnpm”)

## Local pre-commit (husky)

After `pnpm install`, a **pre-commit** hook runs `pnpm typecheck` so unused imports / TS errors fail before push (same gate as CI typecheck). Config lives in repo root `.husky/pre-commit`. Skip once with `git commit --no-verify` or `HUSKY=0`.

## Workflows

| Workflow | File (repo root) | When | What |
|----------|------------------|------|------|
| **CI** | `.github/workflows/ci.yml` | PR / push to `main` | Build, test, typecheck, CLI smoke, npm pack dry-run. No secrets, never publishes |
| **Docs site** | `.github/workflows/docs.yml` | Push to `main` affecting `docs/**` | VitePress → GitHub Pages (`gh-pages`). Never touches npm |
| **Release (manual)** | `.github/workflows/release.yml` | **Manual only** (`workflow_dispatch`) | Verify QA-passed `sha` → bump → test → **npm publish** → release commit + tag → GitHub Release |

`release.yml` is the **only** workflow that can publish to npm, and it has no `push`, tag or `release` trigger. The old `release-on-push.yml` (auto-publish on every push to `main`) was removed.

## Manual release (the only way to publish)

### Before you run it

1. QA passes the packed tarballs built from a specific commit on `main` (see "Build from a SHA" below).
2. That commit must be **`main` HEAD**. If anything landed after it, QA the new HEAD first.

### Run

**Actions → Release (manual) → Run workflow**, with the branch set to **`main`**:

| Input | Required | Meaning |
|-------|----------|---------|
| `sha` | **yes** | Full 40-character commit SHA that QA passed. Must equal `main` HEAD when you dispatch |
| `bump` | no (`auto`) | `auto` (conventional commits since the last tag), `patch`, `minor`, `major` |
| `npm_tag` | no (`latest`) | npm dist-tag |
| `dry_run` | no (`false`) | Runs the gates, bump, build, test and smoke only. No npm publish, push, tag or GitHub Release |

CLI equivalent:

```bash
gh workflow run release.yml --repo harsha09/spec-driven-development --ref main \
  -f sha=<40-char QA-passed sha> -f bump=auto
```

### What it checks, then does

```text
dispatched from main?                         else fail
sha is 40-char hex and exists?                else fail
git merge-base --is-ancestor sha origin/main  else fail ("not on main")
sha == origin/main HEAD?                      else fail ("main has moved", lists the extra commits)
        ↓
git checkout --detach <sha>   (exactly that commit)
        ↓
bump root + core + cli versions together (auto from commits since last tag, or forced)
        ↓
build + typecheck + test + CLI smoke
        ↓
skip to a free patch version if this one is already on npm
re-check origin/main is still <sha>           else fail, nothing published
        ↓
npm publish @structured-vibe-coding/core, then @structured-vibe-coding/cli
        ↓
commit chore(release): vX.Y.Z [skip release] on top of <sha>, tag vX.Y.Z, push (fast-forward)
        ↓
GitHub Release vX.Y.Z (generated notes)
```

**Why `sha` must equal `main` HEAD.** It is the simplest rule that guarantees the published code is exactly what QA tested, and that the release commit fast-forwards `main`. If `main` moved after QA (even only by docs), QA the new HEAD and dispatch with that SHA. The run also stops before publishing if `main` moves during the run.

**Why there is no GitHub Release trigger.** The workflow creates the GitHub Release itself. A `release: published` trigger would be a second publishing path that skips the `sha` gate (anyone drafting a release in the UI would publish whatever the tag points at).

### How the bump type is chosen (`bump: auto`)

From commit subjects **since the last git tag**:

| Commits contain | Bump |
|-----------------|------|
| `BREAKING CHANGE` or `feat!:` / `fix!:` | **major** |
| `feat:` / `feat(scope):` | **minor** |
| anything else (fix, chore, docs, …) | **patch** |

### “There are no new packages that should be published”

The current version is already on npm. `scripts/ensure-unpublished-version.mjs` patch-bumps until it finds a free version, and the publish step fails if pnpm still skips.

### Build from a SHA without publishing (QA / pinned consumers)

```bash
git worktree add --detach /tmp/sdd-$SHA $SHA && cd /tmp/sdd-$SHA
pnpm install --frozen-lockfile
node scripts/bump-version.mjs --set "0.0.0-sha.$(git rev-parse --short=12 HEAD)"   # local only
pnpm build
(cd packages/core && pnpm pack --pack-destination /tmp/sdd-pack)
(cd packages/cli  && pnpm pack --pack-destination /tmp/sdd-pack)
npm i -g --prefix "$PREFIX" /tmp/sdd-pack/*-core-*.tgz /tmp/sdd-pack/*-cli-*.tgz   # both in one command
```

The packed cli pins core at the exact same version, so install both tarballs together. The unique `-sha.` version means a cli-only install fails loudly instead of pulling a different core from npm.

### Local version scripts

```bash
pnpm version:bump    # auto from commits since last tag
pnpm version:patch
pnpm version:minor
pnpm version:major
node scripts/bump-version.mjs --set 1.0.0
```

---

## One-time setup

1. **npm scope**  
   Packages are `@structured-vibe-coding/core` and `@structured-vibe-coding/cli`. Own that org/scope on npm, or rename packages.

2. **Secret `NPM_TOKEN`** (you already added this)  
   - Use a **Granular Access Token** (recommended in 2026+) with **Read and write** permission for Packages.  
   - Limit it to the `@structured-vibe-coding` packages you maintain (or "All packages you maintain").  
   - Classic tokens that bypass 2FA are being restricted for direct publishing.  
   - Repo → Settings → Secrets and variables → Actions → `NPM_TOKEN`

3. **Workflow permissions**  
   Repo → Settings → Actions → General → **Workflow permissions**:  
   - Allow **Read and write** permissions (so the bot can push the release commit + tags)

4. **Publishing**  
   Only by running **Release (manual)** with a QA-passed `sha` (see above). Pushing to `main` never publishes.

---

## Docs site (GitHub Pages)

Public site: `https://harsha09.github.io/spec-driven-development/`

**Pages setting:** Deploy from branch **`gh-pages`** / **`/` (root)**.  
Do **not** use `main` + `/docs` (raw Markdown via Jekyll — broken nav and theme).

Workflow `.github/workflows/docs.yml` builds VitePress and publishes to **`gh-pages`**.

Local: `pnpm docs:dev` · `pnpm docs:build`

## CI (every PR)

No secrets. Quality gate only (build, typecheck, test, CLI smoke, npm pack dry-run). Does **not** publish npm.

---

## Install after a successful release

```bash
npm install -g @structured-vibe-coding/cli
sdd --help
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Release run fails "main has moved" | Something landed on `main` after the QA'd commit. QA the new HEAD and dispatch with that SHA |
| Release run fails "not on main" | The `sha` is from a branch or was rebased away. Use a commit on `main` |
| Cannot push release commit | Enable **Read and write** workflow permissions |
| `403` or `E404` npm publish | Token lacks write permission for the `@structured-vibe-coding` scope **or** you are using a classic npm token that bypasses 2FA (npm is restricting these for publishing). Create a **Granular Access Token** with "Read and write" for Packages (scoped to packages you maintain), store it as the `NPM_TOKEN` secret, and re-run. See the script output for the exact npm guidance link. |
| Version already on npm | The workflow patch-bumps to a free version automatically, or dispatch with a higher `bump` |

---

## Related

- [`scripts/bump-version.mjs`](https://github.com/harsha09/spec-driven-development/blob/main/scripts/bump-version.mjs) — shared bump logic  
- [Product roadmap](https://github.com/harsha09/spec-driven-development/blob/main/ROADMAP.md) — P0–P3 priorities, meaning/non-goals for implementers (not CI-specific)  

