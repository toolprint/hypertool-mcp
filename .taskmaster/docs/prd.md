<context>
# Overview  
Meta-MCP is a TypeScript-based proxy MCP server that acts as a single entry point for multiple underlying MCP servers. It dynamically exposes a configurable subset of tools from connected MCP servers, allowing users to create custom toolsets by combining tools from different servers. The proxy handles tool discovery, caching, and request routing transparently across multiple transport protocols.

# Core Features  
- **MCP Server Proxy**: Acts as a single MCP server that proxies requests to multiple underlying MCP servers
- **Multi-Transport Support**: Supports both streamable HTTP and stdio transports for client connections, built on Express.js framework
- **Dynamic Tool Discovery**: Automatically discovers and caches available tools from connected MCP servers
- **Dynamic Tool Registration**: Tools from equipped toolsets are dynamically registered/unregistered with automatic change notifications
- **Configurable Tool Subsets**: Users can specify which tools to expose from each underlying server via toolsets
- **Tool Request Routing**: Transparently routes tool calls to the appropriate underlying server
- **MCP Configuration Parsing**: Reads and parses existing .mcp.json files to discover available servers
- **Server Health Monitoring**: Tracks which underlying servers are running and accessible
- **Toolset Management**: Allows users to create, save, and load custom toolset configurations
- **TypeScript Implementation**: Full TypeScript type safety and modern development practices

# User Experience  
- **Primary User**: Developers using Claude Code with multiple MCP servers who want simplified tool management
- **Key User Flows**: 
  - Point server to existing .mcp.json file on first launch
  - Server discovers available tools from running MCP servers
  - User configures custom toolset (subset of available tools)
  - When toolset is equipped, tools are dynamically registered with flattened names (e.g., git.search → git_search)
  - MCP clients see only the tools from the equipped toolset directly in their tool list
  - Tool calls are transparently proxied to correct underlying servers
  - When toolset is unequipped, tools are dynamically unregistered with change notifications
- **Error Handling**: Clear warnings when underlying servers are unavailable or tools can't be loaded
</context>
<PRD>
# Technical Architecture  
- **TypeScript MCP Server**: Standard MCP server implementation following cco-mcp best practices
- **Express.js Framework**: Modern HTTP server built on Express.js with middleware support for extensibility
- **Transport Layer**: Support for both streamable HTTP (/mcp endpoint) and stdio transports for maximum compatibility
- **Client Pool Management**: Maintains connections to multiple underlying MCP servers
- **Tool Registry**: Dynamic registry with two layers - tool discovery (all available tools) and tool registration (active toolset tools)
- **Dynamic Tool Registration**: Real-time registration/unregistration of tools based on equipped toolset with MCP change notifications
- **Configuration System**: Parses .mcp.json files and manages toolset configurations
- **Caching Layer**: Caches tool definitions and server availability status with real-time updates
- **Request Router**: Routes incoming tool requests to appropriate underlying servers
- **Health Monitor**: Periodically checks underlying server availability with reconnection logic

# Development Roadmap  
**Phase 1 - Core Proxy Functionality (MVP)**
- Implement TypeScript MCP server with Express.js framework and streamable HTTP transport
- Support both stdio and streamable HTTP (/mcp endpoint) transport modes  
- Add .mcp.json file parsing and server discovery
- Create tool discovery and caching system with TypeScript types
- Implement basic request proxying for tool calls
- Add simple toolset configuration (JSON-based)

**Phase 2 - Enhanced Management**
- Implement server health monitoring and reconnection logic
- Add toolset management commands (create, save, load, list)
- Implement graceful error handling for unavailable servers
- Add configuration persistence and user preferences
- Create CLI interface for toolset management

**Phase 3 - Advanced Features**
- Add tool call middleware for logging/debugging
- Implement tool versioning and compatibility checks
- Add performance monitoring and caching optimizations
- Add hot-reloading of configurations
- Implement comprehensive testing suite

