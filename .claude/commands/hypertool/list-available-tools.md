---
allowed-tools:
  - list-available-tools
description: Discover all tools from connected MCP servers via HyperTool proxy
---

# List Available Tools

Discover all tools from connected MCP servers via HyperTool proxy

## Usage
Use the list-available-tools tool from the HyperTool MCP server to see all discovered tools

## Parameters
None required - this command shows all available tools from connected servers.

## Examples
Use the list-available-tools tool to see all tools discovered from your configured MCP servers.

This will show you:
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
