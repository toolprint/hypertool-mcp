# Server Tools Architecture

This document describes the unified architecture for server tools integration, particularly the relationship between PersonaManager, ToolsetManager, and ConfigToolsManager.

## Architecture Overview

The server tools system is built around a unified architecture where ToolsetManager serves as the single source of truth for all toolset operations, while PersonaManager provides persona-specific data through a bridge pattern.

```
Enhanced Server (Orchestrator)
├── PersonaManager (Independent - Persona Lifecycle)
├── ToolsetManager (Independent - Unified Toolset Interface) 
└── ConfigToolsManager (Consumer - Uses both above)
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

### PersonaManager (Independent Content Pack Manager)
**Role**: Persona lifecycle and content pack management

**Key Capabilities**:
- Manages persona discovery, loading, activation/deactivation
- Provides MCP server configurations to Enhanced Server
- Converts persona toolsets via PersonaToolsetBridge
- Notifies but doesn't directly control ToolsetManager

**Public Interface for Integration**:
```typescript
getActivePersona() → LoadedPersona | null
getPersonaToolsets(personaName) → PersonaToolset[]
activatePersona(name) → ActivationResult
getPersonaMcpServers(name) → ServerConfigs
```

### ToolsetManager (Unified Toolset Interface)
**Role**: Single source of truth for all toolset operations

**Enhanced Responsibilities**:
- Manages both regular and persona toolsets through unified interface
- Handles toolset equipping, listing, validation, tool filtering
- Uses PersonaManager as data source (via bridge) when needed
- Provides filtered tools to Enhanced Server

**Unified Interface**:
```typescript
// Core operations
listSavedToolsets() → regular + persona toolsets ✅
equipToolset(name) → handles both regular + persona (enhanced)
deleteToolset(name) → prevents persona deletion (enhanced)
getMcpTools() → filtered tools based on active toolset ✅

// Persona integration
setPersonaManager(pm) ✅
getPersonaToolsets() → converts via bridge ✅
```

### ConfigToolsManager (Consumer)
**Role**: MCP tool interface for configuration operations

- Consumes ToolsetManager's unified interface
- Provides MCP tools for client interactions
- No direct persona knowledge - relies on ToolsetManager

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

### 🎯 Next Steps
- Enhance `equipToolset()` to handle persona toolsets
- Enhance `deleteToolset()` to prevent persona toolset deletion  
- Test end-to-end persona toolset operations

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