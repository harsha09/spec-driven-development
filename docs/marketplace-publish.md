# Publish the VS Code extension to Visual Studio Marketplace

Your extension lives in `packages/vscode`.  
Marketplace identity:

| Field | Value |
|-------|--------|
| **Publisher** | `structured-vibe-coding` |
| **Extension name** | `structured-vibe-sdd` |
| **Full ID** | `structured-vibe-coding.structured-vibe-sdd` |
| **Display name** | Structured Vibe Coding (SDD) |

Install URL after publish:

```text
https://marketplace.visualstudio.com/items?itemName=structured-vibe-coding.structured-vibe-sdd
```

---

## Prerequisites (one-time)

### 1. Microsoft account

Use a Microsoft account (personal or work) you control.

### 2. Azure DevOps organization + publisher

1. Open [https://marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)  
2. Sign in  
3. **Create publisher** (if needed)  
   - **ID must be exactly:** `structured-vibe-coding`  
     (must match `"publisher"` in `packages/vscode/package.json`)  
   - Display name can be “Structured Vibe Coding”  
4. Accept the publisher agreement  

If the ID `structured-vibe-coding` is taken, either:

- Claim it under your org, or  
- Change `"publisher"` in `package.json` to an available ID and use that everywhere  

### 3. Personal Access Token (PAT)

1. Open Azure DevOps: [https://dev.azure.com](https://dev.azure.com)  
   - If you have no org, create one (e.g. `structured-vibe-coding`)  
2. User settings (top right) → **Personal access tokens** → **+ New Token**  
3. Settings that work for `vsce publish`:

| Setting | Value |
|---------|--------|
| Name | `vsce-publish` |
| Organization | **All accessible organizations** (recommended) |
| Expiration | 90 days or custom |
| Scopes | **Custom defined** → **Marketplace** → **Manage** |

4. **Create** → **copy the token once** (you won’t see it again)

Do **not** commit the PAT. Store it as a GitHub secret later if you automate publish (`VSCE_PAT`).

---

## Local publish (recommended first time)

### 1. Install tools

```bash
# Node 24+
cd /path/to/spec-driven-development
pnpm install
```

`@vscode/vsce` is already a devDependency of `packages/vscode`.

### 2. Log in to vsce with the PAT

```bash
cd packages/vscode
# paste PAT when prompted (or use env)
pnpm exec vsce login structured-vibe-coding
# Token: <paste PAT>
```

Or non-interactive:

```bash
export VSCE_PAT='your-azure-devops-pat'
```

### 3. Build, package, publish

```bash
cd /path/to/spec-driven-development
pnpm build

cd packages/vscode
# Dry-run package (optional)
pnpm exec vsce package --no-dependencies

# Publish to Marketplace
pnpm exec vsce publish --no-dependencies
# or:
pnpm run publish:vsce
```

With PAT env:

```bash
cd packages/vscode
VSCE_PAT='your-pat' pnpm exec vsce publish --no-dependencies
```

### 4. Verify

1. [Marketplace manage](https://marketplace.visualstudio.com/manage) → your publisher → extension listed  
2. Search VS Code Extensions for **Structured Vibe Coding**  
3. Or install by ID:

```bash
code --install-extension structured-vibe-coding.structured-vibe-sdd
```

Marketplace can take **a few minutes** to index after first publish.

---

## Versioning

Each Marketplace publish needs a **new version** in `packages/vscode/package.json` (`version` field).

```bash
# example: bump extension only
# edit packages/vscode/package.json "version": "0.2.2"
pnpm exec vsce publish --no-dependencies
# or
pnpm exec vsce publish patch --no-dependencies   # auto-bumps patch
```

Keep CLI/core versions in sync if you care about product consistency, but Marketplace only cares about the extension package version.

---

## Optional: publish from GitHub Actions

1. Repo → **Settings → Secrets → Actions**  
2. Add secret **`VSCE_PAT`** = Azure DevOps PAT (Marketplace Manage)  
3. Add a job (example):

```yaml
# .github/workflows/publish-extension.yml (example)
name: Publish VS Code extension
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - uses: actions/setup-node@v5
        with:
          node-version: "24"
          package-manager-cache: false
      - run: pnpm install --frozen-lockfile && pnpm build
      - run: pnpm --filter structured-vibe-sdd exec vsce publish --no-dependencies
        env:
          VSCE_PAT: ${{ secrets.VSCE_PAT }}
```

---

## Cursor / Open VSX (optional second store)

Cursor often uses Open VSX as well as Marketplace:

```bash
# separate token from https://open-vsx.org
npx ovsx publish packages/vscode/*.vsix -p "$OVSX_PAT"
```

Not required for VS Code Marketplace.

---

## Checklist before first publish

- [ ] Publisher ID `structured-vibe-coding` created on Marketplace manage  
- [ ] PAT with **Marketplace → Manage**  
- [ ] `"publisher": "structured-vibe-coding"` matches the portal  
- [ ] `media/icon.png` exists (128×128) — already generated  
- [ ] `pnpm build` succeeds  
- [ ] `vsce package --no-dependencies` succeeds with no errors  
- [ ] Repository URL is correct (or acceptable)  
- [ ] You are allowed to publish under that publisher (owner/member)  

---

## Common errors

| Error | Fix |
|-------|-----|
| `Publisher ... not found` | Create publisher with **exact** ID `structured-vibe-coding` |
| `401 / Invalid PAT` | New PAT, scope Marketplace Manage, org “All accessible” |
| `The publisher name is already taken` | Pick another publisher ID; update `package.json` |
| `Icon missing / invalid` | Need **PNG** 128×128 at `media/icon.png` |
| `ERROR  The extension already exists` | Bump `version` and publish again |
| `GitHub repository not found` | Repo may still be under `harsha09/...`; update `repository.url` or transfer repo |

---

## What users do after you publish

```text
VS Code → Extensions → search "Structured Vibe Coding"
```

or

```bash
code --install-extension structured-vibe-coding.structured-vibe-sdd
```

Then: open a folder → **SDD: Initialize in Workspace**.
