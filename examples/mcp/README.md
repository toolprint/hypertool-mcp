# MCP Configuration Examples

**🎯 Two Options: Zero-setup or Full-featured with your own API keys**

## Quick Start

### Option 1: Zero Setup (Recommended for Getting Started)
Use `mcp.everything.json` - works immediately without any API keys:

```json
{
  "mcpServers": {
    "hypertool": {
      "command": "npx",
      "args": ["-y", "@toolprint/hypertool-mcp@latest", "--mcp-config", "examples/mcp/mcp.everything.json"]
    }
  }
}
```

### Option 2: Full-Featured (Add Your Own API Keys)
Use `mcp.everything-with-secrets.json` after adding your credentials:

```json
{
  "mcpServers": {
    "hypertool": {
      "command": "npx",
      "args": ["-y", "@toolprint/hypertool-mcp@latest", "--mcp-config", "examples/mcp/mcp.everything-with-secrets.json"]
    }
  }
}
```

### Create Dynamic Toolsets
Both configurations work with hypertool's MCP tools:

```
You: "Show me all available tools"
Assistant: "I found 26 tools (or 52 with secrets config)..."

You: "Create a toolset called 'startup-ops' with slack, linear, stripe, and github"
Assistant: "Created 'startup-ops' toolset with business operation tools"

You: "Switch to the startup-ops toolset"  
Assistant: "Equipped 'startup-ops'! I now see only the business tools you need"
```

## Configuration Options

### 🆓 `mcp.everything.json` - 26 Servers (Zero Setup)
Perfect for immediate use without any API keys or accounts:

#### 🛠️ Development & Infrastructure  
- **docker** - Container management (local Docker daemon)
- **terraform** - Infrastructure as code (file operations)
- **kubernetes** - K8s cluster operations (local kubectl config)
- **git** - Version control (local repositories)
- **filesystem** - File operations and local development

#### 🗄️ Local Database
- **sqlite** - Local database operations (no connection strings)

#### 🌐 Web & Content Research (Public APIs)
- **hackernews** - Tech news aggregation (public API, no auth)
- **web-search** - Google search without API keys
- **web-scraper** - Public web scraping
- **fetch** - HTTP requests to public URLs

#### 📊 Data Processing (Local Files)
- **csv-processor, json-tools, excel-converter** - Data analysis
- **markitdown, pandoc, pdf-processor** - Document conversion

#### 🖥️ System Administration & Testing
- **ssh-tools, terminal, system-monitor** - Local system tools
- **browser-automation, python-sandbox, javascript-sandbox** - Testing environments

#### 📅 Productivity & AI
- **time, memory, sequential-thinking, everything** - Local AI and utilities

### 🔑 `mcp.everything-with-secrets.json` - 52 Servers (Requires Your API Keys)
All the above PLUS business tools when you add your credentials:

#### 💬 Communication & Collaboration
- **github** - Repository management (add `GITHUB_TOKEN`)
- **slack** - Team communication (add `SLACK_BOT_TOKEN`)
- **discord** - Community management (add `DISCORD_BOT_TOKEN`)
- **notion** - Documentation (add `NOTION_API_KEY`)

#### 📋 Project Management
- **linear** - Issue tracking (add `LINEAR_API_KEY`)
- **jira** - Enterprise PM (add `JIRA_API_TOKEN`)
- **asana** - Team coordination (add `ASANA_ACCESS_TOKEN`)

#### 💼 CRM & Sales
- **salesforce** - Enterprise CRM (add Salesforce credentials)
- **hubspot** - Marketing automation (add `HUBSPOT_ACCESS_TOKEN`)
- **intercom** - Customer support (add `INTERCOM_ACCESS_TOKEN`)

#### ☁️ Cloud Storage & Productivity
- **google-drive, gmail** - Google Workspace (add service account key)

#### 🗄️ Production Databases
- **postgresql, mongodb, redis** - Database servers (add connection strings)

#### 💳 Payments & E-commerce
- **stripe** - Payment processing (add `STRIPE_SECRET_KEY`)
- **paypal** - Global payments (add PayPal credentials)
- **shopify** - E-commerce (add `SHOPIFY_ACCESS_TOKEN`)

#### 🤖 AI & ML Services
- **openai, anthropic** - AI model APIs (add API keys)

#### 📊 Analytics & Cloud
- **google-analytics** - Web analytics (add service account)
- **sentry** - Error tracking (add `SENTRY_AUTH_TOKEN`)
- **aws-lambda, aws-s3** - AWS services (add AWS credentials)
- **twitter** - Social media (add Twitter API keys)

## Setup Instructions

### For Zero-Setup Config
Just use `mcp.everything.json` - it works immediately!

### For Full-Featured Config
1. Copy `mcp.everything-with-secrets.json`
2. Replace placeholder values with your real credentials:
   - `YOUR_GITHUB_TOKEN_HERE` → your actual GitHub token
   - `YOUR_SLACK_BOT_TOKEN_HERE` → your actual Slack bot token
   - `YOUR_STRIPE_SECRET_KEY_HERE` → your actual Stripe secret key
   - etc.

#### Example: Setting up GitHub
```json
"github": {
  "command": "npx",
  "args": ["-y", "@github/github-mcp-server"],
  "env": {
    "GITHUB_TOKEN": "ghp_your_actual_github_token_here"
  }
}
```

### Getting API Keys
- **GitHub**: Settings → Developer settings → Personal access tokens
- **Slack**: Create Slack app → OAuth & Permissions → Bot User OAuth Token
- **Stripe**: Dashboard → Developers → API keys → Secret key
- **Linear**: Settings → API → Personal API keys
- **OpenAI**: Platform → API keys → Create new secret key

## Security Notes

🔒 **Keep secrets secure**:
- Never commit files with real API keys to version control
- Use environment variables or separate config files
- Consider using `.env` files that are gitignored
- Most MCP servers support loading credentials from environment variables

## Installation

```bash
# Hypertool installs automatically when first used
# Requires Node.js + Python with uv
# uv install: https://docs.astral.sh/uv/getting-started/installation/
```

## Configuration Locations

**Claude Desktop:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

**VS Code:** `.vscode/mcp.json`

---

**💡 Pro Tips:** 
- Start with `mcp.everything.json` for immediate use
- Upgrade to `mcp.everything-with-secrets.json` as you add API keys
- Use hypertool to create focused toolsets from either configuration!