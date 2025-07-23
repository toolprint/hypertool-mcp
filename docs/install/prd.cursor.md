# PRD: Cursor IDE Integration for HyperTool MCP

## Overview
Implement comprehensive Cursor IDE integration for HyperTool MCP server with two installation methods: one-click badge installation and automated npx script setup.

## Goals
- Provide seamless Cursor IDE integration for HyperTool MCP
- Offer multiple installation paths for different user preferences
- Automate MCP configuration management with backup and cleanup options
- Enable users to proxy all their MCP tools through HyperTool for better performance

## User Stories

### Story 1: One-Click Installation
**As a developer**, I want to install HyperTool MCP in Cursor with a single click so that I can quickly get started without manual configuration.

**Acceptance Criteria:**
- README contains prominent installation badge
- Badge deep-links to cursor.com/install-mcp with pre-configured settings
- Installation automatically adds hypertool-mcp to user's Cursor MCP configuration
- User can immediately start using HyperTool MCP tools in Cursor

### Story 2: Automated Script Setup
**As a developer**, I want to run a single npx command to set up HyperTool MCP with my existing Cursor configuration so that all my current MCP tools are proxied through HyperTool.

**Acceptance Criteria:**
- `npx -y @toolprint/hypertool-mcp add-cursor` command available
- Script automatically detects and backs up existing Cursor MCP configuration
- All existing MCP servers are copied to HyperTool configuration
- User can choose to clean up original config or manage it manually
- Clear feedback provided throughout the process

## Technical Specifications

### One-Click Badge Installation

**Badge Code:**
```markdown
[![Install Hypertool MCP Server](https://cursor.com/deeplink/mcp-install-light.svg)](https://cursor.com/install-mcp?name=hypertool&config=JTdCJTIydHlwZSUyMiUzQSUyMnN0cmVhbWFibGUtaHR0cCUyMiUyQyUyMmNvbW1hbmQlMjIlM0ElMjJucHglMjAteSUyMCU0MHRvb2xwcmludCUyRmh5cGVydG9vbC1tY3AlMjAtLWNvbmZpZyUyMH4lMkYuY3Vyc29yJTJGbWNwLmpzb24lMjIlN0Q%3D)
```

**Placement:**
- Prominently displayed in README
- Include in "Quick Start" or "Installation" section
- Provide clear explanation of what the badge does

### NPX Script Implementation

**Command Structure:**
```bash
npx -y @toolprint/hypertool-mcp add-cursor
```

**File Locations:**
- Global Cursor config: `~/.cursor/mcp.json`
- Backup file: `~/.cursor/mcp.backup.json`
- HyperTool config: `~/.cursor/.mcp.ht.json`

**Configuration Management Flow:**

1. **Validation Phase:**
   - Check if `~/.cursor/mcp.json` exists
   - If not found, exit with message: "No mcp.json exists yet"
   - Validate JSON structure of existing config

2. **Backup Phase:**
   - Create backup at `~/.cursor/mcp.backup.json`
   - Preserve original file permissions and timestamps

3. **Configuration Copy Phase:**
   - Copy ALL existing MCP servers from `~/.cursor/mcp.json` to `~/.cursor/.mcp.ht.json`
   - Maintain exact server configurations (command, args, env, etc.)
   - Preserve any additional configuration properties

4. **HyperTool Integration Phase:**
   - Add hypertool entry to original `~/.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "hypertool": {
         "type": "stdio",
         "command": "npx",
         "args": ["-y", "@toolprint/hypertool-mcp", "--config", "~/.cursor/.mcp.ht.json"]
       }
     }
   }
   ```

5. **User Choice Phase:**
   - Prompt: "Would you like us to clean up your original Cursor config to only include hypertool-mcp? (y/n)"
   - **If Yes:** Replace original config with only hypertool entry
   - **If No:** Show informational message about manual cleanup

**Error Handling:**

- **Missing Config:** Exit gracefully if `~/.cursor/mcp.json` doesn't exist
- **Invalid JSON:** Show clear error message and exit
- **Permission Issues:** Handle file permission errors gracefully
- **Backup Conflicts:** Handle existing backup files appropriately

**User Feedback:**

- Clear progress indicators for each phase
- Success messages with next steps
- Error messages with resolution guidance
- Final summary of what was changed

## Implementation Requirements

### CLI Integration
- Add `add-cursor` command to existing CLI argument parser
- Integrate with existing commander.js setup
- Add proper help text and documentation

### Configuration Utilities
- Create `src/scripts/cursor/` directory structure for setup scripts
- Implement `CursorConfigManager` class for config operations in `src/scripts/cursor/`
- Add JSON validation and error handling
- Implement backup and restore functionality
- Ensure all scripts are packaged into `dist/scripts/` for npx execution

### User Interface
- Interactive prompts using existing CLI framework
- Clear progress indicators and status messages
- Colorized output for better user experience
- Proper error handling and user guidance

### Testing Requirements
- Unit tests for configuration management
- Integration tests with mock file system
- Error case testing (missing files, invalid JSON, permissions)
- End-to-end testing with actual Cursor configurations

## Security Considerations

- Validate all JSON input to prevent injection attacks
- Use secure file operations with proper permissions
- Backup original configurations before making changes
- Provide clear rollback instructions if needed

## Documentation Requirements

- Update README with both installation methods
- Add troubleshooting section for common issues
- Document configuration file locations and formats
- Provide examples of successful installations

## Success Metrics

- Users can install HyperTool MCP in Cursor with one click
- Automated script successfully migrates existing configurations
- Zero data loss during configuration migration
- Clear user feedback throughout the process
- Proper error handling and recovery options

## Future Enhancements

- Support for multiple Cursor installations
- Automatic detection of Cursor installation path
- Integration with Cursor's extension marketplace
- Advanced configuration validation and suggestions