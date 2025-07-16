# 🛠️ HyperTool MCP

> **Too many MCP servers? Too many tools? Poor LLM performance?**  
> HyperTool creates dynamic toolsets that dramatically improve tool usage performance.

[![Version](https://img.shields.io/npm/v/hypertool-mcp)](https://npmjs.com/package/hypertool-mcp)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-ISC-blue)](LICENSE)

## 🎯 Why HyperTool?

**The Problem**: LLMs struggle when overwhelmed with too many tools. 50+ tools from multiple MCP servers? Your AI assistant becomes confused and ineffective.

**The Solution**: HyperTool lets you create focused, dynamic toolsets that expose only the tools you need for specific tasks. Think of it as "tool playlists" for your AI.

```
📦 Multiple MCP Servers → 🎯 Focused Toolsets → 🚀 Better Performance
```

## ✨ Key Features

- **🎯 Dynamic Toolsets**: Create custom tool collections from any MCP servers
- **🔄 Hot-Swapping**: Switch between toolsets instantly - clients are notified automatically
- **🌐 Universal Compatibility**: Works with any MCP client (Claude Desktop, etc.)
- **🛡️ Secure by Default**: Tool reference validation prevents stale/malicious tools
- **📡 Multiple Transports**: Supports both stdio and HTTP/SSE protocols

## 🚀 Quick Start

### 1. Add to Your MCP Configuration

Add HyperTool to your existing `.mcp.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "hypertool": {
      "type": "stdio",
      "command": "hypertool-mcp",
      "args": ["--config", ".mcp.json"]
    }
  }
}
```

### 2. Configure Your MCP Servers

Create `.mcp.json` in your project to define underlying servers:

```json
{
  "mcpServers": {
    "everything": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"]
    },
    "context7": {
      "type": "sse",
      "url": "https://mcp.context7.com/sse"
    }
  }
}
```

### 3. Start HyperTool

```bash
# Install globally
npm install -g hypertool-mcp

# Or run directly
npx hypertool-mcp --config .mcp.json

# Try with the included test configuration
npx hypertool-mcp --config test-mcp.json
```

## 🎭 Creating Your First Toolset

Once HyperTool is running, you can use the built-in MCP tools to manage toolsets:

1. **List available tools**: Use `list-available-tools` to see what's discovered
2. **Build a toolset**: Use `build-toolset` to create a focused collection
3. **Equip the toolset**: Use `equip-toolset` to activate it

Your MCP client (like Claude) can now call these tools directly:

```
Claude: Use the build-toolset tool to create a development toolset with echo and add_numbers
```

**Result**: A focused toolset with only the tools you need!

## 🔄 Hot-Swapping Toolsets

The magic happens when you switch contexts using the MCP tools:

```
Claude: Use the equip-toolset tool to switch to "debugging" toolset

# MCP clients are automatically notified
# Tool list updates instantly - no restart needed!
```

**Your AI assistant now sees only debugging tools:**
- `everything.echo` - For testing responses
- `everything.error` - For error handling  
- `everything.longRunning` - For async operations
- `context7.search` - For finding information

## 🌐 Multiple Transport Support

### Stdio (Default)
Perfect for Claude Desktop and most MCP clients:
```bash
hypertool-mcp --transport stdio
```

### HTTP/SSE
Great for web applications and modern tooling:
```bash
hypertool-mcp --transport http --port 3000 --config test-mcp.json
```

Access via: `http://localhost:3000/mcp`

## 🛡️ Security & Validation

HyperTool validates tool references using cryptographic hashes:

```json
{
  "name": "secure-toolset",
  "tools": [
    {
      "namespacedName": "everything.echo",
      "refId": "sha256:abc123...",
      "server": "everything"
    }
  ]
}
```

- **Secure by default**: Rejects tools with changed schemas
- **Insecure mode**: Available with `--insecure` flag (use carefully!)
- **Automatic validation**: Toolsets are re-validated when servers reconnect

## 📋 Common Workflows

### Development Setup
```
1. Start HyperTool: hypertool-mcp --config test-mcp.json
2. Ask Claude: "Use build-toolset to create a frontend toolset with echo and add_numbers"
3. Ask Claude: "Use equip-toolset to activate the frontend toolset"
```

### Production Debugging
```
1. Ask Claude: "Use equip-toolset to switch to debug toolset"
2. Your AI now has access to focused debugging tools
3. MCP clients are automatically notified of the change
```

### Team Collaboration
```
1. Ask Claude: "Use list-saved-toolsets to see available toolsets"
2. Share toolset configurations via your preferred method
3. Team members can equip the same toolsets for consistency
```

## 🔧 Configuration Reference

### CLI Options
```bash
hypertool-mcp [options]

Options:
  --config <path>        MCP servers config file (default: .mcp.json)
  --transport <type>     Transport type: stdio|http (default: stdio)
  --port <number>        HTTP port (default: 3000)
  --equip-toolset <name> Load toolset on startup
  --debug                Verbose logging
```

### Server Configuration
```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio|sse",
      "command": "command-name",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

## 🤝 Integration Examples

### Claude Desktop
```json
{
  "mcpServers": {
    "hypertool": {
      "type": "stdio",
      "command": "hypertool-mcp",
      "args": ["--config", "/path/to/test-mcp.json", "--equip-toolset", "daily-dev"]
    }
  }
}
```

### Continue.dev
```json
{
  "mcp": {
    "servers": {
      "hypertool": {
        "command": "hypertool-mcp",
        "args": ["--transport", "http", "--port", "3001"]
      }
    }
  }
}
```

## 📊 Performance Impact

**Before HyperTool:**
- 🐌 50+ tools exposed to LLM
- 😵 Confused tool selection
- 🔄 Slow response times

**After HyperTool:**
- ⚡ 5-10 focused tools per context
- 🎯 Precise tool selection  
- 🚀 Faster, more accurate responses

## 🛠️ Development

```bash
# Clone and setup
git clone https://github.com/yourorg/hypertool-mcp
cd hypertool-mcp
npm install

# Development
npm run dev        # Start with hot reload
npm test          # Run tests
npm run lint      # Code quality
```

## 🎨 Built With

- **TypeScript** - Type safety and modern JS
- **MCP SDK** - Official Model Context Protocol
- **Zod** - Runtime validation
- **Pino** - Structured logging
- **Commander** - CLI interface

## 📄 License

ISC License - see [LICENSE](LICENSE) file for details.

---

**Built by developers who got tired of overwhelming their AI with too many tools. Hope you find it useful!** 🚀

> 💡 **Pro Tip**: Start with 5-10 essential tools per toolset. You can always create multiple toolsets for different contexts!