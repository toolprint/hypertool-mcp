/**
 * Tests for Claude Code integration setup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { installClaudeCodeCommands } from './setup.js';
import { createCommandTemplates } from './utils.js';

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
    },
  };
});

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
    text: '',
  })),
}));

// Mock console methods
const consoleMock = {
  log: vi.fn(),
  error: vi.fn(),
};
vi.stubGlobal('console', consoleMock);

describe('Claude Code Integration Setup', () => {
  const mockFs = fs as any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    consoleMock.log.mockClear();
    consoleMock.error.mockClear();
    mockCwd.mockReturnValue('/test/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('installClaudeCodeCommands', () => {
    it('should create .claude/commands directory in current project', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('File not found'));

      await installClaudeCodeCommands();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        join('/test/project', '.claude', 'commands'),
        { recursive: true }
      );
    });

    it('should generate and write all 5 command files', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('File not found'));

      await installClaudeCodeCommands();

      expect(mockFs.writeFile).toHaveBeenCalledTimes(5);
      
      const writtenFiles = mockFs.writeFile.mock.calls.map(call => call[0]);
      expect(writtenFiles).toContain(join('/test/project', '.claude', 'commands', 'list-available-tools.md'));
      expect(writtenFiles).toContain(join('/test/project', '.claude', 'commands', 'build-toolset.md'));
      expect(writtenFiles).toContain(join('/test/project', '.claude', 'commands', 'equip-toolset.md'));
      expect(writtenFiles).toContain(join('/test/project', '.claude', 'commands', 'list-saved-toolsets.md'));
      expect(writtenFiles).toContain(join('/test/project', '.claude', 'commands', 'get-active-toolset.md'));
    });

    it('should backup existing files before overwriting', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined); // File exists
      mockFs.copyFile.mockResolvedValue(undefined);

      await installClaudeCodeCommands();

      expect(mockFs.copyFile).toHaveBeenCalledTimes(5);
      
      const backupCalls = mockFs.copyFile.mock.calls;
      backupCalls.forEach(call => {
        expect(call[1]).toMatch(/\.backup$/);
      });
    });

    it('should display success message with installation commands', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('File not found'));

      await installClaudeCodeCommands();

      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('✅ Installation Complete!')
      );
      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('npx @toolprint/hypertool-mcp install --claude-code')
      );
      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('npx @toolprint/hypertool-mcp install --cc')
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
      
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(installClaudeCodeCommands()).rejects.toThrow('process.exit called');
      
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Error:'),
        expect.stringContaining('Permission denied')
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
        expect(content).toMatch(/^# .+/);
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
        expect(content).toContain('```');
        expect(content).toContain('Claude:');
        expect(content).toContain('Use the');
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