# 🎭 Personas Guide

Complete guide to using personas - pre-configured MCP server bundles with curated toolsets.

## Table of Contents

- [What are Personas?](#what-are-personas)
- [Quick Start](#quick-start)
- [Available Personas](#available-personas)
- [Managing Personas](#managing-personas)
- [Using Personas](#using-personas)
- [Creating Your Own Personas](#creating-your-own-personas)
- [Persona vs Standard Mode](#persona-vs-standard-mode)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)

## What are Personas?

Personas are pre-packaged bundles that provide everything you need for specific workflows. Think of them as "starter packs" or "app bundles" for your AI assistant.

### Each Persona Includes:

- **🔧 MCP Servers**: Pre-configured servers relevant to the workflow
- **📦 Curated Toolsets**: Organized collections of tools for specific tasks
- **⚙️ Configuration**: All necessary settings and environment variables
- **📖 Documentation**: Usage instructions and best practices

### Why Use Personas?

1. **Zero Configuration**: No need to set up individual MCP servers
2. **Instant Expertise**: Get domain-specific tools immediately
3. **Best Practices**: Curated by experts for optimal workflows
4. **Easy Switching**: Change your entire tool context with one command
5. **Community Driven**: Benefit from shared configurations

## Quick Start

### Step 1: Get the Persona Collection

```bash
# Clone the community persona repository
git clone https://github.com/toolprint/awesome-mcp-personas
cd awesome-mcp-personas
```

### Step 2: Add a Persona

```bash
# Add the web-dev persona
hypertool-mcp persona add personas/web-dev

# Or add from any path
hypertool-mcp persona add /path/to/persona-folder
```

During installation, you'll be prompted to configure any required environment variables or arguments for the persona's MCP servers. You can also skip this and configure them later.

📁 **Note:** Personas are installed to `~/.toolprint/hypertool-mcp/personas/<persona-name>/`

### Step 3: Run with the Persona

```bash
# Start HyperTool with the persona
npx -y @toolprint/hypertool-mcp mcp run --persona web-dev
```

That's it! The persona's servers will start automatically, and its default toolset will be activated.

## Available Personas

The [awesome-mcp-personas](https://github.com/toolprint/awesome-mcp-personas) repository contains a growing collection of community-contributed personas:

### Development Personas

| Persona | Description | Key Tools |
|---------|-------------|-----------|
| **web-dev** | Full-stack web development | Git, Docker, Browser, Testing, Filesystem |
| **backend-dev** | Server-side development | Database, Docker, API Testing, Monitoring |
| **frontend-dev** | UI/UX development | Browser, CSS, Component Testing, Design |
| **mobile-dev** | Mobile app development | Android, iOS, React Native, Testing |

### Data & Research Personas

| Persona | Description | Key Tools |
|---------|-------------|-----------|
| **data-scientist** | Data analysis & ML | Python, Jupyter, Plotting, Database |
| **researcher** | Academic research | Arxiv, Wikipedia, Citation, Note-taking |
| **analyst** | Business analytics | SQL, Excel, Visualization, Reporting |

### Operations Personas

| Persona | Description | Key Tools |
|---------|-------------|-----------|
| **devops** | Infrastructure & deployment | Docker, Kubernetes, Terraform, AWS |
| **sre** | Site reliability | Monitoring, Logging, Alerts, Incidents |
| **security** | Security operations | Scanning, Audit, Compliance, Secrets |

### Creative Personas

| Persona | Description | Key Tools |
|---------|-------------|-----------|
| **content-creator** | Content & marketing | Notion, SEO, Grammar, Social Media |
| **technical-writer** | Documentation | Markdown, Diagrams, API Docs, Screenshots |
| **designer** | Design work | Figma, Color, Typography, Assets |

## Managing Personas

### List Available Personas

```bash
# See all installed personas
hypertool-mcp persona list

# With detailed information
hypertool-mcp persona list --verbose
```

### Inspect a Persona

```bash
# View detailed information about a persona
hypertool-mcp persona inspect web-dev
```

This shows:
- Included MCP servers and their configurations
- Available toolsets
- Required environment variables
- Usage instructions

### Activate a Persona

```bash
# Activate a persona (for next run)
hypertool-mcp persona activate web-dev

# Activate with a specific toolset
hypertool-mcp persona activate web-dev --toolset frontend
```

### Check Current Status

```bash
# See which persona is active
hypertool-mcp persona status
```

### Deactivate Current Persona

```bash
# Switch back to standard mode
hypertool-mcp persona deactivate
```

### Validate a Persona

```bash
# Check if a persona is valid before adding
hypertool-mcp persona validate /path/to/persona
```

## Using Personas

### Running with a Persona

```bash
# Basic usage
npx -y @toolprint/hypertool-mcp mcp run --persona web-dev

# With a specific toolset
npx -y @toolprint/hypertool-mcp mcp run --persona web-dev --equip-toolset frontend

# Combine with your own servers
npx -y @toolprint/hypertool-mcp mcp run --persona web-dev --mcp-config my-servers.json
```

### Switching Toolsets

Once running with a persona, you can switch between its toolsets dynamically:

```
You: "Switch to the backend toolset"
AI: "Equipped backend toolset with database and API tools"

You: "Now switch to frontend tools"
AI: "Equipped frontend toolset with UI and browser tools"
```

### Persona Toolsets

Each persona typically includes multiple toolsets for different tasks:

```yaml
# Example: web-dev persona toolsets
toolsets:
  - name: frontend
    tools: [browser.*, css.*, webpack.*]

  - name: backend
    tools: [database.*, api.*, auth.*]

  - name: fullstack
    tools: [git.*, docker.*, test.*]

  - name: debugging
    tools: [logs.*, trace.*, profile.*]
```

## Creating Your Own Personas

### Persona Structure

A persona is a folder with these files:

```
my-persona/
├── persona.yaml       # Persona definition (required)
├── mcp.json          # MCP server configurations (required)
├── README.md         # Usage instructions (recommended)
└── toolsets/         # Additional toolset files (optional)
    ├── advanced.yaml
    └── specialty.yaml
```

### Basic persona.yaml

```yaml
name: my-persona
description: Custom persona for my workflow
version: "1.0"

# Define toolsets
toolsets:
  - name: default
    description: Essential tools for getting started
    toolIds:
      - git.status
      - git.commit
      - filesystem.read_file
      - filesystem.write_file

  - name: advanced
    description: Power user tools
    toolIds:
      - docker.build
      - docker.run
      - database.query

# Set the default toolset
defaultToolset: default

# Metadata
metadata:
  author: Your Name
  tags:
    - development
    - custom
  created: "2024-01-01T00:00:00Z"
```

### Basic mcp.json

```json
{
  "mcpServers": {
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "docker": {
      "command": "docker-mcp",
      "env": {
        "DOCKER_HOST": "unix:///var/run/docker.sock"
      }
    }
  }
}
```

### Installing Your Persona

```bash
# Add your custom persona
hypertool-mcp persona add /path/to/my-persona

# Test it
npx -y @toolprint/hypertool-mcp mcp run --persona my-persona
```

Your persona is now installed at: `~/.toolprint/hypertool-mcp/personas/my-persona/`

## Persona vs Standard Mode

### When to Use Personas

✅ **Use Personas when:**
- Starting fresh with a new workflow
- Trying out new MCP servers
- Want pre-configured, curated toolsets
- Need quick setup without configuration
- Working on specialized tasks (data science, DevOps, etc.)

### When to Use Standard Mode

✅ **Use Standard Mode when:**
- You have existing MCP server configurations
- Need full control over server settings
- Have custom or proprietary MCP servers
- Want to mix and match servers dynamically

### Combining Both Modes

You can use both together:

```bash
# Persona servers + your custom servers
npx -y @toolprint/hypertool-mcp mcp run \
  --persona web-dev \
  --mcp-config my-custom-servers.json
```

## Advanced Usage

### HyperTool Data Storage

All HyperTool data is stored in: `~/.toolprint/hypertool-mcp/`

```bash
~/.toolprint/hypertool-mcp/
├── personas/                 # All installed personas
│   ├── web-dev/
│   │   ├── persona.yaml     # Persona definition
│   │   └── mcp.json         # MCP server configs
│   └── data-scientist/
├── toolsets/                 # Saved toolset configurations
│   ├── coding.json
│   └── debugging.json
├── config/                   # HyperTool configuration
│   ├── preferences.json     # User preferences
│   └── server-groups.json   # Server group definitions
└── cache/                    # Cached data
    └── discovery.json        # Tool discovery cache
```

#### Key File Locations

```bash
# View your user preferences
cat ~/.toolprint/hypertool-mcp/config/preferences.json

# Check saved toolsets
ls ~/.toolprint/hypertool-mcp/toolsets/

# View all personas
ls ~/.toolprint/hypertool-mcp/personas/

# Edit a specific persona's MCP configuration
nano ~/.toolprint/hypertool-mcp/personas/web-dev/mcp.json

# Check server groups
cat ~/.toolprint/hypertool-mcp/config/server-groups.json
```

💡 **Tip:** You can directly edit any of these files when HyperTool is not running. Changes will be picked up on the next start.

### Configuring MCP Servers

#### During Installation

When you add a persona, HyperTool will check for required configuration:

```bash
hypertool-mcp persona add personas/backend-dev

# You'll see prompts like:
# ⚙️  Configuration needed:
#    database: DB_HOST, DB_PORT, DB_USER
#    github: GITHUB_TOKEN
# ? Configure now? (Y/n)
```

Choose to configure immediately or skip and configure later.

#### Manual Configuration

You can edit MCP server configurations directly:

```bash
# Edit the persona's MCP configuration
nano ~/.toolprint/hypertool-mcp/personas/backend-dev/mcp.json
```

Example configuration with environment variables and arguments:
```json
{
  "mcpServers": {
    "database": {
      "command": "postgres-mcp",
      "args": ["--host", "localhost", "--port", "5432"],
      "env": {
        "DB_HOST": "localhost",
        "DB_USER": "myuser",
        "DB_PASSWORD": "mypassword"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/specific/path"]
    }
  }
}
```

#### Environment Variables

Some personas require environment variables:

```bash
# Set required variables before running
export GITHUB_TOKEN=your_token
export DATABASE_URL=postgres://...

# Then run the persona
npx -y @toolprint/hypertool-mcp mcp run --persona backend-dev
```

Or configure them permanently in the persona's mcp.json file as shown above.

### Persona Packages (.htp files)

Personas can be distributed as `.htp` archive files:

```bash
# Add from an archive
hypertool-mcp persona add my-persona.htp

# Create an archive from a persona folder
cd my-persona/
tar -czf ../my-persona.htp .
```

### Server Groups with Personas

Combine server groups with personas for more control:

```bash
# Create a group from persona servers
hypertool-mcp mcp group create dev-servers -d "Development servers"
hypertool-mcp mcp group add dev-servers git docker filesystem

# Run specific groups
hypertool-mcp mcp run --group dev-servers
```

### Updating Personas

To update personas from the awesome-mcp-personas repository:

```bash
# Pull latest changes
cd awesome-mcp-personas
git pull

# Re-add the updated persona
hypertool-mcp persona add personas/web-dev --force
```

## Troubleshooting

### Persona Storage Location

All personas are stored locally at: `~/.toolprint/hypertool-mcp/personas/`

```bash
# View all installed personas
ls -la ~/.toolprint/hypertool-mcp/personas/

# Check a specific persona's files
ls -la ~/.toolprint/hypertool-mcp/personas/web-dev/

# Edit a persona's configuration directly (advanced)
nano ~/.toolprint/hypertool-mcp/personas/web-dev/persona.yaml
```

Each persona folder contains:
- `persona.yaml` - The persona definition
- `mcp.json` - MCP server configurations
- Additional files copied during installation

### Common Issues

**Persona not found:**
```bash
# Check if persona is installed
hypertool-mcp persona list

# Check the storage directory
ls ~/.toolprint/hypertool-mcp/personas/

# Re-add if missing
hypertool-mcp persona add /path/to/persona
```

**MCP servers not starting:**
```bash
# Check persona's MCP configuration
hypertool-mcp persona inspect persona-name

# Validate the persona
hypertool-mcp persona validate /path/to/persona

# Edit the configuration directly to fix issues
nano ~/.toolprint/hypertool-mcp/personas/persona-name/mcp.json
```

**Missing environment variables:**
```bash
# Personas will warn about missing variables
# Set them before running:
export REQUIRED_VAR=value

# Or add them permanently to the persona's mcp.json:
nano ~/.toolprint/hypertool-mcp/personas/persona-name/mcp.json
# Add under the server's "env" section
```

**Wrong server arguments:**
```bash
# Fix server arguments in the persona configuration
nano ~/.toolprint/hypertool-mcp/personas/persona-name/mcp.json

# Example: Change filesystem server path
# Before: "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
# After:  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
```

**Toolset not found:**
```bash
# List available toolsets for a persona
hypertool-mcp persona inspect persona-name

# Use a valid toolset name
npx -y @toolprint/hypertool-mcp mcp run --persona name --equip-toolset valid-name
```

### Getting Help

1. Check the persona's README: `hypertool-mcp persona inspect persona-name`
2. Visit the [awesome-mcp-personas](https://github.com/toolprint/awesome-mcp-personas) repository
3. Open an issue on [HyperTool GitHub](https://github.com/toolprint/hypertool-mcp/issues)
4. Join the community discussions

## Contributing Personas

Share your personas with the community:

1. Fork [awesome-mcp-personas](https://github.com/toolprint/awesome-mcp-personas)
2. Add your persona to the `personas/` directory
3. Include a comprehensive README
4. Submit a pull request

### Contribution Guidelines

- ✅ Include clear documentation
- ✅ Test all MCP server configurations
- ✅ Provide meaningful toolset organizations
- ✅ Add usage examples
- ✅ List required environment variables
- ✅ Follow naming conventions (lowercase, hyphens)

---

📚 **Related Guides:**
- [Configuration Mode](CONFIGURATION_MODE.md) - How toolset management works
- [Examples](EXAMPLES.md) - More usage patterns and recipes
- [Advanced Features](ADVANCED.md) - Power user features
- [Troubleshooting](TROUBLESHOOTING.md) - General troubleshooting

💡 **Pro tip:** Start with a community persona and customize it to create your perfect workflow!
