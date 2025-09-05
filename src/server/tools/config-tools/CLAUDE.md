# Configuration Tools System

This document describes the configuration tools system that manages toolsets in HyperTool MCP, including behavior differences between standard mode and persona mode.

## Overview

The configuration tools system provides a unified interface for managing toolsets, whether they come from the regular toolset manager (standard mode) or from personas (persona mode). The system uses an **IToolsetDelegate** pattern to route operations to the appropriate manager based on the current mode.

## Architecture

```
ConfigToolsManager (Router)
├── Routes to PersonaManager when persona is active (persona mode)
└── Routes to ToolsetManager when no persona is active (standard mode)
```

## Tool Visibility Rules

### Standard Mode (No Active Persona)

When running without a persona (`--mcp-config` flag only):

**Visible Tools:**
- ✅ `list-available-tools` - Show all discovered tools from connected servers
- ✅ `build-toolset` - Create new toolsets
- ✅ `list-saved-toolsets` - List regular toolsets from preferences
- ✅ `equip-toolset` - Activate a regular toolset
- ✅ `delete-toolset` - Delete regular toolsets
- ✅ `unequip-toolset` - Deactivate current toolset
- ✅ `get-active-toolset` - Get information about active toolset
- ✅ `add-tool-annotation` - Add notes to tools
- ✅ `exit-configuration-mode` - Exit configuration mode (when menu enabled)

**Hidden Tools:**
- ❌ `list-personas` - Not shown (persona system not in use)

### Persona Mode (Active Persona)

When running with a persona (`--persona` flag):

**Visible Tools:**
- ✅ `list-available-tools` - Show all discovered tools from connected servers
- ✅ `list-saved-toolsets` - List persona toolsets (NO "persona:" prefix needed)
- ✅ `equip-toolset` - Activate a persona toolset (use plain name, not prefixed)
- ✅ `unequip-toolset` - Deactivate current persona toolset
- ✅ `get-active-toolset` - Get information about active persona toolset
- ✅ `add-tool-annotation` - Add notes to tools in persona toolsets
- ✅ `list-personas` - Show available personas for reference
- ✅ `exit-configuration-mode` - Exit configuration mode (when menu enabled)

