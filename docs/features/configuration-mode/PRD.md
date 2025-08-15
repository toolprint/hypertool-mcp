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

**ToolsProvider Interface** (New)
- Located at: `src/server/types.ts`
- Provides common interface for tool providers:
  ```typescript
  import { Tool } from "@modelcontextprotocol/sdk/types.js";
  
  export interface ToolsProvider {
    /**
     * Get MCP tools provided by this component
     */
    getMcpTools(): Tool[];
  }
  ```
- Both ToolsetManager and ConfigToolsManager implement this interface
- Enables polymorphic tool provider handling in the server

**ConfigToolsManager** (New Component)
- Manages all configuration-related tools
- Located at: `src/server/tools/config-tools/manager.ts`
- Implements `ToolsProvider` interface
- Responsibilities:
  - Register configuration tool modules
  - Provide `getMcpTools()` method for configuration tools
  - Handle tool execution routing for config tools
  - Manage `exit-configuration-mode` tool (but NOT `enter-configuration-mode`)

**ToolsetManager** (Existing, Modified)
- Continues to manage toolset tools
- Now implements `ToolsProvider` interface
- No changes to its core responsibility
- `getMcpTools()` returns tools based on equipped toolset

**EnhancedMCPServer** (Modified)
- Maintains `configurationMode` state
- Instantiates both ToolsetManager and ConfigToolsManager
- Manages `enter-configuration-mode` tool directly (located at `src/server/tools/common/enter-configuration-mode.ts`)
- Tool exposure logic:
  ```typescript
  // Pseudocode
  if (this.configurationMode) {
    return this.configToolsManager.getMcpTools();
  } else {
    const tools = this.toolsetManager.getMcpTools();
    // Server adds enter-configuration-mode tool to the list
    tools.push(enterConfigurationModeTool);
    return tools;
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

#### Mode Change Callback Pattern

**Callback Interface**:
```typescript
type OnModeChangeRequest = () => void;
```

**Implementation**:
- Both ConfigToolsManager and ToolsetManager receive an `onModeChangeRequest` callback
- Components call this callback when they need to trigger a mode change:
  - ConfigToolsManager: When mode switching tools are executed (toggle mode)
  - ToolsetManager: When "equip-toolset" succeeds (exit to normal mode)
  - ToolsetManager: When "build-toolset" with `autoEquip: true` succeeds (exit to normal mode)
- EnhancedMCPServer handles the callback based on source:
  1. From ConfigToolsManager → Toggle between configuration/normal modes
  2. From ToolsetManager → Always switch to normal mode
  3. Triggers `tools_changed` notification
  4. Clients re-fetch tools and see the new set

#### Notifications
- Mode changes MUST trigger `tools_changed` notification
- Clients will re-fetch tool list and see new set of exposed tools
- Ensures client UI updates appropriately

## Implementation Details

### ToolsProvider Interface

```typescript
// src/server/types.ts
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface ToolsProvider {
  /**
   * Get MCP tools provided by this component
   * @returns Array of Tool definitions exposed by this provider
   */
  getMcpTools(): Tool[];
}
```

### ConfigToolsManager Class

```typescript
// src/config-tools/manager.ts
import { ToolsProvider } from "../server/types.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export class ConfigToolsManager implements ToolsProvider {
  private toolModules: ToolModule[] = [];
  private dependencies: ToolDependencies;
  private onModeChangeRequest?: OnModeChangeRequest;

  constructor(
    dependencies: ToolDependencies,
    onModeChangeRequest?: OnModeChangeRequest
  ) {
    this.dependencies = dependencies;
    this.onModeChangeRequest = onModeChangeRequest;
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

### ToolsetManager Modifications

```typescript
// src/toolset/manager.ts
import { ToolsProvider } from "../server/types.js";

export class ToolsetManager extends EventEmitter implements ToolsProvider {
  // Existing implementation...
  
  getMcpTools(): Tool[] {
    // Existing implementation remains the same
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

### Feature Flag Support

Configuration mode is controlled via the Feature Flag Registry system:

```typescript
// Feature Flag Definition (src/config/flagRegistry.ts)
enableConfigToolsMenu: {
  name: "enableConfigToolsMenu",
  description: "Enable configuration tools menu mode (separates config tools from operational tools)",
  defaultValue: true,  // Enabled by default
  envVar: "HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU",
}
```

**Control Methods**:
1. **Environment Variable** (highest priority):
   ```bash
   # Enable configuration mode (default)
   HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=true hypertool-mcp
   
   # Disable configuration mode (legacy behavior)
   HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=false hypertool-mcp
   ```

2. **Config File** (medium priority):
   ```json
   {
     "featureFlags": {
       "enableConfigToolsMenu": false
     }
   }
   ```

3. **Default Value**: `true` (configuration mode enabled)

**Legacy Mode Behavior**:
When `enableConfigToolsMenu: false`, the server operates in legacy mode:
- All configuration tools and operational tools are exposed together
- No mode switching occurs
- No `enter-configuration-mode` tool is available
- Backward compatible with existing workflows

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