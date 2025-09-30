---
description: Run PR checks, push to remote, create PR, and generate description automatically
tags: [git, pr, ci, github, automation]
allowed-tools: Read, Bash(just pr-prep), Bash(gh pr*), Bash(git push*), Bash(git branch*), Bash(git log*), Bash(git diff*), Bash(git pull --rebase origin main), Bash(git remote -v), Bash(git rev-parse --abbrev-ref @{upstream}), Bash(git status --porcelain), Bash(mkdir -p .tmp), Bash(cat > .tmp/pr-description.md*)
---

# Create PR with Auto-Generated Description

Complete PR workflow: run all CI checks locally, push branch to remote, create PR on GitHub, and automatically generate a comprehensive PR description from commits.

## Instructions

### Step 1: Run Local PR Validation

1. **Run `just pr-prep`**:
   - Executes all CI checks locally (pre-commit, build, tests, typecheck, lint, format)
   - Ensures the branch will pass GitHub PR validation
   - If this fails, STOP and inform the user to fix issues before proceeding

### Step 2: Rebase from Main

1. **Rebase from main**:
   ```bash
   git pull --rebase origin main
   ```
   - Ensures the branch is up-to-date with latest main
   - If rebase conflicts occur, STOP and inform user to resolve conflicts first
   - User should run `git rebase --continue` after resolving, then retry the command

### Step 3: Check Git Status and Branch

1. **Verify we're on a feature branch**:
   - Run `git branch --show-current` to get current branch name
   - If on `main` or `master`, STOP and inform user they should be on a feature branch

2. **Check for uncommitted changes**:
   - Run `git status --porcelain`
   - If there are uncommitted changes, inform user and ask if they want to commit them first
   - Do NOT auto-commit without user permission

3. **Get remote information**:
   - Run `git remote -v` to verify remote exists
   - Run `git rev-parse --abbrev-ref @{upstream}` to check if branch has upstream
   - If no upstream, inform user that branch will be pushed with `-u` flag

### Step 4: Push to Remote

1. **Push the branch**:
   ```bash
   # If branch has no upstream
   git push -u origin <branch-name>

   # If branch already has upstream
   git push
   ```

2. **Verify push succeeded**:
   - Check exit code
   - If push fails (e.g., force-push required, conflicts), inform user and STOP

### Step 5: Create PR on GitHub

1. **Check if PR already exists**:
   - Run `gh pr view --json number,url` to check for existing PR
   - If PR exists, inform user and ask if they want to update it instead
   - If user says yes, skip to Step 6

2. **Create the PR**:
   ```bash
   gh pr create --title "<branch-name-as-title>" --body "Initial PR - description being generated..." --reviewer toolprint/admins
   ```
   - Use branch name as initial title (will be updated with proper description)
   - Add placeholder body initially
   - Automatically assign `toolprint/admins` as reviewers

3. **Verify PR creation**:
   - Check exit code
   - Capture PR URL from output
   - If creation fails, inform user and STOP

### Step 6: Generate and Update PR Description

Follow the same process as `/proj:generate-pr-desc`:

1. **Backup Current PR Description** (if updating existing PR):
   ```bash
   mkdir -p .tmp
   gh pr view --json body --jq .body > .tmp/pr-description.backup.md
   ```

2. **Analyze Branch Commits**:
   - Run `git log main..HEAD --oneline` to see all commits
   - Run `git diff main..HEAD --stat` to see files changed
   - Parse commit messages to understand changes

3. **Extract Information**:
   - Identify bug fixes (commits with "fix:", "bug:", etc.)
   - Identify new features (commits with "feat:", "add:", etc.)
   - Identify refactors (commits with "refactor:", "improve:", etc.)
   - Identify documentation (commits with "docs:", "chore:", etc.)
   - Identify build/tooling (commits with "build:", "ci:", etc.)

4. **Read PR Template**:
   - Read `.github/pull_request_template.md`

5. **Generate PR Description**:
   - Fill in "Description" with concise summary (2-3 sentences)
   - Check appropriate boxes in "Type of Change"
   - Fill in "Changes Made" sections grouped by category
   - Mark relevant checkboxes in "Testing" section
   - Mark relevant checkboxes in "Checklist" section
   - Include related issues with "Fixes #", "Closes #" syntax if applicable

6. **Save and Update**:
   ```bash
   # Save generated description
   cat > .tmp/pr-description.md << 'EOF'
   [generated description]
   EOF

   # Update PR
   gh pr edit --body-file .tmp/pr-description.md
   ```

### Step 7: Confirm Success

1. **Display PR URL**:
   - Show the PR URL to the user
   - Confirm that checks have passed and PR description has been generated

