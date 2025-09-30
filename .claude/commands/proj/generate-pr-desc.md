---
description: Generate and update PR description from branch commits using GitHub CLI
tags: [git, pr, documentation, github]
allowed-tools: Read, Bash(gh pr view*), Bash(gh pr edit*), Bash(git log*), Bash(git diff*), Bash(mkdir -p .tmp), Bash(cat > .tmp/pr-description.md*)
---

# Generate PR Description

Generate a comprehensive PR description based on the commits in your current branch, formatted according to the project's PR template, and automatically update the PR on GitHub using `gh pr edit`.

## Instructions

1. **Check for Existing PR**:
   - Run `gh pr view --json number,title,url` (without arguments - automatically detects PR for current branch)
   - If no PR exists, inform the user and suggest creating one first with `gh pr create`
   - Note: `gh` CLI automatically detects the PR for the current branch

2. **Analyze Current Branch**:
   - Run `git log --oneline main..HEAD` to see all commits on this branch
   - Run `git diff main..HEAD --stat` to see files changed
   - Run `git diff main..HEAD` to understand the nature of changes

3. **Extract Information**:
   - Parse commit messages to understand what was changed
   - Identify bug fixes (commits with "fix:", "bug:", etc.)
   - Identify new features (commits with "feat:", "add:", etc.)
   - Identify refactors (commits with "refactor:", "improve:", etc.)
   - Identify documentation changes (commits with "docs:", "chore:", etc.)
   - Identify build/tooling changes (commits with "build:", "ci:", etc.)

4. **Generate PR Description**:
   - Follow the template from `.github/pull_request_template.md`
   - Fill in the "Description" with a concise summary (2-3 sentences)
   - Check appropriate boxes in "Type of Change" based on commit analysis
   - Fill in "Changes Made" sections based on commits:
     - Group by category (Bug Fixes, New Features, Other Enhancements, Breaking Changes)
     - Include technical details and rationale
     - Mention file paths and component names where relevant
   - Mark all relevant checkboxes in "Testing" section
   - Mark all relevant checkboxes in "Checklist" section
   - If applicable, mention related issues with "Fixes #", "Closes #" syntax

5. **Format Requirements**:
   - Use markdown formatting
   - Use [x] for checked boxes, [ ] for unchecked
   - Be specific and technical in descriptions
   - Include "why this matters" context in Additional Notes
   - Mention any workflow safeguards or important implementation details

6. **Backup Current PR Description**:
   - Before updating, fetch and save the current PR description using `gh pr view --json body --jq .body > .tmp/pr-description.backup.md`
   - This allows reverting if needed
   - Keep the backup file for user reference

7. **Update PR on GitHub**:
   - Save the generated description to a temporary file (use `.tmp/pr-description.md`)
   - Use `gh pr edit --body-file .tmp/pr-description.md` (without PR number - automatically uses current branch's PR)
   - Confirm successful update and provide the PR URL
   - Inform user that backup is available at `.tmp/pr-description.backup.md` if they need to revert

8. **Error Handling**:
   - If `gh` command is not available, inform user to install GitHub CLI
   - If not authenticated, instruct user to run `gh auth login`
   - If PR doesn't exist, provide instructions to create one
   - Handle any git or gh command errors gracefully

## Example Usage

User: "/proj:generate-pr-desc"

Assistant should:
1. Check if PR exists for current branch using `gh pr view`
2. Backup current PR description to `.tmp/pr-description.backup.md`
3. Run git commands to analyze the branch
4. Parse commits and changes
5. Generate a filled-out PR template
6. Save to `.tmp/pr-description.md`
7. Update PR description using `gh pr edit --body-file .tmp/pr-description.md`
8. Confirm success and show PR URL
9. Inform user about backup location for potential revert

## Implementation Notes

- **No PR number needed**: Both `gh pr view` and `gh pr edit` automatically detect the PR for the current branch when called without arguments
- Use `gh pr edit --body-file` instead of `--body` to handle multi-line descriptions properly
- Create temp file in `.tmp/` directory (create if doesn't exist with `mkdir -p .tmp`)
- Verify successful update by checking command exit code
- Provide user with before/after confirmation
- Show user the generated description before updating if they want to review it

## Example Commands

```bash
# Check if PR exists for current branch
gh pr view --json number,title,url

# Backup current PR description before updating
mkdir -p .tmp
gh pr view --json body --jq .body > .tmp/pr-description.backup.md

# Update PR description for current branch
gh pr edit --body-file .tmp/pr-description.md

# Get PR URL for current branch
gh pr view --json url --jq .url

# Revert to previous description if needed
gh pr edit --body-file .tmp/pr-description.backup.md
```

## Backup and Revert

The command automatically backs up the previous PR description to `.tmp/pr-description.backup.md` before updating. To revert:

```bash
gh pr edit --body-file .tmp/pr-description.backup.md
```

Or manually:
1. Open `.tmp/pr-description.backup.md` to see the previous description
2. Copy the content
3. Run `gh pr edit` and paste when prompted
