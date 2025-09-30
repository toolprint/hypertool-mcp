---
description: Generate comprehensive release notes from merged PRs between releases
tags: [git, release, documentation, github]
allowed-tools: Read, Bash(gh release*), Bash(gh pr*), Bash(git log*), Bash(git diff*), Bash(git tag*), Bash(mkdir -p .tmp), Bash(cat > .tmp/release-notes.md*)
---

# Generate Release Notes

Generate comprehensive release notes for the latest release by analyzing all merged PRs since the previous release. This command finds all squashed commits between releases, identifies their associated PRs, and creates a well-formatted release note following the project's template.

## Instructions

### Step 1: Find Release Tags and Previous Release

**Important**: We update the LATEST existing release, not create a new one. There may be multiple tags between releases.

1. **Get Latest Release**:
   - Run `gh release view --json tagName,name,publishedAt,url` to get the latest release
   - This is the release we will UPDATE
   - If no release exists, inform user and suggest creating one first with `gh release create`

2. **Get Previous Release** (handle multiple tags between releases):
   - Run `gh release list --json tagName,name,publishedAt` to get ALL releases
   - Find the latest release (first in list)
   - Find the second-to-last release (may be several tags back)
   - **Key insight**: Not every tag has a release! We need to find the previous actual release, which may skip several tags

3. **Get All Tags Between Releases**:
   - Run `git tag --sort=-version:refname` to get all tags chronologically
   - Find all tags between the previous release tag and the latest release tag
   - Example: If latest release is `v0.0.44` and previous is `v0.0.40`, we need to capture commits from tags `v0.0.41`, `v0.0.42`, `v0.0.43`, and `v0.0.44`

### Step 2: Analyze Commits Between Releases

**Critical**: Use the previous RELEASE tag, not the previous version tag. Releases may skip tags!

1. **Get Commit Range**:
   - Run `git log <previous-release-tag>..<latest-release-tag> --oneline` to see ALL commits (not just merges)
   - This captures all commits across potentially multiple version tags
   - Example: `git log v0.0.40..v0.0.44 --oneline` captures commits from tags v0.0.41, v0.0.42, v0.0.43, and v0.0.44

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

3. **Update the Latest Release** (not create a new one):
   ```bash
   gh release edit <LATEST_RELEASE_TAG> --notes-file .tmp/release-notes.md
   ```
   - This UPDATES the existing latest release with new notes
   - Does NOT create a new release

4. **Confirm Success**:
   - Display release URL
   - Inform user about backup location
   - Confirm which release was updated (tag name and version)

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
1. Finds latest release: v0.0.44
2. Finds previous release: v0.0.40 (note: v0.0.41, v0.0.42, v0.0.43 don't have releases)
3. Gets ALL commits between v0.0.40..v0.0.44 (captures all 4 version bumps)
4. Identifies merged PRs from commits (#38, #39, #40, #41, #42, #43, #44)
5. Fetches details for each PR
6. Categorizes changes (3 bug fixes, 2 features, 2 docs updates)
7. Generates formatted release notes covering all changes since v0.0.40
8. Backs up current notes to .tmp/release-notes.backup.md
9. UPDATES existing v0.0.44 release with comprehensive notes
10. Shows release URL: https://github.com/org/repo/releases/tag/v0.0.44
```

**Key Point**: This updates the LATEST existing release (v0.0.44) with ALL changes since the PREVIOUS release (v0.0.40), even though there were tags v0.0.41-v0.0.43 in between without releases.

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

- **First Release**: No previous release exists
  - Use entire git history from first commit
  - Or use project initialization as starting point

- **Multiple Tags Between Releases**: Common scenario!
  - Not every version tag has a release
  - Must find previous actual RELEASE, not just previous tag
  - Use `gh release list` to find actual releases, not `git tag`
  - Example: Latest release v0.0.44, previous release v0.0.40
    - Captures commits from v0.0.41, v0.0.42, v0.0.43, v0.0.44
    - All changes since v0.0.40 are included in v0.0.44 release notes

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
gh release view --json tagName,name,publishedAt,url

# Get ALL releases (to find previous release, may skip several tags)
gh release list --json tagName,name,publishedAt

# Get all tags sorted by version
git tag --sort=-version:refname

# Get ALL commits between releases (captures multiple version tags)
git log v0.0.40..v0.0.44 --oneline
# This captures commits from v0.0.41, v0.0.42, v0.0.43, and v0.0.44

# Get PR details
gh pr view 123 --json number,title,body,labels,author,closedAt,url

# Backup current release notes before updating
mkdir -p .tmp
gh release view v0.0.44 --json body --jq .body > .tmp/release-notes.backup.md

# UPDATE existing release notes (not create new release)
gh release edit v0.0.44 --notes-file .tmp/release-notes.md

# Get release URL
gh release view v0.0.44 --json url --jq .url

# Verify update
gh release view v0.0.44 --json body --jq .body
```

## Tips for Best Release Notes

1. **Be User-Focused**: Describe changes from the user's perspective, not internal implementation
2. **Highlight Impact**: Explain why changes matter and what problems they solve
3. **Migration Guides**: For breaking changes, provide clear upgrade instructions
4. **Visual Hierarchy**: Use emojis and formatting to make scanning easy
5. **Credit Contributors**: Always acknowledge everyone who contributed
6. **Link Everything**: PRs, issues, commits, and compare views for full traceability
