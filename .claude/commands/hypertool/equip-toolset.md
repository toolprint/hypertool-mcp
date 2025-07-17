---
allowed-tools:
  - equip-toolset
description: Switches to a different toolset via HyperTool, making its tools available for use
---

# Equip Toolset

Switches to a different toolset via HyperTool, making its tools available for use

## Usage
Use the equip-toolset tool from the HyperTool MCP server with the name of the toolset to activate

## Parameters
- toolsetName: Name of the toolset to activate (required)

## Examples
Use the equip-toolset tool with parameters:
{
  "toolsetName": "development"
}

This will activate the "development" toolset and make its tools available.

## Common Use Cases
- Switch between different tool configurations for different projects
- Activate specialized toolsets for specific workflows
- Change context quickly without reconfiguring tools manually

## Tips
- Only one toolset can be active at a time
- Equipping a new toolset will replace the currently active one
- Use get-active-toolset to see what's currently equipped

## Related Commands
- Use /list-saved-toolsets to see available toolsets
- Use /get-active-toolset to see what's currently active
- Use /build-toolset to create new toolsets
