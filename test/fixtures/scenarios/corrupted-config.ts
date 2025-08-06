/**
 * Corrupted configuration scenario - invalid or malformed configs
 */

import { TestScenario, TestEnvironment } from '../base.js';
import {
  ClaudeDesktopFixture,
  CursorFixture,
  ClaudeCodeFixture
} from '../applications/index.js';

export class CorruptedConfigScenario implements TestScenario {
  name = 'corrupted-config';
  description = 'Environment with corrupted or invalid MCP configurations';

  constructor(
    private corruptedApps: Array<'claude-desktop' | 'cursor' | 'claude-code'> = ['claude-desktop'],
    private validApps: Array<'cursor' | 'claude-code'> = []
  ) {}

  async apply(env: TestEnvironment): Promise<void> {
    // Install corrupted configurations
    for (const app of this.corruptedApps) {
      switch (app) {
        case 'claude-desktop':
          await ClaudeDesktopFixture.installCorrupted(env);
          break;

        case 'cursor':
          await CursorFixture.installCorrupted(env);
          break;

        case 'claude-code':
          const project = await env.createProjectDir('corrupted-project');
          await ClaudeCodeFixture.installCorrupted(env, project);
          break;
      }
    }

    // Install valid configurations for contrast
    for (const app of this.validApps) {
      switch (app) {
        case 'cursor':
          await CursorFixture.install(env, { withServers: true });
          break;

        case 'claude-code':
          const validProject = await env.createProjectDir('valid-project');
          await ClaudeCodeFixture.install(env, validProject, { withServers: true });
          break;
      }
    }
  }
}

/**
 * Edge cases scenario - various problematic configurations
 */
export class EdgeCasesScenario implements TestScenario {
  name = 'edge-cases';
  description = 'Environment with various edge case configurations';

  async apply(env: TestEnvironment): Promise<void> {
    // Claude Desktop with empty mcpServers object
    await env.createAppStructure('claude-desktop', {
      'Library/Application Support/Claude/claude_desktop_config.json': JSON.stringify({
        mcpServers: {}
      }, null, 2)
    });

    // Cursor with backup but no main config
    await env.createAppStructure('cursor', {
      '.cursor/mcp.backup.json': JSON.stringify({
        mcpServers: {
          'old-server': {
            type: 'stdio',
            command: 'old-mcp-server'
          }
        }
      }, null, 2),
      '.cursor/settings.json': '{}'
    });

    // Claude Code with hypertool config but missing main config
    const project = await env.createProjectDir('edge-case-project');
    const relativeProject = project.substring(env.getBaseDir().length + 1);

    await env.createAppStructure('claude-code', {
      [`${relativeProject}/mcp.hypertool.json`]: JSON.stringify({
        mcpServers: {
          'orphaned-server': {
            type: 'stdio',
            command: 'orphaned-mcp'
          }
        }
      }, null, 2),
      [`${relativeProject}/package.json`]: JSON.stringify({
        name: 'edge-case-project'
      }, null, 2)
    });

    // Create a project with very large config
    const largeProject = await env.createProjectDir('large-config-project');
    const largeRelativeProject = largeProject.substring(env.getBaseDir().length + 1);

    const largeServers: Record<string, any> = {};
    for (let i = 0; i < 50; i++) {
      largeServers[`server-${i}`] = {
        type: 'stdio',
        command: `mcp-server-${i}`,
        args: [`--id=${i}`]
      };
    }

    await env.createAppStructure('claude-code', {
      [`${largeRelativeProject}/.mcp.json`]: JSON.stringify({
        mcpServers: largeServers
      }, null, 2)
    });
  }
}
