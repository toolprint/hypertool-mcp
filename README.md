# 🛠️ Hypertool MCP

> **Too many MCP servers? Too many tools? Poor LLM performance?**  
> Hypertool creates dynamic toolsets that dramatically improve tool usage performance.

[![Version](https://img.shields.io/npm/v/hypertool-mcp)](https://npmjs.com/package/hypertool-mcp)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT%20with%20Commons%20Clause-yellow.svg)](LICENSE)

## 🎯 Why Hypertool?

**The Problem**: LLMs struggle when overwhelmed with too many tools. 50+ tools from multiple MCP servers? Your AI assistant becomes confused and ineffective.

**The Solution**: Hypertool lets you create focused, dynamic toolsets that expose only the tools you need for specific tasks. Think of it as "tool playlists" for your AI.

**Only one MCP in mcp.json**: Hypertool will read your mcp configuration and run as both a server (to cursor/claude code, etc.) and run or connect to your MCPs regardless of transport.

```
Cursor / Claude Code → Hypertool MCP → Your MCPs
```
```
📦 Multiple MCP Servers → 🎯 Focused Toolsets → 🚀 Better Performance
```

## ✨ Key Features

- **🎯 Dynamic Toolsets**: Create custom tool collections from any MCP servers
- **🔄 Hot-Swapping**: Switch between toolsets instantly - clients are notified automatically using MCP list tools changed notifications.
- **🌐 Universal Compatibility**: Works with any MCP client (Claude Desktop, etc.)
- **🛡️ Tool Checks**: Toolsets capture a hashed tool reference to validate that the right tool gets exposed.
- **📡 Multiple Transports**: Supports both stdio and HTTP/SSE protocols

## 🚀 Quick Start

Install hypertool in all your agentic apps.
```bash
npx -y @toolprint/hypertool-mcp@latest --install

# use the --dry-run flag to see what will be installed.
```

Just restart Cursor/Claude Code and it will pick up hypertool. All your MCP configs get automatically backed up so that you can restore them at any time.

## Add Hypertool to your project

### Claude Code
**Option 1 - quick add**
```bash
# In your project directory:
npx -y @toolprint/hypertool-mcp@latest --install claude-code
```

**Option 2 - manual add**
1. Copy your `.mcp.json` to `.mcp.hypertool.json`
2. Update your `.mcp.json` with only the hypertool MCP:
```json
{
  "mcpServers": {
    "hypertool": {
      "type": "stdio",
      "command": "npx",
      "args": [
          "-y", 
          "@toolprint/hypertool-mcp@latest", 
          "--mcp-config", 
          ".mcp.hypertool.json"
      ]
    }
  }
}
```

### 🎯 Cursor
**Option 1 - One command install**
```bash
# Updates your cursor settings to include the hypertool MCP and backs up your original MCP settings.
npx -y @toolprint/hypertool-mcp@latest --install cursor
```

This will:
- Back up your current Cursor MCP configuration
- Copy all existing servers to Hypertool's config
- Add Hypertool as your main MCP server

**Option 2**
[![Install Hypertool MCP Server](https://cursor.com/deeplink/mcp-install-light.svg)](https://cursor.com/install-mcp?name=hypertool&config=JTdCJTIydHlwZSUyMiUzQSUyMnN0cmVhbWFibGUtaHR0cCUyMiUyQyUyMmNvbW1hbmQlMjIlM0ElMjJucHglMjAteSUyMCU0MHRvb2xwcmludCUyRmh5cGVydG9vbC1tY3AlMjAtLWNvbmZpZyUyMH4lMkYuY3Vyc29yJTJGbWNwLmpzb24lMjIlN0Q%3D)

Click the badge above to automatically install Hypertool MCP in Cursor IDE. This will add the server to your Cursor configuration and you can start using it immediately.

**Note** you will need to update the runtime flag for the hypertool mcp server `--mcp-config` to point to a copied version of Cursor's MCP settings. All of this is done automatically in **Option 1**


## Other Projects
1. Copy your `mcp.json` to `.mcp.hypertool.json`
2. Update your `mcp.json` with only the hypertool MCP:
```json
{
  "mcpServers": {
    "hypertool": {
      "type": "stdio",
      "command": "npx",
      "args": [
          "-y", 
          "@toolprint/hypertool-mcp@latest", 
          "--mcp-config", 
          ".mcp.hypertool.json"
      ]
    }
  }
}
```


## 🎭 Creating Your First Toolset

Once Hypertool is running, you can use the built-in MCP tools to manage toolsets:

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

Hypertool validates tool references using cryptographic hashes:

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
1. Start Hypertool: hypertool-mcp --config test-mcp.json
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

### Equip a specific toolset on server spawn
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


## 📊 Performance Impact

**Before Hypertool:**
- 🐌 50+ tools exposed to LLM
- 😵 Confused tool selection
- 🔄 Slow response times

**After Hypertool:**
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

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built by developers who got tired of overwhelming their AI with too many tools. Hope you find it useful!** 🚀


<a href="https://toolprint.dev">
  <img src="./assets/toolprint.png" alt="Toolprint" width="200">
</a>

<p>
  <strong>Built with ❤️ by <a href="https://toolprint.dev">Toolprint</a></strong><br>
  <sub>© 2025 OneGrep, Inc.</sub>
</p>

</div>