2. **Provide Backup Information**:
   - Inform user about `.tmp/pr-description.backup.md` if they need to revert
   - Remind them they can edit the PR description on GitHub if needed

## Error Handling

### Local Checks Fail (`just pr-prep`)
- Display the failing check output
- STOP workflow
- Instruct user to fix issues and try again

### Rebase Conflicts
- Display rebase conflict message
- STOP workflow
- Instruct user to:
  1. Resolve conflicts in the affected files
  2. Run `git add <resolved-files>`
  3. Run `git rebase --continue`
  4. Retry `/proj:create-pr`

### Uncommitted Changes
- List the uncommitted files
- Ask user if they want to commit them first
- Do NOT auto-commit without permission

### Push Fails
- Display git error message
- Common issues:
  - Need to pull first: `git pull origin <branch>`
  - Force push required: Warn user and ask for confirmation
  - Permission denied: Check git credentials
- STOP workflow until resolved

### PR Already Exists
- Display existing PR URL
- Ask user if they want to update the description instead
- If yes, proceed to Step 5
- If no, STOP workflow

### PR Creation Fails
- Display gh CLI error message
- Common issues:
  - Not authenticated: `gh auth login`
  - Invalid repository: Check remote URL
  - No commits on branch: Branch must have commits
- STOP workflow until resolved

### Description Generation Fails
- If template missing, use basic description format
- If git commands fail, use available information
- Always provide SOME description, even if minimal

## Example Usage

```
User: /proj:create-pr

Claude:
1. ✅ Running local PR checks with `just pr-prep`...
   - Pre-commit hooks: PASSED
   - Build: PASSED
   - Tests: PASSED
   - Typecheck: PASSED
   - Lint: PASSED
   - Format check: PASSED

2. ✅ Rebasing from main...
   - Rebased successfully on origin/main
   - No conflicts

3. ✅ Current branch: feature/add-context-measurement
   - No uncommitted changes
   - Remote: origin

4. ✅ Pushing to remote...
   - Pushed to origin/feature/add-context-measurement

5. ✅ Creating PR on GitHub...
   - PR created: https://github.com/org/repo/pull/43

6. ✅ Generating PR description...
   - Analyzed 3 commits
   - Found: 1 feature, 2 documentation updates
   - Generated description from template
   - Updated PR #43

7. ✅ Done! Your PR is ready for review:
   https://github.com/org/repo/pull/43

   Backup saved to .tmp/pr-description.backup.md
```

## Implementation Notes

### Branch Name to Title Conversion

Convert branch names to human-readable titles:
- `feature/add-context-measurement` → "Add context measurement"
- `fix/version-bump-issues` → "Fix version bump issues"
- `docs/update-readme` → "Update readme"

Rules:
- Remove prefix (feature/, fix/, docs/, etc.)
- Replace hyphens/underscores with spaces
- Capitalize first letter of each word

### When to Skip Steps

- **Skip Step 2 (Rebase)**: Never skip - always rebase to ensure up-to-date with main
- **Skip Step 4 (Push)**: If branch is already up-to-date on remote
- **Skip Step 5 (Create)**: If PR already exists, go straight to Step 6
- **Skip Step 6 (Backup)**: If this is a new PR (no existing description to backup)

### Safety Checks

- NEVER force push without explicit user confirmation
- NEVER commit changes without explicit user permission
- ALWAYS run `just pr-prep` first to ensure quality
- ALWAYS backup existing PR descriptions before updating

## Comparison with `/proj:generate-pr-desc`

| Feature | `/proj:create-pr` | `/proj:generate-pr-desc` |
|---------|------------------|--------------------------|
| Run CI checks | ✅ Yes | ❌ No |
| Push to remote | ✅ Yes | ❌ No |
| Create PR | ✅ Yes | ❌ No (assumes exists) |
| Generate description | ✅ Yes | ✅ Yes |
| Update existing PR | ✅ Yes | ✅ Yes |

**Use `/proj:create-pr` when**: Starting from scratch with a local branch
**Use `/proj:generate-pr-desc` when**: PR already exists, just need to update description

## Tips for Best Results

1. **Commit messages matter**: Use conventional commit format (feat:, fix:, docs:) for better categorization
2. **Small PRs**: Easier to generate accurate descriptions for focused changes
3. **Run locally first**: Don't rely solely on this - review the generated description
4. **Edit if needed**: The generated description is a starting point, refine it on GitHub if needed

## Revert Instructions

If you need to revert the PR description:

```bash
# Revert to previous description
gh pr edit --body-file .tmp/pr-description.backup.md

# Or get the backup content
cat .tmp/pr-description.backup.md
```
