# Discovery Module

The Discovery Module is responsible for automatically discovering, cataloging, and managing tools from connected MCP (Model Context Protocol) servers. It provides a centralized tool registry that enables the Meta-MCP server to route tool calls efficiently.

## Overview

The Discovery Module acts as the "phone book" for all available MCP tools across multiple connected servers. It automatically discovers tools when servers connect, maintains a cached registry for fast lookups, and provides real-time updates when tools change.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Server A  │    │   MCP Server B  │    │   MCP Server C  │
│   (git tools)   │    │ (docker tools)  │    │  (npm tools)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     Discovery Module     │
                    │   ┌─────────────────┐    │
                    │   │  Tool Registry  │    │
                    │   │ - git.status    │    │
                    │   │ - git.commit    │    │
                    │   │ - docker.ps     │    │
                    │   │ - docker.run    │    │
                    │   │ - npm.install   │    │
                    │   │ - npm.build     │    │
                    │   └─────────────────┘    │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │    Router & Toolset      │
                    │       Modules            │
                    └───────────────────────────┘
```

## Architecture

### Core Components

#### 1. **ToolDiscoveryEngine** (`service.ts`)
The main orchestrator that coordinates tool discovery across all connected MCP servers.

**Key Responsibilities:**
- Discovers tools from connected MCP servers via `list_tools` MCP calls
- Maintains real-time inventory of available tools
- Provides fast lookup and search capabilities
- Emits events when tool availability changes
- Manages server connection state and health

#### 2. **ToolCache** (`cache.ts`)
High-performance in-memory cache for discovered tools with TTL (Time-To-Live) management.

**Features:**
- Fast O(1) tool lookups by name or hash
- Automatic expiration and cleanup
- Hit rate monitoring for performance optimization
- Server-specific cache management

#### 3. **ToolLookupManager** (`lookup.ts`)
Advanced search and filtering capabilities for the tool registry.

**Capabilities:**
- Name-based search with fuzzy matching
- Keyword-based search in descriptions
- Server-specific filtering
- Search result scoring and ranking

#### 4. **ToolHashManager** (`hash-utils.ts`)
Tool identity and change detection system using cryptographic hashes.

**Functions:**
- Generates unique hashes for tool identity
- Detects tool changes (schema updates, description changes)
- Enables efficient diff operations
- Supports cache invalidation strategies

## Usage in Meta-MCP

### Integration with Enhanced Server

The Discovery Module is initialized and used by the Enhanced Meta-MCP Server:

```typescript
// In src/server/enhanced.ts
export class EnhancedMetaMCPServer extends MetaMCPServer {
  private discoveryEngine?: IToolDiscoveryEngine;

  private async initializeRouting(options: ServerInitOptions): Promise<void> {
    // 1. Initialize discovery engine
    this.discoveryEngine = new ToolDiscoveryEngine(this.connectionManager);
    await this.discoveryEngine.initialize({
      autoDiscovery: true,    // Auto-discover on server connect
      enableMetrics: true,    // Performance monitoring
    });

    // 2. Start discovery process
    await this.discoveryEngine.start();

    // 3. Get available tools for tool registration
    const discoveredTools = this.discoveryEngine.getAvailableTools(true);
  }
}
```

### Integration with Toolset Manager

The Toolset Manager uses the Discovery Module to validate tool references and resolve tool lookups:

```typescript
// In src/toolset/index.ts
export class ToolsetManager extends EventEmitter {
  private discoveryEngine?: IToolDiscoveryEngine;

  setDiscoveryEngine(discoveryEngine: IToolDiscoveryEngine): void {
    this.discoveryEngine = discoveryEngine;
  }

  // Validate that tool references point to real tools
  validateToolReferences(tools: DynamicToolReference[]) {
    for (const toolRef of tools) {
      const resolution = this.discoveryEngine.resolveToolReference(toolRef);
      // ... validation logic
    }
  }

  // Get active tools for current toolset
  getActiveDiscoveredTools(): DiscoveredTool[] {
    return this.discoveryEngine.getAvailableTools(true);
  }
}
```

### Integration with Request Router

The Router uses the Discovery Module to route tool calls to the correct MCP server:

```typescript
// In src/router/router.ts
export class RequestRouter implements IRequestRouter {
  
