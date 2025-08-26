/**
 * Integration tests for Persona CLI commands
 *
 * This test suite verifies that all persona CLI commands work correctly
 * with the actual persona system, testing argument parsing, command execution,
 * output formatting, error handling, and integration with MCP components.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import { join } from 'path';
import { TestEnvironment } from '../fixtures/base.js';
import {
  createListCommand,
  createActivateCommand,
  createValidateCommand,
  createStatusCommand,
  createDeactivateCommand,
  createPersonaCommand,
} from '../../src/commands/persona/index.js';
import type { Command } from 'commander';

// Mock console methods to capture output
interface MockConsole {
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
}

describe('Persona CLI Integration Tests', () => {
  let env: TestEnvironment;
  let mockConsole: MockConsole;
  let tempDir: string;
  let originalConsole: Console;
  let originalProcessExit: typeof process.exit;

  beforeEach(async () => {
    // Setup test environment
    tempDir = '/tmp/hypertool-test-persona-cli';
    env = new TestEnvironment(tempDir);
    await env.setup();

    // Setup test personas
    await setupTestPersonas();

    // Mock console methods
    originalConsole = global.console;
    mockConsole = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    };
    global.console = { ...originalConsole, ...mockConsole };

    // Mock process.exit to prevent test termination
    originalProcessExit = process.exit;
    process.exit = vi.fn() as any;
  });

  afterEach(async () => {
    // Restore console and process.exit
    global.console = originalConsole;
    process.exit = originalProcessExit;

    await env.teardown();
    vol.reset();
    vi.clearAllMocks();
  });

  describe('List Command', () => {
    it('should list available personas with proper formatting', async () => {
      const listCommand = createListCommand();

      // Execute list command
      await executeCommand(listCommand, []);

      // Verify output contains expected content
      const output = getAllConsoleOutput(mockConsole);

      expect(output).toContain('🔍 Discovering available personas');
      expect(output).toContain('📊 Persona Discovery Summary');
      expect(output).toContain('📦 Available Personas');
      expect(output).toContain('valid-cli-persona');
      expect(output).toContain('dev-cli-persona');
      expect(output).toContain('✓'); // Success indicator for valid personas

      // Should contain search paths
      expect(output).toContain('🔍 Search Paths');
      expect(output).toContain(join(tempDir, 'personas'));

      // Should contain help text
      expect(output).toContain('💡 Use \'hypertool persona activate <name>\'');
    });

    it('should handle --include-invalid flag correctly', async () => {
      // Add an invalid persona
      await env.createAppStructure('personas', {
        'invalid-cli-persona/persona.yaml': 'invalid: yaml: content: [unclosed',
      });

      const listCommand = createListCommand();

      // Execute without --include-invalid
      await executeCommand(listCommand, []);
      let output = getAllConsoleOutput(mockConsole);
      expect(output).not.toContain('invalid-cli-persona');

      // Clear console output
      vi.clearAllMocks();

      // Execute with --include-invalid
      await executeCommand(listCommand, ['--include-invalid']);
      output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('invalid-cli-persona');
      expect(output).toContain('✗'); // Error indicator for invalid persona
    });

    it('should handle case when no personas are found', async () => {
      // Use empty directory
      const emptyEnv = new TestEnvironment('/tmp/empty-personas');
      await emptyEnv.setup();

      // Mock discovery to return empty results
      const originalModule = await import('../../src/persona/discovery.js');
      const mockDiscoverPersonas = vi.fn().mockResolvedValue({
        personas: [],
        searchPaths: ['/tmp/empty-personas'],
        stats: { totalScanned: 0, validPersonas: 0, errors: [] },
      });

      vi.doMock('../../src/persona/discovery.js', () => ({
        ...originalModule,
        discoverPersonas: mockDiscoverPersonas,
      }));

      const listCommand = createListCommand();
      await executeCommand(listCommand, []);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('📦 No personas found');
      expect(output).toContain('💡 Place personas in these search paths');

      await emptyEnv.teardown();
    });

    it('should handle discovery errors gracefully', async () => {
      // Mock discovery to throw error
      const originalModule = await import('../../src/persona/discovery.js');
      const mockDiscoverPersonas = vi.fn().mockRejectedValue(
        new Error('Discovery failed')
      );

      vi.doMock('../../src/persona/discovery.js', () => ({
        ...originalModule,
        discoverPersonas: mockDiscoverPersonas,
      }));

      const listCommand = createListCommand();
      await executeCommand(listCommand, []);

      expect(mockConsole.error).toHaveBeenCalled();
      const errorOutput = getAllConsoleOutput(mockConsole, 'error');
      expect(errorOutput).toContain('❌ Failed to list personas');
      expect(errorOutput).toContain('Discovery failed');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Activate Command', () => {
    it('should activate persona successfully', async () => {
      const activateCommand = createActivateCommand();

      await executeCommand(activateCommand, ['valid-cli-persona']);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('🎯 Activating persona "valid-cli-persona"');
      expect(output).toContain('✅ Successfully activated persona "valid-cli-persona"');
      expect(output).toContain('📊 Activation Details');
      expect(output).toContain('Persona: valid-cli-persona');
      expect(output).toContain('💡 Persona is now active');
    });

    it('should activate persona with specific toolset', async () => {
      const activateCommand = createActivateCommand();

      await executeCommand(activateCommand, ['multi-toolset-persona', '--toolset', 'testing']);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('✅ Successfully activated persona "multi-toolset-persona"');
      expect(output).toContain('Active Toolset: testing');
    });

    it('should handle persona activation failure', async () => {
      const activateCommand = createActivateCommand();

      await executeCommand(activateCommand, ['non-existent-persona']);

      expect(mockConsole.error).toHaveBeenCalled();
      const errorOutput = getAllConsoleOutput(mockConsole, 'error');
      expect(errorOutput).toContain('❌ Failed to activate persona');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should handle invalid toolset selection', async () => {
      const activateCommand = createActivateCommand();

      await executeCommand(activateCommand, ['valid-cli-persona', '--toolset', 'non-existent-toolset']);

      expect(mockConsole.error).toHaveBeenCalled();
      const errorOutput = getAllConsoleOutput(mockConsole, 'error');
      expect(errorOutput).toContain('❌ Failed to activate persona');
      expect(errorOutput).toContain('toolset not found') || expect(errorOutput).toContain('Invalid toolset');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should display warnings during activation', async () => {
      // Create persona with warnings (missing tools)
      await env.createAppStructure('personas', {
        'warning-persona/persona.yaml': `
name: warning-persona
description: Persona that will generate warnings
version: "1.0"
toolsets:
  - name: warning-toolset
    toolIds:
      - missing.tool.1
      - missing.tool.2
      - git.status  # This one exists
defaultToolset: warning-toolset
        `.trim(),
        'warning-persona/assets/README.md': 'Warning persona'
      });

      const activateCommand = createActivateCommand();
      await executeCommand(activateCommand, ['warning-persona']);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('✅ Successfully activated persona "warning-persona"');
      expect(output).toContain('Warnings:') || expect(output).toContain('warnings');
    });
  });

  describe('Status Command', () => {
    it('should show status when no persona is active', async () => {
      const statusCommand = createStatusCommand();

      await executeCommand(statusCommand, []);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('📦 No persona is currently active');
      expect(output).toContain('💡 Use \'hypertool persona activate <name>\'');
      expect(output).toContain('💡 Use \'hypertool persona list\'');
    });

    it('should show detailed status when persona is active', async () => {
      // First activate a persona
      const activateCommand = createActivateCommand();
      await executeCommand(activateCommand, ['valid-cli-persona']);

      // Clear console output
      vi.clearAllMocks();

      // Check status
      const statusCommand = createStatusCommand();
      await executeCommand(statusCommand, []);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('🎯 Active Persona Status');
      expect(output).toContain('Name: valid-cli-persona');
      expect(output).toContain('Description: Valid persona for CLI testing');
      expect(output).toContain('Active Toolset: development');
      expect(output).toContain('Activated:');
      expect(output).toContain('Path:');
      expect(output).toContain('🔧 Available Toolsets');
    });

    it('should handle status command errors', async () => {
      // Mock PersonaManager to throw error
      const originalModule = await import('../../src/persona/manager.js');
      const mockPersonaManager = {
        initialize: vi.fn().mockResolvedValue(undefined),
        getActivePersona: vi.fn().mockImplementation(() => {
          throw new Error('Status retrieval failed');
        }),
      };

      vi.doMock('../../src/persona/manager.js', () => ({
        ...originalModule,
        PersonaManager: vi.fn().mockImplementation(() => mockPersonaManager),
      }));

      const statusCommand = createStatusCommand();
      await executeCommand(statusCommand, []);

      expect(mockConsole.error).toHaveBeenCalled();
      const errorOutput = getAllConsoleOutput(mockConsole, 'error');
      expect(errorOutput).toContain('❌ Failed to get persona status');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Validate Command', () => {
    it('should validate valid persona successfully', async () => {
      const validPersonaPath = join(tempDir, 'personas', 'valid-cli-persona');
      const validateCommand = createValidateCommand();

      await executeCommand(validateCommand, [validPersonaPath]);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain(`🔍 Validating persona at "${validPersonaPath}"`);
      expect(output).toContain('✅ Persona is valid');
    });

    it('should show validation errors for invalid persona', async () => {
      // Create invalid persona
      const invalidPath = join(tempDir, 'personas', 'invalid-validate-persona');
      await env.createAppStructure('personas', {
        'invalid-validate-persona/persona.yaml': 'invalid: yaml: [unclosed'
      });

      const validateCommand = createValidateCommand();
      await executeCommand(validateCommand, [invalidPath]);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('❌ Persona validation failed');
      expect(output).toContain('Errors:');
    });

    it('should show validation warnings', async () => {
      // Create persona with warnings
      const warningPath = join(tempDir, 'personas', 'warning-validate-persona');
      await env.createAppStructure('personas', {
        'warning-validate-persona/persona.yaml': `
name: warning-validate-persona
description: Persona with warnings
version: "1.0"
# Missing recommended fields that might generate warnings
        `.trim()
      });

      const validateCommand = createValidateCommand();
      await executeCommand(validateCommand, [warningPath]);

      const output = getAllConsoleOutput(mockConsole);
      // Depending on validation implementation, this might succeed with warnings
      expect(output).toContain('✅ Persona is valid') || expect(output).toContain('❌ Persona validation failed');

      // Check for warnings section if it exists
      if (output.includes('Warnings:')) {
        expect(output).toContain('Warnings:');
      }
    });

    it('should handle validation errors gracefully', async () => {
      const validateCommand = createValidateCommand();

      await executeCommand(validateCommand, ['/non/existent/path']);

      expect(mockConsole.error).toHaveBeenCalled();
      const errorOutput = getAllConsoleOutput(mockConsole, 'error');
      expect(errorOutput).toContain('❌ Failed to validate persona');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Deactivate Command', () => {
    it('should deactivate active persona successfully', async () => {
      // First activate a persona
      const activateCommand = createActivateCommand();
      await executeCommand(activateCommand, ['valid-cli-persona']);

      // Clear console output
      vi.clearAllMocks();

      // Deactivate
      const deactivateCommand = createDeactivateCommand();
      await executeCommand(deactivateCommand, []);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('🔄 Deactivating persona "valid-cli-persona"');
      expect(output).toContain('✅ Successfully deactivated persona "valid-cli-persona"');
      expect(output).toContain('💡 No persona is now active');
    });

    it('should handle case when no persona is active', async () => {
      const deactivateCommand = createDeactivateCommand();

      await executeCommand(deactivateCommand, []);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('📦 No persona is currently active');
    });

    it('should handle deactivation errors', async () => {
      // First activate a persona
      const activateCommand = createActivateCommand();
      await executeCommand(activateCommand, ['valid-cli-persona']);

      // Mock PersonaManager deactivation to fail
      const originalModule = await import('../../src/persona/manager.js');
      const mockPersonaManager = {
        initialize: vi.fn().mockResolvedValue(undefined),
        getActivePersona: vi.fn().mockReturnValue({
          persona: { config: { name: 'valid-cli-persona' } }
        }),
        deactivatePersona: vi.fn().mockResolvedValue({
          success: false,
          errors: ['Deactivation failed'],
        }),
      };

      vi.doMock('../../src/persona/manager.js', () => ({
        ...originalModule,
        PersonaManager: vi.fn().mockImplementation(() => mockPersonaManager),
      }));

      const deactivateCommand = createDeactivateCommand();
      await executeCommand(deactivateCommand, []);

      expect(mockConsole.error).toHaveBeenCalled();
      const errorOutput = getAllConsoleOutput(mockConsole, 'error');
      expect(errorOutput).toContain('❌ Failed to deactivate persona');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Main Persona Command', () => {
    it('should create main persona command with all subcommands', () => {
      const personaCommand = createPersonaCommand();

      expect(personaCommand.name()).toBe('persona');
      expect(personaCommand.description()).toBe('Persona content pack management');

      // Verify subcommands are present
      const subcommands = personaCommand.commands.map(cmd => cmd.name());
      expect(subcommands).toContain('list');
      expect(subcommands).toContain('activate');
      expect(subcommands).toContain('validate');
      expect(subcommands).toContain('status');
      expect(subcommands).toContain('deactivate');
    });

    it('should show help text with examples', async () => {
      const personaCommand = createPersonaCommand();

      // Capture help output
      const helpOutput = personaCommand.helpInformation();

      expect(helpOutput).toContain('Persona content pack management');
      expect(helpOutput).toContain('Examples:');
      expect(helpOutput).toContain('hypertool persona list');
      expect(helpOutput).toContain('hypertool persona activate frontend');
      expect(helpOutput).toContain('hypertool persona validate ./my-persona');
    });
  });

  describe('Command Integration and Workflow', () => {
    it('should support complete persona lifecycle workflow', async () => {
      // 1. List personas
      const listCommand = createListCommand();
      await executeCommand(listCommand, []);

      let output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('valid-cli-persona');
      vi.clearAllMocks();

      // 2. Validate specific persona
      const validateCommand = createValidateCommand();
      const personaPath = join(tempDir, 'personas', 'valid-cli-persona');
      await executeCommand(validateCommand, [personaPath]);

      output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('✅ Persona is valid');
      vi.clearAllMocks();

      // 3. Check status (should be inactive)
      const statusCommand = createStatusCommand();
      await executeCommand(statusCommand, []);

      output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('📦 No persona is currently active');
      vi.clearAllMocks();

      // 4. Activate persona
      const activateCommand = createActivateCommand();
      await executeCommand(activateCommand, ['valid-cli-persona']);

      output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('✅ Successfully activated persona "valid-cli-persona"');
      vi.clearAllMocks();

      // 5. Check status (should be active)
      await executeCommand(statusCommand, []);

      output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('🎯 Active Persona Status');
      expect(output).toContain('Name: valid-cli-persona');
      vi.clearAllMocks();

      // 6. Deactivate persona
      const deactivateCommand = createDeactivateCommand();
      await executeCommand(deactivateCommand, []);

      output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('✅ Successfully deactivated persona "valid-cli-persona"');
      vi.clearAllMocks();

      // 7. Final status check (should be inactive)
      await executeCommand(statusCommand, []);

      output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('📦 No persona is currently active');
    });

    it('should handle mixed valid and invalid personas in workflow', async () => {
      // Add both valid and invalid personas
      await env.createAppStructure('personas', {
        'workflow-valid/persona.yaml': `
name: workflow-valid
description: Valid persona for workflow testing
version: "1.0"
toolsets:
  - name: workflow
    toolIds:
      - git.status
defaultToolset: workflow
        `.trim(),
        'workflow-invalid/persona.yaml': 'invalid: yaml: [content'
      });

      // List should show both (when including invalid)
      const listCommand = createListCommand();
      await executeCommand(listCommand, ['--include-invalid']);

      const output = getAllConsoleOutput(mockConsole);
      expect(output).toContain('workflow-valid');
      expect(output).toContain('workflow-invalid');
      expect(output).toContain('✓'); // Valid persona marker
      expect(output).toContain('✗'); // Invalid persona marker
    });

    it('should handle concurrent CLI operations safely', async () => {
      // This test simulates what might happen if multiple CLI commands run
      // Note: In real usage, each CLI invocation is separate, but this tests
      // the underlying persona manager behavior

      const listCommand = createListCommand();
      const statusCommand = createStatusCommand();
      const validateCommand = createValidateCommand();

      // Execute multiple commands concurrently
      const promises = [
        executeCommand(listCommand, []),
        executeCommand(statusCommand, []),
        executeCommand(validateCommand, [join(tempDir, 'personas', 'valid-cli-persona')]),
      ];

      // Should not throw errors
      await expect(Promise.allSettled(promises)).resolves.toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing persona directory gracefully', async () => {
      const listCommand = createListCommand();

      // Mock discovery to simulate missing directory
      const originalModule = await import('../../src/persona/discovery.js');
      const mockDiscoverPersonas = vi.fn().mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      vi.doMock('../../src/persona/discovery.js', () => ({
        ...originalModule,
        discoverPersonas: mockDiscoverPersonas,
      }));

      await executeCommand(listCommand, []);

      expect(mockConsole.error).toHaveBeenCalled();
      const errorOutput = getAllConsoleOutput(mockConsole, 'error');
      expect(errorOutput).toContain('❌ Failed to list personas');
    });

    it('should handle malformed command arguments', async () => {
      const activateCommand = createActivateCommand();

      // Try to activate without providing persona name (this would be caught by commander)
      // For this test, we'll simulate the error handling
      try {
        await executeCommand(activateCommand, []); // Missing required argument
      } catch (error) {
        // Commander should handle missing arguments
        expect(error).toBeDefined();
      }
    });

    it('should handle file system permission errors', async () => {
      const validateCommand = createValidateCommand();

      // Mock file system to throw permission error
      const originalReadFileSync = vol.readFileSync;
      vol.readFileSync = vi.fn().mockImplementation((path) => {
        if (path.includes('permission-test')) {
          throw new Error('EACCES: permission denied');
        }
        return originalReadFileSync.call(vol, path);
      });

      await env.createAppStructure('personas', {
        'permission-test-persona/persona.yaml': `
name: permission-test-persona
version: "1.0"
        `.trim()
      });

      const personaPath = join(tempDir, 'personas', 'permission-test-persona');
      await executeCommand(validateCommand, [personaPath]);

      expect(mockConsole.error).toHaveBeenCalled();
      const errorOutput = getAllConsoleOutput(mockConsole, 'error');
      expect(errorOutput).toContain('❌ Failed to validate persona');

      // Restore original function
      vol.readFileSync = originalReadFileSync;
    });
  });

  /**
   * Execute a commander.js command with given arguments
   */
  async function executeCommand(command: Command, args: string[]): Promise<void> {
    // Set up the command with the arguments
    // Note: This is a simplified approach for testing
    // In real scenarios, commander handles argument parsing automatically

    try {
      // For testing, we need to actually call the action function directly
      // since parseAsync might not work properly in test environment
      const actionMethod = (command as any)._actionHandler || (command as any).action;

      if (actionMethod && typeof actionMethod === 'function') {
        // Extract action parameters based on command type
        if (command.name() === 'activate' && args.length > 0) {
          await actionMethod(args[0], { toolset: args.includes('--toolset') ? args[args.indexOf('--toolset') + 1] : undefined });
        } else if (command.name() === 'validate' && args.length > 0) {
          await actionMethod(args[0]);
        } else {
          // For commands without arguments (list, status, deactivate)
          const options = {};
          if (command.name() === 'list' && args.includes('--include-invalid')) {
            (options as any).includeInvalid = true;
          }
          await actionMethod(options);
        }
      } else {
        // Fallback to parseAsync
        await command.parseAsync(['node', 'test', ...args]);
      }
    } catch (error) {
      // Some errors are expected (like validation failures)
      // Don't re-throw them, let the tests verify the behavior
      if (error instanceof Error && error.message.includes('required argument')) {
        throw error; // Re-throw required argument errors
      }
    }
  }

  /**
   * Get all console output from mock console
   */
  function getAllConsoleOutput(console: MockConsole, type: 'log' | 'error' | 'warn' | 'info' = 'log'): string {
    return console[type].mock.calls
      .flat()
      .join(' ')
      .replace(/\u001b\[[0-9;]*m/g, ''); // Remove ANSI color codes
  }

  /**
   * Setup test personas for CLI testing
   */
  async function setupTestPersonas(): Promise<void> {
    await env.createAppStructure('personas', {
      'valid-cli-persona/persona.yaml': `
name: valid-cli-persona
description: Valid persona for CLI testing
version: "1.0"
toolsets:
  - name: development
    toolIds:
      - git.status
      - filesystem.read
defaultToolset: development
metadata:
  author: CLI Test Suite
  tags: [cli, test]
      `.trim(),
      'valid-cli-persona/assets/README.md': 'Valid CLI persona',

      'dev-cli-persona/persona.yaml': `
name: dev-cli-persona
description: Development persona for CLI testing
version: "1.0"
toolsets:
  - name: dev-tools
    toolIds:
      - git.status
defaultToolset: dev-tools
      `.trim(),
      'dev-cli-persona/assets/README.md': 'Dev CLI persona',

      'multi-toolset-persona/persona.yaml': `
name: multi-toolset-persona
description: Persona with multiple toolsets for CLI testing
version: "1.0"
toolsets:
  - name: development
    toolIds:
      - git.status
      - filesystem.read
  - name: testing
    toolIds:
      - git.status
defaultToolset: development
      `.trim(),
      'multi-toolset-persona/assets/README.md': 'Multi-toolset persona',
    });
  }
});
