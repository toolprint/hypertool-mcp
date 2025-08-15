# TASK-003: Integrate Mode Management in EnhancedMCPServer

## Task Overview
**Priority**: P0 (Critical)
**Estimated Effort**: 2 days
**Dependencies**: TASK-001, TASK-002
**Status**: Not Started

## Description
Modify the EnhancedMCPServer to support configuration mode, including mode state management, tool routing, and initialization logic.

## Acceptance Criteria
- [ ] Add `configurationMode` state property to server
- [ ] Add `configToolsManager` instance to server
- [ ] Modify `listTools()` to check mode and return appropriate tools
- [ ] Modify `callTool()` to route based on mode
- [ ] Implement initialization logic (start in config mode if no toolset)
- [ ] Ensure `tools_changed` notifications on mode changes
- [ ] Integration tests pass

## Technical Details

### Implementation Steps
1. Add mode state property to EnhancedMCPServer
2. Instantiate ConfigurationToolsManager in server initialization
3. Modify tool listing logic to check mode
4. Modify tool calling logic to route to correct manager
5. Add initialization logic to determine starting mode
6. Wire up mode change event handling

### Files to Modify
- `src/server/enhanced.ts`
- `src/server/enhanced.test.ts`

### Key Changes

#### Server Properties
```typescript
private configurationMode: boolean = false;
private configToolsManager: ConfigurationToolsManager;
```

#### listTools() Method
```typescript
listTools() {
  if (this.configurationMode) {
    return this.configToolsManager.getMcpTools();
  } else {
    const tools = this.toolsetManager.getMcpTools();
    // Add enter-configuration-mode tool
    return [...tools, enterConfigModeToolDefinition];
  }
}
```

#### Initialization Logic
```typescript
// In server initialization
const hasEquippedToolset = await this.toolsetManager.hasActiveToolset();
this.configurationMode = !hasEquippedToolset;
```

## Testing Requirements
- Test mode initialization logic
- Test tool listing in both modes
- Test tool routing in both modes
- Test mode transitions
- Test notifications on mode changes
- Integration tests with real tool calls

## Notes
This is the core integration that ties everything together. Must ensure backward compatibility when feature flag is disabled.