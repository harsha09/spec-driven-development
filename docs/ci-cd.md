# CI/CD

GitHub Actions pipelines for continuous integration and **automatic releases on push to `main`**.

## Runtime

- **Node.js 24** everywhere: app `engines` (`>=24`), local develop, and GitHub Actions
- Actions: `actions/setup-node@v5`, `actions/checkout@v5`, `upload-artifact@v5`, `softprops/action-gh-release@v3` (Node 24 runtimes)
- **pnpm**: `pnpm/action-setup@v4` **before** `setup-node`, with `package-manager-cache: false`  
  (`setup-node@v5` otherwise looks for `pnpm` too early and fails with “Unable to locate executable file: pnpm”)

## Workflows

| Workflow | File | When | What |
|----------|------|------|------|
| **CI** | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | PR / push to `main` | Build, test, typecheck, CLI smoke, VSIX artifact, npm pack dry-run |
| **Auto release on push** | [`.github/workflows/release-on-push.yml`](../.github/workflows/release-on-push.yml) | Push to `main` (package changes) | **Auto version bump** → test → **npm publish** → tag → GitHub Release + VSIX |
| **Release (manual)** | [`.github/workflows/release.yml`](../.github/workflows/release.yml) | Manual / classic GitHub Release event | Optional path if you still create releases by hand |

## Automatic version bump on push (default)

You do **not** need to bump versions manually for normal releases.

### Flow

```text
push to main (packages/** changed)
        ↓
  skip if commit is chore(release): … or [skip release]
        ↓
  detect bump from conventional commits since last git tag
        ↓
  bump package.json versions (root, core, cli, vscode) together
        ↓
  build + test + CLI smoke
        ↓
  npm publish @structured-vibe/core + @structured-vibe/cli
        ↓
  commit chore(release): vX.Y.Z [skip release]
  tag vX.Y.Z + push
        ↓
  GitHub Release + VSIX attachment
```

### How the bump type is chosen

From commit subjects **since the last git tag**:

| Commits contain | Bump |
|-----------------|------|
| `BREAKING CHANGE` or `feat!:` / `fix!:` | **major** |
| `feat:` / `feat(scope):` | **minor** |
| anything else (fix, chore, docs, …) | **patch** |

Examples:

```bash
git commit -m "fix: skip stage navigation"
# → 0.1.0 → 0.1.1

git commit -m "feat: add agent handoff panel"
# → 0.1.1 → 0.2.0

git commit -m "feat!: redesign workflow schema"
# → 0.2.0 → 1.0.0
```

### Skip a release

```bash
git commit -m "docs: fix typo [skip release]"
# or after an automated release (already skipped):
# chore(release): v0.1.1 [skip release]
```

Pushes that only touch docs outside `packages/**` also skip the auto-release path filter.

### Manual bump type

**Actions → Auto release on push → Run workflow**

- `bump`: `auto` | `patch` | `minor` | `major`
- `dry_run`: build + bump locally in the job only (no npm, no git push)

### “There are no new packages that should be published”

That means the **current version is already on npm** (e.g. `0.2.0`). npm does not allow re-publishing the same version.

Workflows now:

1. Detect if `@structured-vibe/core` / `cli` already have this version  
2. **Auto patch-bump** (`0.2.0` → `0.2.1` …) until free  
3. Publish and **fail** if pnpm still skips  

**Release (CD)** manual run also has input **`bump`**: `none` | `patch` | `minor` | `major`.

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
   Packages are `@structured-vibe/core` and `@structured-vibe/cli`. Own that org/scope on npm, or rename packages.

2. **Secret `NPM_TOKEN`** (you already added this)  
   - Automation or granular token with **publish** + **bypass 2FA**  
   - Repo → Settings → Secrets and variables → Actions → `NPM_TOKEN`

3. **Workflow permissions**  
   Repo → Settings → Actions → General → **Workflow permissions**:  
   - Allow **Read and write** permissions (so the bot can push the release commit + tags)

4. **First publish**  
   Push a change under `packages/` to `main`, or run **Auto release on push** manually.  
   First run will tag `v0.1.1` (patch from `0.1.0`) unless commits since start include `feat:`.

---

## CI (every PR)

No secrets. Same quality gate as before; uploads VSIX as an artifact (does **not** publish npm).

---

## Install after a successful auto-release

```bash
npm install -g @structured-vibe/cli
sdd --help

# VSIX from the GitHub Release assets for that tag
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No auto release on push | Path must include `packages/**`; message must not be `chore(release):` or `[skip release]` |
| Cannot push release commit | Enable **Read and write** workflow permissions |
| `403` npm publish | Token needs publish + bypass 2FA; confirm `@structured-vibe` ownership |
| Version already on npm | Bump already published; wait for next commit or `workflow_dispatch` with higher bump |
| Loop of releases | Release commits include `[skip release]` / `chore(release):` and are ignored |

---

## Related

- [`scripts/bump-version.mjs`](../scripts/bump-version.mjs) — shared bump logic  
- Classic manual release workflow still available if you prefer tags-only releases  
