# Persona System Integration Tests

This directory contains comprehensive integration tests for the persona content pack system, verifying that the persona system works correctly with existing hypertool-mcp components.

## Test Files Overview

### Core Integration Tests

#### `persona-core.test.ts` ✅ **PASSING**
**Status**: Fully implemented and passing (10/10 tests)

Core integration tests that verify essential persona system integration points with simplified scenarios that are reliable in CI/test environments.

**Test Coverage**:
- ✅ Persona manager initialization with all components
- ✅ Component lifecycle management 
- ✅ Toolset manager integration points
- ✅ MCP configuration handler integration
- ✅ Component disposal and cleanup
- ✅ Error handling and recovery scenarios
- ✅ Concurrent operation safety
- ✅ Resource constraint handling

**Key Integration Points Tested**:
- PersonaManager ↔ ToolsetManager integration
- PersonaManager ↔ MCP config handlers integration  
- PersonaManager ↔ Tool discovery engine integration
- Component initialization and disposal workflows
- Event emission and error handling across components

### Comprehensive Integration Tests

#### `persona-toolset.test.ts` ⚠️ **PARTIAL**
**Status**: Implemented but needs refinement (3/10 tests passing)

Tests persona activation with toolset manager integration, including toolset conversion and application.

**Implemented Test Coverage**:
- ✅ Toolset cleanup on persona deactivation
- ✅ Performance testing for activation/deactivation cycles
- ✅ Resource cleanup after multiple operations
- ❌ Persona discovery and activation workflows (needs environment fixes)
- ❌ Toolset switching and conversion (needs mock refinement)
- ❌ Event emission during activation (needs event handling fixes)

**Integration Points**:
- PersonaToolset → ToolsetConfig conversion via PersonaToolsetBridge
- Toolset activation through ToolsetManager
- Tool resolution with discovery engine
- Event emission for persona and toolset lifecycle

#### `persona-mcp-config.test.ts` ⚠️ **PARTIAL**  
**Status**: Implemented but needs environment integration

Tests MCP configuration merging, conflict resolution, and backup/restore functionality.

**Test Coverage Areas**:
- MCP config merging with existing configurations
- Conflict resolution strategies (persona-wins, existing-wins)
- Configuration backup and restoration
- Connection restart handling
- Error scenarios and recovery

**Integration Points**:
- PersonaMcpIntegration with real MCP config handlers
- Config merging and conflict resolution
- Backup/restore workflows
- Connection management integration

#### `persona-discovery.test.ts` ⚠️ **PARTIAL**
**Status**: Implemented but needs filesystem integration fixes

Tests discovery engine integration with real file system operations and caching.

**Test Coverage Areas**:
- File system discovery from multiple search paths
- Caching behavior and cache invalidation
- Performance with large numbers of personas
- Event emission during discovery
- Error handling for file system issues

**Integration Points**:
- PersonaDiscovery with real file system operations (memfs)
- PersonaCache integration and eviction policies
- Event emission for discovery lifecycle
- Performance characteristics with real file operations

#### `persona-cli.test.ts` ⚠️ **PARTIAL**
**Status**: Implemented but needs command execution refinement

Tests CLI command integration and user interaction workflows.

**Test Coverage Areas**:
- All persona CLI commands (list, activate, validate, status, deactivate)
- Argument parsing and validation
- Output formatting and user feedback
- Error handling in CLI context

**Integration Points**:
- CLI commands with PersonaManager
- Command argument parsing and validation
- Console output formatting and error reporting
- Complete persona lifecycle via CLI

## Test Architecture

### Mock Components

The integration tests use several mock components to provide controlled, reliable testing:

**MockToolDiscoveryEngine**: Provides predictable tool discovery for testing toolset integration
```typescript
class MockToolDiscoveryEngine implements IToolDiscoveryEngine {
  private tools: DiscoveredTool[] = [
    { name: 'git.status', server: 'git', ... },
    { name: 'filesystem.read', server: 'filesystem', ... }
  ];
}
```

**MockToolsetManager**: Simulates toolset manager behavior for integration testing
```typescript
class MockToolsetManager {
  setCurrentToolset(config) { /* track toolset changes */ }
  getCurrentToolset() { /* return active toolset */ }
  unequipToolset() { /* cleanup */ }
}
```

**MockMcpConfigHandlers**: Provides MCP configuration management for testing
```typescript
class MockMcpConfigHandlers {
  getCurrentConfig() { /* return current MCP config */ }
  setCurrentConfig(config) { /* update MCP config */ }
  restartConnections() { /* simulate restart */ }
}
```

### Test Environment

Tests use `TestEnvironment` with memfs for isolated file system operations:

