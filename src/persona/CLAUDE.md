# Persona System Architecture

This document provides a comprehensive overview of the Persona content pack system, including all its components, workflows, and integration patterns.

## System Overview

The Persona system is a comprehensive content pack management framework that allows users to bundle MCP server configurations, toolset definitions, and related assets into distributable packages called "personas". It provides installation, discovery, validation, activation/deactivation, and integration with the existing toolset infrastructure.

## Core Architecture

```
PersonaManager (Central Orchestrator)
├── PersonaDiscovery (Finding personas)
├── PersonaInstaller (Installing personas)  
├── PersonaLoader (Loading persona configs)
├── PersonaValidator (Validating personas)
├── PersonaCache (Caching loaded personas)
├── PersonaToolsetBridge (Conversion of Persona Toolsets to Generic Toolsets)
├── PersonaMcpIntegration (MCP server configuration)
└── PersonaScanner (File system scanning)
```

## Component Details

### 1. PersonaManager (manager.ts)
**Role**: Central orchestrator for the entire persona lifecycle + IToolsetDelegate implementation for persona toolsets

**Key Responsibilities**:
- **Lifecycle Management**: Initialize, activate, deactivate personas
- **State Management**: Track active persona, toolset, and metadata
- **Event Coordination**: Emit events for persona lifecycle changes
- **Integration Coordination**: Bridge with ToolsetManager and MCP system
- **Persistence**: Save/restore active persona state across sessions
- **IToolsetDelegate Implementation**: Provide uniform toolset operations interface for persona toolsets

**Key Methods**:
```typescript
// Core lifecycle
async activatePersona(name: string, options?: ActivationOptions): Promise<ActivationResult>
async deactivatePersona(options?: DeactivationOptions): Promise<ActivationResult>

// Discovery and loading  
async discoverPersonas(config?: DiscoveryConfig): Promise<PersonaDiscoveryResult>
async findAndLoadPersona(name: string): Promise<LoadedPersona | null>

// Integration points
getActivePersona(): LoadedPersona | null
getPersonaToolsets(personaName: string): PersonaToolset[]
getPersonaMcpServers(personaName: string): Promise<{success: boolean, serverConfigs?: Record<string, ServerConfig>, error?: string}>

// IToolsetDelegate interface (for persona toolsets)
async listSavedToolsets(): Promise<ListSavedToolsetsResponse>
async equipToolset(name: string): Promise<EquipToolsetResponse>
async getActiveToolset(): Promise<GetActiveToolsetResponse>
hasActiveToolset(): boolean
getDelegateType(): 'regular' | 'persona'

// State persistence
private async persistActiveState(): Promise<void>
private async restorePersistedState(): Promise<void>
```

**Configuration Options**:
```typescript
interface PersonaManagerConfig {
  getToolDiscoveryEngine?: () => IToolDiscoveryEngine | undefined;
  toolsetManager?: ToolsetManager;
  autoDiscover?: boolean;           // Auto-find personas on init
  validateOnActivation?: boolean;   // Validate before activation
  persistState?: boolean;          // Save state across sessions
  stateKey?: string;              // Storage key for persistence
  bridgeOptions?: BridgeOptions;  // PersonaToolsetBridge config
  mcpConfigHandlers?: {           // MCP integration handlers
    getCurrentConfig: () => Promise<MCPConfig | null>;
    setCurrentConfig: (config: MCPConfig) => Promise<void>;
    restartConnections: () => Promise<void>;
  };
}
```

### 2. PersonaDiscovery (discovery.ts)
**Role**: Discovery engine for finding personas in file system

**Key Features**:
- **Multi-Path Scanning**: Search standard and custom directories
- **Caching**: Cache discovery results with TTL and invalidation
- **Quick Validation**: Basic validation during discovery
- **Event Emission**: Notify when new personas are found

**Search Locations**:
1. `HYPERTOOL_PERSONA_DIR` environment variable
2. `personaDir` setting in config.json
3. Default: `~/.toolprint/hypertool-mcp/personas`

**Discovery Process**:
```
1. Scan file system for persona.yaml/yml files
2. Quick validation of YAML syntax
3. Extract basic metadata (name, description)
4. Cache results with expiration
5. Return PersonaReference objects
```

### 3. PersonaScanner (scanner.ts)
**Role**: Low-level file system scanning with robust error handling

**Key Features**:
- **Depth-Limited Traversal**: Prevent infinite recursion
- **Permission Handling**: Graceful handling of access errors
- **Ignore Patterns**: Respect .gitignore-style patterns
- **Archive Support**: Detect .htp archive files