**Hidden Tools:**
- ❌ `build-toolset` - Cannot create toolsets in persona mode
- ❌ `delete-toolset` - Cannot delete persona toolsets (they're read-only)

## Tool Behaviors

### list-saved-toolsets

**Standard Mode:**
- Returns toolsets from user preferences store
- Format: `{ name: "my-toolset", description: "...", ... }`

**Persona Mode:**
- Returns toolsets from the active persona
- Format: `{ name: "utility-tools", description: "...", ... }`
- NO "persona:" prefix in the names (they're just the toolset names)

### equip-toolset

**Standard Mode:**
- Expects: Regular toolset name (e.g., "my-toolset")
- Action: Loads toolset from preferences and activates it

**Persona Mode:**
- Expects: Persona toolset name without prefix (e.g., "utility-tools", NOT "persona:utility-tools")
- Action: Switches to specified toolset within the active persona

### delete-toolset

**Standard Mode:**
- Can delete any regular toolset from preferences

**Persona Mode:**
- Hidden from tools list (not available)
- If called directly: Returns error "Cannot delete persona toolsets"

### build-toolset

**Standard Mode:**
- Can create new toolsets and save to preferences

**Persona Mode:**
- Hidden from tools list (not available)
- If called directly: Returns error "Cannot build toolsets in persona mode"

### get-active-toolset

**Standard Mode:**
- Returns currently active regular toolset info
- Shows tool availability and server status

**Persona Mode:**
- Returns currently active persona toolset info
- Shows which persona toolset is active within the current persona

## IToolsetDelegate Pattern

Both PersonaManager and ToolsetManager implement the IToolsetDelegate interface:

```typescript
interface IToolsetDelegate {
  listSavedToolsets(): Promise<ListSavedToolsetsResponse>;
  equipToolset(name: string): Promise<EquipToolsetResponse>;
  deleteToolset(name: string): Promise<DeleteToolsetResponse>;
  getActiveToolset(): Promise<GetActiveToolsetResponse>;
  hasActiveToolset(): boolean;
  getDelegateType(): 'regular' | 'persona';
}
```

The ConfigToolsManager routes to the appropriate delegate:

```typescript
private getActiveToolsetDelegate(): IToolsetDelegate {
  const activePersona = this.dependencies.personaManager?.getActivePersona();
  
  if (activePersona) {
    // Persona is active - route to PersonaManager
    return this.dependencies.personaManager as IToolsetDelegate;
  } else {
    // No persona - route to ToolsetManager
    return this.dependencies.toolsetManager as IToolsetDelegate;
  }
}
```

## Configuration Menu Mode

When `HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=true` (default):

### Normal Mode
- Shows only MCP tools from active toolset
- Shows `enter-configuration-mode` tool to access config tools

### Configuration Mode
- Shows only configuration tools
- Shows `exit-configuration-mode` tool to return to normal mode

When `HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=false`:
- All tools (configuration and MCP) are shown together at all times
- No mode switching needed

## Persona Config Tools

The persona-specific configuration tools are located in `config-tools/persona/`:

### list-personas
- **Purpose**: List available personas for reference
- **Visibility**: Only shown when a persona is active
- **Location**: `config-tools/persona/list-personas.ts`
- **Usage**: Helps users understand available personas while in persona mode

### Other Persona Tools (Not Currently Used)
These tools exist but are not exposed through ConfigToolsManager:
- `activate-persona.ts` - Would activate a different persona
- `deactivate-persona.ts` - Would deactivate current persona
- `get-active-persona.ts` - Would get current persona info
- `validate-persona.ts` - Would validate persona configuration

These are kept for potential future use but are not part of the current configuration tools menu.

## Testing

### Test Scripts

**test-config-tools.sh**
- Tests tool visibility in both standard and persona modes
- Verifies tool hiding logic works correctly
- Validates session management for HTTP transport

**test-persona-toolset-activation.sh**
- Tests persona toolset switching at runtime
- Verifies PersonaManager.getMcpTools() filters tools correctly
- Validates tool availability matches persona toolset definitions

### Expected Behaviors to Test

1. **Standard Mode Tool Visibility**
   - All configuration tools visible except `list-personas`
   - Can create and delete toolsets
   
2. **Persona Mode Tool Visibility**
   - `build-toolset` and `delete-toolset` hidden
   - `list-personas` visible
   
3. **Toolset Operations**
   - Equipping toolsets works in both modes
   - Persona toolsets cannot be deleted
   - Toolset names in persona mode don't need prefixes

4. **Tool Routing**
   - PersonaManager.getMcpTools() used in persona mode
   - ToolsetManager.getMcpTools() used in standard mode
   - Tools filtered based on active toolset

## Implementation Notes

### Key Files

- `config-tools/manager.ts` - Main ConfigToolsManager that handles routing
- `config-tools/registry.ts` - Registry of all configuration tool factories
- `config-tools/tools/*.ts` - Individual tool implementations
- `config-tools/persona/*.ts` - Persona-specific tools (only list-personas used)

### Important Behaviors

1. **No "persona:" prefix in persona mode** - Toolset names are used directly
2. **Tool hiding vs errors** - Tools are hidden from list, not just returning errors
3. **Delegate pattern** - Same tool calls route to different managers based on mode
4. **Independent modules** - PersonaManager and ToolsetManager are independent

### Common Issues and Solutions

**Issue**: Persona toolsets showing with "persona:" prefix
**Solution**: PersonaManager should return plain toolset names, no prefix needed

**Issue**: Can't equip persona toolsets
**Solution**: Use plain toolset name (e.g., "utility-tools"), not "persona:utility-tools"

**Issue**: Tools not filtering in persona mode
**Solution**: Ensure PersonaManager.getMcpTools() is implemented and server is in persona mode

**Issue**: Configuration tools showing in normal mode
**Solution**: Check HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU environment variable