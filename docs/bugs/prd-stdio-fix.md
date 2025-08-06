# PRD: Fix Stdio Transport Output Issues

## Problem Statement

When running hypertool-mcp server with stdio transport (the default mode), the server fails to connect with MCP clients like Claude Code. The client receives a JSON parsing error:

```
SyntaxError: Expected ',' or ']' after array element in JSON at position 5
```

This occurs because the server is writing non-protocol messages to stdout, which corrupts the JSON-RPC communication channel.

## Root Cause Analysis

### MCP Protocol Requirements
- **stdout**: Reserved exclusively for JSON-RPC protocol messages
- **stderr**: Used for logging, debugging, and diagnostic output
- **stdin**: Used for receiving JSON-RPC protocol messages

### Current Behavior
1. The server displays initialization progress messages using:
   - `ora` spinners (write to stdout)
   - `output` module methods (write to stdout via Console)
   - `logger` console output (may write to stdout)

2. These messages corrupt the protocol stream because the MCP client expects only valid JSON-RPC messages on stdout.

### Example of Corruption
```
Loading MCP configuration...    <-- This goes to stdout and breaks JSON parsing
{"jsonrpc":"2.0","method":"initialize","params":...}  <-- Valid protocol message
```

## Solution Design

### Objectives
1. Ensure stdout is used exclusively for MCP protocol messages in stdio mode
2. Preserve all diagnostic/progress output by redirecting to stderr
3. Maintain file logging functionality
4. Minimize code changes and maintain backward compatibility

### Technical Approach

#### 1. Create Stdio-Specific Logging Configuration
Add a new configuration in `src/logging/index.ts`:
```typescript
export const STDIO_LOGGING_CONFIG: LoggingConfig = {
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  enableConsole: false,  // Disable console to prevent stdout pollution
  enableFile: true,      // Keep file logging active
  serverName: APP_TECHNICAL_NAME,
  format: "pretty",
  colorize: false,
};
```

#### 2. Update Output Module
Modify `src/logging/output.ts` to:
- Check if console logging is disabled (indicating stdio mode)
- Redirect all Console output to stderr when in stdio mode
- Ensure no direct `process.stdout.write()` calls in stdio mode

#### 3. Early Detection and Configuration
In `src/index.ts`:
- Detect stdio transport mode early in initialization
- Apply STDIO_LOGGING_CONFIG before any output occurs
- Ensure logger is configured before server initialization

## Implementation Plan

### Phase 1: Core Output Redirection
1. Add STDIO_LOGGING_CONFIG to logging module
2. Export logging config state for other modules to check
3. Update output.ts to redirect based on logging config
4. Test basic functionality

### Phase 2: Spinner Handling (Future)
1. Create stdio-safe progress reporter
2. Replace ora spinners in enhanced.ts
3. Ensure all progress indication goes to stderr or is disabled

### Phase 3: Validation
1. Test with Claude Code
2. Verify protocol messages are clean
3. Ensure diagnostic output is still available in stderr
4. Confirm file logging continues to work

## Clarifications

### Output Behavior in Stdio Mode
- **Debug output**: Always goes to stderr, regardless of mode
- **Error messages**: Always go to stderr to maintain separation from protocol
- **Initial banner**: Redirected to stderr in stdio mode to keep stdout clean

### Detection Strategy
- Stdio mode detection happens in the CLI entrypoint (`src/index.ts`)
- Detection is based on `--transport stdio` flag (or default when no transport specified)
- Configuration is applied before any server initialization

### Backward Compatibility
- Not a concern for this implementation
- This is a server binary, not an SDK, so no programmatic usage to consider
- No need for flags to restore old behavior

## Success Criteria

1. **Protocol Integrity**: No non-JSON-RPC data on stdout in stdio mode
2. **Diagnostic Visibility**: All progress/status messages available via stderr
3. **File Logging**: Continues to work as before
4. **Backward Compatibility**: HTTP transport mode unchanged
5. **Client Compatibility**: Successfully connects with:
   - Claude Code
   - Claude Desktop
   - Cursor
   - Other MCP clients

## Testing Strategy

1. **Unit Tests**: Verify output redirection logic
2. **Integration Tests**: Create automated test that:
   - Spawns the server with stdio transport
   - Captures stdout and stderr separately
   - Verifies stdout contains only valid JSON-RPC messages
   - Verifies stderr contains expected diagnostic output
3. **Manual Testing**:
   ```bash
   # Test stdio mode
   hypertool-mcp --transport stdio 2>stderr.log

   # Verify stdout contains only JSON-RPC
   hypertool-mcp | jq .

   # Verify stderr contains diagnostic output
   cat stderr.log
   ```

## Risks and Mitigations

1. **Risk**: Breaking existing HTTP transport mode
   - **Mitigation**: Only apply changes when stdio transport is detected

2. **Risk**: Lost diagnostic information
   - **Mitigation**: Ensure all output is redirected to stderr, not suppressed

3. **Risk**: Performance impact from configuration checks
   - **Mitigation**: Check configuration once during initialization

## Timeline

- Phase 1: 1 hour (Core implementation)
- Phase 2: 1 hour (Spinner handling)
- Phase 3: 30 minutes (Testing and validation)

Total estimated time: 2.5 hours
