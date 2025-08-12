# Enhanced DXT Extension Management - Implementation Plan

## Overview
Create an extension system with auto-discovery and user-configurable settings driven by manifest definitions.

## Core Implementation

### 1. Enhanced Manifest Schema
- Adopt the Claude Desktop-compatible manifest format
- Support `user_config` section defining configurable parameters
- Each parameter has type, validation, and default values
- Support environment variable substitution

### 2. User Configuration in ~/.toolprint/hypertool-mcp/config.json
```json
{
  "extensions": {
    "directory": "~/.toolprint/hypertool-mcp/extensions",
    "autoDiscovery": true,
    "settings": {
      "file-system-tools": {
        "isEnabled": true,
        "userConfig": {
          "allowed_directories": ["/Users/brian/workspace", "/tmp"],
          "api_key": "${env:MY_API_KEY}",
          "max_file_size": 25
        }
      }
    }
  }
}
```

### 3. Configuration Flow
- Extension manifest defines available `user_config` parameters
- User provides values in config.json settings
- System validates user values against manifest schema
- **Invalid settings = extension disabled with WARNING log**
- Values are injected into server environment/args via template substitution

## Key Implementation Details

### 1. Settings Key Convention
- Use filename without .dxt extension as the key
- Example: `hello-dxt.dxt` → settings key: `hello-dxt`
- This matches the installed folder name: `installed/hello-dxt/`

### 2. Validation and Error Handling
```typescript
// During extension loading:
const extensionName = "file-system-tools"; // from hello-dxt.dxt
const userSettings = config.extensions.settings[extensionName];
const manifestConfig = manifest.user_config;

// Validate each user setting against manifest
for (const [key, value] of Object.entries(userSettings.userConfig)) {
  if (!manifestConfig[key]) {
    logger.warn(`Extension ${extensionName}: Unknown config key '${key}'`);
    return { enabled: false, reason: `Invalid config key: ${key}` };
  }

  const paramDef = manifestConfig[key];
  if (!validateType(value, paramDef)) {
    logger.warn(`Extension ${extensionName}: Invalid value for '${key}'. Expected ${paramDef.type}, got ${typeof value}`);
    return { enabled: false, reason: `Invalid type for ${key}` };
  }

  if (paramDef.required && !value) {
    logger.warn(`Extension ${extensionName}: Missing required config '${key}'`);
    return { enabled: false, reason: `Missing required config: ${key}` };
  }
}
```

### 3. Warning Messages
```
[WARN] Extension 'file-system-tools' disabled: Invalid config key 'unknown_param'
       (not defined in manifest user_config)

[WARN] Extension 'api-client' disabled: Invalid value for 'timeout'.
       Expected number (1-300), got string "invalid"

[WARN] Extension 'data-processor' disabled: Missing required config 'api_key'
```

## Example: Complete Flow

### manifest.json in file-system-tools.dxt:
```json
{
  "dxt_version": "0.1",
  "name": "file-system-tools",
  "version": "1.0.0",
  "server": {
    "type": "node",
    "entry_point": "server.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server.js"],
      "env": {
        "ALLOWED_DIRECTORIES": "${user_config.allowed_directories}",
        "MAX_FILE_SIZE": "${user_config.max_file_size}"
      }
    }
  },
  "user_config": {
    "allowed_directories": {
      "type": "directory",
      "title": "Allowed Directories",
      "description": "Directories the server can access",
      "multiple": true,
      "required": true,
      "default": ["${HOME}/Desktop"]
    },
    "max_file_size": {
      "type": "number",
      "title": "Maximum File Size (MB)",
      "description": "Maximum file size to process",
      "default": 10,
      "min": 1,
      "max": 100
    }
  }
}
```

### User's config.json:
```json
{
  "extensions": {
    "settings": {
      "file-system-tools": {
        "isEnabled": true,
        "userConfig": {
          "allowed_directories": [
            "/Users/brian/workspace",
            "/Users/brian/Documents"
          ],
          "max_file_size": 50
        }
      },
      "api-client": {
        "isEnabled": true,
        "userConfig": {
          "invalid_key": "this will cause warning"
        }
      }
    }
  }
}
```

### Directory Structure:
```
extensions/
├── file-system-tools.dxt
├── api-client.dxt
└── installed/
    ├── file-system-tools/    # Matches settings key
    │   ├── manifest.json
    │   └── server.js
    └── api-client/           # Matches settings key
        ├── manifest.json
        └── server.js
```

## Validation Rules

### 1. Type Validation
- `string`: Must be string
- `number`: Must be number, check min/max if specified
- `boolean`: Must be true/false
- `directory`: Must be string, optionally check existence
- `file`: Must be string path

### 2. Required Fields
- If `required: true` and no value provided → disable extension
- If `required: false` and no value → use default

### 3. Multiple Values
- If `multiple: true`, expect array
- If `multiple: false`, expect single value

## CLI Commands

```bash
# List extensions with validation status
hypertool extensions list
# Output:
# ✓ file-system-tools [enabled] - File system operations
# ✗ api-client [disabled] - API client tools
#   Reason: Invalid config key 'invalid_key'

# Show configuration requirements
hypertool extensions config file-system-tools
# Output:
# Configuration for file-system-tools:
#   allowed_directories (required): Directories the server can access
#     Type: directory (multiple)
#     Current: ["/Users/brian/workspace", "/Users/brian/Documents"]
#   max_file_size: Maximum file size to process
#     Type: number (1-100)
#     Current: 50

# Install extension
hypertool extensions install ./my-extension.dxt

# Refresh/re-unpack all extensions
hypertool extensions refresh
```

## Benefits
- **Clear naming convention**: filename without extension = settings key = installed folder
- **Strict validation**: Extensions with invalid settings are disabled with clear warnings
- **User-friendly**: Clear error messages explain what's wrong
- **Safe**: Invalid extensions don't run, preventing runtime errors
- **Manifest-driven**: All configuration requirements come from the extension itself

This approach ensures extensions only run with valid configurations while providing clear feedback about configuration issues.
