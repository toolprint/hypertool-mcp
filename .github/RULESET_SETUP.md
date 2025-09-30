# GitHub Rulesets Setup for Automated Releases

This document explains the **official GitHub-recommended approach** for allowing automated workflows to push version bumps to protected branches.

## Why Rulesets (Not Branch Protection Rules)

GitHub now recommends using **Repository Rulesets** instead of legacy branch protection rules because:
- Rulesets are more flexible and modern
- Support bypass permissions for specific actors (like GitHub Actions)
- Better integration with automated workflows
- Introduced in 2024-2025 as the preferred method

## Overview

The `publish-beta.yml` workflow needs to:
1. Bump the version in `package.json` using changesets
2. Commit these changes back to the `main` branch
3. Push the commit and tag to origin

**Solution**: Use SSH Deploy Keys with ruleset bypass permissions. GitHub does not allow `github-actions[bot]` to be added directly to bypass lists, so we use a deploy key instead.

### Why Deploy Keys?

- **Simpler than GitHub Apps**: No app creation or installation needed
- **Repository-scoped**: Key only works for this specific repository
- **No organization required**: Works for personal and organization repos
- **Native GitHub feature**: Built-in support in rulesets and workflows
- **Secure**: Private key stored as encrypted secret, only accessible to workflows

## Setup Instructions

### Step 1: Navigate to Repository Rulesets

1. Go to your repository: `https://github.com/toolprint/hypertool-mcp`
2. Click on "Settings"
3. In the left sidebar, find "Code and automation" section
4. Click on **"Rules"** → **"Rulesets"** (NOT "Branches")

### Step 2: Create or Edit Ruleset for Main Branch

1. Click **"New ruleset"** → **"New branch ruleset"**
   - Or edit existing ruleset if you have one
2. Name it: `main-branch-protection`
3. Enforcement status: **"Active"**

### Step 3: Configure Target Branches

Under "Target branches":
1. Click **"Add target"**
2. Select **"Include by pattern"**
3. Enter pattern: `main`
4. This applies the ruleset to your main branch

### Step 4: Configure Branch Rules

Enable the following rules:

**Required:**
- ✅ **Require a pull request before merging**
  - Required approvals: 1 (or your preference)
  - Dismiss stale pull request approvals when new commits are pushed

- ✅ **Require status checks to pass**
  - Add your CI checks (tests, lint, etc.)
  - Require branches to be up to date before merging

**Optional (based on your needs):**
- ✅ **Require signed commits** (if you want verified commits)
- ✅ **Block force pushes**
- ✅ **Require linear history**

### Step 5: Configure Bypass Permissions (CRITICAL STEP)

This is the key configuration that allows automated releases:

**Important**: GitHub does not allow adding `github-actions[bot]` directly to bypass lists. You must use the **Deploy Key Method**.

#### Deploy Key Setup (Step-by-Step)

1. **Generate SSH Deploy Key**:
   ```bash
   cd /tmp
   ssh-keygen -t ed25519 -C "github-actions-deploy-key" -f github_actions_deploy_key -N ""
   ```
   This creates:
   - `github_actions_deploy_key` (private key - keep secret!)
   - `github_actions_deploy_key.pub` (public key - safe to share)

2. **Add Public Key as Deploy Key**:
   - Go to: `https://github.com/YOUR_ORG/YOUR_REPO/settings/keys`
   - Click **"Add deploy key"**
   - **Title**: `GitHub Actions Deploy Key`
   - **Key**: Run `cat /tmp/github_actions_deploy_key.pub` and paste the entire output
   - ✅ **CRITICAL**: Check **"Allow write access"**
   - Click **"Add key"**

3. **Add Private Key as Repository Secret**:
   - Go to: `https://github.com/YOUR_ORG/YOUR_REPO/settings/secrets/actions`
   - Click **"New repository secret"**
   - **Name**: `DEPLOY_KEY` (must be exactly this)
   - **Secret**: Run `cat /tmp/github_actions_deploy_key` and paste the **entire output** including:
     - `-----BEGIN OPENSSH PRIVATE KEY-----`
     - All the encoded key data
     - `-----END OPENSSH PRIVATE KEY-----`
   - Click **"Add secret"**

