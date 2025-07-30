/**
 * Test assertion helpers
 */

import { vol } from 'memfs';
import { join } from 'path';

/**
 * Assert that a backup was created for a config file
 */
export function assertBackupCreated(configPath: string): void {
  const backupPath = configPath.replace('.json', '.backup.json');
  const exists = vol.existsSync(backupPath);
  
  if (!exists) {
    throw new Error(`Expected backup file at ${backupPath} but it was not found`);
  }
}

/**
 * Assert that a config file contains hypertool reference
 */
export function assertHasHypertoolConfig(configPath: string): void {
  try {
    const content = vol.readFileSync(configPath, 'utf-8') as string;
    const config = JSON.parse(content);
    
    const hasHypertool = Object.keys(config.mcpServers || {}).some(
      key => key.toLowerCase().includes('hypertool')
    );
    
    if (!hasHypertool) {
      throw new Error(`Config at ${configPath} does not contain hypertool server`);
    }
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new Error(`Config file not found at ${configPath}`);
    }
    throw error;
  }
}

/**
 * Assert that hypertool config file exists with migrated servers
 */
export function assertHypertoolConfigExists(
  baseConfigPath: string, 
  expectedServers: string[]
): void {
  // Determine hypertool config path based on app
  let hypertoolPath: string;
  
  if (baseConfigPath.includes('claude_desktop_config.json')) {
    hypertoolPath = baseConfigPath.replace('claude_desktop_config.json', 'mcp.hypertool.json');
  } else if (baseConfigPath.includes('.cursor/mcp.json')) {
    hypertoolPath = baseConfigPath.replace('mcp.json', 'mcp.hypertool.json');
  } else if (baseConfigPath.includes('.mcp.json')) {
    hypertoolPath = baseConfigPath.replace('.mcp.json', 'mcp.hypertool.json');
  } else {
    throw new Error(`Unknown config path pattern: ${baseConfigPath}`);
  }
  
  try {
    const content = vol.readFileSync(hypertoolPath, 'utf-8') as string;
    const config = JSON.parse(content);
    
    const actualServers = Object.keys(config.mcpServers || {});
    const missingServers = expectedServers.filter(s => !actualServers.includes(s));
    
    if (missingServers.length > 0) {
      throw new Error(
        `Hypertool config at ${hypertoolPath} missing servers: ${missingServers.join(', ')}`
      );
    }
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new Error(`Hypertool config file not found at ${hypertoolPath}`);
    }
    throw error;
  }
}

/**
 * Assert that slash commands were installed
 */
export function assertSlashCommandsInstalled(
  location: 'global' | 'local',
  projectPath?: string
): void {
  let commandsPath: string;
  
  if (location === 'global') {
    // Global commands are at ~/.claude/commands/ht/
    commandsPath = join('/tmp/hypertool-test', '.claude/commands/ht');
  } else {
    // Local commands are in project
    if (!projectPath) {
      throw new Error('Project path required for local commands assertion');
    }
    commandsPath = join(projectPath, '.claude/commands/ht');
  }
  
  const expectedFiles = ['list-all-tools.md', 'use-toolset.md'];
  const missingFiles: string[] = [];
  
  for (const file of expectedFiles) {
    const filePath = join(commandsPath, file);
    if (!vol.existsSync(filePath)) {
      missingFiles.push(file);
    }
  }
  
  if (missingFiles.length > 0) {
    throw new Error(
      `Slash commands not installed at ${commandsPath}. Missing: ${missingFiles.join(', ')}`
    );
  }
}

/**
 * Get the content of a config file
 */
export function getConfigContent(path: string): any {
  try {
    const content = vol.readFileSync(path, 'utf-8') as string;
    return JSON.parse(content);
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new Error(`Config file not found at ${path}`);
    }
    throw error;
  }
}

/**
 * Assert that a file exists
 */
export function assertFileExists(path: string): void {
  if (!vol.existsSync(path)) {
    throw new Error(`Expected file at ${path} but it was not found`);
  }
}

/**
 * Assert that a file does not exist
 */
export function assertFileNotExists(path: string): void {
  if (vol.existsSync(path)) {
    throw new Error(`Expected no file at ${path} but it exists`);
  }
}

/**
 * Get all files in the virtual filesystem
 */
export function getAllFiles(): Record<string, string | null> {
  return vol.toJSON() as Record<string, string | null>;
}

/**
 * Pretty print the current filesystem state
 */
export function printFilesystem(): void {
  const files = getAllFiles();
  console.log('Current filesystem state:');
  console.log(JSON.stringify(files, null, 2));
}