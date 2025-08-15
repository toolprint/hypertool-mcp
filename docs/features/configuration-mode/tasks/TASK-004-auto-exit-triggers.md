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
1. Modify `equip-toolset` tool handler to trigger mode exit
2. Modify `build-toolset` tool handler to check autoEquip flag
3. Create helper method in server for mode transitions
4. Ensure proper event handling and notifications

### Files to Modify
- `src/server/tools/equip-toolset.ts`
- `src/server/tools/build-toolset.ts`
- `src/server/enhanced.ts`

### Implementation Pattern

#### In equip-toolset.ts
```typescript
const result = await deps.toolsetManager.equipToolset(args.name);
if (result.success && deps.server.isInConfigurationMode()) {
  await deps.server.exitConfigurationMode();
}
```

#### In build-toolset.ts
```typescript
const result = await deps.toolsetManager.buildToolset(config);
if (result.success && args.autoEquip && deps.server.isInConfigurationMode()) {
  await deps.server.exitConfigurationMode();
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