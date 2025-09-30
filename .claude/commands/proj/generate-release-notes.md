---
description: Generate comprehensive release notes from merged PRs between releases
tags: [git, release, documentation, github]
allowed-tools: Read, Bash(gh release*), Bash(gh pr*), Bash(git log*), Bash(git diff*), Bash(git tag*), Bash(mkdir -p .tmp), Bash(cat > .tmp/release-notes.md*)
---

# Generate Release Notes

Generate comprehensive release notes for the latest release by analyzing all merged PRs since the previous release. This command finds all squashed commits between releases, identifies their associated PRs, and creates a well-formatted release note following the project's template.

## Instructions

### Step 1: Find Release Tags

1. **Get Latest Release**:
   - Run `gh release view --json tagName,name,publishedAt` to get the latest release
   - If no release exists, inform user and suggest creating one first

2. **Get Previous Release**:
   - Run `gh release list --limit 2 --json tagName,name,publishedAt` to get the two most recent releases
   - Extract the second release as the "previous" release
   - If only one release exists, use the first commit as the starting point

### Step 2: Analyze Commits Between Releases

1. **Get Commit Range**:
   - Run `git log <previous-tag>..<latest-tag> --oneline --merges` to see all merge commits
   - Parse the commit messages to identify squashed PR merges (format: "Merge pull request #XX" or "... (#XX)")

2. **Extract PR Numbers**:
   - Parse commit messages to find PR numbers
   - Look for patterns like:
     - `(#123)` - squash merge format
     - `Merge pull request #123` - merge commit format
     - `#123` in commit title

3. **Handle Missing PR References**:
   - For commits without PR numbers, include them as direct commits
   - Note these separately in the release notes

### Step 3: Fetch PR Details

For each PR number found:

1. **Get PR Information**:
   ```bash
   gh pr view <PR_NUMBER> --json number,title,body,labels,author,closedAt,url
   ```

2. **Extract Key Information**:
   - PR title and description
   - PR type (from labels or title prefix: feat, fix, docs, chore, etc.)
   - Author information
   - Related issues (parse "Fixes #", "Closes #" from PR body)
   - Breaking changes indicators

### Step 4: Categorize Changes

Group changes by type:

- **🎉 New Features** - feat, feature labels or "feat:" prefix
- **🐛 Bug Fixes** - bug, fix labels or "fix:" prefix
- **📚 Documentation** - docs, documentation labels or "docs:" prefix
- **🔧 Build/Tooling** - build, ci, tooling labels or "build:", "ci:" prefix
- **🎨 Refactoring** - refactor label or "refactor:" prefix
- **⚡ Performance** - performance label or "perf:" prefix
- **💥 Breaking Changes** - breaking label or "BREAKING" in PR body
- **🔒 Security** - security label or "security:" prefix
- **Other Changes** - anything else

### Step 5: Generate Release Notes

1. **Read Template**:
   - Read `.github/RELEASE_NOTES_TEMPLATE.md`
   - Use this as the base structure

2. **Fill in Sections**:
   - **Release header** with version and date
   - **Overview** - Brief summary of the release (2-3 sentences synthesizing the main themes)
   - **Highlights** - Top 3-5 most important changes
   - **Changes by category** - Organized list with:
     - PR title as link
     - Brief description (from PR body summary)
     - PR number and author
     - Related issues if any
   - **Breaking Changes** - Dedicated section if any exist
   - **Contributors** - List of all contributors with GitHub handles
   - **Full Changelog** - Link to GitHub compare view

3. **Format Requirements**:
   - Use markdown formatting
   - Link PRs: `[#123](PR_URL)`
   - Link issues: `#456`
   - Credit authors: `by @username`
   - Use emoji categories for visual scanning
   - Include "What's Changed" with GitHub's compare link

### Step 6: Backup and Update Release

1. **Backup Current Release Notes**:
   ```bash
   mkdir -p .tmp
   gh release view <TAG> --json body --jq .body > .tmp/release-notes.backup.md
   ```

2. **Save Generated Notes**:
   - Write to `.tmp/release-notes.md`
   - Show preview to user

