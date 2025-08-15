# TASK-001: Create ConfigurationToolsManager

## Task Overview
**Priority**: P0 (Blocking)
**Estimated Effort**: 2 days
**Dependencies**: None
**Status**: Not Started

## Description
Create a new ConfigurationToolsManager class that manages all configuration-related tools, parallel to the existing ToolsetManager.

## Acceptance Criteria
- [ ] ConfigurationToolsManager class created at `src/config-tools/manager.ts`
- [ ] Implements `getMcpTools()` method that returns configuration tools
- [ ] Registers all existing configuration tool modules
- [ ] Includes type definitions for dependencies
- [ ] Unit tests written with >80% coverage

## Technical Details

### Implementation Steps
1. Create directory structure: `src/config-tools/`
2. Create `manager.ts` with ConfigurationToolsManager class
3. Create `types.ts` with necessary interfaces
4. Import and register existing tool modules from `src/server/tools/`
5. Implement tool filtering logic for configuration mode

### Files to Create
- `src/config-tools/manager.ts`
- `src/config-tools/types.ts`
- `src/config-tools/manager.test.ts`

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
- Unit tests for ConfigurationToolsManager initialization
- Tests for getMcpTools() method
- Tests for tool registration
- Tests for error handling

## Notes
This is the foundational component that will manage all configuration tools separately from operational tools.