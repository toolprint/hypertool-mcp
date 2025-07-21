# PRD: Claude Desktop Integration for HyperTool MCP

## Overview
Implement Claude Desktop integration for HyperTool MCP by creating an automated setup script that configures Claude Desktop to use HyperTool as a proxy for all MCP servers, improving tool performance and organization.

## Goals
- Provide seamless Claude Desktop integration for HyperTool MCP
- Automate the process of configuring Claude Desktop MCP settings
- Migrate existing MCP server configurations to HyperTool proxy setup
- Offer users choice between automated cleanup and manual configuration management

## User Stories

### Story 1: NPX Command Installation
**As a developer**, I want to configure Claude Desktop to use HyperTool MCP with a single command so that all my existing MCP tools are proxied through HyperTool for better performance.

**Acceptance Criteria:**
- `npx -y @toolprint/hypertool-mcp claude-desktop` command available
- Automatically detects and backs up existing Claude Desktop configuration
- Copies all existing MCP servers to HyperTool configuration
- Adds HyperTool as the primary MCP server in Claude Desktop

### Story 2: Configuration Management
**As a developer**, I want the option to clean up my Claude Desktop configuration automatically or manually so that I can choose the level of automation that works for my workflow.

**Acceptance Criteria:**
- Script creates backup of original configuration
- All existing MCP servers copied to HyperTool proxy configuration
- User prompted to choose automatic cleanup or manual management
- Clear instructions provided for both options

## Technical Specifications

### Command Structure

**NPX Command:**
```bash
npx -y @toolprint/hypertool-mcp claude-desktop
```

### Configuration File Management

**File Locations (macOS):**
- Claude Desktop config: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Backup file: `~/Library/Application Support/Claude/claude_desktop_config.backup.json`
- HyperTool config: `~/Library/Application Support/Claude/.mcp.ht.json`

**Configuration Flow:**

1. **Validation Phase:**
   - Check if Claude Desktop config exists
   - Validate JSON structure of existing configuration
   - Verify HyperTool MCP is available

2. **Backup Phase:**
   - Create backup at `claude_desktop_config.backup.json`
   - Preserve original file permissions and timestamps
   - Confirm backup creation success

3. **Configuration Copy Phase:**
   - Copy ALL existing MCP servers to `.mcp.ht.json`
   - Maintain exact server configurations (command, args, env, etc.)
   - Preserve any additional configuration properties

4. **HyperTool Integration Phase:**
   - Add HyperTool entry to original Claude Desktop config:
   ```json
   {
     "mcpServers": {
       "hypertool": {
         "type": "stdio",
         "command": "npx",
         "args": ["-y", "@toolprint/hypertool-mcp", "--config", "~/Library/Application Support/Claude/.mcp.ht.json"]
       }
     }
   }
   ```

5. **User Choice Phase:**
   - Prompt: "Would you like us to clean up your original Claude Desktop config to only include hypertool-mcp? (y/n)"
   - **If Yes:** Replace original config with only HyperTool entry, create backup
   - **If No:** Show informational message about manual cleanup

### Implementation Requirements

**Setup Script Location:**
- Main setup script: `src/scripts/claude-desktop/setup.ts`
- Configuration manager: `src/scripts/claude-desktop/ConfigManager.ts`
- Backup utilities: `src/scripts/claude-desktop/backup.ts`
- All scripts compiled to `dist/scripts/claude-desktop/` for npx execution

**CLI Integration:**
- Add `claude-desktop` command to existing CLI argument parser
- Integrate with existing commander.js setup
- Add proper help text and documentation

**Configuration Management:**
- Create `ClaudeDesktopConfigManager` class
- Implement JSON validation and parsing
- Add atomic file operations for safety
- Handle configuration merging and cleanup

**User Interaction:**
- Interactive prompts using existing CLI framework
- Clear progress indicators and status messages
- Colorized output for better user experience
- Proper error handling and user guidance