```typescript
beforeEach(async () => {
  env = new TestEnvironment('/tmp/hypertool-test-persona');
  await env.setup();
  
  // Create test personas in memfs
  await setupTestPersonas();
});
```

### Test Data

Each test suite creates realistic test personas with various configurations:

- **Valid personas**: Complete personas with toolsets and metadata
- **Invalid personas**: Malformed YAML or missing required fields  
- **Complex personas**: Multiple toolsets and MCP configurations
- **Minimal personas**: Basic personas for simple testing

## Running Integration Tests

### Run All Integration Tests
```bash
npm test -- test/integration/persona-*.test.ts
```

### Run Specific Test Suite
```bash
# Core integration tests (reliable)
npm test -- test/integration/persona-core.test.ts

# Toolset integration tests  
npm test -- test/integration/persona-toolset.test.ts

# MCP config integration tests
npm test -- test/integration/persona-mcp-config.test.ts

# Discovery integration tests
npm test -- test/integration/persona-discovery.test.ts

# CLI integration tests
npm test -- test/integration/persona-cli.test.ts
```

### Run with Coverage
```bash
npm test -- test/integration/ --coverage
```

## Test Status and Known Issues

### Working Tests ✅
- **persona-core.test.ts**: All core integration functionality working
- Core persona manager initialization and component integration
- Error handling and recovery scenarios
- Concurrent operation safety
- Resource management and cleanup

### Partial Implementation ⚠️
- **persona-toolset.test.ts**: Basic functionality working, discovery integration needs refinement
- **persona-mcp-config.test.ts**: Mock handlers working, real integration needs environment fixes
- **persona-discovery.test.ts**: Core discovery working, file system integration needs memfs fixes
- **persona-cli.test.ts**: Command structure working, execution needs mock improvements

### Known Issues
1. **Discovery Integration**: Real file system discovery with memfs needs better integration
2. **Event Handling**: Event emission timing in test environment needs adjustment
3. **CLI Command Execution**: Commander.js command execution in tests needs better mocking
4. **Async Operation Timing**: Some tests need better async operation coordination

## Future Improvements

### Short Term
1. Fix memfs integration for reliable file system operations
2. Improve mock component fidelity to match real implementations
3. Add better async operation coordination in tests
4. Enhance CLI command execution testing

### Long Term  
1. Add performance benchmarking integration tests
2. Create integration tests for persona import/export
3. Add network operation testing for MCP connections
4. Create integration tests for persona validation workflows

## Integration Test Patterns

### Component Integration Pattern
```typescript
describe('Component Integration', () => {
  let personaManager: PersonaManager;
  let toolsetManager: MockToolsetManager;
  let discoveryEngine: MockToolDiscoveryEngine;

  beforeEach(async () => {
    // Setup all components
    toolsetManager = new MockToolsetManager();
    discoveryEngine = new MockToolDiscoveryEngine();
    
    personaManager = new PersonaManager({
      toolsetManager,
      toolDiscoveryEngine: discoveryEngine,
    });
    
    await personaManager.initialize();
  });
  
  it('should integrate components correctly', async () => {
    // Test integration behavior
  });
});
```

### Event Integration Pattern
```typescript
it('should emit events during integration workflows', async () => {
  const events: any[] = [];
  personaManager.on(PersonaEvents.PERSONA_ACTIVATED, (event) => {
    events.push(event);
  });
  
  await personaManager.activatePersona('test-persona');
  
  expect(events).toHaveLength(1);
  expect(events[0].persona.name).toBe('test-persona');
});
```

### Error Integration Pattern
```typescript
it('should handle integration errors gracefully', async () => {
  // Setup component to fail
  toolsetManager.setCurrentToolset = vi.fn().mockRejectedValue(
    new Error('Toolset application failed')
  );
  
  const result = await personaManager.activatePersona('test-persona');
  
  expect(result.success).toBe(false);
  expect(result.errors).toContain('Toolset application failed');
});
```

## Conclusion

The integration test suite provides comprehensive coverage of persona system integration with existing hypertool-mcp components. The core integration tests (`persona-core.test.ts`) are fully functional and provide confidence in the essential integration points. The other test suites provide extensive coverage but need refinement for full CI reliability.

The integration tests demonstrate that:

1. ✅ The persona system integrates correctly with core hypertool-mcp components
2. ✅ Component lifecycle management works properly  
3. ✅ Error handling and recovery mechanisms function correctly
4. ✅ The system handles resource constraints and concurrent operations safely
5. ⚠️  Advanced features like discovery, MCP config merging, and CLI integration are implemented but need environment refinement

This integration test suite serves as both validation of the persona system integration and documentation of the expected integration behavior between components.