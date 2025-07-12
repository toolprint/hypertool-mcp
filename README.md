# Meta-MCP

A TypeScript MCP proxy server that routes requests between clients and multiple underlying MCP servers.

## Overview

Meta-MCP is a single MCP server that:
1. Connects to multiple underlying MCP servers as a client
2. Discovers available tools from those servers
3. Exposes a configurable subset of those tools to its own clients
4. Routes tool calls transparently to the correct underlying server

**Simple Example**: If server A has tools (foo, bar) and server B has tools (bam, bee), this proxy can expose just (foo, bam) and route calls accordingly.

## Features

- 🔧 **Multi-Server Connection**: Connect to multiple MCP servers simultaneously
- 🔍 **Tool Discovery**: Automatically discover tools from connected servers
- 🎯 **Toolset Configuration**: Create custom collections of tools from any servers
- 🛡️ **Security Validation**: Secure-by-default tool reference validation
- 🔄 **Request Routing**: Transparent routing of tool calls to the correct server
- 📦 **TypeScript**: Full type safety with modern TypeScript

## Getting Started

### Prerequisites

- Node.js 16+ 
- TypeScript
- Git (for development)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd meta-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Basic Usage

1. **Configure underlying MCP servers** in `.mcp.json`:
```json
{
  "mcpServers": {
    "git": {
      "type": "stdio",
      "command": "git-mcp-server"
    },
    "docker": {
      "type": "stdio", 
      "command": "docker-mcp-server"
    }
  }
}
```

2. **Create a toolset** to select which tools to expose:
```json
{
  "name": "dev-essentials",
  "description": "Essential development tools",
  "tools": [
    {"namespacedName": "git.status"},
    {"namespacedName": "git.commit"},
    {"namespacedName": "docker.ps"}
  ]
}
```

3. **Start the Meta-MCP server**:
```bash
npm start
```

## Architecture

### Core Components

- **[Connection Manager](src/connection/README.md)**: Manages connections to underlying MCP servers
- **[Tool Discovery](src/discovery/README.md)**: Discovers and caches available tools
- **[Toolset System](src/toolset/README.md)**: User-defined tool collections with validation
- **[Request Router](src/router/README.md)**: Routes requests to the correct underlying server
- **[Configuration Parser](src/config/README.md)**: Parses and validates `.mcp.json` files

### Tool Resolution Flow

```
Client Request → Meta-MCP → Toolset Filter → Route to Server → Execute → Response
```

1. Client sends tool call to Meta-MCP
2. Meta-MCP checks if tool is in active toolset
3. Routes request to appropriate underlying server
4. Executes tool on underlying server
5. Returns response to client

## Development

### Project Structure

```
src/
├── config/          # Configuration parsing and validation
├── connection/      # Multi-server connection management  
├── discovery/       # Tool discovery and caching
├── router/          # Request routing logic
├── server/          # Core MCP server implementation
├── toolset/         # Toolset configuration system
└── types/           # TypeScript type definitions
```

### Available Commands

```bash
# Development
npm run dev          # Start in development mode
npm run build        # Build TypeScript to JavaScript
npm test             # Run test suite
npm run test:watch   # Run tests in watch mode

# Code Quality
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
npm run typecheck    # Check TypeScript types

# Using Just (optional)
just test           # Run tests
just lint           # Run linting
just format         # Format code
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- src/toolset    # Test toolset system
npm test -- src/config     # Test configuration parser
npm test -- src/connection # Test connection management
```

## Configuration

### Server Configuration (`.mcp.json`)

Define the underlying MCP servers to connect to:

```json
{
  "mcpServers": {
    "git": {
      "type": "stdio",
      "command": "git-mcp-server",
      "args": ["--verbose"]
    },
    "github": {
      "type": "sse", 
      "url": "https://api.github.com/mcp/events"
    }
  }
}
```

### Toolset Configuration

Create custom tool collections:

```json
{
  "name": "web-dev-toolset",
  "description": "Tools for web development",
  "tools": [
    {"namespacedName": "git.status", "refId": "abc123..."},
    {"namespacedName": "git.commit", "refId": "def456..."},
    {"namespacedName": "docker.ps", "refId": "ghi789..."}
  ]
}
```

## Security

The toolset system implements **secure-by-default validation**:

- Tool references are validated using both `namespacedName` and `refId`
- Mismatched references are rejected in secure mode (default)
- Insecure mode available with `allowStaleRefs: true` (use with caution)
- All tool calls are routed through the configured toolset filter

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with tests
4. Run the test suite (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- Write tests for new features
- Follow TypeScript best practices
- Use conventional commit messages
- Update documentation for significant changes
- Ensure all tests pass before submitting PRs

## License

[Add license information]