# Logical Dependency Chain
1. **TypeScript MCP Server Foundation**: Basic MCP server implementation with stdio/HTTP transport support
2. **Configuration Parser**: Parse .mcp.json files and extract server connection details
3. **Client Connection Manager**: Establish and maintain connections to underlying MCP servers
4. **Tool Discovery Engine**: Query underlying servers for available tools and cache results with TypeScript types
5. **Request Router**: Route incoming tool requests to correct underlying servers
6. **Toolset Configuration**: Allow users to specify which tools to expose
7. **Health Monitoring**: Track server availability and handle connection failures
8. **Persistence Layer**: Save user preferences and toolset configurations

# Risks and Mitigations  
- **Underlying Server Failures**: Dependent servers may become unavailable
  - Mitigation: Implement health checks, graceful degradation, and clear error messages
- **Tool Schema Conflicts**: Different servers may have tools with same names
  - Mitigation: Implement namespacing or conflict resolution strategies
- **Performance Overhead**: Proxying adds latency to tool calls
  - Mitigation: Optimize connection pooling and implement caching where appropriate
- **Configuration Complexity**: Managing multiple server configurations can be complex
  - Mitigation: Provide clear documentation and intuitive configuration interfaces

# Dynamic Tool Registration System

## Overview
The dynamic tool registration system is the core innovation of HyperTool MCP that transforms toolset management from filtering to real-time tool exposure. When users equip a toolset, the specific tools from that toolset are dynamically registered with the MCP server, making them directly visible to MCP clients as if they were native tools.

## Two-Layer Architecture

### Layer 1: Tool Discovery Engine
- **Purpose**: Comprehensive discovery of all available tools from connected servers
- **Function Name**: `discover-all-tools` (renamed from `list-available-tools` to avoid confusion)
- **Behavior**: Always returns the complete universe of tools from all connected MCP servers
- **Usage**: Used by toolset creation tools and administrative functions
- **Independence**: Operates independently of equipped toolsets

### Layer 2: Dynamic Tool Registration  
- **Purpose**: Real-time registration/unregistration of tools based on equipped toolset
- **Function**: MCP server's `getAvailableTools()` method
- **Behavior**: Only returns currently registered tools from equipped toolset
- **Visibility**: Tools appear directly in MCP client tool lists

## Tool Name Flattening

### Naming Convention
- **Input**: Namespaced tool names (e.g., `git.search_repositories`, `linear.create_issue`)
- **Output**: Flattened names (e.g., `git_search_repositories`, `linear_create_issue`)
- **Rule**: Replace dots with underscores for MCP client compatibility
- **Uniqueness**: Guaranteed unique due to server name uniqueness requirement

### Examples of Name Flattening
```typescript
// Basic flattening examples
"git.status" → "git_status"
"docker.ps" → "docker_ps"
"linear.create_issue" → "linear_create_issue"
"context7.resolve-library-id" → "context7_resolve_library_id"
"task-master.get_tasks" → "task_master_get_tasks"

// Edge cases
"git.search-repositories" → "git_search_repositories"  // hyphens preserved
"docker.build_image" → "docker_build_image"           // underscores preserved
"server.tool.with.multiple.dots" → "server_tool_with_multiple_dots"
```

### Implementation Requirements
- Deterministic flattening algorithm
- Reversible transformation for request routing
- Handle edge cases: special characters, numbers, existing underscores
- Maintain bidirectional mapping for transparent proxying

## Registration Lifecycle

### Toolset Equip Flow
1. User calls `equip-toolset` with toolset name
2. System loads toolset configuration from preferences
3. For each tool in toolset:
   - Resolve tool reference against discovered tools
   - Flatten tool name (git.search → git_search)
   - Preserve exact schema, description, annotations
   - Register with MCP server's tool registry
4. Send MCP `notifications/tools/list_changed` to all clients
5. Update internal registration state