3. **Update Release**:
   ```bash
   gh release edit <TAG> --notes-file .tmp/release-notes.md
   ```

4. **Confirm Success**:
   - Display release URL
   - Inform user about backup location

### Step 7: Error Handling

- **No releases found**: Guide user to create first release
- **No PRs found**: List direct commits instead
- **gh CLI not available**: Instruct to install GitHub CLI
- **Not authenticated**: Instruct to run `gh auth login`
- **API rate limits**: Inform user and suggest waiting

## Example Usage

```bash
User: /proj:generate-release-notes

Claude:
1. Checks latest two releases (e.g., v0.0.44 and v0.0.43)
2. Finds all commits between them
3. Identifies merged PRs (#41, #42, #43, #44)
4. Fetches details for each PR
5. Categorizes changes (2 bug fixes, 1 feature, 1 docs update)
6. Generates formatted release notes
7. Backs up current notes to .tmp/release-notes.backup.md
8. Updates release with new notes
9. Shows release URL: https://github.com/org/repo/releases/tag/v0.0.44
```

## Implementation Notes

### Finding PR Numbers from Commits

GitHub squash merges include PR numbers in commit messages:
```
feat: add new feature (#123)
```

GitHub merge commits have this format:
```
Merge pull request #123 from branch-name
```

Parse both patterns to find all PR numbers.

### Handling Edge Cases

- **First Release**: No previous tag exists
  - Use entire git history
  - Or use first commit as starting point

- **Multiple Authors per PR**: Credit all co-authors from commit trailers

- **No PR for Commit**: Some commits may be pushed directly
  - Include these in "Other Changes"
  - Format: `commit-hash: commit message`

### Performance Considerations

- Cache PR data to avoid repeated API calls
- Use `--limit` with git log for large repositories
- Batch PR fetches when possible

## Release Notes Structure

The generated notes follow this structure:

```markdown
# Release v0.0.44 - 2025-01-15

## 🎯 Overview
[2-3 sentence summary of the release]

## ✨ Highlights
- Most important change 1
- Most important change 2
- Most important change 3

## 📋 Changes

### 🎉 New Features
- **Feature title** - Brief description ([#123](PR_URL)) by @username

### 🐛 Bug Fixes
- **Fix title** - Brief description ([#124](PR_URL)) by @username

### 📚 Documentation
- **Doc update title** - Brief description ([#125](PR_URL)) by @username

### 🔧 Build/Tooling
- **Build improvement** - Brief description ([#126](PR_URL)) by @username

## 💥 Breaking Changes
[If any, detailed migration guide]

## 👥 Contributors
Thank you to all contributors:
- @username1
- @username2

## 🔗 Full Changelog
[v0.0.43...v0.0.44](https://github.com/org/repo/compare/v0.0.43...v0.0.44)
```

## Backup and Revert

The command automatically backs up the previous release notes to `.tmp/release-notes.backup.md` before updating. To revert:

```bash
gh release edit <TAG> --notes-file .tmp/release-notes.backup.md
```

## Example Commands

```bash
# Get latest release
gh release view --json tagName,name,publishedAt

# Get two most recent releases
gh release list --limit 2 --json tagName,name,publishedAt

# Get commits between releases
git log v0.0.43..v0.0.44 --oneline --merges

# Get PR details
gh pr view 123 --json number,title,body,labels,author,closedAt,url

# Backup current release notes
gh release view v0.0.44 --json body --jq .body > .tmp/release-notes.backup.md

# Update release notes
gh release edit v0.0.44 --notes-file .tmp/release-notes.md

# Get release URL
gh release view v0.0.44 --json url --jq .url
```

## Tips for Best Release Notes

1. **Be User-Focused**: Describe changes from the user's perspective, not internal implementation
2. **Highlight Impact**: Explain why changes matter and what problems they solve
3. **Migration Guides**: For breaking changes, provide clear upgrade instructions
4. **Visual Hierarchy**: Use emojis and formatting to make scanning easy
5. **Credit Contributors**: Always acknowledge everyone who contributed
6. **Link Everything**: PRs, issues, commits, and compare views for full traceability
