# NAVIGATION.md - HyperTool MCP Command Reference

Generated navigation documentation for the HyperTool MCP proxy server CLI.

## Overview

HyperTool MCP is a TypeScript-based MCP proxy server that routes requests between clients and multiple underlying MCP servers. The CLI uses **Commander.js** for command-line parsing and **Inquirer.js** for interactive prompts and menus.

**Detected Frameworks:**
- **CLI Framework**: Commander.js (v14+) - Command parsing, subcommands, and options
- **Interactive Menus**: Inquirer.js (v12+) - Prompts, selections, and user input
- **Additional**: Figlet (ASCII banners), Chalk (terminal colors), Ora (spinners)

## Command Tree Structure

```
hypertool-mcp [global-options] <command> [command-options]

Global Options:
  --debug                     Enable debug mode with verbose logging
  --insecure                  Allow tools with changed reference hashes (insecure mode)
  --equip-toolset <name>      Toolset name to equip on startup
  --mcp-config <path>         Path to MCP configuration file (overrides all other config)
  --linked-app <app-id>       Link to specific application (claude-desktop, cursor, claude-code)
  --profile <profile-id>      Use specific profile for workspace/project (basic support)
  --log-level <level>        Log level (trace, debug, info, warn, error, fatal)
  --dry-run                  Show what would be done without making changes
  --install [app]            [DEPRECATED] Use 'setup' command instead

Commands:
├── (no command)                      → Default to 'mcp run' or 'setup' on first run
├── mcp                              → MCP server operations and management
│   ├── run [options]                → Run the MCP server (default subcommand)
│   │   ├── --transport <type>       → Transport protocol (http, stdio) [default: stdio]
│   │   ├── --port <number>          → Port for HTTP transport (only with --transport http)
│   │   ├── --group <name>           → Server group name to load servers from
│   │   └── [all global options]    → Inherits all global options
│   ├── list [options]               → List available MCP servers
│   ├── get <server-id>              → Get details for specific MCP server
│   ├── add <server-config>          → Add new MCP server configuration
│   ├── remove <server-id>           → Remove MCP server configuration
│   └── group                        → Server group management
│       ├── list                     → List all server groups
│       ├── show <group-name>        → Show group details and member servers
│       ├── create <group-name>      → Create new server group
│       ├── delete <group-name>      → Delete server group
│       ├── add <group> <server>     → Add server to group
│       └── remove <group> <server>  → Remove server from group
├── setup [options]                  → Interactive setup wizard (modern)
│   ├── -y, --yes                   → Accept all defaults (non-interactive mode)
│   ├── --dry-run                   → Preview changes without making them
│   ├── --apps <apps>               → Comma-separated list of apps to configure
│   ├── --import-all                → Import all existing configurations
│   ├── --import-none               → Start fresh without importing configs
│   ├── --standard                  → Use standard installation type (default)
│   ├── --development               → Use development installation type
│   ├── --skip-toolsets             → Skip toolset creation
│   ├── --verbose                   → Show detailed output
│   ├── --example <name>            → Use specific example configuration
│   ├── --list-examples             → List available example configurations
│   └── --experimental              → Enable all experimental features
└── config                          → Configuration management
    ├── show [options]              → Display current configuration
    │   ├── --format <format>       → Output format (json, yaml, table)
    │   └── --section <section>     → Show specific section only
    ├── backup [options]            → Create configuration backup
    │   ├── --output <path>         → Backup output directory
    │   └── --name <name>           → Custom backup name
    ├── restore <backup-file>       → Restore from backup
    ├── link <app> [config]         → Link application to configuration
    ├── unlink <app>                → Unlink application from configuration
    └── export [options]            → Export configuration to file
        ├── --format <format>       → Export format (json, yaml)
        └── --output <file>         → Output file path
```

## Interactive Menu Flow DAG

```
Entry Points:
├── hypertool-mcp (no args, first run) → Setup Wizard → [Complete]
├── hypertool-mcp (no args, configured) → MCP Server Run (stdio) → [Running]
├── hypertool-mcp setup → Setup Wizard → [Complete]
└── hypertool-mcp config show --interactive → Configuration Menu → [Complete]

Setup Wizard Flow:
Start → Welcome
  ↓
App Detection (detect Claude Desktop, Cursor, Claude Code)
  ↓
Config Discovery (scan for existing .mcp.json files)
  ↓
Import Strategy Selection:
  ├── Import All → merge all found configs
  ├── Per-App Selection → choose configs per application
  └── Start Fresh → ignore existing configs
  ↓
Example Selection (if starting fresh):
  ├── everything.json (comprehensive setup)
  ├── development.json (dev-focused tools)
  ├── productivity.json (productivity tools)
  ├── web-automation.json (web/testing tools)
  └── [other examples] → custom server selection
  ↓
Server Selection (fine-tune server list)
  ↓
Conflict Resolution (handle duplicate/conflicting servers)
  ↓
Toolset Creation (group servers into named toolsets)
  ↓
Installation Type:
  ├── Standard → production-ready setup
  └── Development → dev environment setup
  ↓
Review Configuration (preview all changes)
  ↓
Execution (apply configuration changes)
  ↓
Completion → [Setup Complete]

Configuration Menu Flow (Future Enhancement):
Main Menu
├── 📡 View MCP Servers → Server Details → Main Menu
├── 🎯 View Applications → Application Status → Main Menu  
├── 📦 View Toolsets → Toolset Management → Main Menu
├── 👥 View Groups (if database enabled) → Group Management → Main Menu
├── ⚙️ Interactive Configuration → Config Editor → Main Menu
└── 🔧 Advanced Options → Advanced Settings → Main Menu
```

