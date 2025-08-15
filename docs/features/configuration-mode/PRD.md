# Configuration Mode for HyperTool MCP

## Metadata
- **Author**: Assistant
- **Created**: 2025-01-15
- **Status**: Final Draft
- **Priority**: P1
- **Reference Commit**: TBD
- **Reference Branch**: mcp-tool-config-menu

## Problem Statement

Currently, HyperTool exposes all configuration tools (toolset management, annotations) alongside the actual working tools from downstream MCP servers. This creates noise and confusion for AI assistants, as configuration tools appear mixed with operational tools.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MCP Client (Claude/Cursor)                   │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ Tool Requests
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EnhancedMCPServer                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Mode State: configurationMode: boolean                      │   │
│  │ - Initialization: Check if toolset equipped                 │   │
│  │ - Mode switching logic                                      │   │
│  │ - tools_changed notifications                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ listTools() {                                               │   │
│  │   if (configurationMode) {                                  │   │
│  │     return configToolsManager.getMcpTools();               │   │
│  │   } else {                                                  │   │
│  │     return toolsetManager.getMcpTools();                   │   │
│  │   }                                                         │   │
│  │ }                                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────┬──────────────────────────┬────────────────────────┘
                 │                           │
    Configuration Mode                   Normal Mode
                 │                           │
                 ▼                           ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│    ConfigToolsManager       │  │      ToolsetManager         │
│                             │  │                             │
│  Tools Exposed:             │  │  Tools Exposed:             │
│  ✓ list-available-tools    │  │  ✓ Tools from equipped      │
│  ✓ build-toolset           │  │    toolset (if equipped)    │
│  ✓ list-saved-toolsets     │  │  ✓ OR empty array          │
│  ✓ equip-toolset           │  │    (if no toolset)          │
│  ✓ delete-toolset          │  │  ✓ enter-configuration-mode │
│  ✓ unequip-toolset         │  │                             │
│  ✓ get-active-toolset      │  │  ✗ No config tools          │
│  ✓ add-tool-annotation     │  │                             │
│  ✓ exit-configuration-mode │  │                             │
│                             │  │                             │
│  ✗ No downstream tools     │  │                             │
└─────────────────────────────┘  └──────────────┬───────────────┘
                                                │
                                                ▼
                                 ┌──────────────────────────────┐
                                 │    DiscoveryEngine           │
                                 │  (Downstream MCP Servers)    │
                                 │                              │
                                 │  - git-server                │
                                 │  - docker-server             │
                                 │  - filesystem-server         │
                                 │  - notion-server             │
                                 │  - etc...                    │
                                 └──────────────────────────────┘

Mode Switching Flow:
════════════════════

1. Server Start:
   ┌──────────┐
   │  START   │──► Has Equipped Toolset? ──► YES ──► Normal Mode
   └──────────┘                │
                               NO
                               ▼
                        Configuration Mode

2. Mode Transitions:
   Normal Mode ──► Call: enter-configuration-mode ──► Configuration Mode
   Configuration Mode ──► Call: exit-configuration-mode ──► Normal Mode
   Configuration Mode ──► Call: equip-toolset (success) ──► Normal Mode (auto)
   Configuration Mode ──► Call: build-toolset (autoEquip) ──► Normal Mode (auto)
