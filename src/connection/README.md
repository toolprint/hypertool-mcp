# Connection Management System

This directory contains the core connection management logic for hypertool-mcp, responsible for establishing, maintaining, and routing connections to multiple underlying MCP servers.

## 🏗️ Architecture Overview

The connection management system is built with three primary components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ ConnectionManager│───▶│ ConnectionPool  │───▶│   Connection    │
│                 │    │                 │    │   (Factory)     │
│ - Orchestration │    │ - Lifecycle     │    │ - Stdio/SSE     │
│ - Configuration │    │ - Health Checks │    │ - MCP Protocol  │
│ - Server Names  │    │ - Event Fwd     │    │ - Transport     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📁 File Structure

```
src/connection/
├── README.md              # This file - architecture and design
├── manager.ts             # High-level connection orchestration
├── pool.ts                # Connection lifecycle and health management
├── factory.ts             # Connection creation and transport setup
├── types.ts               # Type definitions and interfaces
├── clients/               # MCP client implementations
│   ├── stdio.ts          # Standard I/O transport client
│   ├── sse.ts            # Server-Sent Events transport client
│   └── types.ts          # Client-specific type definitions
└── tests/                 # Comprehensive test suites
    ├── manager.test.ts    # Connection manager tests
    ├── pool.test.ts       # Connection pool tests
    └── factory.test.ts    # Factory pattern tests
```

## 🎯 Design Principles

### 1. **Fail-Fast Server Name Conflict Resolution**

**Problem**: Multiple servers with the same name create tool resolution ambiguity.

**Solution**: Multi-level validation with immediate termination on conflicts.

#### **Validation Levels:**

1. **Config Parsing Level** (Most Comprehensive)
   - Detects case-insensitive conflicts (`git` vs `GIT`)
   - Catches whitespace issues (`"git "` vs `"git"`)
   - Validates server name format and uniqueness
   - **Action**: Exit with detailed error message

2. **Connection Manager Level** (Runtime Protection)
   - Prevents duplicate server registration
   - Provides clear conflict resolution guidance
   - **Action**: Throw descriptive error with existing server list

3. **Connection Pool Level** (Last Resort)
   - Final safety check against duplicate connections
   - **Action**: Throw detailed conflict error

#### **Error Message Design:**

```bash
❌ Server name conflict detected: "git" already exists.
💡 Resolution: Use a unique server name or remove the existing server first.
📋 Existing servers: git, docker, npm
🚫 hypertool-mcp server cannot start with conflicting server configurations.
```

### 2. **Graceful Connection Lifecycle Management**

**Design Choice**: Separate connection state from business logic.

```typescript
// Connection states flow
DISCONNECTED → CONNECTING → CONNECTED → DISCONNECTED
     ↑              ↓            ↓
     └──── FAILED ←─┘      RECONNECTING
```

**Benefits:**

- Clear state transitions
- Health check integration
- Automatic reconnection strategies
- Event-driven notifications

### 3. **Transport Abstraction**

**Problem**: MCP supports multiple transport mechanisms (stdio, SSE, future protocols).

**Solution**: Factory pattern with transport-agnostic interface.

```typescript
interface Connection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  isConnected(): boolean;
  // Transport details hidden
}
```

**Supported Transports:**

- **Stdio**: Process-based communication (local tools)
- **SSE**: HTTP Server-Sent Events (remote services)
- **Future**: WebSocket, TCP, custom protocols

## 🔧 Server Resolution Logic

### **Server Name Uniqueness**

**Rule**: Each server must have a globally unique name (case-insensitive).

**Why**: Tool resolution requires unambiguous server identification.

```typescript
// ✅ Valid: Unique server names
{
  "git": { type: "stdio", command: "git-mcp" },
  "docker": { type: "stdio", command: "docker-mcp" },
  "github": { type: "sse", url: "https://api.github.com/mcp" }
}

// ❌ Invalid: Case-insensitive conflict
{
  "git": { type: "stdio", command: "git-mcp" },
  "GIT": { type: "sse", url: "https://git.example.com/mcp" }
  // ERROR: Both normalize to "git"
}
```

### **Tool Namespacing**

**Pattern**: `{serverName}.{toolName}`

**Examples**:

- `git.status` → Git server's status tool
- `docker.ps` → Docker server's ps tool
- `github.create-issue` → GitHub server's issue creation tool

**Conflict Resolution**:

```typescript
// Multiple servers with same tool name
servers: {
  "git": ["status", "commit", "push"],
  "svn": ["status", "commit", "update"]
}

// Tools exposed with namespacing:
tools: [
  "git.status",    // Unambiguous
  "git.commit",    // Unambiguous
  "git.push",      // Unique to git
  "svn.status",    // Unambiguous
  "svn.commit",    // Unambiguous
  "svn.update"     // Unique to svn
]
```

### **Connection Resolution Priority**