**Scanning Strategy**:
```typescript
// Default scan configuration
const SCANNER_DEFAULTS = {
  MAX_SCAN_DEPTH: 3,
  SUPPORTED_CONFIG_FILES: ["persona.yaml", "persona.yml"],
  SUPPORTED_ARCHIVE_EXTENSIONS: [".htp"],
  IGNORE_PATTERNS: [
    "node_modules", ".git", ".DS_Store", 
    "*.tmp", "*.log", "__pycache__"
  ]
};
```

**Error Handling**:
- Permission errors: Log warning, continue scan
- Missing directories: Skip gracefully
- Invalid paths: Clear error messages

### 4. PersonaInstaller (installer.ts)
**Role**: Install personas from folders or .htp archives

**Installation Process**:
```
1. Validate source (folder or .htp archive)
2. Extract/copy to personas directory
3. Validate persona configuration
4. Handle naming conflicts (backup/overwrite)
5. Return installation result
```

**Installation Options**:
```typescript
interface InstallOptions {
  force?: boolean;           // Overwrite existing
  skipValidation?: boolean;  // Skip pre-install validation
  backup?: boolean;         // Backup existing persona
  installDir?: string;      // Custom install location
}
```

**Atomic Operations**:
- **Pre-validation**: Check persona before installation
- **Atomic Copy**: All-or-nothing file operations
- **Rollback**: Undo on failure
- **Backup**: Preserve existing personas

### 5. PersonaLoader (loader.ts)
**Role**: Load and parse persona configurations into memory

**Loading Process**:
```
1. Parse persona.yaml/yml file
2. Load MCP configuration (mcp.json) if present
3. Catalog all assets in persona directory
4. Validate configuration against schema
5. Create LoadedPersona object
```

**Asset Cataloging**:
- **Configuration Files**: persona.yaml, mcp.json
- **Documentation**: README.md, docs/
- **Scripts**: Any executable files
- **Additional Assets**: Any other files in persona directory

**LoadedPersona Structure**:
```typescript
interface LoadedPersona {
  persona: {
    reference: PersonaReference;    // Basic metadata
    config: PersonaConfig;          // Full configuration
    sourcePath: string;            // File system path
    assets: PersonaAssets;         // Cataloged assets
  };
  loadedAt: Date;
  metadata: {
    loadSource: string;
    validated: boolean;
    errors: string[];
    warnings: string[];
  };
}
```

### 6. PersonaValidator (validator.ts)
**Role**: Comprehensive validation of persona configurations

**Validation Levels**:
1. **Schema Validation**: YAML structure and required fields
2. **Tool ID Validation**: Check namespacedName format (e.g., "git.status")
3. **MCP Config Validation**: Validate mcp.json if present
4. **Asset Validation**: Check referenced files exist
5. **Tool Availability**: Verify tools exist in discovery engine

**Validation Context**:
```typescript
interface ValidationContext {
  toolDiscoveryEngine?: IToolDiscoveryEngine;
  allowPartialValidation?: boolean;
  includeWarnings?: boolean;
  checkToolAvailability?: boolean;
  validateMcpConfig?: boolean;
}
```

### 7. PersonaCache (cache.ts)
**Role**: Efficient caching of loaded personas and discovery results

**Cache Types**:
- **Discovery Cache**: PersonaReference objects with TTL
- **Load Cache**: Full LoadedPersona objects
- **Validation Cache**: Validation results

**Cache Strategies**:
- **TTL Expiration**: Time-based invalidation
- **Config-Based Invalidation**: Invalidate when configuration changes
- **Memory Management**: LRU eviction for memory efficiency

### 8. PersonaToolsetBridge (toolset-bridge.ts)
**Role**: Convert between PersonaToolset and ToolsetConfig formats

**Format Conversion**:
```typescript
// Input: PersonaToolset (simple)
interface PersonaToolset {
  name: string;
  toolIds: string[];  // ["git.status", "docker.ps"]
}

// Output: ToolsetConfig (complex)
interface ToolsetConfig {
  name: string;                    // "persona-{personaName}-{toolsetName}"
  description: string;             // Generated description
  version: string;                 // "1.0.0"
  createdAt: Date;
  tools: DynamicToolReference[];   // Converted tool references
}
```

**Bridge Options**:
```typescript
interface BridgeOptions {
  validateTools?: boolean;         // Check tool availability
  allowPartialToolsets?: boolean;  // Allow missing tools  
  namePrefix?: string;            // "persona" prefix
  includeMetadata?: boolean;      // Generate descriptions
}
```