### Example: Equipping "dev-essentials" Toolset
```json
// Toolset configuration
{
  "name": "dev-essentials",
  "tools": [
    {"namespacedName": "git.status"},
    {"namespacedName": "git.commit"},
    {"namespacedName": "docker.ps"},
    {"namespacedName": "linear.create_issue"}
  ]
}

// Before equip: getAvailableTools() returns []
// After equip: getAvailableTools() returns:
[
  {
    "name": "git_status",
    "description": "Show git repository status",
    "inputSchema": { /* original git.status schema */ }
  },
  {
    "name": "git_commit", 
    "description": "Commit changes to git repository",
    "inputSchema": { /* original git.commit schema */ }
  },
  {
    "name": "docker_ps",
    "description": "List running Docker containers", 
    "inputSchema": { /* original docker.ps schema */ }
  },
  {
    "name": "linear_create_issue",
    "description": "Create a new Linear issue",
    "inputSchema": { /* original linear.create_issue schema */ }
  }
]
```

### Toolset Unequip Flow  
1. User calls `unequip-toolset`
2. System unregisters all currently registered tools
3. Clear internal registration state
4. Send MCP `notifications/tools/list_changed` to all clients
5. MCP clients see empty tool list (except built-in management tools)

### Tool Call Routing Example
```typescript
// 1. MCP client calls: git_search_repositories({"query": "typescript"})
// 2. Router receives: name="git_search_repositories", args={"query": "typescript"}
// 3. Router reverse-flattens: "git_search_repositories" → "git.search_repositories"
// 4. Router extracts: serverName="git", toolName="search_repositories"  
// 5. Router proxies to git server: toolName="search_repositories", args={"query": "typescript"}
// 6. Git server responds with repository list
// 7. Response returned to client unchanged

// Internal routing mapping:
{
  "git_search_repositories": {
    "serverName": "git",
    "originalName": "search_repositories",
    "namespacedName": "git.search_repositories"
  },
  "linear_create_issue": {
    "serverName": "linear", 
    "originalName": "create_issue",
    "namespacedName": "linear.create_issue"
  }
}
```

## Schema Preservation
- **Input Schemas**: Preserved exactly from original tool definitions
- **Output Schemas**: Preserved exactly from original tool definitions  
- **Descriptions**: Preserved exactly from original tool definitions
- **Annotations**: All annotations preserved including title, readOnlyHint, etc.
- **No Modification**: Zero alteration of tool behavior or interface

## Error Handling and Edge Cases

### Server Availability Examples
```typescript
// Scenario: git server offline during toolset equip
const toolset = {
  "name": "dev-tools",
  "tools": [
    {"namespacedName": "git.status"},      // git server offline
    {"namespacedName": "docker.ps"},       // docker server online  
    {"namespacedName": "linear.create_issue"} // linear server online
  ]
}

// Result: Register only available tools
console.log("⚠️  Warning: git server unavailable, skipping tools: git.status");
// getAvailableTools() returns: ["docker_ps", "linear_create_issue"]

// When git server comes back online:
console.log("✅ git server reconnected, registering tools: git_status");
// getAvailableTools() now returns: ["docker_ps", "linear_create_issue", "git_status"]
```

### Registration Failure Example
```typescript
// Scenario: Partial registration failure
async function equipToolset(toolsetName) {
  const tools = await loadToolsetTools(toolsetName);
  const registered = [];
  
  try {
    for (const tool of tools) {
      await registerTool(tool);
      registered.push(tool);
    }
    await notifyToolsChanged();
  } catch (error) {
    // Rollback on any failure
    console.error(`Registration failed for ${tool.name}: ${error.message}`);
    for (const rollbackTool of registered) {
      await unregisterTool(rollbackTool);
    }
    throw new Error(`Failed to equip toolset: ${error.message}`);
  }
}
```

