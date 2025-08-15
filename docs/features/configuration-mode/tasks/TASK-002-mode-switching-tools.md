# TASK-002: Implement Mode Switching Tools

## Task Overview
**Priority**: P0 (Blocking)
**Estimated Effort**: 1 day
**Dependencies**: TASK-001
**Status**: Not Started

## Description
Create the mode switching tools (`enter-configuration-mode` and `exit-configuration-mode`) that allow transitioning between Normal and Configuration modes.

## Acceptance Criteria
- [ ] `enter-configuration-mode` tool module created
- [ ] `exit-configuration-mode` tool module created
- [ ] Tools properly registered in ConfigurationToolsManager
- [ ] Tools trigger mode state changes in server
- [ ] Tools trigger `tools_changed` notifications
- [ ] Unit tests with >80% coverage

## Technical Details

### Implementation Steps
1. Create tool module for `enter-configuration-mode`
2. Create tool module for `exit-configuration-mode`
3. Define input/output schemas using Zod
4. Implement tool handlers with proper error handling
5. Add tools to ConfigurationToolsManager registration

### Files to Create
- `src/config-tools/tools/enter-configuration-mode.ts`
- `src/config-tools/tools/exit-configuration-mode.ts`
- `src/config-tools/tools/enter-configuration-mode.test.ts`
- `src/config-tools/tools/exit-configuration-mode.test.ts`

### Tool Specifications

#### enter-configuration-mode
```typescript
{
  name: "enter-configuration-mode",
  description: "Switch to configuration mode to manage toolsets and tool annotations. This will show only configuration tools and hide operational tools.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
}
```

#### exit-configuration-mode
```typescript
{
  name: "exit-configuration-mode",
  description: "Exit configuration mode and return to normal operation with your equipped toolset or all available tools.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
}
```

## Testing Requirements
- Test mode switching logic
- Test notification triggering
- Test error handling for invalid mode transitions
- Integration tests with server

## Notes
These tools should only be available in the appropriate mode (enter in Normal, exit in Configuration).