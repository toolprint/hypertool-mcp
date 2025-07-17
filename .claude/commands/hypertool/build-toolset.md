---
allowed-tools:
  - build-toolset
description: Creates new toolset with selected tools from available MCP servers via HyperTool
---

# Build Toolset

Creates new toolset with selected tools from available MCP servers via HyperTool

## Usage
Use the build-toolset tool from the HyperTool MCP server with toolset name and tool selections

## Parameters
- toolsetName: Name for the new toolset (required)
- toolList: Array of tool names to include (use namespaced names from list-available-tools)
- description: Optional description for the toolset

## Examples
Use the build-toolset tool with parameters:
{
  "toolsetName": "development",
  "toolList": ["git.status", "git.commit", "docker.list_containers"],
  "description": "Essential development tools"
}

This will create a new toolset called "development" with the specified tools.

## Common Use Cases
- Create project-specific toolsets for different workflows
- Group related tools together for easier management
- Build specialized toolsets for different team members or contexts

## Tips
- Use descriptive names for your toolsets
- Include only the tools you actually need to reduce complexity
- Run list-available-tools first to see what tools are available

## Related Commands
- Use /list-available-tools to see available tools before building
- Use /equip-toolset to activate your new toolset
- Use /list-saved-toolsets to see all your created toolsets
