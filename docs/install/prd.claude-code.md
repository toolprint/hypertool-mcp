# PRD: Claude Code Integration for HyperTool MCP

## Overview
Implement Claude Code integration for HyperTool MCP by creating custom slash commands that help users interact with toolset management features directly within their Claude Code workflow.

## Goals
- Provide seamless Claude Code integration for HyperTool MCP toolset management
- Create custom slash commands for each major MCP tool exposed by HyperTool
- Enable project-specific toolset management within Claude Code context
- Improve user experience with contextual command help and examples

## User Stories

### Story 1: NPX Command Installation
**As a developer**, I want to install HyperTool Claude Code commands in my project so that I can manage toolsets directly from Claude Code.

**Acceptance Criteria:**
- `npx -y @toolprint/hypertool-mcp claude-code` command available
- Commands installed to `.claude/commands/` directory
- Each major MCP tool has its own command file
- Commands include contextual help and usage examples

### Story 2: Toolset Management Commands
**As a developer**, I want to use slash commands in Claude Code to manage my toolsets so that I can quickly switch contexts without leaving my coding environment.

**Acceptance Criteria:**
- `/list-available-tools` command shows discovered tools
- `/build-toolset` command creates new toolsets
- `/equip-toolset` command switches active toolsets
- `/list-saved-toolsets` command shows existing toolsets
- `/get-active-toolset` command shows current configuration

## Technical Specifications

### Command Installation

**NPX Command:**
```bash
npx -y @toolprint/hypertool-mcp claude-code
```

**Installation Process:**
1. Check if project has `.claude/` directory, create if needed
2. Create `.claude/commands/` directory if it doesn't exist
3. Install command files for each major MCP tool
4. Provide confirmation and usage instructions

### Command Files Structure

**Location:** `.claude/commands/`

**Individual Command Files:**

1. **`list-available-tools.md`**
   - Discovers all tools from connected MCP servers
   - Shows namespaced tool names and descriptions
   - Includes server source information

2. **`build-toolset.md`**
   - Creates new toolset with selected tools
   - Accepts toolset name and tool selections
   - Provides examples of toolset creation

3. **`equip-toolset.md`**
   - Switches to a different toolset
   - Lists available toolsets for selection
   - Shows current active toolset status

4. **`list-saved-toolsets.md`**
   - Shows all existing toolsets
   - Displays tool counts and descriptions
   - Includes creation dates and status

5. **`get-active-toolset.md`**
   - Shows currently active toolset
   - Lists active tools and their sources
   - Provides toolset configuration details

### Command Content Structure

**Each command file should include:**

```markdown
# Command Name

Brief description of what the command does and when to use it.

## Usage
`Use the [mcp-tool-name] tool to [action description]`

## Parameters
- parameter1: Description of what this parameter does
- parameter2: Description with examples

## Examples
```
Example usage scenarios with expected outputs
```

## Common Use Cases
- Use case 1: When and why to use this command
- Use case 2: Typical workflow scenarios

## Tips
- Helpful tips for effective usage
- Performance considerations
- Best practices

## Related Commands
- Links to related toolset management commands
```

### Implementation Requirements

**Setup Script Location:**
- Main setup script: `src/scripts/claude-code/setup.ts`
- Command templates: `src/scripts/claude-code/commands/`
- Utility functions: `src/scripts/claude-code/utils.ts`
- All scripts compiled to `dist/scripts/claude-code/` for npx execution

**CLI Integration:**
- Add `claude-code` command to existing CLI argument parser
- Integrate with existing commander.js setup
- Add proper help text and documentation

**File Operations:**
- Create `.claude/commands/` directory safely
- Write command files with proper permissions
- Handle existing files gracefully (backup or prompt)
- Validate file system operations

**Command Templates:**
- Create template files for each MCP tool
- Include proper markdown formatting
- Add contextual help and examples
- Ensure consistency across all commands

### User Experience Requirements

**Installation Feedback:**
- Clear progress indicators during installation
- Success confirmation with next steps
- Error handling with resolution guidance
- Summary of installed commands

**Command Discoverability:**
- Commands appear in Claude Code slash command menu
- Consistent naming convention
- Clear descriptions in command files
- Proper categorization and organization

## Security Considerations

- Validate project directory structure before installation
- Use secure file operations with proper permissions
- Handle edge cases (no .claude directory, permission issues)
- Provide clear error messages for security-related failures

## Testing Requirements

**Unit Tests:**
- File system operations with mocked directories
- Command template generation
- CLI argument parsing for claude-code command
- Error handling for various edge cases

**Integration Tests:**
- End-to-end installation workflow
- Command file creation and validation
- Integration with existing Claude Code setup
- Cross-platform compatibility testing

## Documentation Requirements

**Installation Guide:**
- Clear instructions for NPX command
- Prerequisites and system requirements
- Troubleshooting common issues
- Examples of successful installations

**Command Reference:**
- Documentation of each slash command
- Usage examples and best practices
- Integration with existing workflows
- Performance tips and considerations

## Success Metrics

- Users can install commands with single NPX command
- All command files created successfully
- Commands appear in Claude Code slash menu
- Commands provide helpful context and examples
- Clear user feedback throughout process

## Future Enhancements

- Auto-detection of existing HyperTool MCP configuration
- Integration with project-specific toolsets
- Advanced command customization options
- Template system for custom commands
- Integration with other Claude Code features

## Implementation Notes

**Command Content Examples:**

```markdown
# List Available Tools

Discover all tools from connected MCP servers and see what's available for toolset creation.

## Usage
`Use the list-available-tools tool to see all discovered tools`

## Parameters
None required - this command shows all available tools from connected servers.

## Examples
```
Claude: Use the list-available-tools tool
```

This will show you all tools discovered from your configured MCP servers, including:
- Tool names (namespaced with server names)
- Descriptions of what each tool does
- Server sources
- Current availability status

## Common Use Cases
- Before creating a new toolset, see what tools are available
- Troubleshooting tool discovery issues
- Understanding which servers are connected and working

## Tips
- Run this command after adding new MCP servers to your configuration
- Use the output to select tools for new toolsets
- Tools are namespaced (e.g., "git.status") to avoid conflicts

## Related Commands
- Use /build-toolset to create toolsets with discovered tools
- Use /equip-toolset to activate toolsets with these tools
```

This approach ensures each command provides maximum context and utility for Claude Code users while maintaining consistency with the overall HyperTool MCP experience.
