# 🔧 Troubleshooting Guide

## Common Issues and Solutions

### 🚫 "Tool not found" Error

**Symptom**: AI says it can't find a tool that should be available

**Causes & Solutions**:

1. **Tool not in active toolset**
   ```
   You: "List my active toolset"
   AI: "Current toolset: 'writing' with tools: notion, slack, grammarly"
   
   Solution: Switch to a toolset that includes the tool you need
   ```

2. **MCP server not connected**
   ```bash
   # Check server health
   hypertool-mcp mcp health
   
   # If server is down, check your .mcp.hypertool.json config
   ```

3. **Tool name changed**
   - Some MCP servers namespace their tools (e.g., `git.status` not just `status`)
   - Ask your AI to list all available tools to see the correct names

### 🔄 "Toolset not switching" in Claude Code

**Symptom**: You switch toolsets but Claude Code still sees old tools

**Solution**: Claude Code doesn't support hot-swapping yet. Use the workaround:

1. Add the `--equip-toolset` flag to your `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "hypertool": {
         "command": "npx",
         "args": ["-y", "@toolprint/hypertool-mcp@latest", 
                  "--mcp-config", ".mcp.hypertool.json",
                  "--equip-toolset", "dev-essentials"]
       }
     }
   }
   ```

2. Restart Claude Code

### ⚠️ "Failed to connect to MCP server"

**Symptom**: HyperTool can't connect to one of your configured servers

**Common Causes**:

1. **Server not installed**
   ```bash
   # Example: Installing a missing server
   npm install -g @modelcontextprotocol/server-filesystem
   ```

2. **Wrong command/path in config**
   ```json
   // ❌ Wrong
   "command": "mcp-server-filesystem"
   
   // ✅ Correct
   "command": "npx",
   "args": ["-y", "@modelcontextprotocol/server-filesystem"]
   ```

3. **Server requires environment variables**
   - Check the server's documentation for required env vars
   - Add them to your shell profile or `.env` file

### 🐌 "Slow tool switching"

**Symptom**: Switching toolsets takes several seconds

**Solutions**:

1. **Reduce number of MCP servers**
   - Only include servers you actively use
   - Remove test or experimental servers

2. **Use HTTP mode for better performance**
   ```bash
   hypertool-mcp --transport http --port 3000
   ```

3. **Check server response times**
   ```bash
   hypertool-mcp mcp test --timing
   ```

### 💾 "Toolsets not persisting"

**Symptom**: Created toolsets disappear after restart

**Solutions**:

1. **Check permissions on storage directory**
   ```bash
   ls -la ~/.toolprint/hypertool-mcp/
   # Should be readable/writable by your user
   ```

2. **Ensure HyperTool has latest version**
   ```bash
   npm update -g @toolprint/hypertool-mcp
   ```

### 🔍 "Can't find my toolset files"

**Location**: `~/.toolprint/hypertool-mcp/`

**Structure**:
```
~/.toolprint/hypertool-mcp/
├── toolsets/
│   ├── dev-essentials.json
│   ├── writing.json
│   └── debugging.json
├── config/
│   └── settings.json
└── logs/
    └── hypertool.log
```

### 🚨 "Error: EACCES permission denied"

**Symptom**: Permission errors when running HyperTool

**Solutions**:

1. **Don't use sudo with npm global installs**
   ```bash
   # ❌ Wrong
   sudo npm install -g @toolprint/hypertool-mcp
   
   # ✅ Better: Use npx
   npx @toolprint/hypertool-mcp
   
   # ✅ Or fix npm permissions
   npm config set prefix ~/.npm-global
   export PATH=~/.npm-global/bin:$PATH
   ```

2. **Use local installation**
   ```bash
   npm install @toolprint/hypertool-mcp
   ./node_modules/.bin/hypertool-mcp
   ```

### 🤔 "AI using wrong tool from toolset"

**Symptom**: AI picks incorrect tool even from a focused toolset

**Solutions**:

1. **Add tool annotations for clarity**
   ```
   You: "Add annotation to docker.build tool"
   You: "Use this for building images, not docker.create"
   ```

2. **Use more specific toolsets**
   - Instead of one big "dev" toolset, create "frontend-dev", "backend-dev", etc.

3. **Check for tool name conflicts**
   - Some servers might have similar tool names
   - Use fully qualified names when possible

## Debug Mode

Enable verbose logging to diagnose issues:

```bash
# Maximum debug output
hypertool-mcp --debug --log-level trace

# Log to file for analysis
hypertool-mcp --debug --log-file debug.log

# Check the logs
tail -f ~/.toolprint/hypertool-mcp/logs/hypertool.log
```

## Getting Help

### 1. Check the Logs

```bash
# View recent logs
cat ~/.toolprint/hypertool-mcp/logs/hypertool.log | tail -100

# Search for errors
grep ERROR ~/.toolprint/hypertool-mcp/logs/hypertool.log
```

### 2. Verify Your Configuration

```bash
# Validate your config file
hypertool-mcp config validate

# Test MCP server connections
hypertool-mcp mcp test
```

### 3. Community Support

- 🐛 [GitHub Issues](https://github.com/toolprint/hypertool-mcp/issues) - Report bugs
- 💬 [GitHub Discussions](https://github.com/toolprint/hypertool-mcp/discussions) - Ask questions
- 📧 [Email Support](mailto:support@onegrep.dev) - For production issues

## Quick Fixes Checklist

- [ ] Using latest version? `npm update -g @toolprint/hypertool-mcp`
- [ ] All MCP servers installed? Check with `which <server-command>`
- [ ] Correct paths in `.mcp.hypertool.json`?
- [ ] Required environment variables set?
- [ ] File permissions correct on `~/.toolprint/`?
- [ ] Tried restart after configuration changes?
- [ ] Checked logs for specific error messages?

## Platform-Specific Issues

### macOS

- **Gatekeeper blocking servers**: System Preferences → Security & Privacy → Allow
- **PATH issues**: Ensure `/usr/local/bin` or homebrew paths are in PATH

### Linux

- **Snap/Flatpak sandboxing**: May prevent access to some paths
- **SELinux**: May block certain operations (check audit logs)