## Executable Commands Reference

| Command | Purpose | Interactive | Validation |
|---------|---------|-------------|------------|
| `hypertool-mcp` | Start MCP server or setup on first run | No | Config validation |
| `hypertool-mcp mcp run` | Run MCP server with specified transport | No | Config/port validation |
| `hypertool-mcp setup` | Interactive setup wizard | Yes | App detection, config validation |
| `hypertool-mcp setup --yes` | Non-interactive setup with defaults | No | Same validations, no prompts |
| `hypertool-mcp config show` | Display current configuration | No | Config file validation |
| `hypertool-mcp config backup` | Create configuration backup | No | File system permissions |
| `hypertool-mcp config link <app>` | Link app to configuration | Yes (if ambiguous) | App detection, config validation |
| `hypertool-mcp mcp list` | List configured MCP servers | No | Config file validation |
| `hypertool-mcp mcp group list` | List server groups | No | Database connectivity (if enabled) |

## Transport Types & Runtime Modes

**Transport Protocols:**
- **stdio** (default): Standard input/output for MCP protocol communication
- **http**: HTTP server mode with REST API endpoints (requires --port)

**Runtime Modes:**
- **Production**: `hypertool-mcp` (stdio transport, minimal logging)
- **Development**: `hypertool-mcp --debug --transport http --port 3000` 
- **Dry Run**: `hypertool-mcp setup --dry-run` (preview changes only)
- **Non-Interactive**: `hypertool-mcp setup --yes` (automated setup)

## Configuration Discovery Priority

1. **CLI Override**: `--mcp-config <path>` (highest priority)
2. **App-Linked Config**: `--linked-app <app-id>` → `~/.toolprint/hypertool-mcp/<app>/*.mcp.json`
3. **Profile Config**: `--profile <profile>` → `~/.toolprint/hypertool-mcp/<app>/<profile>.mcp.json`
4. **User Preference**: Previously saved config path preference
5. **Auto-Discovery**: Search current directory and common locations for `.mcp.json`

## Example Configurations Available

| Example | ID | Description | Server Count | Requires Secrets |
|---------|----|---------|----|-------|
| Everything | `everything` | Comprehensive MCP server setup | 15+ | ❌ |
| Development | `development` | Developer-focused tools and utilities | 8-10 | ❌ |
| Productivity | `productivity` | Task management and productivity tools | 6-8 | ❌ |
| Web Automation | `web-automation` | Browser automation and testing | 4-6 | ❌ |
| Data Analysis | `data-analysis` | Data processing and analysis tools | 5-7 | ❌ |
| Everything + Secrets | `everything-with-secrets` | Full setup including API-based tools | 20+ | ⚠️ |

## Navigation Patterns & User Experience

**First-Time User Experience:**
1. Run `hypertool-mcp` → Automatic setup wizard launch
2. App detection → Finds Claude Desktop, Cursor, Claude Code installations
3. Guided configuration → Example selection → Server customization
4. One-click deployment → Ready to use

**Power User Shortcuts:**
- `hypertool-mcp setup --yes --example development` → Quick dev setup
- `hypertool-mcp --linked-app claude-code --debug` → App-specific debug mode
- `hypertool-mcp mcp run --group development --transport http` → Group-based server mode

**ESC/Cancel Handling:**
- Setup wizard: ESC → Confirmation prompt → "Setup cancelled by user"
- Interactive prompts: Ctrl+C → Graceful shutdown with cleanup
- Server runtime: SIGINT/SIGTERM → Graceful server shutdown (5s timeout)

**Help System:**
- `hypertool-mcp --help` → Main help with global options
- `hypertool-mcp setup --help` → Setup-specific options and examples
- `hypertool-mcp mcp --help` → MCP server management commands
- `hypertool-mcp setup --list-examples` → Available example configurations

## Entry Points Summary

**Binary Entry Point**: `dist/bin.js` (via `npm install -g`)
**Library Entry Point**: `dist/index.js` (for programmatic use)

**Command Resolution Order:**
1. Global flags (`--help`, `--version`, `--install`)
2. Named commands (`setup`, `config`, `mcp`)
3. Default command insertion (if no command: `mcp run` or `setup` on first run)
4. MCP subcommand resolution (if `mcp` without subcommand: insert `run`)

**Signal Handling:**
- SIGINT/SIGTERM: Graceful shutdown with 5-second timeout
- SIGHUP (stdio mode): Handle terminal disconnection
- Uncaught exceptions: Log and graceful shutdown
- stdin end (stdio mode): Treat as shutdown signal

---

*This navigation documentation was generated automatically by analyzing the HyperTool MCP codebase structure, CLI command definitions, and interactive menu implementations.*