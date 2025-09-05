# HyperTool MCP Server - Usage Guide

## Overview

HyperTool MCP is a unified MCP proxy server that can operate in two distinct modes:
1. **Persona Mode** - Using content packs with bundled MCP servers and toolsets
2. **Standard Mode** - Using your own MCP configuration files with toolset management

## Quick Start

### Running the Server

The server is always started with the `mcp run` command:

```bash
# Standard Mode - with your MCP config
hypertool-mcp mcp run --mcp-config ./config.json

# Persona Mode - with a persona
hypertool-mcp mcp run --persona dev

# With specific toolset
hypertool-mcp mcp run --mcp-config ./config.json --equip-toolset my-toolset
hypertool-mcp mcp run --persona dev --equip-toolset backend
```

## Operational Modes

### Standard Mode (MCP Config + Toolsets)

In standard mode, you provide your own MCP configuration file and manage toolsets through configuration tools.

**Starting the server:**
```bash
hypertool-mcp mcp run --mcp-config ./path/to/config.json
```

**With toolset:**
```bash
hypertool-mcp mcp run --mcp-config ./config.json --equip-toolset dev-tools
```

**How toolsets work in Standard Mode:**
- Toolsets are created and managed via configuration tools
- Use `build-toolset` to create new toolsets from available tools
- Use `equip-toolset` to activate a saved toolset
- Use `list-saved-toolsets` to see available toolsets
- Toolsets filter which tools are exposed to the client

### Persona Mode (Content Packs)

In persona mode, you use pre-packaged content packs that include both MCP server configurations and toolsets.

**First, add a persona:**
```bash
hypertool-mcp persona add ./path/to/persona-folder
hypertool-mcp persona list  # See available personas
```

**Then run with the persona:**
```bash
hypertool-mcp mcp run --persona dev
```

**With specific persona toolset:**
```bash
hypertool-mcp mcp run --persona dev --equip-toolset backend
```

**How toolsets work in Persona Mode:**
- Personas come with their own predefined toolsets
- The `--equip-toolset` flag activates a specific persona toolset
- Persona toolsets are managed internally by the persona
- Cannot be deleted or modified (they're part of the persona definition)

## Configuration Tools Menu

By default, configuration tools are shown in a separate mode to keep them separate from operational tools.

### How it works:
1. **Normal Mode**: Shows operational tools from your equipped toolset
2. **Configuration Mode**: Shows configuration tools for managing toolsets

### To enter configuration mode:
- Use the `enter-configuration-mode` tool when in normal mode
- Configuration tools are then available for toolset management

### To disable separation (legacy mode):
```bash
export HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=false
hypertool-mcp mcp run --mcp-config ./config.json
```

When disabled, all tools (configuration and operational) are shown together at all times.

## Command Line Options

### Core Options

| Option | Description | Example |
|--------|-------------|---------|
| `--mcp-config <path>` | Path to MCP configuration file | `--mcp-config ./config.json` |
| `--persona <name>` | Persona to activate | `--persona dev` |
| `--equip-toolset <name>` | Toolset to equip on startup | `--equip-toolset backend` |

### Transport Options

| Option | Description | Default |
|--------|-------------|---------|
| `--transport <type>` | Transport protocol (stdio, http) | `stdio` |
| `--port <number>` | Port for HTTP transport | `3000` |

### Debug Options

| Option | Description | Default |
|--------|-------------|---------|
| `--debug` | Enable debug logging | `false` |
| `--log-level <level>` | Log level (trace, debug, info, warn, error, fatal) | `info` |
| `--insecure` | Allow tools with changed hashes | `false` |

### Advanced Options

| Option | Description |
|--------|-------------|
| `--group <name>` | Load servers from a group |
| `--linked-app <app>` | Use app-specific config |
| `--profile <id>` | Use specific profile |

## Persona Management

### Adding Personas
```bash
# Add from folder
hypertool-mcp persona add ./personas/my-persona

# Add from .htp archive
hypertool-mcp persona add ./my-persona.htp
```

### Listing Personas
```bash
hypertool-mcp persona list
```

### Getting Persona Help
```bash
hypertool-mcp persona --help
```

## Environment Variables

### Feature Flags

| Variable | Description | Default |
|----------|-------------|---------|
| `HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU` | Enable/disable configuration tools separation | `true` |
| `HYPERTOOL_MAX_LISTENERS` | Max event listeners for Node.js | `10` |
| `HYPERTOOL_MAX_CONNECTIONS` | Max concurrent MCP connections | `20` |

### Disabling Configuration Mode
```bash
# Show all tools together (legacy mode)
export HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=false
```

## Common Workflows

### 1. Standard Development Setup
```bash
# Start server with your MCP config
hypertool-mcp mcp run --mcp-config ./mcp.json

# Once running, use configuration tools to:
# - Create toolsets with build-toolset
# - Equip toolsets with equip-toolset
# - Manage toolsets as needed
```

### 2. Persona-Based Development
```bash
# Add a persona
hypertool-mcp persona add ./personas/frontend-dev

# Run with the persona
hypertool-mcp mcp run --persona frontend-dev

# The persona's default toolset is automatically activated
# Or specify a different persona toolset:
hypertool-mcp mcp run --persona frontend-dev --equip-toolset testing
```

### 3. HTTP Server Mode
```bash
# Run as HTTP server instead of stdio
hypertool-mcp mcp run --mcp-config ./config.json --transport http --port 3000
```

### 4. Debug Mode
```bash
# Run with debug logging
hypertool-mcp mcp run --mcp-config ./config.json --debug --log-level debug
```

## Toolset Behavior Summary

| Aspect | Standard Mode | Persona Mode |
|--------|--------------|--------------|
| **Source** | Created via configuration tools | Defined in persona YAML |
| **Management** | build-toolset, delete-toolset | Part of persona definition |
| **Modification** | Can be edited/deleted | Read-only |
| **Activation** | equip-toolset tool or --equip-toolset flag | Same, but routes through persona |
| **Listing** | Shows as regular names | Shows with "persona:" prefix |

## Error Messages and Solutions

### "No MCP configuration found"
**Solution**: Provide either `--mcp-config` or `--persona` flag

### "Persona not found"
**Solution**:
```bash
hypertool-mcp persona --help     # See setup guide
hypertool-mcp persona add <path>  # Add the persona
hypertool-mcp persona list        # List available personas
```

### "Cannot delete persona toolsets"
**Explanation**: Persona toolsets are part of the persona definition and cannot be deleted. Only regular toolsets can be deleted.

## Getting Help

```bash
# Main help
hypertool-mcp --help

# MCP run options
hypertool-mcp mcp run --help

# Persona management
hypertool-mcp persona --help

# Interactive setup
hypertool-mcp setup
```
