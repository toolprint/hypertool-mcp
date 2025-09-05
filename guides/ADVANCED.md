# 🚀 Advanced Usage Guide

## 🎯 Tool Annotations: Teach Your AI How YOU Work

One of HyperTool's most powerful features is the ability to add custom notes to tools that persist across sessions.

### Real Example: Linear Issue Creation

**The Problem:**
```
You: "Create a bug report for the login issue"
AI: *Creates issue in random team* ❌
You: "No, that should go to the Frontend team!"
AI: "Sorry, let me move it..."
```

**The Solution with Annotations:**
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

### More Annotation Examples

```
// For Docker tools
"Always use --no-cache flag when building production images"

// For Git tools
"Commit messages must follow conventional commits format"

// For Database tools
"Only use the read-only connection for customer data queries"

// For Slack tools
"Always post to #dev-notifications when deploying"

// For Testing tools
"Run integration tests before unit tests in CI pipeline"
```

These annotations become part of your toolset and guide your AI's behavior permanently!

## 🌐 HTTP Transport Mode

Need to run HyperTool as a centralized service? Use HTTP mode!

### Basic HTTP Server

```bash
npx -y @toolprint/hypertool-mcp@latest mcp run --transport http --port 3000 --mcp-config your-config.json
```

### HTTP Mode Use Cases

- **Team Sharing**: One HyperTool instance for your whole team
- **Cloud Deployment**: Run on a server for remote access
- **CI/CD Integration**: Centralized tool management for pipelines

### HTTP Mode Limitations

- Only one active toolset at a time (singleton service)
- Requires network connectivity
- May add latency compared to stdio mode

## 📋 CLI Commands Reference

If you want to use `hypertool` without the npx flag every time:
```
npm install -g @toolprint/hypertool-mcp@latest
```

Else, replace all `hypertool-mcp` commands below with `npx -y @toolprint/hypertool-mcp@latest [command]`

### Server Commands

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

### MCP Management Commands

```bash
# List all available MCP servers
hypertool-mcp mcp list

# Test connection to MCP servers
hypertool-mcp mcp test

# Show server health status
hypertool-mcp mcp health
```

## 🔐 Configuration Management {#configuration}

### View Configuration Status

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

### Backup and Import MCP Servers

Automatically discover and import all MCP servers from your installed applications:

```bash
# Create a backup of all MCP configurations
hypertool-mcp config backup

# See what would be backed up without making changes
hypertool-mcp config backup --dry-run

# Backup to specific location
hypertool-mcp config backup --output ~/my-backups/
```

### Restore from Backup

```bash
# List available backups
hypertool-mcp config restore --list

# Restore from the latest backup
hypertool-mcp config restore --latest

# Interactive restore (choose from list)
hypertool-mcp config restore

# Restore specific backup
hypertool-mcp config restore --file backup-2025-01-15.json
```

### Link HyperTool to Applications

Replace your app's MCP configuration with HyperTool:

```bash
# Interactive linking (choose which apps)
hypertool-mcp config link

# Link all detected applications
hypertool-mcp config link --all

# Link specific application
hypertool-mcp config link --app cursor
hypertool-mcp config link --app claude-code
hypertool-mcp config link --app claude-desktop

# Preview what will be linked
hypertool-mcp config link --dry-run
```

### Unlink and Restore Original Configs

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

## 🔧 Advanced Toolset Management

### Export/Import Toolsets (Coming Soon)

```bash
# Export a toolset
hypertool-mcp toolset export "dev-essentials" > dev-essentials.json

# Import a toolset
hypertool-mcp toolset import < dev-essentials.json

# Share with team via git
git add toolsets/
git commit -m "Share team toolsets"
```

### Toolset Templates (Coming Soon)

```bash
# Use pre-built templates
hypertool-mcp toolset create --template fullstack-dev
hypertool-mcp toolset create --template data-science
hypertool-mcp toolset create --template devops
```

## 🔍 Debugging & Logging
Logs for hypertool are located in `~/.toolprint/hypertool-mcp/logs`

## 🏗️ Architecture Details

### How HyperTool Works Internally

1. **Discovery Phase**: Connects to all configured MCP servers and fetches available tools
2. **Caching Layer**: Stores tool definitions for fast access
3. **Routing Engine**: Maps incoming tool calls to the correct underlying server
4. **Health Monitor**: Continuously checks server connectivity
5. **Toolset Manager**: Handles creation, switching, and persistence of toolsets


## 🔒 Security Best Practices

1. **Local Mode First**: Use stdio mode when possible to avoid network exposure
2. **Minimal Permissions**: Only grant HyperTool access to necessary MCP servers
3. **Audit Toolsets**: Regularly review which tools are included in toolsets
4. **Secure Storage**: Toolset configurations may contain sensitive paths

## 🚀 Pro Tips

1. **Start Small**: Begin with 3-5 tool toolsets and expand as needed
2. **Name Clearly**: Use descriptive toolset names like "customer-support" not "toolset-1"
3. **Document Annotations**: Keep a README with your annotation strategies
4. **Version Control**: Store your `.mcp.hypertool.json` in git
5. **Regular Cleanup**: Remove unused toolsets quarterly

