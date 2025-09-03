# Server Tools Architecture

This document describes the unified architecture for server tools integration, particularly the relationship between PersonaManager, ToolsetManager, and ConfigToolsManager using the IToolsetDelegate pattern.

## Architecture Overview

The server tools system is built around a delegate pattern where both PersonaManager and ToolsetManager implement the same IToolsetDelegate interface, allowing ConfigToolsManager to route toolset operations uniformly based on persona activation state.

```
Enhanced Server (Orchestrator)
├── PersonaManager (IToolsetDelegate - Persona Toolsets)
├── ToolsetManager (IToolsetDelegate - Regular Toolsets) 
└── ConfigToolsManager (Router - Routes to Active Delegate)
```

## Component Responsibilities

### Enhanced Server (Top-Level Orchestrator)
**Role**: System coordinator and dependency injector

**Key Responsibilities**:
- Creates all managers independently
- Initializes in proper sequence (PersonaManager → connections → ToolsetManager)
- Coordinates persona activation with toolset management
- Provides unified `getAvailableTools()` interface to clients

**Coordination Sequence**:
```typescript
1. initializePersonaManager()
2. connectToDownstreamServers() // includes persona MCP servers
3. initializeToolDiscoveryEngine()
4. toolsetManager.setPersonaManager(personaManager) // Link them
5. initializePersona() // Activate if specified
6. getAvailableTools() → toolsetManager.getMcpTools()
```

### PersonaManager (IToolsetDelegate Implementation)
**Role**: Persona lifecycle and content pack management + Toolset delegate for persona toolsets

**Key Capabilities**:
- Manages persona discovery, loading, activation/deactivation
- Provides MCP server configurations to Enhanced Server
- **Implements IToolsetDelegate interface** for persona toolsets
- Converts persona toolsets via PersonaToolsetBridge
- Routes toolset operations when persona is active

**IToolsetDelegate Interface**:
```typescript
// Persona toolset operations
async listSavedToolsets() → ListSavedToolsetsResponse
async equipToolset(name: string) → EquipToolsetResponse  
async getActiveToolset() → GetActiveToolsetResponse
hasActiveToolset() → boolean
getDelegateType() → 'persona'
```

**Public Interface for Integration**:
```typescript
getActivePersona() → LoadedPersona | null
getPersonaToolsets(personaName) → PersonaToolset[]
activatePersona(name) → ActivationResult
getPersonaMcpServers(name) → ServerConfigs
```

### ToolsetManager (IToolsetDelegate Implementation)
**Role**: Regular toolset management + Toolset delegate for regular toolsets

**Key Capabilities**:
- Manages regular toolset operations (create, equip, delete, list)
- Handles toolset validation and tool filtering
- **Implements IToolsetDelegate interface** for regular toolsets
- Provides filtered tools to Enhanced Server
- Maintains persona manager reference for cross-cutting operations

**IToolsetDelegate Interface**:
```typescript
// Regular toolset operations
async listSavedToolsets() → ListSavedToolsetsResponse
async equipToolset(name: string) → EquipToolsetResponse
async getActiveToolset() → GetActiveToolsetResponse
hasActiveToolset() → boolean
getDelegateType() → 'regular'
```

**Core Operations**:
```typescript
// Tool provider interface
getMcpTools() → filtered tools based on active toolset ✅

// Configuration management
buildToolset() → create new toolsets
deleteToolset() → delete regular toolsets
getActiveToolsetConfig() → ToolsetConfig | null

// Persona integration
setPersonaManager(pm) ✅
loadPersonaToolset(name) → converts via bridge ✅
```

### ConfigToolsManager (Intelligent Router)
**Role**: MCP tool interface and intelligent routing for configuration operations

**Key Capabilities**:
- **Routes to appropriate delegate** based on persona activation state
- Provides MCP tools for client interactions (list-saved-toolsets, equip-toolset, etc.)
- **Context-aware routing** - no direct persona or toolset knowledge needed
- **Hides restricted tools** (delete-toolset, build-toolset, list-personas) in persona mode

**Tool Visibility Logic**:
```typescript
getMcpTools(): Tool[] {
  // Hide tools based on persona activation state:
  // - list-personas: hidden when persona is active
  // - build-toolset: hidden when persona is active
  // - delete-toolset: hidden when persona is active
  // All other tools remain available but route appropriately
}
```

