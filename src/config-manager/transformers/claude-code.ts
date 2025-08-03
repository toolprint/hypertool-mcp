/**
 * Transformer for Claude Code configuration format
 */

import {
  ConfigTransformer,
  MCPConfig,
  ValidationResult,
} from "../types/index.js";

export class ClaudeCodeTransformer implements ConfigTransformer {
  /**
   * Convert from Claude Code format to standard MCP format
   */
  toStandard(claudeConfig: any): MCPConfig {
    const mcpConfig: MCPConfig = { mcpServers: {} };

    // Claude Code now uses root-level mcpServers
    if (
      claudeConfig.mcpServers &&
      typeof claudeConfig.mcpServers === "object"
    ) {
      Object.assign(mcpConfig.mcpServers, claudeConfig.mcpServers);
    }

    return mcpConfig;
  }

  /**
   * Convert from standard MCP format to Claude Code format
   * This preserves the existing Claude Code configuration structure
   */
  fromStandard(standardConfig: MCPConfig, existingConfig?: any): any {
    // If we have an existing config, preserve all non-mcpServers fields
    if (existingConfig) {
      return {
        ...existingConfig,
        mcpServers: standardConfig.mcpServers || {},
      };
    }

    // If no existing config, create minimal structure with mcpServers at root
    return {
      mcpServers: standardConfig.mcpServers || {},
    };
  }

  /**
   * Validate Claude Code configuration format
   */
  validate(config: any): ValidationResult {
    const errors: string[] = [];

    if (!config || typeof config !== "object") {
      errors.push("Configuration must be an object");
      return { valid: false, errors };
    }

    // Claude Code uses root-level mcpServers
    if (config.mcpServers && typeof config.mcpServers !== "object") {
      errors.push("mcpServers must be an object");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
