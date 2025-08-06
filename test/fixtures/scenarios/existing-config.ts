/**
 * Existing configuration scenario - applications have MCP servers configured
 */

import { TestScenario, TestEnvironment } from '../base.js';
import {
  ClaudeDesktopFixture,
  CursorFixture,
  ClaudeCodeFixture
} from '../applications/index.js';

export class ExistingConfigScenario implements TestScenario {
  name = 'existing-config';
  description = 'Environment with existing MCP configurations in multiple applications';

  constructor(
    private apps: Array<'claude-desktop' | 'cursor' | 'claude-code'> = ['claude-desktop', 'cursor'],
    private projectPath?: string
  ) {}

  async apply(env: TestEnvironment): Promise<void> {
    // Install each requested application with default servers
    for (const app of this.apps) {
      switch (app) {
        case 'claude-desktop':
          await ClaudeDesktopFixture.install(env, {
            withServers: true,
            customServers: {
              'git': {
                type: 'stdio',
                command: 'git-mcp-server',
                args: ['--verbose']
              },
              'filesystem': {
                type: 'stdio',
                command: 'fs-mcp',
                env: {
                  'FS_ROOT': '/Users/test/documents'
                }
              },
              'github': {
                type: 'stdio',
                command: 'github-mcp',
                env: {
                  'GITHUB_TOKEN': 'test-token-123'
                }
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
                command: 'code-search-mcp',
                args: ['--project', '/Users/test/project']
              },
              'database': {
                type: 'stdio',
                command: 'db-mcp',
                env: {
                  'DB_CONNECTION': 'postgresql://localhost/testdb'
                }
              }
            }
          });
          break;

        case 'claude-code':
          const project = this.projectPath || await env.createProjectDir('test-project');
          await ClaudeCodeFixture.install(env, project, {
            withServers: true,
            customServers: {
              'project-context': {
                type: 'stdio',
                command: 'project-context-mcp',
                args: ['--root', '.']
              },
              'docker': {
                type: 'stdio',
                command: 'docker-mcp',
                args: ['--socket', '/var/run/docker.sock']
              }
            }
          });
          break;
      }
    }
  }
}
