# Toolset Configuration System

This directory contains the simplified toolset configuration system for Meta-MCP, allowing users to create custom collections of tools from discovered MCP servers.

## 🎯 Core Concept

A **toolset** is a user-defined collection of specific tools selected from all available MCP servers. Think of it as assembling tools from a workshop - you pick exactly the tools you need for a particular task or workflow.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Input    │───▶│ Toolset Manager │───▶│ Discovery Engine│
│ (build-toolset) │    │                 │    │                 │
│ - Tool Selection│    │ - Validation    │    │ - Tool Resolution│
│ - Toolset Name  │    │ - Persistence   │    │ - Reconciliation │
└─────────────────┘    │ - Application   │    │ - Server Lookup │
                       └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Persisted Config│
                       │ ~/.toolprint-   │
                       │ meta-mcp/       │
                       │ toolsets.json   │
                       └─────────────────┘
```

## 📁 File Structure

```
src/toolset/
├── README.md              # This file - architecture and design
├── types.ts               # Core type definitions
├── index.ts               # ToolsetManager class and main API
├── mcp-tools.ts          # MCP tool implementations
└── loader.ts             # Configuration file I/O operations
```

## 🎯 Design Principles

### 1. **Simplicity Over Flexibility**

**Decision**: Store only essential tool references, not complex server configurations.

```typescript
// ✅ Simple: Just the tools you want
interface ToolsetConfig {
  name: string;
  description?: string;
  version?: string;
  createdAt?: Date;
  tools: DynamicToolReference[];  // Direct array of tool references
}

// ❌ Complex: Server-level configurations (removed)
interface OldToolsetConfig {
  servers: ServerToolConfig[];    // Too complex for user-generated toolsets
  options: ToolsetOptions;        // Unnecessary configuration overhead
}
```

**Benefits**:
- Users think in terms of tools, not servers
- Server information is implied from tool references
- Much simpler persistence and validation

### 2. **Discovery-Based Reconciliation**

**Problem**: Tool references can become stale when:
- Server implementations change (tool schema updates)
- Servers are reconfigured or moved
- Tool names or descriptions are modified

**Solution**: Store both identifiers and validate consistency at runtime.

```typescript
// Store both ways to identify a tool
interface DynamicToolReference {
  namespacedName?: string;  // e.g., "git.status" 
  refId?: string;          // e.g., "abc123def456..." (tool hash)
}
```

**Reconciliation Process**:
1. **At Build Time**: Store both `namespacedName` and `refId` for each selected tool
2. **At Load Time**: Discovery engine validates references using `resolveToolReference()`
3. **Consistency Validation**:
   - Find tool by `namespacedName` → verify `refId` still matches
   - Find tool by `refId` → verify `namespacedName` still matches
   - Log warnings for mismatches but allow tools to work
4. **Missing Tools**: Skip tools that can't be found, continue with others

### 3. **No Server Abstraction**

**Decision**: Remove server-level configuration from toolsets.

**Rationale**:
- Server name is embedded in `namespacedName` (e.g., "git.status" → server: "git")
- Discovery engine provides authoritative server metadata
- Users select individual tools, not entire servers
- Simplifies the data model significantly

**Implementation**:
```typescript
// Discovery engine resolves server information
const resolution = discoveryEngine.resolveToolReference({
  namespacedName: "git.status",
  refId: "abc123..."
});

// Returns: { tool, serverName, warnings }
```

## 🔧 Core Components

### **ToolsetManager Class**

Main orchestrator for toolset operations:

```typescript
class ToolsetManager {
  // Load/save toolset configurations
  async loadConfig(filePath: string): Promise<ValidationResult>
  async saveConfig(filePath?: string): Promise<{success: boolean}>
  
  // Set configuration directly (in-memory)
  setConfig(config: ToolsetConfig): ValidationResult
  
  // Apply toolset to filter available tools
  async applyConfig(
    discoveredTools: DiscoveredTool[], 
    discoveryEngine?: IToolDiscoveryEngine
  ): Promise<ToolsetResolution>
}
```

### **MCP Tools (mcp-tools.ts)**

Implements the actual MCP tools for toolset management:

- `build-toolset`: Create new toolsets from selected tools
- `list-saved-toolsets`: View all saved toolset configurations  
- `equip-toolset`: Activate a toolset to filter available tools
- `unequip-toolset`: Remove toolset filter, show all tools
- `delete-toolset`: Remove a saved toolset configuration
- `get-active-toolset`: Get details about currently active toolset

### **Tool Resolution Flow**

```typescript
// 1. User builds toolset
const result = await buildToolset({
  name: "dev-essentials",
  tools: [
    { namespacedName: "git.status" },
    { namespacedName: "docker.ps" }
  ]
}, discoveredTools);

// 2. System stores both identifiers
const toolsetConfig = {
  name: "dev-essentials",
  tools: [
    { namespacedName: "git.status", refId: "abc123..." },
    { namespacedName: "docker.ps", refId: "def456..." }
  ]
};

// 3. Later, when loading toolset
const resolution = await toolsetManager.applyConfig(
  discoveredTools, 
  discoveryEngine
);

