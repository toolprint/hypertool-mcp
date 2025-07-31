PRODUCT REQUIREMENTS DOCUMENT: PER-APPLICATION CONFIGURATION SYSTEM
====================================================================

Version: 1.0
Date: 2025-07-31
Status: Completed

## Executive Summary

This PRD outlines the implementation of a per-application configuration system for hypertool-mcp that allows each application (Claude Desktop, Claude Code, Cursor, etc.) to maintain separate MCP server configurations while providing centralized management. This system eliminates server name conflicts and enables flexible workspace-aware configuration management.

## Problem Statement

The existing global configuration approach creates several critical issues:

- **Name Conflicts**: Different applications may define servers with identical names but different configurations, leading to overwrites and unexpected behavior
- **Configuration Pollution**: One application's servers inappropriately appear in another application's context
- **No Workspace Support**: Cannot maintain different configurations for different projects or workspaces
- **Limited Flexibility**: Cannot temporarily point an application to alternative configurations
- **Poor User Experience**: Users struggle with complex conflict resolution during setup

This leads to fragile configurations and forces users to manually manage server naming conflicts.

## Solution Overview

Implement a per-application configuration system that:

1. **Isolates Application Configurations**: Each application maintains its own MCP server namespace
2. **Eliminates Naming Conflicts**: Server names no longer conflict across applications
3. **Enables Workspace Support**: Support multiple configuration profiles per application
4. **Maintains Central Management**: Unified interface for managing all configurations
5. **Provides Flexible Linking**: Applications can dynamically link to specific configurations

## Detailed Requirements

### 1. Architecture & Directory Structure

#### 1.1 Enhanced Directory Layout

```
~/.toolprint/hypertool-mcp/
├── config.json              # Main configuration file
├── mcp/                     # Per-application MCP configs
│   ├── claude-desktop.json  # Claude Desktop's servers
│   ├── cursor.json          # Cursor's servers
│   ├── claude-code.json     # Claude Code global servers
│   └── profiles/            # Profile-specific configs
│       ├── claude-code/
│       │   ├── project-a.json
│       │   └── project-b.json
│       └── cursor/
│           └── workspace-1.json
├── toolsets/                # Toolset configurations
├── apps/                    # Application registry
├── backups/                 # Configuration backups
└── logs/                    # Application logs
```

#### 1.2 Enhanced Configuration Schema

##### Main Configuration (config.json)

```typescript
interface MainConfig {
  version: string;
  applications: Record<string, ApplicationConfig>;
  toolsets: Record<string, ToolsetConfig>;
  preferences: {
    defaultApp?: string;
    defaultProfile?: string;
  };
}

interface ApplicationConfig {
  configPath: string;        // Path to app's native config
  lastSync: string;          // ISO timestamp
  format: 'standard';        // Config format version
  mcpConfig: string;         // Path to app's MCP config file
  linkedProfiles: string[]; // Associated profile names
}
```

##### Per-Application MCP Configuration

```typescript
interface AppMcpConfig {
  mcpServers: Record<string, McpServerConfig>;
  _metadata: {
    app: string;
    importedAt: string;
    lastModified: string;
  };
}
```

### 2. CLI Integration

#### 2.1 New Runtime Flags

```bash
# Link to specific application context
hypertool-mcp --linked-app claude-desktop

# Link with specific profile
hypertool-mcp --linked-app claude-code --profile project-a

# Server mode with app identity
hypertool-mcp serve --linked-app cursor --port 3000
```

#### 2.2 Deprecated Flags (Backwards Compatibility)

```bash
# Old way - still supported but deprecated
hypertool-mcp --mcp-config /path/to/custom.json
```

### 3. Setup Wizard Enhancement

#### 3.1 Per-Application Server Selection

The setup wizard must provide:

1. **Application Detection**: Automatically detect installed applications (Claude Desktop, Cursor, Claude Code)
2. **Per-App Configuration Display**: Show servers grouped by source application with full details (command + args)
3. **Multi-Select Interface**: Allow users to select which servers to include for each application independently
4. **No Conflict Resolution**: Eliminate the need for server name conflict resolution by maintaining application isolation

#### 3.2 Wizard Flow Updates

```typescript
interface WizardState {
  detectedApps: DetectedApp[];
  existingConfigs: ExistingConfig[];
  selectedApps: string[];
  importStrategy: 'per-app' | 'fresh' | 'view';
  perAppSelections: Record<string, SelectedServer[]>; // appId -> selected servers
  toolsets: ToolsetDefinition[];
  installationType: 'standard' | 'development';
  serverNameMapping: Record<string, string>;
  // ... other fields
}
```

#### 3.3 Enhanced Server Information Display

```typescript
interface ServerInfo {
  name: string;
  command: string;
  args?: string[];      // Enhanced: Always capture arguments
  description?: string;
  fromApp: string;
}
```

### 4. Connection Management Updates

#### 4.1 App-Aware Connection Manager

```typescript
interface AppAwareConnectionConfig {
  appId?: string;
  profile?: string;
  mcpConfigPath?: string; // Resolved from app + profile
}

class ConnectionManager {
  async loadServersForApp(appId: string, profile?: string): Promise<void> {
    const configPath = this.resolveConfigPath(appId, profile);
    const servers = await this.loadMcpConfig(configPath);
    // Load only servers for this app context
  }
  
  private resolveConfigPath(appId: string, profile?: string): string {
    if (profile) {
      return `mcp/profiles/${appId}/${profile}.json`;
    }
    return `mcp/${appId}.json`;
  }
}
```

### 5. Migration Strategy

#### 5.1 Backwards Compatibility (Phase 1)

