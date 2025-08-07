# HyperTool MCP Desktop Extension

Welcome to the HyperTool MCP Desktop Extension (DXT)! This extension enables you to manage and organize tools from multiple MCP servers into focused, task-specific toolsets.

## 🚀 Quick Start

1. **Install the Extension**: Simply double-click the `.dxt` file or use your AI application's extension manager.

2. **Configure MCP Servers**: Create an `.mcp.json` file in your project with your MCP server configurations:

   ```json
   {
     "mcpServers": {
       "git": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-git"]
       },
       "filesystem": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
       }
     }
   }
   ```

3. **Create Your First Toolset**: Ask your AI assistant:
   - "Create a coding toolset with git and file tools"
   - "Show me all available tools"
   - "Switch to the coding toolset"

## 📋 Configuration Options

The extension can be configured through the extension settings:

- **MCP Configuration File**: Path to your `.mcp.json` file (default: `.mcp.json`)
- **Debug Mode**: Enable detailed logging for troubleshooting
- **Log Level**: Set verbosity (error, warn, info, debug, trace)
- **Default Toolset**: Name of toolset to load on startup
- **Data Directory**: Where to store toolsets and cache (default: `~/.hypertool`)

## 🛠️ Available Commands

HyperTool provides these management tools to your AI:

### Tool Discovery

- `list-available-tools` - See all tools from connected MCP servers

### Toolset Management

- `build-toolset` - Create custom toolsets with specific tools
- `equip-toolset` - Switch to a saved toolset
- `unequip-toolset` - Show all available tools
- `list-saved-toolsets` - View your saved configurations
- `delete-toolset` - Remove a saved toolset
- `get-active-toolset` - See current toolset info

### Tool Enhancement

- `add-tool-annotation` - Add context and examples to help your AI use tools better

## 💡 Usage Examples

### Create Task-Specific Toolsets

```
You: Create a toolset for web development with git, npm, and file tools
AI: I've created the 'web-dev' toolset with 12 tools focused on web development.

You: Now create one for writing documentation
AI: I've created the 'docs' toolset with 5 tools for documentation tasks.
```

### Switch Contexts Instantly

```
You: Switch to web-dev mode
AI: Equipped 'web-dev' toolset. I now have access to git, npm, and file management tools.

You: Actually, I need to write docs now
AI: Switched to 'docs' toolset. I now have documentation and writing tools available.
```

### Enhance Tools with Context

```
You: Add a note to the git-commit tool to always write descriptive messages
AI: Added annotation to git-commit. I'll remember to write descriptive commit messages.
```

## 🔧 Troubleshooting

### No tools showing up?

1. Check that your `.mcp.json` file exists and is valid JSON
2. Verify MCP servers are installed and accessible
3. Enable debug mode to see detailed logs

### Extension not starting?

1. Check the logs in your AI application's extension console
2. Ensure Node.js 16+ is available
3. Verify the data directory is writable

### Performance issues?

1. Reduce the number of connected MCP servers
2. Use focused toolsets instead of showing all tools
3. Clear the cache by deleting the data directory

## 📚 Advanced Usage

### Environment Variables

- `HYPERTOOL_MAX_LISTENERS`: Increase if you have many MCP servers (default: 30)
- `DEBUG=true`: Enable debug logging
- `HYPERTOOL_DATA_DIR`: Override data directory location

### Programmatic Configuration

The extension accepts configuration through environment variables prefixed with `DXT_CONFIG_`:

- `DXT_CONFIG_mcpConfigPath`
- `DXT_CONFIG_debug`
- `DXT_CONFIG_logLevel`
- `DXT_CONFIG_equipToolset`
- `DXT_CONFIG_dataDir`

## 🤝 Support

For issues, feature requests, or contributions:

- GitHub: <https://github.com/toolprint/hypertool-mcp>
- Email: <hello@toolprint.com>

## 📄 License

MIT License - see LICENSE file for details.