// 4. Discovery engine validates each reference
for (const toolRef of toolset.tools) {
  const result = discoveryEngine.resolveToolReference(toolRef);
  // { exists: true, tool: {...}, serverName: "git", warnings: [...] }
}
```

## 📋 Tool Reference Validation

### **Consistency Scenarios**

1. **Perfect Match**: Both `namespacedName` and `refId` resolve to same tool ✅
2. **Schema Change**: `namespacedName` matches but `refId` changed (tool updated) ⚠️
3. **Name Change**: `refId` matches but `namespacedName` changed (tool renamed) ⚠️
4. **Missing Tool**: Neither identifier resolves (server offline/tool removed) ❌
5. **Server Migration**: Tool moved to different server (both identifiers changed) ❌

### **Error Handling Strategy**

```typescript
// Graceful degradation - continue with available tools
const warnings: string[] = [];

for (const toolRef of toolset.tools) {
  const resolution = discoveryEngine.resolveToolReference(toolRef);
  
  if (!resolution.exists) {
    warnings.push(`Tool not found: ${toolRef.namespacedName}`);
    continue; // Skip missing tool, continue with others
  }
  
  if (!resolution.namespacedNameMatch) {
    warnings.push(`Tool name changed: ${toolRef.refId} now points to ${resolution.tool.namespacedName}`);
    // Still include the tool - user can update toolset later
  }
  
  resolvedTools.push(convertToResolvedTool(resolution.tool));
}
```

## 🔄 Integration Points

### **With Discovery Engine**

```typescript
interface IToolDiscoveryEngine {
  // Main integration point for toolset reconciliation
  resolveToolReference(ref: DynamicToolReference): {
    exists: boolean;
    tool?: DiscoveredTool;
    serverName?: string;
    namespacedNameMatch: boolean;
    refIdMatch: boolean;
    warnings: string[];
  };
}
```

### **With Enhanced Server**

```typescript
// Enhanced server applies active toolset as filter
if (this.activeToolset) {
  this.toolsetManager.setConfig(this.activeToolset);
  const resolution = await this.toolsetManager.applyConfig(
    discoveredTools, 
    this.discoveryEngine
  );
  
  // Only expose tools from the active toolset
  toolsToExpose = resolution.tools.map(resolvedTool => 
    findOriginalDiscoveredTool(resolvedTool)
  );
}
```

## 💾 Persistence Format

Toolsets are stored in `~/.toolprint-meta-mcp/toolsets.json`:

```json
{
  "dev-essentials": {
    "name": "dev-essentials",
    "description": "Essential tools for web development",
    "version": "1.0.0",
    "createdAt": "2024-01-15T10:30:00Z",
    "tools": [
      {
        "namespacedName": "git.status",
        "refId": "sha256:abc123..."
      },
      {
        "namespacedName": "docker.ps", 
        "refId": "sha256:def456..."
      }
    ]
  }
}
```

## 🚀 Usage Examples

### **Creating a Development Toolset**

```typescript
// 1. List available tools
const availableTools = await listAvailableTools(discoveredTools);

// 2. Build custom toolset
const result = await buildToolset({
  name: "web-dev",
  description: "Tools for web development",
  tools: [
    { namespacedName: "git.status" },
    { namespacedName: "git.commit" },
    { namespacedName: "docker.ps" },
    { namespacedName: "npm.install" }
  ],
  autoEquip: true  // Immediately activate this toolset
}, discoveredTools);
```

### **Loading and Applying Toolset**

```typescript
// 1. Load saved toolset
const toolsetManager = new ToolsetManager();
await toolsetManager.loadConfig("/path/to/toolset.json");

// 2. Apply to discovered tools with validation
const resolution = await toolsetManager.applyConfig(
  discoveredTools,
  discoveryEngine
);

// 3. Handle warnings
if (resolution.warnings.length > 0) {
  console.warn("Toolset validation warnings:");
  resolution.warnings.forEach(warning => console.warn(`  • ${warning}`));
}

// 4. Use filtered tools
const filteredTools = resolution.tools; // Only tools from toolset
```

## ⚠️ Known Limitations

1. **No Pattern Matching**: Only supports explicit tool selection, not regex/wildcard patterns
2. **No Server-Level Rules**: Cannot include/exclude entire servers with rules
3. **No Conflict Resolution**: Assumes tools have unique namespaced names
4. **Local Storage Only**: Toolsets are stored locally, not shared across environments

These limitations are intentional design decisions prioritizing simplicity for the primary use case of user-curated tool collections.

## 🔮 Future Enhancements

### **Planned Features**

1. **Toolset Sharing**: Export/import toolsets as portable JSON files
2. **Tool Versioning**: Track and validate specific tool schema versions
3. **Dependency Management**: Automatically include dependent tools
4. **Usage Analytics**: Track which tools are actually used in each toolset
5. **Smart Suggestions**: Recommend tools based on usage patterns

### **Extensibility Points**

```typescript
// Plugin architecture for custom toolset behaviors
interface ToolsetPlugin {
  name: string;
  validateToolReference(ref: DynamicToolReference): ValidationResult;
  transformToolset(config: ToolsetConfig): ToolsetConfig;
  onToolsetActivated(config: ToolsetConfig): void;
}
```

---

> **Note**: This system prioritizes user experience and simplicity over comprehensive toolset management features. The goal is to make it easy for users to create and manage collections of their most-used tools without complex configuration overhead.