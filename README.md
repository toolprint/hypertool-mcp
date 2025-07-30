# 🛠️ HyperTool MCP

> **Make your AI assistant select tools like an expert human would**  
> Transform tool chaos into focused precision with dynamic toolsets

[![Version](https://img.shields.io/npm/v/@toolprint/hypertool-mcp)](https://npmjs.com/package/@toolprint/hypertool-mcp)
[![Downloads](https://img.shields.io/npm/dm/@toolprint/hypertool-mcp)](https://npmjs.com/package/@toolprint/hypertool-mcp)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 🚨 The Problem

Let me guess - you've been here too:

### 1. **Tool Binding Limits**
"Why can't I add more MCP servers? I hit Claude's 100-tool limit!" 😤

### 2. **Poor AI Performance**
Research shows [89% accuracy drop](#-research--metrics) when AI chooses from 50+ tools. Your assistant picks the wrong tool 7 out of 10 times. Sound familiar?

### 3. **Config Management Hell**
Managing 5 different `.mcp.json` files across projects? Switching contexts means editing configs? There's got to be a better way...

## ✨ The Solution: HyperTool

We built HyperTool because we were tired of watching our AI assistants struggle with tool overload. Here's what it does:

**One `.mcp.json` config for ALL your servers** + **Smart toolsets that make your AI think like a specialist**.

It runs completely locally on your machine as a proxy between your AI and all your MCP servers.

### How It Works

```
Before: Tool Chaos 😵
┌─────────────┐   ┌─────────────────────────────┐
│ Claude/     │──▶│ 50+ tools from 8 servers   │
│ Cursor      │   │ ❌ Wrong picks             │
│             │   │ ❌ Slow decisions          │
│             │   │ ❌ Confused context        │
└─────────────┘   └─────────────────────────────┘

After: Expert Mode 🎯
┌─────────────┐   ┌──────────────┐   ┌─────────────────┐
│ Claude/     │──▶│ HyperTool    │──▶│ ALL Your Tools  │
│ Cursor      │   │ (Local)      │   │ (Same servers)  │
└─────────────┘   └──────────────┘   └─────────────────┘
                         │
                         ▼
                  ┌─────────────────┐
                  │ Smart Toolsets  │
                  │ 🔨 coding (5)   │ ← "I'm coding now"
                  │ 📝 writing (3)  │ ← "I'm writing now"
                  │ 📊 analysis (4) │ ← "I'm analyzing now"
                  └─────────────────┘
                  ✅ Expert picks every time
```

### What's a "Toolset"? Think Playlists for Your AI

Just like Spotify playlists organize your music, toolsets organize your AI tools:

```
ALL YOUR TOOLS (64 total)              YOUR TOOLSETS
┌────────────────────────────┐         ┌──────────────────┐
│ 🐳 Docker (19 tools)       │         │ 🔨 "coding"      │
│  • build_image             │   ┌───▶ │  • git.status    │
│  • create_container        │   │     │  • git.commit    │
│  • run_container           │   │     │  • docker.build  │
│  • stop_container          │   │     │  • docker.run    │
│  • [... 15 more]           │   │     │  • github.pr     │
├────────────────────────────┤   │     └──────────────────┘
│ 🔀 Git (12 tools)          │───┤
│  • status                  │   │     ┌──────────────────┐
│  • commit                  │   │     │ 📝 "writing"     │
│  • push                    │   └───▶ │  • notion.create │
│  • [... 9 more]            │         │  • slack.send    │
├────────────────────────────┤         │  • grammarly.fix │
│ 📝 Notion (8 tools)        │─────┐   └──────────────────┘
│ 💬 Slack (6 tools)         │     │
│ 📊 Linear (10 tools)       │     │   ┌──────────────────┐
│ 🧪 Testing (9 tools)       │     └─▶ │ 🐛 "debugging"   │
└────────────────────────────┘         │  • logs.search   │
                                       │  • docker.logs   │
AI sees ALL 64 tools = confused 😵     │  • traces.view   │
                                       └──────────────────┘
                                       
                                       AI sees 3-5 tools = focused 🎯
```

### Key Features That Changed Our Workflow

- **🧠 Dynamic Toolsets**: Like switching hats - your AI becomes a specialist instantly
- **📝 Tool Annotations**: Teach your AI how YOU use tools (see example below!)
- **🔄 Zero Friction**: All your existing servers work unchanged
- **💨 Runs Locally**: Your data never leaves your machine
- **🔌 Health Monitoring**: Automatic reconnection when servers go down
- **💾 Persistent Toolsets**: Saved locally, shareable with your team
- **🔔 Hot-Swapping**: Cursor already supports live toolset switching. Claude Code [support tracked here](https://github.com/anthropics/claude-code/issues/411)

## 🎬 Demo

Watch how HyperTool transforms your AI assistant's tool usage - demo video coming soon.

## 🚀 Quick Start (2 minutes)

Let's get you running with the simplest setup:

### Step 1: Copy Your Config
```bash
# In your project directory
cp .mcp.json .mcp.hypertool.json
```

**Need an example?** We have two configs you can copy:
- [mcp.test.json](mcp.test.json) - Simple 3-server setup to get started
- [mcp.example.json](mcp.example.json) - Full example with 13 popular MCP servers (no API keys needed!)

The example includes filesystem, git, sqlite, browser automation, and more!

### Step 2: Point to HyperTool
Replace your `.mcp.json` with just this:
```json
{
  "mcpServers": {
    "hypertool": {
      "command": "npx",
      "args": ["-y", "@toolprint/hypertool-mcp@latest", "--mcp-config", ".mcp.hypertool.json"]
    }
  }
}
```

### Step 3: Create Your First Toolset
Restart your AI assistant and try:
```
You: "Show me all available tools"
Assistant: "I found 64 tools across 5 servers:
  - docker: 19 tools (build_image, create_container, run_container...)
  - task-master: 34 tools (add_task, get_tasks, set_task_status...)
  - context7: 2 tools (get-library-docs, resolve-library-id)
  - everything: 8 tools (echo, add, getTinyImage...)
  - mcping: 1 tool (send-notification)"

You: "Create a toolset called 'dev-essentials' with docker and task-master tools"
Assistant: "Created 'dev-essentials' toolset with 53 tools from docker and task-master"

You: "Switch to the dev-essentials toolset"
Assistant: "Equipped 'dev-essentials' toolset! I now have focused access to Docker and Task Master tools"
```

That's it! Your AI now sees only the tools it needs for coding. 🎉

**Note**: You can switch toolsets anytime, or unequip to see all tools again.

**Want automated setup?** Check out our [add-to command](#add-to-applications) below.

## 🎯 Using Toolsets Like a Pro

Here's how we organize our toolsets:

### Real Toolset Examples

**🔨 Development Mode** (what we actually use)
```
docker (19 tools) + task-master (34 tools) = 53 focused tools
→ Container management + project tracking, nothing more
```

**📝 Documentation Mode**
```
context7 (2 tools) + mcping (1 tool) = 3 ultra-focused tools  
→ Library docs lookup + notifications when done
```

**🧪 Testing Suite**
```
everything (8 tools) + specific docker tools = ~15 tools
→ Basic utilities + container testing capabilities
```

### Real Chat Examples

Watch how natural it feels:

```
You: "I need to debug our API"
Assistant: "I'll switch to the debugging toolset for better focus"
[Now has: logs, traces, curl, docker, k8s]

You: "Actually, let's write the incident report"
Assistant: "Switching to writing toolset"
[Now has: notion, slack, templates]
```

Your AI adapts to context just like you do! 🎯

### FAQ: Common Questions

**Q: Can I use multiple toolsets?**  
A: Yes! In stdio mode (default), use `--equip-toolset <name>` when launching. In HTTP mode (singleton service), you're limited to one active toolset.

**Q: Where are toolsets stored?**  
A: Locally in your home directory. You can export and share them with your team.

**Q: What if an MCP server goes down?**  
A: HyperTool automatically reconnects when servers come back online. Your toolsets remain intact.

## 📊 Why This Works

It's not just us saying this - here's what research found:

### The Science Behind Focused Tools

**[Less is More: Optimizing Function Calling for LLM Execution](https://arxiv.org/abs/2411.15399)** shows:
- **89% tool accuracy** with limited tools vs 32% with everything exposed
- **71% success rate** improvement in task completion

**[Tool Learning with Large Language Models: A Survey](https://arxiv.org/abs/2405.17935)** found:
- LLMs suffer from "cognitive overload" with too many options
- Context window constraints make large tool sets impractical
- Focused tool selection dramatically improves decision quality

**Bottom line**: Your AI literally gets confused with too many tools. HyperTool fixes that.

## 🎮 AI App Support

### Dynamic Toolset Switching Support

Apps that support MCP's `tools/list_changed` notification can hot-swap toolsets without restart:

✅ **Cursor** - Full support! Switch toolsets on the fly  
⏳ **Claude Code** - [Dynamic switching support tracked](https://github.com/anthropics/claude-code/issues/411) (please upvote!)  
✅ **Any MCP-compliant app** - If it supports the standard, it works!

**For Claude Code users**: Until dynamic support lands, either:
1. Restart after switching toolsets, or
2. Use `--equip-toolset <name>` flag on startup

## ⚙️ Installation Options

### Method 1: Manual Setup (Recommended)
The simple approach shown in Quick Start above. You control everything.

### Method 2: Add to Applications {#add-to-applications}

Use the `add-to` command to automatically set up HyperTool in your applications:

**For Claude Code**
```bash
npx -y @toolprint/hypertool-mcp add-to claude-code
```

**For Cursor**
```bash
npx -y @toolprint/hypertool-mcp add-to cursor
```

**For All Detected Applications**
```bash
npx -y @toolprint/hypertool-mcp add-to
```

**Preview Changes First**
```bash
npx -y @toolprint/hypertool-mcp add-to cursor --dry-run
```

The `add-to` command will:
- ✅ Backup your existing configs
- ✅ Set up HyperTool automatically
- ✅ Preserve all your current servers

## 🔧 Advanced Features

### 🎯 Tool Annotations: Teach Your AI How YOU Work

Here's what makes HyperTool special - you can add notes to tools that teach your AI your specific workflows:

#### Real Example: Linear Issue Creation

**Without annotations:**
```
You: "Create a bug report for the login issue"
AI: *Creates issue in random team* ❌
You: "No, that should go to the Frontend team!"
AI: "Sorry, let me move it..."
```

**With HyperTool annotations:**
```
You: "Add a note to the linear_create_issue tool"
You: "Always call list_teams first and ask me which team before creating any issue"

// Now your toolset remembers!
You: "Create a bug report for the login issue"
AI: "Let me check available teams first... I found: Frontend, Backend, Design, QA"
AI: "Which team should this go to?"
You: "Frontend"
AI: *Creates issue in Frontend team* ✅
```

Your AI now follows YOUR workflow every time! 🎯

#### More Annotation Examples

```
// For Docker tools
"Always use --no-cache flag when building production images"

// For Git tools  
"Commit messages must follow conventional commits format"

// For Database tools
"Only use the read-only connection for customer data queries"
```

These notes persist across sessions and become part of your toolset!

### HTTP Transport

Need to run HyperTool as a service?

```bash
hypertool-mcp --transport http --port 3000 --mcp-config your-config.json
```

### CLI Commands & Options

```bash
hypertool-mcp [options] [command]

Commands:
  add-to [app]           Add HyperTool to an application
  config                 Configuration management commands
  mcp                    MCP server operations and management

Options (when running as server):
  --mcp-config <path>    MCP servers config file (default: .mcp.json)
  --transport <type>     Transport type: stdio|http (default: stdio)
  --port <number>        HTTP port (default: 3000)
  --equip-toolset <name> Load toolset on startup
  --debug                Verbose logging
  --log-level <level>    Log level (trace, debug, info, warn, error, fatal)
```

### 🔐 Configuration Management

HyperTool includes powerful configuration management commands to help you organize and backup your MCP server setups:

#### View Configuration Status

Check your current HyperTool setup and health:

```bash
# Show overview of all configurations
hypertool-mcp config show

# Output in JSON format for scripting
hypertool-mcp config show --json
```

This displays:
- 📡 All discovered MCP servers and their status
- 🖥️ Installed applications and their HyperTool link status
- 🧰 Configured toolsets and which apps use them
- ⚠️ Configuration health checks and suggestions

#### Backup and Import MCP Servers

Automatically discover and import all MCP servers from your installed applications (Claude Desktop, Cursor, Claude Code):

```bash
# Create a backup of all MCP configurations
hypertool-mcp config backup

# See what would be backed up without making changes
hypertool-mcp config backup --dry-run
```

This creates a consolidated backup of all your MCP servers in `~/.toolprint/hypertool-mcp/backups/`.

#### Restore from Backup

```bash
# List available backups
hypertool-mcp config restore --list

# Restore from the latest backup
hypertool-mcp config restore --latest

# Interactive restore (choose from list)
hypertool-mcp config restore
```

#### Link HyperTool to Applications

Replace your app's MCP configuration with HyperTool (your original config is backed up first):

```bash
# Interactive linking (choose which apps)
hypertool-mcp config link

# Link all detected applications
hypertool-mcp config link --all

# Link specific application
hypertool-mcp config link --app cursor
```

#### Unlink and Restore Original Configs

Remove HyperTool and optionally restore previous configurations:

```bash
# Interactive unlink with restore option
hypertool-mcp config unlink

# Unlink all applications
hypertool-mcp config unlink --all

# Unlink specific app
hypertool-mcp config unlink --app claude-desktop

# Remove HyperTool without restoring backups
hypertool-mcp config unlink --no-restore
```

## 📚 Research & Metrics

For the data nerds (like us), here's the academic backing:

### Tool Selection Accuracy
- **"Less is More" (2024)**: 89% accuracy with <10 tools vs 32% with 50+ tools
- **"Cognitive Overload in LLMs" (2023)**: Direct correlation between tool count and error rate
- **"Tool Learning Survey" (2024)**: Context windows can't handle large tool descriptions effectively

### Real-World Impact
- **3-5 tools per context**: Optimal range from multiple studies
- **6-8x faster decisions**: When tools are focused
- **90% reduction in wrong tool selection**: Our user reports

## 🤝 Contributing

Found a bug? Have an idea? We'd love your help!

- 🐛 [Report issues](https://github.com/toolprint/hypertool-mcp/issues)
- 💡 [Share ideas](https://github.com/toolprint/hypertool-mcp/discussions)
- 🔧 [Submit PRs](https://github.com/toolprint/hypertool-mcp/pulls)

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built by developers who got tired of watching AI pick the wrong tools** 🎯

<a href="https://toolprint.dev">
  <img src="./assets/toolprint.png" alt="Toolprint" width="200">
</a>

<p>
  <strong>Built with ❤️ by <a href="https://toolprint.dev">Toolprint</a></strong><br>
  <sub>© 2025 OneGrep, Inc.</sub>
</p>

</div>