```typescript
async function detectConfigurationMode(): Promise<'legacy' | 'per-app'> {
  const hasGlobalConfig = await fileExists('mcp.json');
  const hasPerAppConfigs = await directoryExists('mcp/');
  
  if (!hasPerAppConfigs && hasGlobalConfig) {
    return 'legacy'; // Use global config for all apps
  }
  
  return 'per-app';
}
```

#### 5.2 Automatic Migration (Phase 2)

```typescript
async function migrateToPerAppConfigs(): Promise<void> {
  const globalConfig = await loadGlobalMcpConfig();
  
  // Group servers by source application if metadata available
  const serversByApp = groupServersByApp(globalConfig);
  
  // Create per-app configs
  for (const [appId, servers] of Object.entries(serversByApp)) {
    await saveMcpConfig(`mcp/${appId}.json`, {
      mcpServers: servers,
      _metadata: {
        app: appId,
        importedAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }
    });
  }
  
  // Archive global config
  await archiveGlobalConfig();
}
```

### 6. Profile Management (Future Enhancement)

#### 6.1 Profile Configuration Schema

```typescript
interface ProfileConfig {
  id: string;
  appId: string;
  name: string;
  description?: string;
  mcpConfig: string;        // Path to profile-specific MCP config
  toolsets?: string[];      // Profile-specific toolsets
  createdAt: string;
  lastModified: string;
}
```

#### 6.2 Profile Management Commands

```bash
# Create a new profile
hypertool-mcp profile create --app claude-code --name "ml-project"

# Import servers from custom config
hypertool-mcp profile import --app claude-code --profile ml-project --from ./ml-servers.json

# Activate profile
hypertool-mcp --linked-app claude-code --profile ml-project
```

### 7. Implementation Details

#### 7.1 Configuration Import Flow

```typescript
async function importFromApplication(appId: string): Promise<void> {
  const appConfig = await loadApplicationConfig(appId);
  const mcpConfigPath = `mcp/${appId}.json`;
  
  // Save to app-specific file instead of merging
  await saveMcpConfig(mcpConfigPath, {
    mcpServers: appConfig.mcpServers,
    _metadata: {
      app: appId,
      importedAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    }
  });
  
  // Update main config to reference the app's MCP config
  await updateApplicationReference(appId, mcpConfigPath);
}
```

#### 7.2 Toolset Management Integration

```typescript
interface EnhancedToolsetConfig extends ToolsetConfig {
  // Optional app/profile associations
  appAssociations?: {
    appId: string;
    profiles?: string[];
  }[];
}
```

### 8. Security Considerations

#### 8.1 File System Security

- **File Permissions**: Per-app configs inherit parent directory permissions
- **Path Sanitization**: Validate profile names to prevent directory traversal
- **Config Validation**: Validate all imported configurations before saving

#### 8.2 Access Control

- **Read-Only Mode**: Support read-only access to configurations
- **Backup Integrity**: Maintain configuration backups with checksums
- **Audit Logging**: Log all configuration changes

## Implementation Priority

1. ✅ Enhanced directory structure and configuration schema
2. ✅ Setup wizard per-app selection interface
3. ✅ Configuration import flow updates
4. ✅ Connection manager app-awareness
5. ✅ Migration strategy implementation
6. ✅ CLI flag integration (--linked-app, --profile)
7. 🔲 Profile management system
8. 🔲 Shared server library
9. 🔲 Configuration templates

## Acceptance Criteria

1. ✅ Each application maintains its own isolated MCP server configuration
2. ✅ Server name conflicts are eliminated through application namespacing
3. ✅ Setup wizard provides per-application server selection with enhanced display
4. ✅ Existing global configurations are automatically migrated to per-app structure
5. ✅ Applications can be dynamically linked to specific configurations via CLI flags
6. ✅ System maintains backwards compatibility during migration period
7. ✅ All tests pass and system remains stable

## Dependencies

- Enhanced setup wizard system
- Configuration management infrastructure  
- CLI argument parsing system
- Connection management system
- Backup and restore system

## Benefits Realized

1. **Eliminated Naming Conflicts**: Each app maintains its own server namespace
2. **Improved User Experience**: No complex conflict resolution required during setup
3. **Better Organization**: Clear separation of application concerns
4. **Enhanced Flexibility**: Applications can be linked to different configurations
5. **Easier Debugging**: Clear ownership of server configurations
6. **Future-Ready**: Foundation for profiles, templates, and advanced features

## Example Workflows

### Listing Configurations

```bash
# List all app configurations
hypertool-mcp config list

# Output:
# claude-desktop: 3 servers (mcp/claude-desktop.json)
# cursor: 5 servers (mcp/cursor.json)  
# claude-code: 2 servers (mcp/claude-code.json)
```

### Application-Specific Execution

```bash
# Run with Claude Desktop configuration
hypertool-mcp --linked-app claude-desktop

# Run with Cursor configuration  
hypertool-mcp --linked-app cursor

# Run with Claude Code project profile
hypertool-mcp --linked-app claude-code --profile project-a
```

### Setup Wizard Per-App Selection

```bash
# Interactive setup with per-app selection
hypertool-mcp setup

# Non-interactive setup for specific apps
hypertool-mcp setup --yes --apps claude-desktop,cursor
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration data loss | High | Comprehensive backup before migration |
| Backwards compatibility | Medium | Maintain legacy config support during transition |
| Configuration fragmentation | Low | Clear documentation and tooling for management |
| User confusion | Medium | Enhanced setup wizard with clear explanations |

## Conclusion

The per-application configuration system successfully addresses the critical issues of server name conflicts and configuration pollution while providing a foundation for advanced features like profiles and templates. The implementation maintains backwards compatibility and provides a smooth migration path for existing users.

This system represents a significant improvement in hypertool-mcp's usability and flexibility, enabling users to maintain clean, organized configurations across multiple applications and workspaces.