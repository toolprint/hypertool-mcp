# DXT Extension Support for Hypertool-MCP

## Executive Summary

This document outlines the design for adding DXT (Dynamic eXtension Template) support to hypertool-mcp, allowing it to load and manage DXT extension files alongside traditional JSON MCP server configurations. DXT is a ZIP-based package format that bundles MCP server code, dependencies, and metadata into distributable extensions.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Component Design](#component-design)
- [Implementation Phases](#implementation-phases)
- [Configuration Schema](#configuration-schema)
- [Security Considerations](#security-considerations)
- [Integration Strategy](#integration-strategy)
- [Deployment Strategies](#deployment-strategies)
- [Code Examples](#code-examples)
- [Performance Considerations](#performance-considerations)
- [Testing Strategy](#testing-strategy)

## Architecture Overview

### Current State
Hypertool-mcp currently loads MCP server configurations from JSON files that specify:
- stdio-based servers (command + args)
- HTTP-based servers (URL + headers)
- SSE-based servers (URL + headers)

### DXT Integration Vision
The DXT support extends this system to additionally support:
- **DXT Extensions**: ZIP archives containing Node.js/Python/binary MCP servers
- **Unified Server Registry**: Single interface managing both JSON configs and DXT extensions
- **Template Resolution**: Dynamic configuration using template variables
- **Lifecycle Management**: Process spawning, monitoring, and cleanup for DXT servers
- **Sandboxed Execution**: Isolated runtime environments for security

### Design Principles

1. **Backward Compatibility**: Existing JSON configurations continue to work unchanged
2. **Unified Interface**: DXT servers appear identical to JSON servers from the proxy perspective
3. **Security First**: Sandboxed execution with configurable permission levels
4. **Local-First**: Begin with local filesystem loading, prepare for registry integration
5. **Extensible Architecture**: Design supports future transport types and runtimes

## Component Design

### 1. DXT Package Manager (`src/dxt/`)

#### `DxtPackageLoader`
```typescript
interface DxtPackageLoader {
  loadFromPath(path: string): Promise<DxtPackage>
  loadFromRegistry(id: string, version?: string): Promise<DxtPackage>
  validatePackage(pkg: DxtPackage): ValidationResult
  extractPackage(zipPath: string, extractDir: string): Promise<void>
}
```

**Responsibilities:**
- Extract and validate DXT ZIP archives
- Parse manifest.json files
- Verify package integrity and security constraints
- Handle different runtime types (Node.js, Python, binary)

#### `DxtManifestParser`
```typescript
interface DxtManifest {
  name: string
  version: string
  runtime: 'nodejs' | 'python' | 'binary'
  main: string
  description?: string
  dependencies?: Record<string, string>
  environment?: Record<string, string>
  permissions?: DxtPermissions
  templates?: Record<string, TemplateVariable>
}
```

**Responsibilities:**
- Parse and validate DXT manifest.json files
- Support template variable definitions
- Handle runtime-specific configurations
- Validate security permissions

### 2. Extended Configuration System (`src/config/`)

#### `EnhancedMCPConfigParser`
Extends existing `MCPConfigParser` to support:
```typescript
interface ExtendedServerConfig extends BaseServerConfig {
  type: 'stdio' | 'http' | 'sse' | 'dxt'
}

interface DxtServerConfig extends BaseServerConfig {
  type: 'dxt'
  source: 'local' | 'registry'
  path?: string        // Local path to .dxt file
  package?: string     // Registry package identifier
  version?: string     // Package version
  config?: Record<string, any>  // DXT-specific configuration
  templates?: Record<string, string>  // Template variable values
}
```

**Enhancement Strategy:**
- Modify `parseServerConfig()` to handle DXT type
- Add new `parseDxtConfig()` method
- Extend validation to include DXT-specific checks
- Support template variable resolution

#### `DxtConfigurationProvider`
```typescript
interface DxtConfigurationProvider {
  resolveDxtServers(configs: DxtServerConfig[]): Promise<ResolvedDxtServer[]>
  resolveTemplates(config: DxtServerConfig, manifest: DxtManifest): DxtServerConfig
  validatePermissions(manifest: DxtManifest): SecurityValidation
}
```

### 3. DXT Runtime Manager (`src/dxt/runtime/`)

#### `DxtRuntimeManager`
```typescript
interface DxtRuntimeManager {
  createRuntime(manifest: DxtManifest, config: DxtServerConfig): Promise<DxtRuntime>
  startServer(runtime: DxtRuntime): Promise<ProcessHandle>
  stopServer(handle: ProcessHandle): Promise<void>
  monitorHealth(handle: ProcessHandle): HealthStatus
}
```

**Runtime Support:**
- **Node.js**: Spawn child process with extracted package
- **Python**: Create virtual environment and execute
- **Binary**: Direct execution with security constraints

#### `ProcessManager`
```typescript
interface ProcessManager {
  spawn(config: ProcessConfig): Promise<ProcessHandle>
  kill(handle: ProcessHandle): Promise<void>
  monitor(handle: ProcessHandle): EventEmitter
  cleanup(): Promise<void>
}

interface ProcessConfig {
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
  timeout?: number
  memoryLimit?: number
}
```

### 4. Enhanced Connection Factory (`src/connection/`)

#### `DxtConnectionClient`
```typescript
class DxtConnectionClient extends BaseClient {
  constructor(
    private runtime: DxtRuntime,
    private processHandle: ProcessHandle
  ) {}

  async connect(): Promise<void> {
    // Start DXT process and establish MCP connection
  }

  async disconnect(): Promise<void> {
    // Graceful shutdown with cleanup
  }
}
```

**Integration Points:**
- Extends existing `BaseClient` architecture
- Manages DXT process lifecycle
- Handles stdio/HTTP transport detection
- Implements health monitoring

## Implementation Phases

### Phase 1: Core DXT Infrastructure (2-3 weeks)
**Goal**: Basic DXT package loading and parsing

**Deliverables:**
- `DxtPackageLoader` with ZIP extraction
- `DxtManifestParser` with validation
- Extended configuration types
- Basic Node.js runtime support
- Unit tests for core components

**Success Criteria:**
- Load and parse DXT packages from local filesystem
- Extract and validate manifest.json files
- Basic integration test with simple Node.js DXT server

### Phase 2: Runtime Integration (2-3 weeks)
**Goal**: Full process management and MCP integration

**Deliverables:**
- `DxtRuntimeManager` with process spawning
- `ProcessManager` with lifecycle management
- `DxtConnectionClient` with transport handling
- Enhanced configuration parser
- Integration with existing connection factory

**Success Criteria:**
- Start and stop DXT servers successfully
- Establish MCP connections to DXT processes
- Handle process crashes and restarts
- Full integration tests

### Phase 3: Template and Security (1-2 weeks)
**Goal**: Template variable resolution and security hardening

**Deliverables:**
- Template variable resolution system
- Security permission validation
- Sandboxed execution environment
- Error handling and recovery
- Comprehensive testing

**Success Criteria:**
- Support template variables in DXT configurations
- Implement basic security constraints
- Handle all error scenarios gracefully
- Performance benchmarking

### Phase 4: Enhanced Features (1-2 weeks)
**Goal**: Python/binary support and advanced features

**Deliverables:**
- Python runtime support
- Binary execution support
- Advanced configuration options
- Monitoring and observability
- Documentation and examples

**Success Criteria:**
- Support multiple runtime types
- Production-ready monitoring
- Complete documentation
- Example DXT packages

## Configuration Schema

### Extended MCP Configuration
```json
{
  "mcpServers": {
    "traditional-server": {
      "type": "stdio",
      "command": "node",
      "args": ["server.js"]
    },
    "dxt-extension": {
      "type": "dxt",
      "source": "local",
      "path": "./extensions/my-extension.dxt",
      "templates": {
        "API_KEY": "${env:MY_API_KEY}",
        "BASE_URL": "https://api.example.com"
      },
      "config": {
        "maxConcurrent": 10,
        "timeout": 30000
      }
    },
    "registry-dxt": {
      "type": "dxt",
      "source": "registry",
      "package": "@toolprint/filesystem-tools",
      "version": "1.2.0",
      "templates": {
        "ROOT_PATH": "/tmp/sandbox"
      }
    }
  }
}
```

### DXT Manifest Schema
```json
{
  "name": "@toolprint/filesystem-tools",
  "version": "1.2.0",
  "description": "File system operations for MCP",
  "runtime": "nodejs",
  "main": "dist/server.js",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "fs-extra": "^11.0.0"
  },
  "environment": {
    "NODE_ENV": "production"
  },
  "permissions": {
    "filesystem": {
      "read": ["{{ROOT_PATH}}/**"],
      "write": ["{{ROOT_PATH}}/output/**"]
    },
    "network": false,
    "processes": false
  },
  "templates": {
    "ROOT_PATH": {
      "type": "string",
      "description": "Root path for file operations",
      "required": true,
      "default": "/tmp"
    },
    "API_KEY": {
      "type": "string",
      "description": "API key for external service",
      "required": false,
      "secret": true
    }
  },
  "transport": "stdio",
  "capabilities": {
    "tools": true,
    "resources": false,
    "prompts": false
  }
}
```

## Security Considerations

### 1. Package Validation
- **Manifest Integrity**: Validate manifest schema and required fields
- **Code Signing**: Support for signed DXT packages (future)
- **Dependency Scanning**: Check for known vulnerable dependencies
- **Size Limits**: Enforce maximum package size constraints

### 2. Runtime Sandboxing
```typescript
interface DxtPermissions {
  filesystem?: {
    read?: string[]     // Allowed read paths (glob patterns)
    write?: string[]    // Allowed write paths
  }
  network?: {
    outbound?: string[] // Allowed outbound hosts/IPs
    inbound?: boolean   // Allow inbound connections
  }
  processes?: {
    spawn?: boolean     // Allow process spawning
    shell?: boolean     // Allow shell access
  }
  resources?: {
    memory?: number     // Memory limit in bytes
    cpu?: number        // CPU limit percentage
    time?: number       // Execution time limit
  }
}
```

### 3. Template Security
- **Variable Sanitization**: Escape special characters in template values
- **Secret Handling**: Secure storage and injection of sensitive variables
- **Scope Limitation**: Restrict template access to approved variables

### 4. Process Isolation
- **Working Directory**: Isolated working directories per DXT
- **Environment Isolation**: Clean environment variables
- **Resource Limits**: CPU, memory, and time constraints
- **Network Restrictions**: Configurable network access policies

## Integration Strategy

### 1. Backward Compatibility
- **Zero Breaking Changes**: Existing JSON configurations work unchanged
- **Gradual Migration**: Users can adopt DXT incrementally
- **Configuration Validation**: Enhanced validation with clear error messages
- **Rollback Support**: Easy fallback to previous versions

### 2. Server Factory Integration
```typescript
// Enhanced ServerConnectionFactory
class ServerConnectionFactory {
  async createConnection(config: ServerConfig): Promise<BaseClient> {
    switch (config.type) {
      case 'stdio':
        return new StdioClient(config)
      case 'http':
        return new HttpClient(config)
      case 'sse':
        return new SSEClient(config)
      case 'dxt':
        return await this.createDxtConnection(config)
      default:
        throw new Error(`Unsupported server type: ${config.type}`)
    }
  }

  private async createDxtConnection(config: DxtServerConfig): Promise<DxtConnectionClient> {
    const loader = new DxtPackageLoader()
    const pkg = await loader.loadFromPath(config.path!)
    const runtime = await this.runtimeManager.createRuntime(pkg.manifest, config)
    return new DxtConnectionClient(runtime, pkg)
  }
}
```

### 3. Discovery Service Integration
- **Unified Tool Discovery**: DXT servers participate in normal tool discovery
- **Caching Strategy**: Cache DXT server capabilities alongside JSON servers
- **Health Monitoring**: Include DXT server health in overall system status

## Deployment Strategies

### 1. Local Development
```bash
# Development workflow
hypertool config add-dxt ./my-extension.dxt --name "my-dev-extension"
hypertool start
hypertool toolset create --include-dxt
```

### 2. Production Deployment
```bash
# Production deployment
hypertool config add-dxt @toolprint/filesystem-tools --version 1.2.0
hypertool config validate
hypertool start --production
```

### 3. CI/CD Integration
```yaml
# Example GitHub Actions workflow
- name: Deploy DXT Extensions
  run: |
    hypertool config import ./production-config.json
    hypertool config validate --strict
    hypertool start --daemon
    hypertool health-check --timeout 30s
```

## Code Examples

### 1. Creating a Simple DXT Extension

**manifest.json:**
```json
{
  "name": "hello-world-dxt",
  "version": "1.0.0",
  "runtime": "nodejs",
  "main": "server.js",
  "description": "Simple hello world DXT extension",
  "templates": {
    "GREETING": {
      "type": "string",
      "description": "Greeting message",
      "default": "Hello"
    }
  }
}
```

**server.js:**
```javascript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new Server({
  name: 'hello-world-dxt',
  version: '1.0.0'
}, {
  capabilities: { tools: {} }
})

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'say_hello') {
    const greeting = process.env.GREETING || 'Hello'
    return {
      content: [{
        type: 'text',
        text: `${greeting}, World!`
      }]
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
```

### 2. Using DXT Extensions in Configuration

```json
{
  "mcpServers": {
    "hello-world": {
      "type": "dxt",
      "source": "local",
      "path": "./extensions/hello-world.dxt",
      "templates": {
        "GREETING": "Hi there"
      }
    },
    "file-tools": {
      "type": "dxt",
      "source": "registry",
      "package": "@toolprint/filesystem-tools",
      "version": "latest",
      "templates": {
        "ROOT_PATH": "/workspace/projects",
        "API_KEY": "${env:FILESYSTEM_API_KEY}"
      }
    }
  }
}
```

### 3. DXT Runtime Manager Implementation

```typescript
export class DxtRuntimeManager {
  private processes = new Map<string, ProcessHandle>()
  private workingDirs = new Map<string, string>()

  async createRuntime(manifest: DxtManifest, config: DxtServerConfig): Promise<DxtRuntime> {
    // Create isolated working directory
    const workDir = await this.createWorkingDirectory(manifest.name)
    this.workingDirs.set(manifest.name, workDir)

    // Resolve template variables
    const resolvedEnv = this.resolveTemplates(manifest.environment || {}, config.templates || {})

    // Prepare runtime configuration
    const runtimeConfig = {
      workingDirectory: workDir,
      environment: { ...process.env, ...resolvedEnv },
      command: this.getRuntimeCommand(manifest.runtime),
      args: [manifest.main],
      permissions: manifest.permissions || {}
    }

    return new DxtRuntime(runtimeConfig, manifest)
  }

  async startServer(runtime: DxtRuntime): Promise<ProcessHandle> {
    const processConfig: ProcessConfig = {
      command: runtime.config.command,
      args: runtime.config.args,
      env: runtime.config.environment,
      cwd: runtime.config.workingDirectory,
      timeout: 60000, // 1 minute startup timeout
      memoryLimit: runtime.manifest.permissions?.resources?.memory
    }

    const handle = await this.processManager.spawn(processConfig)
    this.processes.set(runtime.manifest.name, handle)

    // Monitor process health
    handle.on('exit', (code) => {
      this.emit('processExit', { name: runtime.manifest.name, code })
    })

    return handle
  }

  private getRuntimeCommand(runtime: string): string {
    switch (runtime) {
      case 'nodejs':
        return 'node'
      case 'python':
        return 'python3'
      case 'binary':
        return '' // Binary files are self-executing
      default:
        throw new Error(`Unsupported runtime: ${runtime}`)
    }
  }

  private resolveTemplates(
    environment: Record<string, string>,
    templates: Record<string, string>
  ): Record<string, string> {
    const resolved: Record<string, string> = {}

    for (const [key, value] of Object.entries(environment)) {
      resolved[key] = this.expandTemplate(value, templates)
    }

    return resolved
  }

  private expandTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] || match
    }).replace(/\$\{env:(\w+)\}/g, (match, envVar) => {
      return process.env[envVar] || match
    })
  }
}
```

## Performance Considerations

### 1. Package Loading Optimization
- **Lazy Loading**: Load DXT packages only when needed
- **Caching**: Cache extracted packages to avoid repeated extraction
- **Parallel Processing**: Load multiple DXT packages concurrently
- **Memory Management**: Clean up unused package data

### 2. Process Management
- **Connection Pooling**: Reuse established connections
- **Process Reuse**: Keep warm processes for frequently used extensions
- **Resource Monitoring**: Track CPU, memory usage per DXT server
- **Graceful Shutdown**: Proper cleanup to prevent resource leaks

### 3. Template Resolution
- **Compilation**: Compile templates once, reuse multiple times
- **Variable Caching**: Cache resolved template variables
- **Lazy Evaluation**: Resolve variables only when needed

## Testing Strategy

### 1. Unit Tests
- **Package Loading**: Test DXT ZIP extraction and validation
- **Manifest Parsing**: Test manifest.json parsing and validation
- **Template Resolution**: Test variable expansion and substitution
- **Process Management**: Test process spawning and lifecycle
- **Security Validation**: Test permission checking and enforcement

### 2. Integration Tests
- **End-to-End**: Full workflow from DXT loading to tool execution
- **Multi-Runtime**: Test Node.js, Python, and binary DXT extensions
- **Error Scenarios**: Test handling of invalid packages, process crashes
- **Performance**: Benchmark loading times and resource usage
- **Security**: Test sandbox enforcement and permission violations

### 3. Example DXT Packages
Create test packages covering:
- **Simple Node.js Server**: Basic MCP server implementation
- **Python Server**: Python-based MCP server with dependencies
- **Binary Server**: Compiled binary MCP server
- **Template-Heavy**: Server with extensive template variable usage
- **Security-Constrained**: Server with restrictive permissions

## Reasons Behind Design Decisions

### 1. Unified Configuration Approach
**Decision**: Extend existing JSON configuration rather than separate systems
**Reasoning**:
- Maintains familiar user experience
- Reduces learning curve for adoption
- Simplifies mental model (one config system)
- Leverages existing validation and error handling

### 2. ZIP-Based Package Format
**Decision**: Use ZIP archives following Claude Desktop's DXT specification
**Reasoning**:
- Industry standard, well-supported format
- Built-in compression reduces storage/transfer overhead
- Existing tooling for creation and inspection
- Proven by Claude Desktop implementation
- Easy to validate and extract securely

### 3. Process-Per-Extension Model
**Decision**: Run each DXT extension in separate processes
**Reasoning**:
- Strong isolation between extensions
- Crash recovery (one extension failure doesn't affect others)
- Resource management and limits per extension
- Security boundaries enforced by OS
- Familiar model for MCP server deployment

### 4. Template Variable System
**Decision**: Support template variables in DXT configurations
**Reasoning**:
- Enables reusable extensions across environments
- Secure secret injection without hardcoding
- Flexible configuration without package modification
- Follows infrastructure-as-code best practices
- Simplifies deployment automation

### 5. Gradual Feature Rollout
**Decision**: Implement in phases starting with core functionality
**Reasoning**:
- Reduces implementation risk
- Enables early user feedback
- Allows for architectural adjustments
- Maintains stable system during development
- Provides value incrementally

## Future Considerations

### 1. Registry Integration
- **Package Discovery**: Search and browse available DXT extensions
- **Automatic Updates**: Version management and update notifications
- **Dependency Resolution**: Handle transitive dependencies
- **Publishing Pipeline**: Tools for creating and publishing DXT packages

### 2. Advanced Security Features
- **Code Signing**: Cryptographic verification of package integrity
- **Sandboxing**: Container-based or VM-based isolation
- **Audit Logging**: Detailed logs of DXT server actions
- **Permission Escalation**: Dynamic permission requests

### 3. Performance Optimizations
- **Hot Reloading**: Update DXT servers without full restart
- **Shared Dependencies**: Reduce duplication across extensions
- **Native Compilation**: Optimize frequently used extensions
- **Edge Caching**: Distribute popular extensions via CDN

### 4. Developer Experience
- **DXT Development Kit**: Tools for creating and testing extensions
- **Local Registry**: Private registry for organization-specific extensions
- **Debug Support**: Enhanced debugging capabilities for DXT development
- **IDE Integration**: Extensions for popular development environments

This design provides a solid foundation for DXT support while maintaining the flexibility to evolve and add advanced features based on user needs and feedback.
