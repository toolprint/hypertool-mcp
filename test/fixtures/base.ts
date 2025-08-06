/**
 * Base test environment for HyperTool MCP tests
 * Provides isolated in-memory filesystem using memfs
 */

import { vol } from 'memfs';
import { join } from 'path';
import { EnvironmentConfig, EnvironmentMode, EnvironmentManager } from '../../src/config/environment.js';
import { ApplicationRegistry } from '../../src/config-manager/types/index.js';

/**
 * Test scenario interface
 */
export interface TestScenario {
  name: string;
  description: string;
  apply(env: TestEnvironment): Promise<void>;
}

/**
 * Mock application structure
 */
export interface MockAppStructure {
  appId: string;
  configPath: string;
  configContent: string;
  additionalFiles?: Record<string, string>;
}

/**
 * Test environment class
 * Manages isolated test environments with memfs
 */
export class TestEnvironment {
  private baseDir: string;
  private config: EnvironmentConfig;
  private envManager: EnvironmentManager;

  constructor(baseDir: string = '/tmp/hypertool-test') {
    this.baseDir = baseDir;
    this.envManager = EnvironmentManager.getInstance();

    // Set test mode
    this.envManager.setMode(EnvironmentMode.TEST, baseDir);
    this.config = this.envManager.getConfig();
  }

  /**
   * Setup test environment
   */
  async setup(scenario?: TestScenario): Promise<void> {
    // Reset memfs
    vol.reset();

    // Create base directory structure using mkdirSync to ensure proper directory creation
    const dirsToCreate = [
      this.config.configRoot,
      join(this.config.configRoot, 'apps'),
      join(this.config.configRoot, 'backups'),
      join(this.config.configRoot, 'cache'),
      join(this.baseDir, '.claude/commands/ht'),
      join(this.baseDir, '.cursor'),
      join(this.baseDir, 'Library/Application Support/Claude')
    ];

    // Create directories explicitly
    for (const dir of dirsToCreate) {
      vol.mkdirSync(dir, { recursive: true });
    }

    // Create default registry
    const defaultRegistry: ApplicationRegistry = {
      version: '1.0.0',
      applications: {
        'claude-desktop': {
          name: 'Claude Desktop',
          enabled: true,
          platforms: {
            darwin: {
              configPath: '~/Library/Application Support/Claude/claude_desktop_config.json',
              format: 'standard'
            },
            win32: {
              configPath: '%APPDATA%\\Claude\\claude_desktop_config.json',
              format: 'standard'
            }
          },
          detection: {
            type: 'directory',
            path: '~/Library/Application Support/Claude'
          }
        },
        'cursor': {
          name: 'Cursor IDE',
          enabled: true,
          platforms: {
            all: {
              configPath: '~/.cursor/mcp.json',
              format: 'standard'
            }
          },
          detection: {
            type: 'directory',
            path: '~/.cursor'
          }
        },
        'claude-code': {
          name: 'Claude Code',
          enabled: true,
          platforms: {
            all: {
              configPath: './.mcp.json',
              format: 'standard'
            }
          },
          detection: {
            type: 'project-local',
            indicator: '.mcp.json'
          }
        }
      }
    };

    // Write default registry
    if (this.config.registryPath) {
      vol.writeFileSync(this.config.registryPath, JSON.stringify(defaultRegistry, null, 2));
    }

    // Create default config.json
    vol.writeFileSync(
      join(this.config.configRoot, 'config.json'),
      JSON.stringify({
        version: '1.0.0',
        applications: {}
      }, null, 2)
    );

    // Apply scenario if provided
    if (scenario) {
      await scenario.apply(this);
    }
  }

  /**
   * Teardown test environment
   */
  async teardown(): Promise<void> {
    vol.reset();
    this.envManager.reset();
  }

  /**
   * Get environment configuration
   */
  getConfig(): EnvironmentConfig {
    return this.config;
  }

  /**
   * Get base directory
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Create application structure
   */
  async createAppStructure(appId: string, files: Record<string, string>): Promise<void> {
    for (const [path, content] of Object.entries(files)) {
      // Convert relative paths to absolute paths under baseDir
      const absolutePath = path.startsWith('/') ? path : join(this.baseDir, path);

      // Ensure parent directory exists
      const parentDir = absolutePath.substring(0, absolutePath.lastIndexOf('/'));
      if (parentDir) {
        vol.mkdirSync(parentDir, { recursive: true });
      }

      // Write the file
      vol.writeFileSync(absolutePath, content);
    }
  }

  /**
   * Create mock application with config
   */
  async createMockApp(structure: MockAppStructure): Promise<void> {
    const files: Record<string, string> = {
      [structure.configPath]: structure.configContent
    };

    if (structure.additionalFiles) {
      Object.assign(files, structure.additionalFiles);
    }

    await this.createAppStructure(structure.appId, files);
  }

  /**
   * Read file from test filesystem
   */
  async readFile(path: string): Promise<string> {
    const absolutePath = path.startsWith('/') ? path : join(this.baseDir, path);
    return vol.readFileSync(absolutePath, 'utf-8') as string;
  }

  /**
   * Check if file exists in test filesystem
   */
  async fileExists(path: string): Promise<boolean> {
    const absolutePath = path.startsWith('/') ? path : join(this.baseDir, path);
    try {
      vol.statSync(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(path: string): Promise<string[]> {
    const absolutePath = path.startsWith('/') ? path : join(this.baseDir, path);
    return vol.readdirSync(absolutePath) as string[];
  }

  /**
   * Get current filesystem state as JSON
   */
  getFilesystemState(): Record<string, string | null> {
    return vol.toJSON() as Record<string, string | null>;
  }

  /**
   * Create a project directory with optional .mcp.json
   */
  async createProjectDir(projectName: string, withMcpConfig: boolean = true): Promise<string> {
    const projectPath = join(this.baseDir, 'projects', projectName);

    vol.mkdirSync(projectPath, { recursive: true });

    if (withMcpConfig) {
      vol.writeFileSync(
        join(projectPath, '.mcp.json'),
        JSON.stringify({
          mcpServers: {}
        }, null, 2)
      );
    }

    // Create .git directory to simulate a project
    vol.mkdirSync(join(projectPath, '.git'), { recursive: true });

    return projectPath;
  }

  /**
   * Simulate OS platform
   */
  setPlatform(platform: NodeJS.Platform): void {
    // This would need to be mocked at a different level
    // For now, we'll store it as metadata that tests can use
    (global as any).__TEST_PLATFORM__ = platform;
  }

  /**
   * Get simulated platform
   */
  getPlatform(): NodeJS.Platform {
    return (global as any).__TEST_PLATFORM__ || process.platform;
  }
}