**Routing Logic**:
```typescript
private getActiveToolsetDelegate(): IToolsetDelegate {
  const activePersona = this.dependencies.personaManager?.getActivePersona();
  
  if (activePersona) {
    // Route to PersonaManager for persona toolsets
    return this.dependencies.personaManager as IToolsetDelegate;
  } else {
    // Route to ToolsetManager for regular toolsets
    return this.dependencies.toolsetManager as IToolsetDelegate;
  }
}

// All toolset operations route through the active delegate
handleToolCall('list-saved-toolsets') → delegate.listSavedToolsets()
handleToolCall('equip-toolset') → delegate.equipToolset(name)
handleToolCall('get-active-toolset') → delegate.getActiveToolset()
```

## Data Flow Patterns

### Tool Listing Flow
```
Client requests tools →
Enhanced Server.getAvailableTools() →
├── ConfigToolsManager.getMcpTools() (if config mode)
│   └── Returns: [list-saved-toolsets, equip-toolset, ...]
└── ToolsetManager.getMcpTools() (if normal mode)
    ├── Filters discovered tools by active toolset
    ├── Active toolset could be regular or persona-sourced
    └── Returns: [git_status, docker_ps, ...] (filtered)
```

### Toolset Operations Flow
```
Configuration tool called →
ConfigToolsManager.handleToolCall() →
ToolsetManager.[operation]() →
├── Handle regular toolsets (preference store)
├── Handle persona toolsets (via PersonaManager + Bridge)
└── Return unified result
```

## Key Architectural Principles

### 1. Single Responsibility
- **PersonaManager**: Persona content pack lifecycle
- **ToolsetManager**: Unified toolset operations 
- **ConfigToolsManager**: MCP tool interface
- **Enhanced Server**: System orchestration

### 2. Unified Interface Pattern
- ToolsetManager presents single interface for all toolset operations
- Configuration tools remain unchanged - they just call ToolsetManager
- PersonaManager provides data when requested via bridge

### 3. Data Source Transparency
- Clients don't know/care if toolset came from persona or preference store
- ToolsetManager handles routing to appropriate data source
- "persona:" prefix provides clear distinction in listings

### 4. Dependency Direction
```
Enhanced Server
├── Creates: PersonaManager, ToolsetManager, ConfigToolsManager
├── Links: ToolsetManager ← PersonaManager (via setPersonaManager)
└── Injects: All three into ConfigToolsManager dependencies
```

## PersonaToolsetBridge

The PersonaToolsetBridge is a critical component that converts between persona and toolset formats:

**Purpose**: Format converter and compatibility layer
- Converts PersonaToolset (simple) → ToolsetConfig (complex)
- Validates tool availability during conversion
- Handles partial toolset creation with missing tools
- Provides consistent naming with "persona:" prefix

**Usage Patterns**:
1. During persona activation (PersonaManager → ToolsetManager)
2. For toolset listing (ToolsetManager → ConfigToolsManager)
3. For toolset operations (equipping, validation, etc.)

## Implementation Status

### ✅ Completed
- PersonaManager integration with ToolsetManager
- Enhanced toolset listing (includes persona toolsets)
- Basic architecture and dependency injection
- PersonaToolsetBridge conversion system
- Tool hiding in persona mode (list-personas, build-toolset, delete-toolset)
- Comprehensive test infrastructure for configuration tools

### 🎯 Next Steps
- Enhance `equipToolset()` to handle persona toolsets
- Enhance `deleteToolset()` to prevent persona toolset deletion  
- Test end-to-end persona toolset operations

## Testing

### Configuration Tools Behavior Testing

To test the configuration tools behavior in both standard and persona modes:

```bash
# Run the full test suite (tests both standard and persona modes)
bash src/test-utils/test-config-tools.sh

# Run focused test for persona mode only
bash src/test-utils/test-persona-only.sh
```

**Test Coverage**:
- **Standard Mode**: Verifies all configuration tools are available
- **Persona Mode**: Verifies restricted tools are hidden (list-personas, build-toolset, delete-toolset)
- **Tool Routing**: Validates proper delegation to PersonaManager vs ToolsetManager
- **Session Management**: Tests HTTP/SSE transport with proper MCP session handling

**Test Documentation**: See `src/test-utils/CLAUDE.md` for detailed test infrastructure documentation

## Usage Guidelines

### For Tool Developers
- **Always use ToolsetManager** for toolset operations
- **Don't directly call PersonaManager** from configuration tools
- **Handle "persona:" prefix** appropriately in toolset names
- **Test with both regular and persona toolsets**

### For Architecture Changes
- **Maintain unified interface** in ToolsetManager
- **Keep configuration tools simple** - complexity belongs in ToolsetManager
- **Use dependency injection** for manager references
- **Follow single responsibility principle**

This architecture ensures clean separation of concerns while providing a unified, powerful toolset management system that seamlessly handles both regular and persona-based toolsets.