4. **Configure Ruleset Bypass**:
   - Go to: `https://github.com/YOUR_ORG/YOUR_REPO/settings/rules`
   - Find your main branch ruleset (or create one if needed)
   - Scroll to **"Bypass list"** section
   - Click **"Add bypass"**
   - Select **"Deploy keys"** from the dropdown
   - **Bypass mode**: Select **"Always"**
   - Click **"Save"** or **"Create"**

5. **Clean Up Key Files**:
   ```bash
   rm /tmp/github_actions_deploy_key /tmp/github_actions_deploy_key.pub
   ```

6. **Update Workflow** (see Step 7 below for workflow changes)

### Step 6: Save Ruleset

1. Review your configuration
2. Click **"Create"** (or **"Save changes"**)
3. The ruleset is now active

### Step 7: Update Workflow to Use Deploy Key

If using **Option A (Deploy Key)**, update the checkout step in `publish-beta.yml`:

```yaml
- name: Checkout code
  uses: actions/checkout@v4
  with:
    ssh-key: ${{ secrets.DEPLOY_KEY }}
    fetch-depth: 0
    persist-credentials: true
```

If using **Option B (GitHub App)**, the workflow would need additional steps with the `create-github-app-token` action (not covered in detail here).

**Current workflow** uses `token: ${{ secrets.GITHUB_TOKEN }}` which won't work with rulesets. You must switch to the deploy key method.

## How It Works

1. When the workflow runs on `main` branch:
   - The workflow uses the SSH deploy key for authentication
   - Deploy keys are in the ruleset bypass list
   - The workflow can push commits and tags directly to `main`
   - The `[skip-ci]` commit message prevents infinite loops

2. Regular developers cannot push to `main`:
   - Must create pull requests
   - Must pass status checks
   - Must get approvals
   - Cannot bypass the rules (they don't have the deploy key)

## Troubleshooting

### Error: "Push declined due to repository rule violations"
**Solution**:
- Verify "Deploy keys" are in the bypass list of your ruleset
- Check that bypass mode is set to "Always"
- Ensure the ruleset is "Active" (not "Evaluate")
- Confirm the deploy key was added with "Allow write access" enabled

### Error: "Permission denied (publickey)"
**Solution**:
- Verify the `DEPLOY_KEY` secret contains the **private key** (not public key)
- Ensure the deploy key is properly formatted (starts with `-----BEGIN OPENSSH PRIVATE KEY-----`)
- Check that the deploy key was added to the repository's Deploy keys settings

### Error: "Commits must have verified signatures"
**Solution**:
- Either remove the "Require signed commits" rule from your ruleset
- Or add "Deploy keys" to the bypass list for this specific rule
- SSH deploy keys automatically handle commit signing

### Workflow doesn't push anything
**Solution**:
- Check that `persist-credentials: true` is set in the checkout action
- Verify `ssh-key: ${{ secrets.DEPLOY_KEY }}` is configured (not `token`)
- Ensure the deploy key has write access enabled

## Security Considerations

✅ **Safe**:
- Only workflows with access to the `DEPLOY_KEY` secret can bypass rules
- Only workflows running from the main repository can access secrets (not forks)
- Requires `[skip-ci]` tag to prevent infinite loops
- All actions are audited in GitHub audit log
- Deploy key is scoped to a single repository

⚠️ **Be Aware**:
- Anyone who can modify workflow files can potentially use the deploy key
- Review workflow changes carefully in PRs
- Consider using CODEOWNERS for `.github/workflows/` directory
- Protect the `DEPLOY_KEY` secret - never expose it in logs or output
- Rotate the deploy key periodically for enhanced security

## Alternative: Separate Release Branch

If you prefer not to use bypass permissions, you can:
1. Have the workflow create a release PR instead of pushing directly
2. Auto-merge the PR using a GitHub App or auto-merge setting
3. This is more complex but doesn't require bypass permissions

However, the bypass approach is **GitHub's official recommendation** for automated releases.

## Documentation References

- [GitHub Rulesets Official Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Available Rules for Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [GitHub Ruleset Best Practices](https://wellarchitected.github.com/library/governance/recommendations/managing-repositories-at-scale/rulesets-best-practices/)
