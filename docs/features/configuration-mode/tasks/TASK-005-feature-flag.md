# TASK-005: Add Feature Flag Support

## Task Overview
**Priority**: P1 (Important)
**Estimated Effort**: 0.5 days
**Dependencies**: TASK-003
**Status**: Not Started

## Description
Add a feature flag to enable/disable configuration mode for backward compatibility.

## Acceptance Criteria
- [ ] Add `disableConfigurationMode` flag to RuntimeOptions
- [ ] Server respects flag and operates in legacy mode when disabled
- [ ] Default behavior is configuration mode enabled
- [ ] Tests cover both flag states

## Technical Details

### Implementation Steps
1. Add flag to RuntimeOptions interface
2. Check flag in server initialization
3. Bypass mode logic when flag is set
4. Ensure all tools exposed when disabled

### Files to Modify
- `src/types/options.ts` (or equivalent)
- `src/server/enhanced.ts`
- `src/cli.ts` (for CLI flag support)

### Implementation

#### RuntimeOptions Update
```typescript
interface RuntimeOptions {
  // ... existing options
  disableConfigurationMode?: boolean;
}
```

#### Server Logic
```typescript
constructor(options: RuntimeOptions) {
  this.legacyMode = options.disableConfigurationMode || false;
}

listTools() {
  if (this.legacyMode) {
    // Return all tools (current behavior)
    return [
      ...this.toolsetManager.getMcpTools(),
      ...this.getAllConfigurationTools()
    ];
  }
  // Normal mode logic
  if (this.configurationMode) {
    return this.configToolsManager.getMcpTools();
  }
  // ... rest of mode logic
}
```

#### CLI Support
```bash
hypertool-mcp --disable-configuration-mode
```

## Testing Requirements
- Test server behavior with flag enabled
- Test server behavior with flag disabled (default)
- Test that legacy mode exposes all tools
- Test CLI flag parsing

## Notes
This ensures backward compatibility for users who prefer the current behavior.