/**
 * Partial configuration scenario - some apps configured, others not
 */

import { TestScenario, TestEnvironment } from '../base.js';
import {
  ClaudeDesktopFixture,
  CursorFixture,
  ClaudeCodeFixture
} from '../applications/index.js';

export class PartialConfigScenario implements TestScenario {
  name = 'partial-config';
  description = 'Environment where some applications have MCP configs and others do not';

  constructor(
    private configuredApps: Array<'claude-desktop' | 'cursor' | 'claude-code'> = ['claude-desktop'],
    private emptyApps: Array<'cursor' | 'claude-code'> = ['cursor']
  ) {}

  async apply(env: TestEnvironment): Promise<void> {
    // Install configured applications with servers
    for (const app of this.configuredApps) {
      switch (app) {
        case 'claude-desktop':
          await ClaudeDesktopFixture.install(env, {
            withServers: true,
            customServers: {
              'git': {
                type: 'stdio',
                command: 'git-mcp-server'
              }
            }
          });
          break;

        case 'cursor':
          await CursorFixture.install(env, {
            withServers: true,
            customServers: {
              'code-search': {
                type: 'stdio',
                command: 'code-search-mcp'
              }
            }
          });
          break;

        case 'claude-code':
          const project = await env.createProjectDir('configured-project');
          await ClaudeCodeFixture.install(env, project, {
            withServers: true
          });
          break;
      }
    }

    // Install empty applications (no MCP servers)
    for (const app of this.emptyApps) {
      switch (app) {
        case 'cursor':
          await CursorFixture.installEmpty(env);
          break;

        case 'claude-code':
          const emptyProject = await env.createProjectDir('empty-project', false);
          await ClaudeCodeFixture.createEmptyProject(env, emptyProject);
          break;
      }
    }
  }
}

/**
 * Mixed state scenario - some apps with hypertool, some without
 */
export class MixedStateScenario implements TestScenario {
  name = 'mixed-state';
  description = 'Environment where some apps already use HyperTool and others do not';

  async apply(env: TestEnvironment): Promise<void> {
    // Claude Desktop already has HyperTool
    await ClaudeDesktopFixture.installWithHypertool(env, {
      'git': {
        type: 'stdio',
        command: 'git-mcp-server'
      },
      'filesystem': {
        type: 'stdio',
        command: 'fs-mcp'
      }
    });

    // Cursor has regular MCP config (not yet converted)
    await CursorFixture.install(env, {
      withServers: true,
      customServers: {
        'github': {
          type: 'stdio',
          command: 'github-mcp'
        }
      }
    });

    // Claude Code project without any config
    const project = await env.createProjectDir('new-project');
    await ClaudeCodeFixture.createEmptyProject(env, project);
  }
}