1. **Exact server name match** (highest priority)
2. **Server availability check** (connected state)
3. **Health status verification** (ping response)
4. **Fallback to error** (no valid route found)

## 🛡️ Error Handling Strategy

### **Initialization Errors**

**Principle**: Fail fast with actionable guidance.

```typescript
// Before: Silent warnings, partial initialization
console.warn("Failed to load config:", error);
// Server continues with partial state ❌

// After: Immediate termination with guidance
console.error(`
❌ FATAL ERROR: Failed to initialize server "git"
   Error: Connection for server "git" already exists
💡 Resolution: Check configuration for duplicate server names
   Configuration file: /path/to/.mcp.json
🚫 hypertool-mcp server cannot start with conflicting configurations.`);
process.exit(1); // ✅
```

### **Runtime Errors**

**Principle**: Graceful degradation with service continuity.

```typescript
// Connection failures don't stop other servers
try {
  await connection.connect();
} catch (error) {
  // Log error, emit event, continue with other servers
  this.emit('connectionFailed', { serverName, error });
  // Server remains available for manual reconnection
}
```

### **Health Check Failures**

**Principle**: Automatic recovery with manual override options.

```typescript
// Periodic health checks with automatic reconnection
if (!await connection.ping()) {
  console.warn(`Health check failed for "${serverName}"`);
  // Emit warning, attempt reconnection, notify discovery engine
  this.emit('healthCheckFailed', { serverName });
}
```

## 🔄 Event System

### **Connection Events**

```typescript
// Manager-level events
manager.on('connected', ({ serverName }) => {
  // Server successfully connected
});

manager.on('disconnected', ({ serverName }) => {
  // Server disconnected (graceful or unexpected)
});

manager.on('failed', ({ serverName, error }) => {
  // Connection attempt failed
});

// Pool-level events
pool.on('connectionAdded', ({ serverName, connection }) => {
  // New server added to pool
});

pool.on('poolStarted', () => {
  // All connections initialized
});
```

### **Integration with Discovery Engine**

```typescript
// Automatic tool discovery on connection changes
connectionManager.on('connected', (event) => {
  if (autoDiscovery) {
    discoveryEngine.discoverTools(event.serverName);
  }
});

connectionManager.on('disconnected', (event) => {
  discoveryEngine.clearServerTools(event.serverName);
});
```

## 🧪 Testing Strategy

### **Unit Test Coverage**

- **Connection Manager**: Configuration validation, server lifecycle
- **Connection Pool**: Health checks, concurrent connection limits
- **Factory**: Transport creation, configuration parsing
- **Clients**: Protocol compliance, error handling

### **Integration Test Scenarios**

- **Server Name Conflicts**: Various conflict types and resolutions
- **Transport Failures**: Network issues, process crashes, timeouts
- **Configuration Edge Cases**: Invalid JSON, missing fields, permissions
- **Health Check Recovery**: Connection drops, server restarts

### **Mock Testing Infrastructure**

```typescript
// Comprehensive mocking for isolated testing
class MockConnectionManager implements IConnectionManager {
  // Simulates real connection behavior without external dependencies
}

class MockConnection implements Connection {
  // Controllable connection state for testing edge cases
  mockConnect() { /* ... */ }
  mockDisconnect() { /* ... */ }
  triggerHealthCheckFailure() { /* ... */ }
}
```

## 🔮 Future Enhancements

### **Planned Features**

1. **Connection Pooling**: Reuse connections for multiple tool calls
2. **Load Balancing**: Distribute requests across server instances
3. **Circuit Breakers**: Automatic failure detection and recovery
4. **Metrics Collection**: Connection statistics, performance monitoring
5. **Protocol Versioning**: MCP protocol version negotiation

### **Extensibility Points**

```typescript
// Plugin architecture for custom transports
interface TransportPlugin {
  readonly name: string;
  createConnection(config: any): Connection;
  validateConfig(config: any): ValidationResult;
}

// Custom connection strategies
interface ConnectionStrategy {
  shouldConnect(server: string): boolean;
  getRetryPolicy(server: string): RetryPolicy;
  handleConnectionFailure(server: string, error: Error): void;
}
```

## 📚 Related Documentation

- **[Discovery Engine](../discovery/README.md)**: Tool discovery and caching
- **[Request Router](../router/README.md)**: Request routing and load balancing
- **[Configuration](../config/README.md)**: MCP configuration parsing
- **[Types](../types/README.md)**: TypeScript type definitions

## 🤝 Contributing

When modifying connection management logic:

1. **Maintain backward compatibility** for existing configurations
2. **Add comprehensive tests** for new connection strategies
3. **Update error messages** to be actionable and user-friendly
4. **Consider multi-transport scenarios** in design decisions
5. **Document breaking changes** with migration guides

---

> **Note**: This system prioritizes reliability and clear error reporting over performance optimization. Connection setup is infrequent but critical - failing fast with clear guidance prevents hours of debugging misconfigured servers.