### 9. IToolsetDelegate Implementation (Unified Toolset Interface)
**Role**: Provide uniform toolset operations interface for persona-based toolsets

**Interface Implementation**:
```typescript
export class PersonaManager implements IToolsetDelegate {
  // Returns persona toolsets with "persona:" prefix
  async listSavedToolsets(): Promise<ListSavedToolsetsResponse> {
    const activePersona = this.getActivePersona();
    if (!activePersona) {
      return { success: true, toolsets: [] };
    }
    
    // Convert persona toolsets to standard format
    const toolsets = activePersona.persona.config.toolsets?.map(ts => ({
      name: `persona:${ts.name}`,
      description: `Persona toolset: ${ts.name}`,
      tools: ts.toolIds.map(toolId => ({ refId: toolId, namespacedName: toolId }))
    })) || [];
    
    return { success: true, toolsets };
  }

  // Equip persona toolset by name
  async equipToolset(name: string): Promise<EquipToolsetResponse> {
    // Parse "persona:toolset-name" format
    if (!name.startsWith('persona:')) {
      return { success: false, message: 'Not a persona toolset' };
    }
    // Implementation activates specific toolset within persona
  }

  // Get currently active persona toolset
  async getActiveToolset(): Promise<GetActiveToolsetResponse> {
    const activePersona = this.getActivePersona();
    if (!activePersona || !this.activeState?.toolsetName) {
      return { success: true, hasActiveToolset: false, toolset: undefined };
    }
    // Return active persona toolset details
  }

  hasActiveToolset(): boolean {
    return this.activeState !== null && this.activeState.toolsetName !== null;
  }

  getDelegateType(): 'regular' | 'persona' {
    return 'persona';
  }
}
```

**Key Features**:
- **NamespacedName as RefId**: Uses tool namespacedName (e.g., "git.status") as refId for persona toolsets
- **Tool Format Parsing**: Extracts server and tool names from {server_name}.{tool_name} format
- **Unified Response Format**: Returns same schema types as ToolsetManager for consistency
- **Context-Aware Operations**: All operations work within active persona context

**Integration with ConfigToolsManager**:
```typescript
// ConfigToolsManager routes to PersonaManager when persona is active
private getActiveToolsetDelegate(): IToolsetDelegate {
  const activePersona = this.dependencies.personaManager?.getActivePersona();
  
  if (activePersona) {
    return this.dependencies.personaManager as IToolsetDelegate;
  } else {
    return this.dependencies.toolsetManager as IToolsetDelegate;
  }
}
```

### 10. PersonaMcpIntegration (mcp-integration.ts)
**Role**: Integrate persona MCP configurations with system MCP config

**Integration Process**:
```
1. Backup current MCP configuration
2. Merge persona MCP config with existing
3. Apply merged configuration to system
4. Restart MCP server connections
5. Restore on deactivation
```

**Merge Strategies**:
- **Server Conflicts**: Persona servers override existing
- **Configuration Merging**: Deep merge of server configurations
- **Backup/Restore**: Complete restoration on deactivation

## Persona Configuration Schema

### persona.yaml Structure
```yaml
# Required fields
name: "complex-persona"           # Must match directory name
description: "Advanced development tools with web scraping capabilities"

# Optional toolset definitions
toolsets:
  - name: "web-scraping"         # Toolset name
    toolIds:                     # Array of tool IDs
      - "playwright.navigate"
      - "playwright.screenshot"
      - "readability.extract"
  
  - name: "git-workflow"
    toolIds:
      - "git.status"
      - "git.add"
      - "git.commit"

# Optional default toolset (auto-activated)
defaultToolset: "web-scraping"

# Metadata
version: "1.0.0"
metadata:
  author: "Developer Name"
  homepage: "https://github.com/user/persona"
  tags: ["web", "scraping", "development"]
```

### mcp.json Structure (Optional)
```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio", 
      "command": "node",
      "args": ["/path/to/playwright-mcp/index.js"]
    },
    "readability": {
      "type": "stdio",
      "command": "npx", 
      "args": ["-y", "@example/readability-mcp"]
    }
  }
}
```

## Workflow Patterns

### 1. Persona Installation Flow
```
User runs: persona add /path/to/persona →
PersonaInstaller.installPersona() →
├── Validate source path/archive
├── Extract/copy to personas directory  
├── PersonaValidator.validatePersona()
├── Handle conflicts (backup/overwrite)
└── Return InstallResult
```

