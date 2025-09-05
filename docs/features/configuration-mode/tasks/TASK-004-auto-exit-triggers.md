# TASK-004: Implement Auto-Exit Triggers

## Task Overview
**Priority**: P1 (Important)
**Estimated Effort**: 1 day
**Dependencies**: TASK-003
**Status**: Not Started

## Description
Implement automatic exit from configuration mode when certain actions are taken (equip-toolset success, build-toolset with autoEquip).

## Acceptance Criteria
- [ ] Auto-exit when `equip-toolset` succeeds
- [ ] Auto-exit when `build-toolset` with `autoEquip: true` succeeds
- [ ] Mode transition triggers proper notifications
- [ ] Tests cover all auto-exit scenarios

## Technical Details

### Implementation Steps
1. Add `setModeChangeCallback` method to ToolsetManager
2. Update `equip-toolset` handler to call the callback on success
3. Update `build-toolset` handler to call the callback when autoEquip succeeds
4. Ensure the callback is properly wired in server initialization

### Files to Modify
- `src/server/tools/toolset/manager.ts` - Add callback support
- `src/server/tools/config-tools/tools/equip-toolset.ts`
- `src/server/tools/config-tools/tools/build-toolset.ts`

### Implementation Pattern

#### In ToolsetManager
```typescript
export class ToolsetManager extends EventEmitter implements ToolsProvider {
  private onModeChangeRequest?: () => void;

  setModeChangeCallback(callback: () => void): void {
    this.onModeChangeRequest = callback;
  }

  // In equipToolset method, after successful equip:
  if (result.success && this.onModeChangeRequest) {
    this.onModeChangeRequest();
  }

  // In buildToolset method, after successful build with autoEquip:
  if (result.success && args.autoEquip && this.onModeChangeRequest) {
    this.onModeChangeRequest();
  }
}
```

#### Server Helper Method
```typescript
async exitConfigurationMode(): Promise<void> {
  this.configurationMode = false;
  await this.notifyToolsChanged();
}
```

## Testing Requirements
- Test auto-exit on successful equip-toolset
- Test auto-exit on build-toolset with autoEquip
- Test that failed operations don't trigger auto-exit
- Test notification firing on auto-exit
- Integration tests for full flow

## Notes
Auto-exit should only occur on successful operations. Failed attempts should leave the mode unchanged.