```

## Proposed Solution

Implement a "Configuration Mode" that:
1. **Normal Mode**: Shows only the tools from the currently equipped toolset (or no tools if no toolset is equipped)
2. **Configuration Mode**: Shows only configuration/management tools for creating and managing toolsets
3. **Mode Switching**: Provides tools to toggle between modes
4. **Smart Initialization**: Start in Configuration Mode when no toolset is equipped, Normal Mode when a toolset is active

## Requirements Specification

### Core Functionality

#### 1. Mode Management
- **Current State**: Single mode with all tools exposed
- **Proposed State**: Two distinct modes (Normal, Configuration)
- **Initialization Logic**:
  - If a toolset is equipped (from preferences file): Start in **Normal Mode**
  - If no toolset is active: Start in **Configuration Mode**
- **Mode Scope**: Global for all clients connected to the server

#### 2. Tool Exposure Rules

**Normal Mode:**
- If toolset equipped: Show only tools from that toolset
- If no toolset equipped: Show no tools (empty array) except mode-switching tool
- Hide ALL configuration tools
- Expose single mode-switching tool: `enter-configuration-mode`

**Configuration Mode:**
- Hide ALL downstream server tools
- Show only configuration tools:
  - `list-available-tools` (retains current behavior - shows all discovered tools)
  - `build-toolset`
  - `list-saved-toolsets`
  - `equip-toolset`
  - `delete-toolset`
  - `unequip-toolset`
  - `get-active-toolset`
  - `add-tool-annotation`
  - `exit-configuration-mode`

#### 3. Mode Switching Behavior

**`open-toolset-menu`** (Recommended name)
- Available only in Normal mode
- Opens the toolset configuration menu
- Does NOT unequip current toolset
- Triggers `tools_changed` notification
- Returns confirmation with list of available configuration tools
- Description clearly lists all available configuration options

**`close-toolset-menu`** (Recommended name)
- Available only in Configuration mode
- Closes the menu and returns to operational tools
- Triggers `tools_changed` notification
- Returns confirmation with current toolset status
- Description explains what tools will be available after closing

**Auto-Exit Triggers:**
- When `equip-toolset` succeeds → automatically exit to Normal mode
- When `build-toolset` with `autoEquip: true` succeeds → automatically exit to Normal mode

### Technical Architecture

#### State Management
- Track current mode in the MCP Server (EnhancedMCPServer)
- Mode state is session-based (persists across tool calls)
- Mode state does NOT persist across server restarts
- Global mode state (not per-client)

#### Component Architecture

**ConfigToolsManager** (New Component)
- Manages all configuration-related tools
- Located at: `src/config-tools/manager.ts`
- Responsibilities:
  - Register configuration tool modules
  - Provide `getMcpTools()` method for configuration tools
  - Handle tool execution routing for config tools
  - Manage mode-switching tools (`enter-configuration-mode`, `exit-configuration-mode`)

**ToolsetManager** (Existing)
- Continues to manage toolset tools
- No changes to its core responsibility
- `getMcpTools()` returns tools based on equipped toolset

**EnhancedMCPServer** (Modified)
- Maintains `configurationMode` state
- Instantiates both ToolsetManager and ConfigToolsManager
- Tool exposure logic:
  ```typescript
  // Pseudocode
  if (this.configurationMode) {
    return this.configToolsManager.getMcpTools();
  } else {
    return this.toolsetManager.getMcpTools();
  }
  ```

#### Tool Filtering & Exposure
- **Server Responsibility**: The MCP server determines which manager to query based on mode
- **Normal Mode**: Server calls `toolsetManager.getMcpTools()` 
- **Configuration Mode**: Server calls `configToolsManager.getMcpTools()`
- Clean separation of concerns: 
  - ToolsetManager handles toolsets
  - ConfigToolsManager handles config tools
  - Server handles mode switching and routing

#### Notifications
- Mode changes MUST trigger `tools_changed` notification
- Clients will re-fetch tool list and see new set of exposed tools
- Ensures client UI updates appropriately

## Implementation Details

### ConfigToolsManager Class

```typescript
// src/config-tools/manager.ts
export class ConfigToolsManager {
  private toolModules: ToolModule[] = [];
  private dependencies: ToolDependencies;
  private configurationMode: boolean = false;

  constructor(dependencies: ToolDependencies) {
    this.dependencies = dependencies;
    this.registerTools();
  }

  private registerTools(): void {
    // Register all configuration tools
    // Including new mode-switching tools
  }

  getMcpTools(): Tool[] {
    // Return all configuration tools
    // Include enter/exit configuration mode tools based on current mode
  }

  async handleToolCall(name: string, args: any): Promise<any> {
    // Route tool calls to appropriate handlers
  }
}
```

### Mode Switching Tools

**Tool: `enter-configuration-mode`**
```typescript
{
  name: "enter-configuration-mode",
  description: "Switch to configuration mode to manage toolsets and tool annotations. This will show only configuration tools and hide operational tools.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
}
```

**Tool: `exit-configuration-mode`**
```typescript
{
  name: "exit-configuration-mode", 
  description: "Exit configuration mode and return to normal operation with your equipped toolset or all available tools.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
}
```

**Alternative Names to Consider:**
- `open-toolset-menu` / `close-toolset-menu`
- `enter-toolset-config` / `exit-toolset-config`
- `switch-to-config` / `switch-to-tools`
- `configure-toolsets` / `use-toolsets`

### Server Modifications

The EnhancedMCPServer will need:
1. `configurationMode: boolean` property
2. `configToolsManager: ConfigToolsManager` instance
3. Modified `listTools()` method to check mode
4. Modified `callTool()` method to route based on mode
5. Initialization logic to determine starting mode

### Feature Flag

Add configuration option:
```typescript
interface RuntimeOptions {
  // ... existing options
  disableConfigurationMode?: boolean;
}
```

When `disableConfigurationMode: true`, server operates in legacy mode with all tools exposed.

## Future Enhancements

1. **Auto-timeout**: Configuration mode could automatically exit after a period of inactivity
2. **Mode Indicators**: Tool descriptions could include mode badges
3. **Nested Modes**: Sub-modes for different configuration contexts
4. **Mode History**: Track mode transitions for debugging

## Migration Path

1. **Phase 1**: Implement feature behind flag (disabled by default)
2. **Phase 2**: Enable by default with opt-out flag
3. **Phase 3**: Remove flag after stable adoption

## Success Criteria

1. Clean separation between operational and configuration tools
2. Intuitive mode switching for users
3. No breaking changes for existing workflows (with feature flag)
4. Reduced cognitive load for AI assistants
5. Clear tool organization and discovery

## Testing Requirements

1. Unit tests for ConfigToolsManager
2. Integration tests for mode switching
3. Tests for auto-exit triggers
4. Tests for initialization logic
5. Tests for feature flag behavior
6. Tests for tools_changed notifications

## Timeline

- Design Review: 1 day
- Implementation: 2-3 days
- Testing: 1 day
- Documentation: 0.5 day
- Total: ~5 days