### Concurrent Operations Example
```typescript
// Scenario: Rapid equip/unequip sequence
let registrationLock = false;

async function equipToolset(name) {
  if (registrationLock) {
    throw new Error("Registration operation in progress, please wait");
  }
  
  registrationLock = true;
  try {
    // Perform registration...
  } finally {
    registrationLock = false;
  }
}

// User rapidly calls:
// 1. equip-toolset dev-tools    → succeeds, locks during operation
// 2. equip-toolset data-tools   → fails with "operation in progress"  
// 3. unequip-toolset           → waits for lock, then succeeds
```

### State Consistency Examples
```typescript
// Before any toolset equipped
getAvailableTools() → [
  // Only built-in toolset management tools
  "discover-all-tools", 
  "build-toolset",
  "equip-toolset", 
  "unequip-toolset"
]

// After equipping "dev-essentials" toolset  
getAvailableTools() → [
  // Built-in tools + registered toolset tools
  "discover-all-tools",
  "build-toolset", 
  "equip-toolset",
  "unequip-toolset",
  "git_status",
  "git_commit", 
  "docker_ps",
  "linear_create_issue"
]

// After unequipping toolset
getAvailableTools() → [
  // Back to only built-in tools
  "discover-all-tools",
  "build-toolset",
  "equip-toolset", 
  "unequip-toolset"
]
```

## MCP Protocol Compliance

### Change Notifications
- **Event**: `notifications/tools/list_changed`
- **Timing**: Sent after successful registration/unregistration operations
- **Clients**: All connected MCP clients receive notifications
- **Content**: Standard MCP notification format

### Tool Interface Compliance
- **Format**: Exact MCP Tool interface: name, description, inputSchema, outputSchema
- **Validation**: All registered tools must pass MCP schema validation
- **Compatibility**: Works with all MCP client implementations

## Integration Points

### Existing Systems
- **Toolset Management**: Hooks into equip/unequip commands in enhanced server
- **Request Router**: Updated to handle flattened name routing
- **Discovery Engine**: Remains independent, provides tools for registration
- **Health Monitor**: Triggers re-registration on server availability changes

### Built-in Tools
- **Toolset Management**: Always available regardless of equipped toolset
- **Discovery Tools**: `discover-all-tools` always available for toolset creation
- **Status Tools**: `get-active-toolset` shows registration status

## Performance Considerations

### Registration Performance
- **Batch Operations**: Register all toolset tools in single operation
- **Lazy Loading**: Register tools on-demand if needed for large toolsets
- **Caching**: Cache flattened names and routing mappings

### Memory Management
- **Tool Registry**: Lightweight registry with minimal memory footprint
- **Cleanup**: Automatic cleanup on toolset unequip
- **Garbage Collection**: No memory leaks from registration operations

# Logging System

## Overview
The logging system uses Pino as the primary logger throughout the codebase, replacing all console.log/warn/error calls with structured logging. It provides both human-readable output for development and structured JSON logs for production, with comprehensive request/response tracking and file logging capabilities.

## Core Requirements

### 1. Pino Implementation
- **Primary Logger**: Pino with async logging for performance
- **Pretty Printing**: pino-pretty for development mode with colored, human-readable output
- **Structured Logging**: JSON format for production with full metadata
- **TypeScript Support**: Full type definitions via @types/pino

### 2. CLI Configuration
- **Log Level Flag**: `--log-level` with options: trace, debug, info, warn, error, fatal
- **Default Level**: info
- **Environment Detection**: Automatically enable pretty-printing in development
- **Transport Awareness**: Adjust logging based on stdio vs HTTP transport

### 3. Centralized Logger Module
- **Location**: `src/logging/index.ts`
- **Architecture**: Factory pattern for creating child loggers
- **Child Loggers**: Each module gets its own child logger with context
- **Type Safety**: Full TypeScript interfaces for logger configuration

