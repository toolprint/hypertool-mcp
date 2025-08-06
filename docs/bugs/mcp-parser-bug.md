# MCP Parser Bug - Missing Type Field Handling

**Created**: 2025-07-23
**Reference Commit**: 0c683824b5736993ab134616d30b528166148997
**Branch**: cleanup-prod

## Problem Statement

The MCP configuration parser in `src/config/mcpConfigParser.ts` has two critical issues:

1. **Missing type field causes parser failure**: When a server configuration omits the `type` field, the parser throws an error instead of defaulting to the implied transport type of `stdio`.

2. **Single malformed config fails entire parse**: If one server configuration is malformed, the entire configuration parsing fails instead of logging the error for that specific server and continuing with valid configurations.

## Current Behavior

### Issue 1: Missing Type Field
```json
// This configuration causes parser to fail
{
  "mcpServers": {
    "example-server": {
      "command": "node",
      "args": ["server.js"]
      // Missing "type" field - should default to "stdio"
    }
  }
}
```

Current parser code (lines 157-160) requires the type field to be present.

### Issue 2: Complete Parse Failure
When parsing multiple server configurations, if one is malformed, the entire parse operation fails:
```json
{
  "mcpServers": {
    "good-server": {
      "type": "stdio",
      "command": "node",
      "args": ["server1.js"]
    },
    "bad-server": {
      // Missing required fields - should not fail good-server
    }
  }
}
```

## Expected Behavior

### Issue 1: Default to stdio
According to MCP specification, when the `type` field is omitted, the implied transport is `stdio`. The parser should:
- Check if `type` field exists
- If missing, default to `"stdio"`
- Continue parsing normally

### Issue 2: Graceful Degradation
When encountering a malformed server configuration:
- Log a clear error message for that specific server
- Include the server name and specific validation errors
- Continue parsing remaining servers
- Return successfully parsed servers
- Include a summary of failed servers in the result

## Technical Implementation

### Code Location
- File: `src/config/mcpConfigParser.ts`
- Method: `parseFile()` and related validation methods
- Lines: Around 157-160 for type validation

### Solution Approach

1. **Type Field Default**:
   - Modify server config validation to check for missing type
   - Set default value of "stdio" before validation
   - Ensure backward compatibility

2. **Error Isolation**:
   - Wrap individual server parsing in try-catch
   - Collect errors per server
   - Continue processing remaining servers
   - Return partial results with error summary

### Example Implementation Pattern
```typescript
// Pseudo-code for solution
for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
  try {
    // Default type to stdio if missing
    if (!serverConfig.type) {
      serverConfig.type = 'stdio';
    }

    // Validate and process server
    const validatedConfig = validateServerConfig(serverConfig);
    validServers[serverName] = validatedConfig;
  } catch (error) {
    // Log error for this server but continue
    errors.push({
      server: serverName,
      error: error.message
    });
    console.error(`Failed to parse config for server "${serverName}": ${error.message}`);
  }
}
```

## Testing Requirements

1. **Type Field Tests**:
   - Test config with missing type field defaults to stdio
   - Test explicit type fields still work
   - Test all transport types (stdio, http, sse)

2. **Error Isolation Tests**:
   - Test mix of valid and invalid configs
   - Test multiple invalid configs
   - Test error messages include server names
   - Test partial results are returned

## Impact Analysis

- **Breaking Changes**: None - this makes the parser more permissive
- **Compatibility**: Improves compatibility with standard MCP configurations
- **User Experience**: Better error messages and resilience
- **Security**: No security implications

## Success Criteria

1. Parser accepts configs without type field and defaults to stdio
2. Single malformed config doesn't fail entire parse operation
3. Clear error messages identify which server configs failed and why
4. All existing tests continue to pass
5. New tests verify both bug fixes
