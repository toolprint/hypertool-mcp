# Hypertool Restore Utility

This utility helps you restore all applications to their pre-Hypertool installation state. It's useful for testing the installer multiple times.

## Usage

### Dry Run (see what would be restored)

```bash
npm run restore:dry-run
```

### Actual Restore

```bash
npm run restore
```

## What it does

The restore utility will:

1. **Claude Desktop** (macOS)
   - Restore from `claude_desktop_config.backup.json` if it exists
   - Remove `mcp.hypertool.json`
   - Remove the backup file after restoration

2. **Cursor IDE**
   - Restore from `.mcp.backup.json` if it exists
   - Remove `mcp.hypertool.json`
   - Remove the backup file after restoration

3. **Claude Code** (current project)
   - Restore from `.mcp.backup.json` if it exists
   - Remove `mcp.hypertool.json`
   - Remove local `.claude/commands/ht/` directory
   - Remove the backup file after restoration

4. **Global Slash Commands**
   - Remove `~/.claude/commands/ht/` directory

## Testing Workflow

1. Run the installer: `npx -y @toolprint/hypertool-mcp --install`
2. Test the installation
3. Run the restore: `npm run restore`
4. Repeat as needed

## Notes

- The restore utility only affects files created by the Hypertool installer
- Original backups are preserved during restoration
- If no backup exists, the utility will skip that application
- Always run from the project root directory
