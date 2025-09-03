# Test Utils - Configuration Tools Testing

This document describes the testing infrastructure for configuration tools behavior, particularly the differences between standard mode and persona mode.

## Overview

The `test-config-tools.sh` script tests how configuration tools behave differently when the server is running with or without an active persona.

## Test Script Architecture

### Key Components

1. **HTTP Session Management**: 
   - Uses MCP's Streamable HTTP transport
   - Requires proper session initialization with `initialize` method
   - Session ID returned in `Mcp-Session-Id` header
   - All subsequent requests must include session ID

2. **SSE Response Parsing**:
   - HTTP transport returns Server-Sent Events (SSE) format
   - Responses start with `event: message` followed by `data: {json}`
   - Script parses SSE to extract JSON data

3. **Required Headers**:
   ```bash
   Content-Type: application/json
   Accept: text/event-stream, application/json
   Mcp-Session-Id: {session-id}  # After initialization
   ```

## Configuration Tools Behavior

### Standard Mode (No Persona)

When running with `--mcp-config` flag and no persona:

**Available Tools**:
- ✅ `list-personas` - Show available personas for activation
- ✅ `build-toolset` - Create new toolsets
- ✅ `delete-toolset` - Delete existing toolsets
- ✅ `list-saved-toolsets` - Lists regular toolsets
- ✅ `equip-toolset` - Equip any toolset
- ✅ `unequip-toolset` - Unequip current toolset
- ✅ `get-active-toolset` - Get current toolset
- ✅ `add-tool-annotation` - Add notes to tools
- ✅ `list-available-tools` - Show all available tools

### Persona Mode

When running with `--persona` flag:

**Hidden Tools** (Not shown in tools/list):
- ❌ `list-personas` - Not needed when persona is active
- ❌ `build-toolset` - Cannot create toolsets in persona mode
- ❌ `delete-toolset` - Cannot delete persona toolsets

**Available Tools**:
- ✅ `list-saved-toolsets` - Shows persona toolsets with "persona:" prefix
- ✅ `equip-toolset` - Equip persona toolsets
- ✅ `unequip-toolset` - Unequip current persona toolset
- ✅ `get-active-toolset` - Get active persona toolset
- ✅ `add-tool-annotation` - Add notes to tools in persona toolsets
- ✅ `list-available-tools` - Show tools from connected servers

## Test Setup

### Prerequisites

1. **Test Personas**: Copy from fixtures using justfile
   ```bash
   just persona-setup-real
   ```
   This copies test personas from `test/fixtures/personas/` to `personas/`

2. **Test MCP Config**: `mcp.test.json` with test servers
   ```json
   {
     "mcpServers": {
       "sequential-thinking": {...},
       "everything": {...}
     }
   }
   ```

### Test Personas Available

From `test/fixtures/personas/`:
- `test-persona` - Basic persona with utility toolsets
- `valid-persona` - Complete valid persona example
- `complex-persona` - Advanced persona with compound tools
- `invalid-persona` - Invalid for testing error handling

## Running Tests

### Full Test Suite
```bash
bash src/test-utils/test-config-tools.sh
```

### Manual Testing

1. **Start server in standard mode**:
   ```bash
   dist/bin.js mcp run --mcp-config mcp.test.json --transport http --port 3456
   ```

2. **Start server in persona mode**:
   ```bash
   dist/bin.js mcp run --persona test-persona --transport http --port 3456
   ```

3. **Initialize session**:
   ```bash
   curl -i -X POST "http://localhost:3456/mcp" \
     -H "Content-Type: application/json" \
     -H "Accept: text/event-stream, application/json" \
     -d '{
       "jsonrpc": "2.0",
       "id": 1,
       "method": "initialize",
       "params": {
         "protocolVersion": "2025-06-18",
         "capabilities": {},
         "clientInfo": {
           "name": "test-client",
           "version": "1.0.0"
         }
       }
     }'
   ```
   Extract session ID from `Mcp-Session-Id` header

4. **List available tools**:
   ```bash
   curl -X POST "http://localhost:3456/mcp" \
     -H "Content-Type: application/json" \
     -H "Accept: text/event-stream, application/json" \
     -H "Mcp-Session-Id: {session-id}" \
     -d '{
       "jsonrpc": "2.0",
       "id": 1,
       "method": "tools/list"
     }'
   ```

## Implementation Notes

### Tool Filtering Logic

Located in `src/server/tools/config-tools/manager.ts`:

```typescript
public getMcpTools(): Tool[] {
  const activePersona = this.dependencies.personaManager?.getActivePersona();
  
  // Hide tools based on persona state:
  if (toolName === 'list-personas' && activePersona) continue;
  if (toolName === 'build-toolset' && activePersona) continue;
  if (toolName === 'delete-toolset' && activePersona) continue;
  
  // Return remaining tools
}
```

### Persona State Persistence

- Persona state is persisted to `~/.toolprint/hypertool-mcp/hypertool-persona-runtime-state.json`
- State is only restored when `--persona` flag is provided
- State is cleared when starting without `--persona` flag

### Known Issues Fixed

1. **Session ID Required**: HTTP transport requires session initialization
2. **SSE Format**: Responses are in SSE format, not plain JSON
3. **Accept Header**: Must include both `application/json` and `text/event-stream`
4. **Persona State Persistence**: Fixed to only restore when persona requested
5. **Tool Visibility**: Tools are now properly hidden rather than returning errors

## Debugging Tips

1. **Check logs**: Server logs are saved to `src/test-utils/logs/`
2. **Debug mode**: Use `--debug --log-level debug` flags
3. **Manual curl**: Test individual endpoints with curl commands
4. **State file**: Check `~/.toolprint/hypertool-mcp/hypertool-persona-runtime-state.json`

## Expected Test Results

### Standard Mode
- ✅ All configuration tools visible
- ✅ Can create/delete toolsets
- ✅ No persona toolsets shown

### Persona Mode  
- ✅ Restricted tools hidden
- ✅ Persona toolsets shown with "persona:" prefix
- ✅ Cannot create/delete toolsets
- ✅ Can equip/unequip persona toolsets