  async routeToolCall(request: ToolCallRequest): Promise<any> {
    // 1. Look up tool in discovery registry
    const tool = await this.discoveryEngine.getToolByName(toolName);
    
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    // 2. Route to correct server
    const connection = this.connectionManager.getConnection(tool.serverName);
    return await connection.callTool(tool.name, args);
  }
}
```

## Key Data Structures

### DiscoveredTool

The primary data structure representing a discovered tool:

```typescript
interface DiscoveredTool {
  name: string;                    // Original tool name: "status"
  serverName: string;              // Source server: "git-server"
  namespacedName: string;          // Namespaced name: "git.status"
  tool: MCPToolDefinition;         // Complete MCP tool definition
  discoveredAt: Date;              // When first discovered
  lastUpdated: Date;               // When last updated
  serverStatus: "connected" | "disconnected";
  toolHash: string;                // Identity hash for change detection
}
```

### Tool Resolution Process

When a tool is requested (e.g., `git.status`):

1. **Lookup**: Discovery engine searches its registry by namespaced name
2. **Validation**: Checks if the source server is still connected
3. **Resolution**: Returns the `DiscoveredTool` with complete MCP definition
4. **Routing**: Router uses the `serverName` to route the call appropriately

## Real-Time Updates

The Discovery Module provides real-time updates through an event-driven architecture:

### Tool Change Events

```typescript
interface DiscoveredToolsChangedEvent {
  serverName: string;
  changes: ToolChangeInfo[];
  summary: {
    added: number;
    updated: number;
    removed: number;
    unchanged: number;
  };
  timestamp: Date;
}
```

### Event Flow

1. **Server Connection**: When an MCP server connects, discovery automatically runs
2. **Tool Changes**: When tools are added/updated/removed, change events are emitted
3. **Cache Updates**: Tool cache is automatically updated with new information
4. **Downstream Notifications**: Router and Toolset Manager receive change notifications
5. **Client Updates**: MCP clients are notified of tool list changes

## Performance Features

### Caching Strategy

- **In-Memory Cache**: Fast O(1) lookups for frequently accessed tools
- **TTL Management**: Automatic expiration prevents stale data
- **Cache Warming**: Pre-populates cache during server startup
- **Hit Rate Monitoring**: Tracks cache effectiveness

### Search Optimization

- **Indexed Lookups**: Tools indexed by name, server, and hash
- **Fuzzy Matching**: Handles minor spelling variations in tool names
- **Result Scoring**: Ranks search results by relevance
- **Server Filtering**: Efficient server-specific tool queries

## Error Handling

### Connection Failures
- **Graceful Degradation**: Continues operating with remaining servers
- **Retry Logic**: Automatic reconnection and rediscovery
- **Error Tracking**: Logs server-specific errors for debugging

### Tool Discovery Failures
- **Individual Server Isolation**: Failure in one server doesn't affect others
- **Partial Discovery**: Returns successfully discovered tools even if some fail
- **Error Reporting**: Detailed error messages for troubleshooting

## Configuration

The Discovery Module accepts configuration options:

```typescript
interface DiscoveryConfig {
  cacheTtl?: number;              // Cache TTL (default: 5 minutes)
  refreshInterval?: number;       // Auto-refresh interval (default: 30 seconds)
  autoDiscovery?: boolean;        // Auto-discover on connect (default: true)
  namespaceSeparator?: string;    // Namespace separator (default: ".")
  enableMetrics?: boolean;        // Performance monitoring (default: false)
}
```

## Testing

The module includes comprehensive test coverage:

- **Unit Tests**: Individual component testing (`cache.test.ts`, `hash-utils.test.ts`, `service.test.ts`)
- **Performance Tests**: Load testing and benchmarking (`performance.test.ts`)
- **Integration Tests**: Cross-module testing (`toolset/discovery-integration.test.ts`)

## Future Enhancements

- **Distributed Caching**: Redis-based caching for multi-instance deployments
- **Tool Versioning**: Support for tool schema versioning and migration
- **Advanced Search**: Machine learning-based tool recommendations
- **Metrics Dashboard**: Real-time monitoring and analytics

## Related Modules

- **Connection Module**: Provides server connectivity
- **Router Module**: Uses discovery data for request routing  
- **Toolset Module**: Uses discovery for tool validation and filtering
- **Server Module**: Orchestrates discovery initialization and lifecycle