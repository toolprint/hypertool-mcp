# Claude Code Installation Improvements

**Created**: 2025-07-23
**Reference Commit**: 0c683824b5736993ab134616d30b528166148997
**Branch**: cleanup-prod

## Problem Statement

The Claude Code installation process for hypertool-mcp has several usability issues:

1. **No global vs local installation choice**: Users cannot choose between global Claude Code installation or project-specific installation.

2. **Missing configuration locations in help**: The `--help` output doesn't show where hypertool MCP configurations are stored for different clients (Claude, Claude Code, Cursor).

3. **No detection of external MCP additions**: When users run `claude add mcp` to add new MCPs directly through Claude Code, hypertool doesn't detect or warn about these additions.

## Current Behavior

### Issue 1: Installation Scope
Currently, the install command doesn't ask users about installation scope:
- Always installs globally (or always locally)
- No user choice for project-specific vs global installation
- Doesn't show which directory is being used

### Issue 2: Configuration Visibility
The `--help` command output doesn't include:
- Where Claude Desktop configs are stored
- Where Claude Code configs are stored
- Where Cursor configs are stored
- How to manually edit these configs

### Issue 3: External MCP Detection
When hypertool starts:
- Doesn't check if other MCPs exist in client configs
- Doesn't warn about MCPs added outside hypertool
- No guidance on porting external MCPs to hypertool

## Expected Behavior

### Issue 1: Installation Choice
When running installation commands, the system should:
1. Detect if in a valid project directory
2. Ask user: "Install hypertool-mcp globally or for this project only?"
3. For local install:
   - Show current working directory
   - Confirm this is the intended project
4. For global install:
   - Install to user's global config
5. Apply same logic to slash commands

### Issue 2: Help Enhancement
The `--help` output should include a new section:
```
Configuration Locations:
  Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json
  Claude Code:    ~/.claude.json (global)
                  ./.mcp.json (project)
  Cursor:         ~/.cursor/mcp.json

Use --install to manage hypertool in these configurations.
```

### Issue 3: MCP Detection & Warning
On server startup:
1. Read client configurations
2. Detect non-hypertool MCPs
3. If found, output warning:
```
⚠️  Other MCP servers detected in your Claude Code configuration:
   - example-mcp
   - another-mcp

   These servers won't be managed by hypertool.
   Run 'hypertool --install' to import them into your hypertool configuration.
```

4. The `--install` command should:
   - Detect external MCPs
   - Offer to import them
   - Add them to hypertool's MCP config
   - Preserve their settings

## Technical Implementation

### Code Locations
- Installation logic: `src/scripts/install.ts` (or similar)
- Help command: CLI argument parser
- Config detection: Server initialization
- Config paths: Platform-specific config utilities

### Solution Approach

1. **Installation Flow**:
   ```typescript
   // Pseudo-code
   async function installClaudeCode() {
     const inProject = await isValidProject();

     if (inProject) {
       const choice = await prompt(
         'Install hypertool-mcp:\n' +
         '1. Globally (all projects)\n' +
         '2. This project only: ' + process.cwd()
       );

       if (choice === 'project') {
         await installToProject();
       } else {
         await installGlobally();
       }
     } else {
       await installGlobally();
     }
   }
   ```

2. **Config Path Detection**:
   ```typescript
   function getConfigPaths() {
     return {
       claudeDesktop: {
         mac: '~/Library/Application Support/Claude/claude_desktop_config.json',
         windows: '%APPDATA%/Claude/claude_desktop_config.json',
         linux: '~/.config/Claude/claude_desktop_config.json'
       },
       claudeCode: {
         global: '~/.claude.json',
         local: './.mcp.json'
       },
       cursor: {
         path: '~/.cursor/mcp/settings.json'
       }
     };
   }
   ```

3. **External MCP Detection**:
   ```typescript
   async function detectExternalMCPs() {
     const configs = await readClientConfigs();
     const externalMCPs = [];

     for (const [name, config] of Object.entries(configs.mcpServers)) {
       if (name !== 'hypertool-mcp') {
         externalMCPs.push({ name, config });
       }
     }

     return externalMCPs;
   }
   ```

## User Experience Flow

### Installation Flow
```
$ hypertool install claude-code

? Where would you like to install hypertool-mcp?
  ❯ Globally (all projects)
    This project only (/Users/me/my-project)

Installing to: ~/.claude.json

✓ MCP server configuration added
✓ Slash commands installed

Other MCPs detected:
  - example-mcp
  - test-mcp

? Would you like to import these into hypertool? (Y/n)

✓ Imported 2 MCP configurations
✓ Installation complete!
```

### Startup Warning
```
$ hypertool

⚠️  External MCP servers detected:
   - example-mcp (not managed by hypertool)

   Run 'hypertool install --import' to add to hypertool config.

Starting hypertool server...
```

## Testing Requirements

1. **Installation Tests**:
   - Test global vs local prompts
   - Test project detection
   - Test both installation paths work
   - Test slash command installation

2. **Config Path Tests**:
   - Test path resolution on each platform
   - Test help output includes paths
   - Test paths are accessible

3. **MCP Detection Tests**:
   - Test detection of external MCPs
   - Test import functionality
   - Test warning messages
   - Test preservation of MCP settings

## Impact Analysis

- **Breaking Changes**: None - adds new features
- **Compatibility**: Maintains existing behavior as default
- **User Experience**: Significantly improved clarity and control
- **Migration**: Smooth path for existing external MCPs

## Success Criteria

1. Users can choose global vs local installation
2. Help clearly shows config file locations
3. External MCPs are detected and user is warned
4. Import process preserves all MCP settings
5. Clear documentation for all new features
