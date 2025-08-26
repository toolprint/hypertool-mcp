# TASK-005: Add Feature Flag Support

## Task Overview
**Priority**: P1 (Important)
**Estimated Effort**: 0.5 days
**Dependencies**: TASK-003
**Status**: Completed

## Description
Add a feature flag to enable/disable configuration mode for backward compatibility.

## Acceptance Criteria
- [x] Add `enableConfigToolsMenu` flag to Feature Flag Registry
- [x] Server respects flag and operates in legacy mode when disabled
- [x] Default behavior is configuration mode enabled (flag default: true)
- [x] Tests cover both flag states

## Technical Details

### Implementation Steps
1. Add flag to Feature Flag Registry (`flagRegistry.ts`)
2. Add flag checking method to Feature Flag Service
3. Check flag in server initialization
4. Bypass mode logic when flag is disabled
5. Ensure all tools exposed when disabled (legacy mode)

### Files Modified
- `src/config/flagRegistry.ts` - Added flag definition
- `src/config/featureFlagService.ts` - Added checking methods
- `src/server/enhanced.ts` - Integrated flag checking
- `src/server/tools/config-tools/feature-flag.test.ts` - Created tests

### Implementation

#### Feature Flag Registry
```typescript
export const FLAG_REGISTRY = {
  // ... existing flags
  enableConfigToolsMenu: {
    name: "enableConfigToolsMenu",
    description: "Enable configuration tools menu mode (separates config tools from operational tools)",
    defaultValue: true,
    envVar: "HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU",
  },
} as const;
```

#### Feature Flag Service
```typescript
isConfigToolsMenuEnabled(): boolean {
  return this.isFlagEnabled("enableConfigToolsMenu");
}

export async function isConfigToolsMenuEnabledViaService(): Promise<boolean> {
  const service = getFeatureFlagService();
  await service.initialize();
  return service.isConfigToolsMenuEnabled();
}
```

#### Server Logic
```typescript
private configToolsMenuEnabled: boolean = true;

private async initializeConfigurationMode(dependencies: ToolDependencies): Promise<void> {
  // Check if configuration tools menu is enabled via feature flag
  this.configToolsMenuEnabled = await isConfigToolsMenuEnabledViaService();

  if (!this.configToolsMenuEnabled) {
    logger.info('Configuration tools menu disabled - running in legacy mode');
    // Legacy mode: all tools exposed together
    this.configToolsManager = new ConfigToolsManager(dependencies);
    return;
  }
  // Normal configuration mode setup...
}

protected async getAvailableTools(): Promise<Tool[]> {
  if (!this.configToolsMenuEnabled) {
    // Legacy mode: return all tools together
    const tools: Tool[] = [];
    // Add all configuration tools
    if (this.configToolsManager) {
      tools.push(...this.configToolsManager.getMcpTools());
    }
    // Add all toolset tools
    tools.push(...this.toolsetManager.getMcpTools());
    return tools;
  }
  // Normal mode logic...
}
```

#### Environment Variable Control
```bash
# Enable configuration mode (default)
HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=true hypertool-mcp

# Disable configuration mode (legacy behavior)
HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU=false hypertool-mcp
```

## Testing Requirements
- [x] Test server behavior with flag enabled (default)
- [x] Test server behavior with flag disabled
- [x] Test that legacy mode exposes all tools together
- [x] Test environment variable override
- [x] Test convenience function

## Notes
- Feature flag follows existing patterns (environment > config > default)
- Default is true (configuration mode enabled) for better UX
- Legacy mode ensures backward compatibility for users who prefer all tools exposed together
- No CLI flag added (uses environment variable pattern consistent with other feature flags)
