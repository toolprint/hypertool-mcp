---
"@toolprint/hypertool-mcp": patch
---

Add semantic versioning with changesets for better release management

- Install and configure @changesets/cli for proper version management
- Update GitHub Actions to use changesets for version bumps instead of always patch
- Add changeset automation bot for PR guidance and validation
- Update justfile and documentation with changeset workflow
- Maintain backward compatibility with existing beta/stable release strategy
- Automatic patch fallback when no changesets are provided for merges
- Improve local testing with version suffixes and proper package.json restoration
- Add comprehensive GitHub Actions permissions for workflow automation
