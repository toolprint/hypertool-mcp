# TASK-001: Create ConfigToolsManager

## Task Overview
**Priority**: P0 (Blocking)
**Estimated Effort**: 2 days
**Dependencies**: None
**Status**: Not Started

## Description
Create a new ConfigToolsManager class that manages all configuration-related tools, parallel to the existing ToolsetManager.

## Acceptance Criteria
- [ ] ToolsProvider interface created in `src/server/types.ts`
- [ ] ConfigToolsManager class created at `src/config-tools/manager.ts`
- [ ] Implements `ToolsProvider` interface
- [ ] Implements `getMcpTools()` method that returns configuration tools
- [ ] Registers all existing configuration tool modules
- [ ] Includes type definitions for dependencies
- [ ] Unit tests written with >80% coverage

## Technical Details

### Implementation Steps
1. Add `ToolsProvider` interface to `src/server/types.ts`
2. Create directory structure: `src/config-tools/`
3. Create `manager.ts` with ConfigToolsManager class implementing ToolsProvider
4. Create `types.ts` with necessary interfaces
5. Import and register existing tool modules from `src/server/tools/`
6. Implement tool filtering logic for configuration mode

### Files to Create/Modify
- `src/server/types.ts` (add ToolsProvider interface)
- `src/config-tools/manager.ts` (new)
- `src/config-tools/types.ts` (new)
- `src/config-tools/manager.test.ts` (new)

### Configuration Tools to Include
- list-available-tools
- build-toolset
- list-saved-toolsets
- equip-toolset
- delete-toolset
- unequip-toolset
- get-active-toolset
- add-tool-annotation

## Testing Requirements
- Unit tests for ConfigToolsManager initialization
- Tests for getMcpTools() method
- Tests for tool registration
- Tests for error handling

## Notes
This is the foundational component that will manage all configuration tools separately from operational tools.