## 🤖 Setup Command {#setup-command}

The `setup` command provides an interactive way to configure HyperTool, with support for both interactive and non-interactive modes.

### Interactive Setup

Run the setup wizard to configure HyperTool with guided prompts:

```bash
npx -y @toolprint/hypertool-mcp setup
```

This will:
1. Detect your installed applications (Claude Desktop, Cursor, Claude Code)
2. Import MCP servers from your existing configurations
3. Link HyperTool to your applications
4. Create an initial toolset

### Non-Interactive Setup

For automation, CI/CD pipelines, and scripted installations:

#### Basic Usage

```bash
# Run setup accepting all defaults
npx -y @toolprint/hypertool-mcp setup --yes

# Use a specific example configuration
npx -y @toolprint/hypertool-mcp setup --yes --example everything

# List available example configurations
npx -y @toolprint/hypertool-mcp setup --list-examples

# Dry run to preview changes
npx -y @toolprint/hypertool-mcp setup --yes --dry-run

# Verbose output for debugging
npx -y @toolprint/hypertool-mcp setup --yes --verbose
```

#### Configuration Options

**Application Selection**
```bash
# Configure specific applications only
npx -y @toolprint/hypertool-mcp setup --yes --apps claude-desktop,cursor

# Configure all detected applications (default)
npx -y @toolprint/hypertool-mcp setup --yes
```

**Import Strategy**
```bash
# Import all existing configurations (default)
npx -y @toolprint/hypertool-mcp setup --yes --import-all

# Start fresh without importing
npx -y @toolprint/hypertool-mcp setup --yes --import-none

# Use an example configuration
npx -y @toolprint/hypertool-mcp setup --yes --example everything
npx -y @toolprint/hypertool-mcp setup --yes --example development
npx -y @toolprint/hypertool-mcp setup --yes --example data-analysis
```

**Installation Type**
```bash
# Standard installation - replace app configs (default)
npx -y @toolprint/hypertool-mcp setup --yes --standard

# Development installation - run alongside existing configs
npx -y @toolprint/hypertool-mcp setup --yes --development
```

**Toolset Management**
```bash
# Create default toolset (default behavior)
npx -y @toolprint/hypertool-mcp setup --yes

# Skip toolset creation
npx -y @toolprint/hypertool-mcp setup --yes --skip-toolsets
```

### Complete Examples

**Fresh Installation**
```bash
# Clean install for CI/CD environment
npx -y @toolprint/hypertool-mcp setup --yes --import-none --skip-toolsets
```

**Import Everything**
```bash
# Import all configs from all detected apps
npx -y @toolprint/hypertool-mcp setup --yes --import-all
```

**Selective Configuration**
```bash
# Configure only Claude Desktop with development mode
npx -y @toolprint/hypertool-mcp setup --yes \
  --apps claude-desktop \
  --development \
  --verbose
```

**Docker/Container Setup**
```bash
# Minimal setup for containerized environments
npx -y @toolprint/hypertool-mcp setup --yes \
  --import-none \
  --skip-toolsets \
  --standard
```

### Default Behaviors in Non-Interactive Mode

When using `--yes`, the following defaults apply:

1. **App Selection**: All detected applications
2. **Import Strategy**: Import all existing configurations
3. **Server Selection**: All servers from selected apps
4. **Conflict Resolution**: Add app suffix to conflicting names
5. **Installation Type**: Standard (replace app configs)
6. **Toolsets**: Create one "default" toolset with all tools

### Exit Codes

- `0`: Success
- `1`: Setup failed
- `2`: No applications detected (when specific apps requested)

### Environment Variables

```bash
# Set config directory
export HYPERTOOL_CONFIG_PATH=/custom/path
npx -y @toolprint/hypertool-mcp setup --yes

# Debug output
export DEBUG=1
npx -y @toolprint/hypertool-mcp setup --yes

# Enable database-backed configuration (experimental)
export HYPERTOOL_NEDB_ENABLED=true
npx -y @toolprint/hypertool-mcp

# Configuration storage mode
# When HYPERTOOL_NEDB_ENABLED is not set or false:
#   - Configurations are stored in ~/.toolprint/hypertool-mcp/mcp.json
#   - Per-app configs in ~/.toolprint/hypertool-mcp/mcp/*.json
# When HYPERTOOL_NEDB_ENABLED is true:
#   - Configurations are stored in an embedded NeDB database
#   - Enables advanced features like server groups and conflict resolution
#   - Database commands (config show servers/groups/sources) become available
```

### CI/CD Integration

**GitHub Actions Example**
```yaml
- name: Setup Hypertool MCP
  run: |
    npm install -g @toolprint/hypertool-mcp
    hypertool-mcp setup --yes --import-none
```

**GitLab CI Example**
```yaml
setup-hypertool:
  script:
    - npm install -g @toolprint/hypertool-mcp
    - hypertool-mcp setup --yes --dry-run
    - hypertool-mcp setup --yes
```

**Jenkins Pipeline Example**
```groovy
stage('Setup Hypertool') {
  steps {
    sh '''
      npm install -g @toolprint/hypertool-mcp
      hypertool-mcp setup --yes --verbose
    '''
  }
}
```
