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

### 3. Auth: PAT vs Microsoft Entra ID

Microsoft is steering people to **Entra ID** (Azure AD). That is **not** the same screen as a classic **Personal Access Token**.

| Goal | What to use |
|------|-------------|
| First publish from your laptop (simplest) | **Option A** – upload VSIX in Marketplace UI (no PAT) |
| Local `vsce login` / `vsce publish` | **Option B** – Azure DevOps **PAT** with Marketplace Manage |
| Fully automated CI (Microsoft’s long-term path) | **Option C** – Entra + managed identity + `vsce publish --azure-credential` |

**Important:** Global PATs (“All accessible organizations”) are being retired (blocked/new creation limited; full retirement **Dec 1, 2026**). Prefer an **org-scoped** PAT if the portal forces that, or use **Option A** / **Option C**.

---

#### Option A — No token (easiest first publish)

1. Build a VSIX:
   ```bash
   cd /path/to/spec-driven-development
   pnpm build && pnpm package:vscode
   # → packages/vscode/structured-vibe-sdd-*.vsix
   ```
2. Open [https://marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)  
3. Select publisher **`structured-vibe-coding`**  
4. **New extension** / **+** → upload the `.vsix`  
5. Wait for validation / listing  

This only needs your Microsoft account + publisher; no PAT/Entra app for a one-off.

---

#### Option B — Generate a PAT for `vsce` (Azure DevOps, not Entra app registration)

You do **not** create this under Azure Portal → Entra ID → App registrations for basic `vsce login`.

1. Go to **Azure DevOps** (not only Azure portal): [https://dev.azure.com](https://dev.azure.com)  
2. Create or open an **organization** (e.g. `structured-vibe-coding`)  
3. Top-right **user icon** → **Personal access tokens**  
   - Direct pattern: `https://dev.azure.com/{your-org}/_usersSettings/tokens`  
4. **+ New Token** and set:

| Field | Value for `vsce` |
|-------|------------------|
| **Name** | `vsce-publish` (any name) |
| **Organization** | Prefer **your Azure DevOps org** (org-scoped). If offered and still allowed: *All accessible organizations* — Microsoft is deprecating that “global” type. |
| **Expiration** | 30–90 days (short is safer) |
| **Scopes** | **Custom defined** |
| | Click **Show all scopes** |
| | Scroll to **Marketplace** |
| | Check **Manage** only (enough for publish) |

5. **Create** → **copy the token immediately**

If the UI only shows **Entra / “sign in with work account”** loops:

- Use an **incognito** window  
- Sign in with the **same** Microsoft account you used for the Marketplace publisher  
- Or create the PAT from Marketplace manage if available: publisher → **Security** / tokens (when shown)  
- Avoid mixing personal + work Entra tenants in the same browser session  

Use with vsce:

```bash
cd packages/vscode
pnpm exec vsce login structured-vibe-coding
# paste PAT when prompted

# or one-shot:
pnpm exec vsce publish --no-dependencies -p "$VSCE_PAT"
```

Do **not** commit the PAT. For CI later, store as GitHub secret `VSCE_PAT`.

---

#### Option C — Microsoft Entra ID (CI / “no PAT” path Microsoft recommends)

Use this for **Azure Pipelines** (or advanced automation), not the first local publish.

High-level attributes / objects (not a single “Entra PAT” string):

| Piece | What it is |
|-------|------------|
| **User-assigned managed identity** (Azure) | Identity that can act without a stored password |
| **Azure DevOps Service Connection** | Type: **Azure Resource Manager** → **Workload Identity Federation (manual)** |
| **Federated credential** | Links DevOps issuer/subject ↔ managed identity |
| **Marketplace publisher membership** | Add that identity’s resource ID as **Contributor** on publisher `structured-vibe-coding` |
| **Pipeline publish** | AzureCLI task + `vsce publish --azure-credential` (needs recent `@vscode/vsce`) |

Official outline: [Publishing Extensions – Secure automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace).

You **do not** fill “scopes: Marketplace Manage” on an Entra **app registration** the same way as a DevOps PAT. Entra uses **workload identity federation** + marketplace membership of the managed identity.
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