### 2. Persona Discovery Flow
```
PersonaManager.initialize() →
PersonaDiscovery.discoverPersonas() →
├── PersonaScanner.scanForPersonas()
├── Quick validation of found personas
├── PersonaCache.cacheResults()
└── Emit PERSONA_DISCOVERED events
```

### 3. Persona Activation Flow
```
User runs: --persona complex-persona →
PersonaManager.activatePersona() →
├── PersonaLoader.loadPersona()
├── PersonaValidator.validatePersona() (if enabled)
├── PersonaMcpIntegration.applyMcpConfig()
├── PersonaToolsetBridge.convertToolsets()  
├── Activate default toolset (if specified)
├── Persist state (if enabled)
└── Emit PERSONA_ACTIVATED event
```

### 4. Toolset Integration Flow
```
PersonaManager.listSavedToolsets() →
├── Delegates to the PersonaManager to render toolsets
```

### 5. MCP Integration Flow
```
Enhanced Server boot sequence →
├── PersonaManager.getPersonaMcpServers() 
├── Merge with other MCP configs
├── Connect to all MCP servers (including persona servers)
├── ToolDiscoveryEngine discovers all tools
└── PersonaManager activates persona toolsets
```

## Error Handling & Recovery

### Error Types
```typescript
// Base error types
PersonaError              // Base persona error
PersonaNotFoundError      // Persona doesn't exist
PersonaActivationError    // Activation failed
PersonaValidationError    // Validation failed
PersonaRuntimeError       // Runtime operation failed

// Specific error codes
enum PersonaErrorCode {
  PERSONA_NOT_FOUND = "PERSONA_NOT_FOUND",
  INVALID_CONFIG = "INVALID_CONFIG", 
  MCP_INTEGRATION_FAILED = "MCP_INTEGRATION_FAILED",
  TOOLSET_ACTIVATION_FAILED = "TOOLSET_ACTIVATION_FAILED"
}
```

### Recovery Strategies
- **Partial Activation**: Continue with warnings for non-critical failures
- **State Restoration**: Restore previous state on activation failure
- **Graceful Degradation**: Function without MCP integration if needed
- **Cache Invalidation**: Clear corrupt cache entries

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading**: Load personas only when needed
2. **Discovery Caching**: Cache discovery results with TTL
3. **Incremental Validation**: Validate only changed aspects
4. **Asset Cataloging**: Cache file system scans
5. **Memory Management**: LRU eviction in caches

### Memory Usage
- **Discovery Cache**: ~1KB per PersonaReference
- **Load Cache**: ~10-50KB per LoadedPersona
- **Validation Cache**: ~1-5KB per validation result
- **Total**: Typically <10MB for 100+ personas

## Integration Points

### With Server Tools System
- **IToolsetDelegate Implementation**: PersonaManager implements the same IToolsetDelegate interface as ToolsetManager
- **ConfigToolsManager**: Routes toolset operations to PersonaManager when persona is active, ToolsetManager when not
- **Unified Interface**: Both managers provide identical toolset operations (list, equip, get-active) through shared interface
- **Context-Aware Routing**: Same commands work differently based on persona activation state
- **Enhanced Server**: Coordinates persona activation with system boot

### With MCP System  
- **MCP Configuration**: Merges persona servers with system servers
- **Discovery Engine**: Discovers tools from persona MCP servers
- **Connection Management**: Manages persona server connections

### With File System
- **Standard Paths**: Uses configured persona directory
- **Asset Management**: Catalogs all persona assets
- **Archive Support**: Handles .htp archive format

## Development Guidelines

### Creating New Personas
1. **Directory Structure**: `personas/{persona-name}/`
2. **Required Files**: `persona.yaml` (configuration)
3. **Optional Files**: `mcp.json` (MCP servers), `README.md` (docs)
4. **Naming Convention**: Hyphen-delimited lowercase names
5. **Tool IDs**: Use namespacedName format (`server.tool`)

### Testing Personas
1. **Validation**: Use PersonaValidator for schema checking
2. **Tool Availability**: Verify all toolIds exist in discovery
3. **MCP Integration**: Test server connections and configurations
4. **Activation/Deactivation**: Test full lifecycle
5. **Error Handling**: Test with invalid configurations

### Performance Best Practices
1. **Minimize Tool Lists**: Only include necessary tools in toolsets
2. **Cache Appropriately**: Use TTL values based on persona change frequency
3. **Validate Efficiently**: Skip expensive validation when possible
4. **Handle Errors Gracefully**: Don't block on non-critical failures
5. **Monitor Memory**: Watch cache sizes in production

This comprehensive persona system provides a robust foundation for content pack management while integrating seamlessly with the existing toolset and MCP infrastructure.