### Error Handling

**Missing Configuration:**
- Exit gracefully if `claude_desktop_config.json` doesn't exist
- Show message: "No Claude Desktop configuration found. Please run Claude Desktop first to create initial configuration."

**Invalid JSON:**
- Show clear error message with file location
- Provide guidance on fixing JSON syntax issues
- Exit without making changes

**Permission Issues:**
- Handle file permission errors gracefully
- Provide clear instructions for resolving permission issues
- Suggest running with appropriate permissions

**Backup Conflicts:**
- Check for existing backup files
- Prompt user for action if backup already exists
- Provide options to overwrite or skip backup

### User Experience Requirements

**Installation Feedback:**
- Clear progress indicators for each phase
- Success messages with next steps
- Error messages with resolution guidance
- Final summary of changes made

**Configuration Summary:**
- Show list of MCP servers that were migrated
- Display location of backup file
- Explain what HyperTool proxy will do
- Provide next steps for testing

**Cleanup Options:**
- Clear explanation of cleanup vs manual management
- Show what will be removed/kept in each option
- Provide undo instructions for both choices
- Confirm user's selection before proceeding

## Security Considerations

**File Operations:**
- Validate all file paths before operations
- Use secure file operations with proper permissions
- Create backups before making any changes
- Verify backup integrity before proceeding

**Configuration Validation:**
- Validate JSON structure before processing
- Sanitize configuration values
- Prevent injection attacks through configuration
- Validate server configurations before copying

## Testing Requirements

**Unit Tests:**
- Configuration file parsing and validation
- Backup creation and restoration
- JSON manipulation and merging
- Error handling for various scenarios

**Integration Tests:**
- End-to-end configuration migration
- Claude Desktop integration testing
- File system operations with mocked directories
- User interaction flow testing

**Platform Testing:**
- macOS-specific path handling
- File permission handling
- JSON file operations
- Claude Desktop config format validation

## Documentation Requirements

**Installation Guide:**
- Clear instructions for NPX command
- Prerequisites (Claude Desktop installed)
- System requirements and limitations
- Troubleshooting common issues

**Configuration Reference:**
- Explanation of file locations and formats
- Backup and restore procedures
- Manual configuration options
- Integration with existing workflows

## Success Metrics

- Users can configure Claude Desktop with single NPX command
- All existing MCP servers successfully migrated to HyperTool
- Backup created successfully for all configurations
- User choice respected for cleanup vs manual management
- Clear feedback provided throughout process

## Future Enhancements

- Support for other operating systems (Windows, Linux)
- Advanced configuration validation and suggestions
- Integration with Claude Desktop settings UI
- Automated testing with different Claude Desktop versions
- Configuration export/import functionality

## Implementation Examples

**Configuration Migration Example:**

**Original `claude_desktop_config.json`:**
```json
{
  "mcpServers": {
    "git": {
      "type": "stdio",
      "command": "git-mcp-server"
    },
    "filesystem": {
      "type": "stdio",
      "command": "fs-mcp-server"
    },
    "docker": {
      "type": "stdio",
      "command": "docker-mcp-server"
    }
  }
}
```

**After Migration:**

**New `claude_desktop_config.json`:**
```json
{
  "mcpServers": {
    "hypertool": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@toolprint/hypertool-mcp", "--config", "~/Library/Application Support/Claude/.mcp.ht.json"]
    }
  }
}
```

**Created `.mcp.ht.json`:**
```json
{
  "mcpServers": {
    "git": {
      "type": "stdio",
      "command": "git-mcp-server"
    },
    "filesystem": {
      "type": "stdio",
      "command": "fs-mcp-server"
    },
    "docker": {
      "type": "stdio",
      "command": "docker-mcp-server"
    }
  }
}
```

This approach ensures that all existing MCP functionality is preserved while gaining the benefits of HyperTool's toolset management and performance improvements.