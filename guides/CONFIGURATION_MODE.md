# Configuration Mode Guide

## Overview

HyperTool MCP features a Configuration Mode system that separates toolset management tools from operational tools. This provides a cleaner, more focused experience for AI assistants by showing only relevant tools at the right time.

## How It Works

### Two Modes of Operation

1. **Configuration Mode**: Shows only tools for creating and managing toolsets
   - `list-available-tools` - Discover tools from connected MCP servers
   - `build-toolset` - Create new toolsets with specific tools
   - `list-saved-toolsets` - View all saved toolsets
   - `equip-toolset` - Activate a toolset
   - `delete-toolset` - Remove a saved toolset
   - `unequip-toolset` - Deactivate the current toolset
   - `get-active-toolset` - Check which toolset is active
   - `add-tool-annotation` - Add notes to tools in toolsets
   - `exit-configuration-mode` - Return to normal operation

2. **Normal Mode**: Shows tools from your equipped toolset
   - All tools from the currently equipped toolset
   - `enter-configuration-mode` - Switch to configuration mode
   - If no toolset is equipped, only the mode switching tool is available

## Automatic Mode Selection

The server intelligently determines the initial mode based on your setup:

- **Has saved toolset** → Starts in Normal Mode with that toolset active
- **No saved toolset** → Starts in Configuration Mode to help you get started
- **After equipping a toolset** → Automatically switches to Normal Mode
- **After building with `autoEquip`** → Automatically switches to Normal Mode

## Mode Switching

### Manual Switching

```bash
# In Normal Mode - to configure toolsets
enter-configuration-mode

# In Configuration Mode - to return to operational tools
exit-configuration-mode
```

### Automatic Switching

Configuration Mode automatically exits to Normal Mode when:
- You successfully equip a toolset using `equip-toolset`
- You build a new toolset with `autoEquip: true`

## Common Workflows

### First Time Setup

1. Server starts in Configuration Mode (no toolset equipped)
2. Use `list-available-tools` to see what's available
3. Use `build-toolset` to create your toolset
4. The server automatically switches to Normal Mode
5. Your tools are now ready to use

### Switching Toolsets

1. In Normal Mode, call `enter-configuration-mode`
2. Use `list-saved-toolsets` to see your options
3. Use `equip-toolset` to activate a different toolset
4. Server automatically returns to Normal Mode with new tools

### Creating a New Toolset

```bash
# From Normal Mode
enter-configuration-mode

# See what tools are available
list-available-tools

# Create a new toolset
build-toolset name="dev-tools" tools=[...] autoEquip=true

# Automatically returns to Normal Mode with new toolset active
```

## Benefits

1. **Reduced Cognitive Load**: AI assistants only see relevant tools
2. **Cleaner Tool Lists**: No mixing of configuration and operational tools
3. **Intuitive Flow**: Automatic mode switching reduces manual steps
4. **Backward Compatible**: Can be disabled if you prefer all tools visible

## Disabling Configuration Mode

If you prefer the legacy behavior where all tools are always visible, you can disable Configuration Mode:

### Via Environment Variable

```bash
HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=false hypertool-mcp
```

### Via Configuration File

Add to your HyperTool config file (`~/.toolprint/hypertool-mcp/config.json`):
```json
{
  "featureFlags": {
    "enableConfigToolsMenu": false
  }
}
```

When disabled, all configuration tools and operational tools are exposed together, matching the pre-configuration-mode behavior.

## Troubleshooting

### Q: Why don't I see any tools?
**A:** You're likely in Normal Mode without an equipped toolset. Use `enter-configuration-mode` to access toolset management tools.

### Q: Why can't I see my Git/Docker/etc. tools?
**A:** You're likely in Configuration Mode. Use `exit-configuration-mode` to return to your operational tools.

### Q: How do I know which mode I'm in?
**A:** Check the available tools:
- If you see `enter-configuration-mode` → You're in Normal Mode
- If you see `exit-configuration-mode` → You're in Configuration Mode

### Q: The server always starts in Configuration Mode even though I have a toolset
**A:** Make sure your toolset was properly saved. Use `get-active-toolset` to check if a toolset is equipped.

## Advanced Tips

- Use `get-active-toolset` in any mode to check your current toolset status
- Configuration Mode changes trigger `tools_changed` notifications, so clients automatically refresh
- Mode state is global (affects all connected clients) but doesn't persist across server restarts
- The initial mode is determined by whether a toolset was previously equipped and saved

## Related Documentation

- [Getting Started](../README.md#quick-start) - Initial setup guide
- [Advanced Configuration](./ADVANCED.md) - Advanced toolset configurations
- [Examples](./EXAMPLES.md) - Example toolset configurations
