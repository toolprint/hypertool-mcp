/**
 * Transformer for Claude Code configuration format
 */

import { ConfigTransformer, MCPConfig, ValidationResult } from '../types/index.js';

export class ClaudeCodeTransformer implements ConfigTransformer {
  /**
   * Convert from Claude Code format to standard MCP format
   */
  toStandard(claudeConfig: any): MCPConfig {
    const mcpConfig: MCPConfig = { mcpServers: {} };

    // Extract MCP servers from all projects
    if (claudeConfig.projects && typeof claudeConfig.projects === 'object') {
      for (const [projectPath, projectConfig] of Object.entries(claudeConfig.projects)) {
        if (projectConfig && typeof projectConfig === 'object') {
          const project = projectConfig as any;
          
          // Extract mcpServers from this project
          if (project.mcpServers && typeof project.mcpServers === 'object') {
            // Add each server with a project-specific prefix to avoid conflicts
            for (const [serverName, serverConfig] of Object.entries(project.mcpServers)) {
              // Create a unique key by combining project path and server name
              const uniqueKey = `${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}_${serverName}`;
              mcpConfig.mcpServers[uniqueKey] = serverConfig as any;
            }
          }
        }
      }
    }

    // Also check if there are any top-level mcpServers (though this seems unlikely)
    if (claudeConfig.mcpServers && typeof claudeConfig.mcpServers === 'object') {
      Object.assign(mcpConfig.mcpServers, claudeConfig.mcpServers);
    }

    return mcpConfig;
  }

  /**
   * Convert from standard MCP format to Claude Code format
   * Note: This is a lossy conversion as we can't reconstruct the full Claude config
   */
  fromStandard(standardConfig: MCPConfig): any {
    return {
      projects: {
        '/workspace': {
          mcpServers: standardConfig.mcpServers || {},
          allowedTools: [],
          history: [],
          mcpContextUris: [],
          enabledMcpjsonServers: [],
          disabledMcpjsonServers: [],
          hasTrustDialogAccepted: false,
          projectOnboardingSeenCount: 0
        }
      }
    };
  }

  /**
   * Validate Claude Code configuration format
   */
  validate(config: any): ValidationResult {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('Configuration must be an object');
      return { valid: false, errors };
    }

    // Claude config can have projects or be empty
    if (config.projects && typeof config.projects !== 'object') {
      errors.push('projects must be an object');
    }

    // Validate each project's mcpServers if present
    if (config.projects) {
      for (const [projectPath, project] of Object.entries(config.projects)) {
        if (project && typeof project === 'object') {
          const proj = project as any;
          if (proj.mcpServers && typeof proj.mcpServers !== 'object') {
            errors.push(`Project ${projectPath}: mcpServers must be an object`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}