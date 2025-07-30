/**
 * Multi-server scenario - complex configurations with many MCP servers
 */

import { TestScenario, TestEnvironment } from '../base.js';
import { 
  ClaudeDesktopFixture, 
  CursorFixture, 
  ClaudeCodeFixture 
} from '../applications/index.js';
import { MCPServerConfig } from '../../../src/config-manager/types/index.js';

export class MultiServerScenario implements TestScenario {
  name = 'multi-server';
  description = 'Environment with multiple MCP servers configured across applications';

  constructor(
    private serverCount: number = 10,
    private includeComplexConfigs: boolean = true
  ) {}

  async apply(env: TestEnvironment): Promise<void> {
    // Claude Desktop with many servers
    const claudeServers: Record<string, MCPServerConfig> = {
      'git': {
        type: 'stdio',
        command: 'git-mcp-server',
        args: ['--verbose', '--auto-commit']
      },
      'filesystem': {
        type: 'stdio',
        command: 'fs-mcp',
        env: {
          'FS_ROOT': '/Users/test/documents',
          'FS_READONLY': 'false'
        }
      },
      'github': {
        type: 'stdio',
        command: 'github-mcp',
        env: {
          'GITHUB_TOKEN': 'ghp_xxxxxxxxxxxxxxxxxxxx',
          'GITHUB_ORG': 'test-org'
        }
      },
      'database': {
        type: 'stdio',
        command: 'postgres-mcp',
        args: ['--host', 'localhost', '--port', '5432'],
        env: {
          'PGUSER': 'testuser',
          'PGPASSWORD': 'testpass',
          'PGDATABASE': 'testdb'
        }
      },
      'docker': {
        type: 'stdio',
        command: 'docker-mcp',
        args: ['--socket', '/var/run/docker.sock', '--verbose']
      }
    };

    // Add more servers if requested
    for (let i = 5; i < this.serverCount; i++) {
      claudeServers[`custom-server-${i}`] = {
        type: 'stdio',
        command: `custom-mcp-${i}`,
        args: [`--id=${i}`, '--mode=production'],
        env: {
          [`CUSTOM_VAR_${i}`]: `value_${i}`
        }
      };
    }

    await ClaudeDesktopFixture.install(env, {
      withServers: true,
      customServers: claudeServers
    });

    // Cursor with different set of servers
    const cursorServers: Record<string, MCPServerConfig> = {
      'code-intelligence': {
        type: 'stdio',
        command: 'code-intel-mcp',
        args: ['--language', 'typescript', '--language', 'python']
      },
      'test-runner': {
        type: 'stdio',
        command: 'test-mcp',
        env: {
          'TEST_FRAMEWORK': 'jest',
          'COVERAGE': 'true'
        }
      },
      'linter': {
        type: 'stdio',
        command: 'eslint-mcp',
        args: ['--fix', '--cache']
      }
    };

    await CursorFixture.install(env, {
      withServers: true,
      customServers: cursorServers
    });

    // Claude Code projects with different configs
    const project1 = await env.createProjectDir('multi-server-project-1');
    await ClaudeCodeFixture.install(env, project1, {
      withServers: true,
      customServers: {
        'project-analyzer': {
          type: 'stdio',
          command: 'analyze-mcp',
          args: ['--deep', '--include-deps']
        },
        'ci-cd': {
          type: 'stdio',
          command: 'cicd-mcp',
          env: {
            'CI_PROVIDER': 'github-actions'
          }
        }
      }
    });

    // Include complex configs if requested
    if (this.includeComplexConfigs) {
      const project2 = await env.createProjectDir('complex-server-project');
      const complexServers: Record<string, MCPServerConfig> = {
        'http-server': {
          type: 'http',
          url: 'http://localhost:3000/mcp',
          headers: {
            'Authorization': 'Bearer test-token',
            'X-API-Version': '2.0'
          }
        },
        'sse-server': {
          type: 'sse',
          url: 'http://localhost:3001/events',
          headers: {
            'X-Client-ID': 'test-client'
          }
        },
        'complex-stdio': {
          type: 'stdio',
          command: '/usr/local/bin/complex-mcp',
          args: [
            '--config', '/etc/complex-mcp/config.yaml',
            '--plugin', 'auth',
            '--plugin', 'cache',
            '--plugin', 'metrics',
            '--log-level', 'debug',
            '--max-connections', '100'
          ],
          env: {
            'NODE_ENV': 'production',
            'LOG_FILE': '/var/log/complex-mcp.log',
            'CACHE_DIR': '/tmp/complex-mcp-cache',
            'METRICS_PORT': '9090'
          }
        }
      };

      await ClaudeCodeFixture.install(env, project2, {
        withServers: true,
        customServers: complexServers
      });
    }
  }
}

/**
 * Duplicate servers scenario - same servers across multiple apps
 */
export class DuplicateServersScenario implements TestScenario {
  name = 'duplicate-servers';
  description = 'Environment where multiple applications use the same MCP servers';

  async apply(env: TestEnvironment): Promise<void> {
    // Common servers used by all apps
    const commonServers: Record<string, MCPServerConfig> = {
      'git': {
        type: 'stdio',
        command: 'git-mcp-server',
        args: ['--verbose']
      },
      'filesystem': {
        type: 'stdio',
        command: 'fs-mcp',
        env: {
          'FS_ROOT': '/Users/shared/documents'
        }
      },
      'shared-db': {
        type: 'stdio',
        command: 'postgres-mcp',
        env: {
          'PGDATABASE': 'shared_db'
        }
      }
    };

    // Install same servers in all applications
    await ClaudeDesktopFixture.install(env, {
      withServers: true,
      customServers: commonServers
    });

    await CursorFixture.install(env, {
      withServers: true,
      customServers: {
        ...commonServers,
        'cursor-specific': {
          type: 'stdio',
          command: 'cursor-mcp'
        }
      }
    });

    const project = await env.createProjectDir('shared-servers-project');
    await ClaudeCodeFixture.install(env, project, {
      withServers: true,
      customServers: {
        ...commonServers,
        'project-specific': {
          type: 'stdio',
          command: 'project-mcp'
        }
      }
    });
  }
}