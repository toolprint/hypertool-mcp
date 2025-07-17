/**
 * Tests for Claude Code integration setup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { installClaudeCodeCommands } from './setup.js';
import { createCommandTemplates } from './utils.js';
import inquirer from 'inquirer';

// Mock file system operations
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      access: vi.fn(),
      copyFile: vi.fn(),
      readFile: vi.fn(),
      rmdir: vi.fn(),
    },
  };
});

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn()
  }
}));

// Mock shared utilities
vi.mock('../shared/mcpSetupUtils.js', () => ({
  fileExists: vi.fn(),
  validateMcpConfiguration: vi.fn(),
  createConfigBackup: vi.fn(),
  migrateToHyperToolConfig: vi.fn(),
  promptForCleanupOptions: vi.fn(),
  updateMcpConfigWithHyperTool: vi.fn(),
  displaySetupSummary: vi.fn(),
  displaySetupPlan: vi.fn(),
}));

// Mock process.cwd
const mockCwd = vi.fn(() => '/test/project');
vi.stubGlobal('process', { 
  cwd: mockCwd,
  exit: vi.fn(),
});

// Mock ora spinner
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

// Mock console methods
const consoleMock = {
  log: vi.fn(),
  error: vi.fn(),
};
vi.stubGlobal('console', consoleMock);

// Mock output utilities
vi.mock('../../logging/output.js', () => ({
  output: {
    displayHeader: vi.fn(),
    displaySpaceBuffer: vi.fn(),
    displaySubHeader: vi.fn(),
    displayInstruction: vi.fn(),
    displayTerminalInstruction: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  }
}));

describe('Claude Code Integration Setup', () => {
  const mockFs = fs as any;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    consoleMock.log.mockClear();
    consoleMock.error.mockClear();
    mockCwd.mockReturnValue('/test/project');
    
    // Setup default mocks for shared utilities
    const { fileExists, validateMcpConfiguration, createConfigBackup, migrateToHyperToolConfig, promptForCleanupOptions, updateMcpConfigWithHyperTool, displaySetupSummary, displaySetupPlan } = await import('../shared/mcpSetupUtils.js');
    
    (fileExists as any).mockResolvedValue(true);
    (validateMcpConfiguration as any).mockResolvedValue(undefined);
    (createConfigBackup as any).mockResolvedValue(undefined);
    (migrateToHyperToolConfig as any).mockResolvedValue(undefined);
    (promptForCleanupOptions as any).mockResolvedValue(true);
    (updateMcpConfigWithHyperTool as any).mockResolvedValue(undefined);
    (displaySetupSummary as any).mockResolvedValue(undefined);
    (displaySetupPlan as any).mockResolvedValue(true);
    
    // Mock inquirer prompt for component selection
    (inquirer.prompt as any).mockResolvedValue({
      components: ['updateMcpConfig', 'installSlashCommands']
    });
    
    // Mock fs.readFile to return valid JSON
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        "test-server": {
          type: "stdio",
          command: "test-command"
        }
      }
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('installClaudeCodeCommands', () => {
    it('should create .claude/commands directory in current project', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.rmdir.mockResolvedValue(undefined);

      await installClaudeCodeCommands();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        join('/test/project', '.claude', 'commands', 'hypertool'),
        { recursive: true }
      );
    });

    it('should generate and write all 5 command files', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.rmdir.mockResolvedValue(undefined);

      await installClaudeCodeCommands();

      expect(mockFs.writeFile).toHaveBeenCalledTimes(5);
      
      const writtenFiles = mockFs.writeFile.mock.calls.map(call => call[0]);
      expect(writtenFiles).toContain(join('/test/project', '.claude', 'commands', 'hypertool', 'list-available-tools.md'));
      expect(writtenFiles).toContain(join('/test/project', '.claude', 'commands', 'hypertool', 'build-toolset.md'));
      expect(writtenFiles).toContain(join('/test/project', '.claude', 'commands', 'hypertool', 'equip-toolset.md'));
      expect(writtenFiles).toContain(join('/test/project', '.claude', 'commands', 'hypertool', 'list-saved-toolsets.md'));
      expect(writtenFiles).toContain(join('/test/project', '.claude', 'commands', 'hypertool', 'get-active-toolset.md'));
    });

    it('should clean and recreate hypertool commands directory', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined); // File exists
      mockFs.copyFile.mockResolvedValue(undefined);
      mockFs.rmdir.mockResolvedValue(undefined);

      await installClaudeCodeCommands();

      expect(mockFs.rmdir).toHaveBeenCalledWith(
        join('/test/project', '.claude', 'commands', 'hypertool'),
        { recursive: true }
      );
      
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        join('/test/project', '.claude', 'commands', 'hypertool'),
        { recursive: true }
      );
    });

    it('should display success message with installation commands', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.rmdir.mockResolvedValue(undefined);

      // Import the output mock
      const { output } = await import('../../logging/output.js');

      await installClaudeCodeCommands();

      expect(output.displayTerminalInstruction).toHaveBeenCalledWith(
        'npx @toolprint/hypertool-mcp install claude-code'
      );
      expect(output.displayTerminalInstruction).toHaveBeenCalledWith(
        'npx @toolprint/hypertool-mcp install cc'
      );
    });

    it('should handle file system errors gracefully', async () => {
      const mockExit = vi.fn(() => {
        throw new Error('process.exit called');
      });
      vi.stubGlobal('process', { 
        cwd: mockCwd,
        exit: mockExit,
      });
      
      // Import the output mock
      const { output } = await import('../../logging/output.js');
      
      // Mock the shared utilities to throw an error
      const { createConfigBackup } = await import('../shared/mcpSetupUtils.js');
      (createConfigBackup as any).mockRejectedValue(new Error('Permission denied'));

      await expect(installClaudeCodeCommands()).rejects.toThrow('process.exit called');
      
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Error: Permission denied')
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('createCommandTemplates', () => {
    it('should generate all required command templates', async () => {
      const templates = await createCommandTemplates();

      expect(Object.keys(templates)).toHaveLength(5);
      expect(templates).toHaveProperty('list-available-tools.md');
      expect(templates).toHaveProperty('build-toolset.md');
      expect(templates).toHaveProperty('equip-toolset.md');
      expect(templates).toHaveProperty('list-saved-toolsets.md');
      expect(templates).toHaveProperty('get-active-toolset.md');
    });

    it('should generate valid markdown content for each template', async () => {
      const templates = await createCommandTemplates();

      Object.entries(templates).forEach(([filename, content]) => {
        // Check for YAML frontmatter
        expect(content).toMatch(/^---\nallowed-tools:/);
        expect(content).toContain('description:');
        expect(content).toMatch(/---\n\n# .+/);
        expect(content).toContain('## Usage');
        expect(content).toContain('## Parameters');
        expect(content).toContain('## Examples');
        expect(content).toContain('## Common Use Cases');
        expect(content).toContain('## Tips');
        expect(content).toContain('## Related Commands');
      });
    });

    it('should include correct MCP tool references', async () => {
      const templates = await createCommandTemplates();

      expect(templates['list-available-tools.md']).toContain('Use the list-available-tools tool');
      expect(templates['build-toolset.md']).toContain('Use the build-toolset tool');
      expect(templates['equip-toolset.md']).toContain('Use the equip-toolset tool');
      expect(templates['list-saved-toolsets.md']).toContain('Use the list-saved-toolsets tool');
      expect(templates['get-active-toolset.md']).toContain('Use the get-active-toolset tool');
    });

    it('should provide usage examples for each command', async () => {
      const templates = await createCommandTemplates();

      Object.values(templates).forEach(content => {
        expect(content).toContain('Use the');
        expect(content).toContain('tool');
        expect(content).toContain('HyperTool');
      });
    });

    it('should include cross-references between related commands', async () => {
      const templates = await createCommandTemplates();

      expect(templates['list-available-tools.md']).toContain('/build-toolset');
      expect(templates['build-toolset.md']).toContain('/list-available-tools');
      expect(templates['equip-toolset.md']).toContain('/list-saved-toolsets');
      expect(templates['list-saved-toolsets.md']).toContain('/equip-toolset');
      expect(templates['get-active-toolset.md']).toContain('/equip-toolset');
    });
  });
});