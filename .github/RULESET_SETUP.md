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

Using rulesets with bypass permissions allows `github-actions[bot]` to do this without requiring a GitHub App or PAT.

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

1. Scroll to **"Bypass list"** section
2. Click **"Add bypass"**
3. Select **"Repository roles"** or **"GitHub Apps"**
4. Add: **`github-actions[bot]`** or **"GitHub Actions"** role
5. **Bypass mode**: Select **"Always"** (for trusted automation) or **"With approval"**

For automated releases, use **"Always"** bypass mode.

### Step 6: Save Ruleset

1. Review your configuration
2. Click **"Create"** (or **"Save changes"**)
3. The ruleset is now active

### Step 7: Verify Workflow Permissions

Ensure your workflow has the correct permissions (already configured in `publish-beta.yml`):

```yaml
permissions:
  contents: write      # Required to push commits and tags
  actions: read        # Required to read workflow information
  id-token: write      # Required for OIDC authentication
```

## How It Works

1. When the workflow runs on `main` branch:
   - It has `contents: write` permission
   - The `github-actions[bot]` actor is in the bypass list
   - It can push commits and tags directly to `main`

2. Regular developers cannot push to `main`:
   - Must create pull requests
   - Must pass status checks
   - Must get approvals
   - Cannot bypass the rules

## Troubleshooting

### Error: "Resource not accessible by integration"
**Solution**: Ensure `contents: write` permission is set in the workflow

### Error: "Push declined due to repository rule violations"
**Solution**:
- Verify `github-actions[bot]` is in the bypass list
- Check that bypass mode is set to "Always"
- Ensure the ruleset is "Active" (not "Evaluate")

### Error: "Commits must have verified signatures"
**Solution**:
- Either remove the "Require signed commits" rule
- Or add `github-actions[bot]` to the bypass list for this rule specifically
- GitHub Actions commits are automatically signed by GitHub

### Workflow doesn't push anything
**Solution**:
- Check that `persist-credentials: true` is set in the checkout action
- Verify `GITHUB_TOKEN` is being used (not a PAT)

## Security Considerations

✅ **Safe**:
- Only `github-actions[bot]` can bypass rules
- Only for workflows running from the main repository (not forks)
- Requires `[skip-ci]` tag to prevent infinite loops
- All actions are audited in GitHub audit log

⚠️ **Be Aware**:
- Anyone who can modify workflow files can potentially use the bypass
- Review workflow changes carefully in PRs
- Consider using CODEOWNERS for `.github/workflows/` directory

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
