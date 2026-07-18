# CI/CD

This repo uses GitHub Actions for continuous integration and release delivery.

## Workflows

| Workflow | File | When | What |
|----------|------|------|------|
| **CI** | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Push/PR to `main`, manual | Install → build → typecheck → test → CLI smoke → package VSIX → npm pack dry-run |
| **Release (CD)** | [`.github/workflows/release.yml`](../.github/workflows/release.yml) | GitHub Release published, or manual | Quality gate → publish npm packages → package VSIX → attach VSIX to release |

The older `publish.yml` is replaced by **Release (CD)**.

## CI details

On every PR and push to `main`:

1. `pnpm install --frozen-lockfile`
2. `pnpm build` (core, cli, vscode)
3. `pnpm typecheck`
4. `pnpm test`
5. CLI smoke: `sdd init` → `new` → `next` → `complete` in a temp dir
6. `pnpm package:vscode` and upload the `.vsix` as a workflow artifact (14 days)
7. `npm pack --dry-run` for core + cli (ensures publishable layout)

No secrets required for CI.

## CD (release) details

### One-time setup

1. **npm token**  
   - Create an [npm Automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens) or granular token with **publish** + **bypass 2FA**.  
   - Org/scope: packages use `@structured-vibe/*` — you must own that scope or rename packages first.

2. **GitHub secret**  
   - Repo → **Settings** → **Secrets and variables** → **Actions**  
   - New secret: `NPM_TOKEN` = your npm token  

3. **Version bump**  
   Before releasing, set the same version in:
   - `packages/core/package.json`
   - `packages/cli/package.json`
   - `packages/vscode/package.json` (for VSIX)

### Publish a release

```bash
# 1. Bump versions, commit, push
# 2. Tag and create a GitHub Release (UI or gh):
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --generate-notes
```

That triggers **Release (CD)**:

- Runs quality gate (build/test/smoke)
- Publishes `@structured-vibe/core` then `@structured-vibe/cli` with tag `latest`
- Builds VSIX and attaches it to the GitHub Release

### Manual dispatch

**Actions → Release (CD) → Run workflow**

| Input | Meaning |
|-------|---------|
| `npm_tag` | npm dist-tag (`latest`, `next`, …) |
| `skip_npm` | If true, only build/upload VSIX (no npm publish) |

## Local parity

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm package:vscode
pnpm publish:npm:dry
```

## Install published artifacts

```bash
# after successful CD
npm install -g @structured-vibe/cli
sdd --help

# VSIX from GitHub Release assets
code --install-extension structured-vibe-sdd-*.vsix
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `403` on npm publish | Token lacks publish / bypass 2FA; or `@structured-vibe` scope not owned |
| `NPM_TOKEN is not set` | Add repo secret `NPM_TOKEN` |
| Version already exists | Bump version in package.json files |
| VSIX missing on release | Check **package-vsix** job logs; ensure `pnpm package:vscode` succeeds |
| Environment `npm` blocks job | Approve deployment or remove `environment: npm` from workflow |
