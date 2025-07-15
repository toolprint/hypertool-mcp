# MCP Configuration Parser

This module provides a TypeScript parser for `.mcp.json` configuration files used in the hypertool-mcp project.

## Usage

```typescript
import { MCPConfigParser } from './config';

// Create parser instance
const parser = new MCPConfigParser();

// Parse a configuration file
const result = await parser.parseFile('/path/to/.mcp.json');

if (result.success) {
  console.log('Servers:', MCPConfigParser.getServerNames(result.config!));
} else {
  console.error('Parse error:', result.error || result.validationErrors);
}
```

## Configuration Format

The parser expects JSON files in the following format:

```json
{
  "mcpServers": {
    "serverName": {
      "type": "stdio",
      "command": "command-to-run",
      "args": ["arg1", "arg2"],
      "env": { "KEY": "value" }
    }
  }
}
```

## Supported Server Types

- **stdio**: Process-based servers using stdin/stdout communication
- **sse**: HTTP-based servers using Server-Sent Events

## Parser Options

- `validatePaths`: Validate command paths exist (default: true)
- `allowRelativePaths`: Allow relative paths in commands (default: true)  
- `strict`: Fail completely on any validation error (default: false)