### 4. File Logging
- **Directory**: Configuration directory (e.g., ~/.config/hypertool-mcp/logs/)
- **Filename Format**: `hypertool-mcp_{ISO_timestamp}.log` where timestamp is like `2025-01-15T10-30-45`
- **New File Per Run**: Each server start creates a new log file
- **Async Writing**: Non-blocking file writes using Pino's async mode

### 5. Request/Response Logging
- **Metadata Fields**:
  - `requestId`: Unique identifier for each request
  - `correlationId`: Track related requests across the system
  - `serverName`: Which underlying MCP server handled the request
  - `toolName`: The specific tool being called
  - `duration`: Time taken for the request
  - `status`: Success/failure status
- **Automatic Tracking**: Middleware to automatically log all MCP requests/responses
- **Sensitive Data**: Careful not to log sensitive parameters

### 6. Module Integration
Each module should create its own child logger:
```typescript
// In src/server/index.ts
const logger = createLogger('server');

// In src/discovery/engine.ts  
const logger = createLogger('discovery');

// In src/router/index.ts
const logger = createLogger('router');
```

### 7. Migration Script
- **Location**: `scripts/migrate-to-pino.js`
- **Functionality**:
  - Replace `console.log` → `logger.info` or `logger.debug`
  - Replace `console.warn` → `logger.warn`
  - Replace `console.error` → `logger.error`
  - Add appropriate context to each log call
  - Handle special cases (startup messages, CLI output)

### 8. Transport Mode Support
- **stdio Mode**: 
  - Use stdout for logs to avoid mixing with MCP protocol
  - Consider using stderr for error logs
  - Pretty-print by default
- **HTTP Mode**:
  - Full async logging to prevent request blocking
  - JSON format for easier parsing
  - Include HTTP-specific metadata (headers, status codes)

### 9. Development Features
- **Stack Traces**: Include full stack traces in error logs when in development
- **Source Location**: Log file and line number in development mode
- **Performance Timing**: Log function execution times for debugging
- **Memory Usage**: Optional memory usage logging for performance debugging

### 10. TypeScript Interfaces
```typescript
interface LoggerConfig {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  transport: 'stdio' | 'http';
  filePath?: string;
  prettyPrint?: boolean;
  async?: boolean;
}

interface RequestLogContext {
  requestId: string;
  correlationId: string;
  serverName: string;
  toolName?: string;
  startTime: number;
  metadata?: Record<string, any>;
}

interface LoggerFactory {
  createLogger(module: string): Logger;
  getRootLogger(): Logger;
  setGlobalLevel(level: string): void;
}
```

### 11. Error Handling
- **Fallback Logging**: If file logging fails, fallback to console
- **Circular Reference**: Handle circular references in logged objects
- **Large Payloads**: Truncate extremely large logged objects
- **Performance Impact**: Monitor and limit logging in hot paths

### 12. Best Practices
- **Contextual Logging**: Always include relevant context (module, operation, IDs)
- **Log Levels**: Use appropriate levels (debug for development, info for important events)
- **Structured Data**: Log objects instead of concatenated strings
- **Consistent Format**: Use consistent field names across all modules
- **Performance**: Use child loggers to avoid repeated context addition

## Implementation Priority
1. Create centralized logger module with TypeScript interfaces
2. Add CLI flag parsing for log level
3. Implement file logging with ISO timestamp format
4. Create migration script to replace console.* calls
5. Integrate with request/response middleware
6. Add child loggers to all major modules
7. Test in both stdio and HTTP transport modes

# Appendix  
- **Target MCP Servers**: git, docker, context7, task-master, claude-task, and others
- **Configuration Format**: JSON-based toolset definitions with server mappings
- **Deployment**: Single TypeScript executable that can be run as MCP server
- **Development Language**: TypeScript with full type safety
- **Reference Implementation**: https://github.com/toolprint/cco-mcp for best practices
- **Transport Support**: stdio (for Claude Code) and streamable HTTP with /mcp endpoint (for modern MCP tooling)
- **Server Framework**: Express.js with middleware architecture for extensibility
</PRD>