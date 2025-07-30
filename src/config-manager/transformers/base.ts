/**
 * Base transformer for standard MCP configuration format
 */

import { ConfigTransformer, MCPConfig, ValidationResult } from '../types/index.js';
import { ClaudeCodeTransformer } from './claude-code.js';

/**
 * Base transformer for applications using standard mcpServers format
 */
export class StandardTransformer implements ConfigTransformer {
  /**
   * Convert from standard format to standard format (pass-through)
   */
  toStandard(appConfig: any): MCPConfig {
    // If it already has mcpServers, return as-is
    if (appConfig.mcpServers && typeof appConfig.mcpServers === 'object') {
      return {
        mcpServers: appConfig.mcpServers,
        _metadata: appConfig._metadata
      };
    }
    
    // If it's a bare object of servers, wrap it
    if (typeof appConfig === 'object' && !Array.isArray(appConfig)) {
      return {
        mcpServers: appConfig
      };
    }
    
    // Otherwise return empty config
    return {
      mcpServers: {}
    };
  }
  
  /**
   * Convert from standard format to standard format (pass-through)
   */
  fromStandard(standardConfig: MCPConfig): any {
    return standardConfig;
  }
  
  /**
   * Validate standard MCP configuration format
   */
  validate(config: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check if config is an object
    if (typeof config !== 'object' || config === null) {
      errors.push('Configuration must be an object');
      return { valid: false, errors };
    }
    
    // Check if mcpServers exists and is an object
    if (!config.mcpServers) {
      warnings.push('Configuration does not contain mcpServers field');
    } else if (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
      errors.push('mcpServers must be an object');
    } else {
      // Validate each server
      for (const [name, server] of Object.entries(config.mcpServers)) {
        if (typeof server !== 'object' || server === null) {
          errors.push(`Server "${name}" must be an object`);
          continue;
        }
        
        const serverConfig = server as any;
        
        // Check required fields
        if (!serverConfig.type) {
          errors.push(`Server "${name}" missing required field: type`);
        } else if (!['stdio', 'http', 'websocket', 'sse'].includes(serverConfig.type)) {
          errors.push(`Server "${name}" has invalid type: ${serverConfig.type}`);
        }
        
        // Check command/url based on transport type
        if (serverConfig.type === 'stdio') {
          if (!serverConfig.command) {
            errors.push(`Server "${name}" with type 'stdio' missing required field: command`);
          }
        } else if (['http', 'sse', 'websocket'].includes(serverConfig.type)) {
          if (!serverConfig.url) {
            errors.push(`Server "${name}" with type '${serverConfig.type}' missing required field: url`);
          }
          if (serverConfig.command) {
            warnings.push(`Server "${name}" with type '${serverConfig.type}' should use 'url' instead of 'command'`);
          }
        }
        
        // Check optional fields
        if (serverConfig.args && !Array.isArray(serverConfig.args)) {
          errors.push(`Server "${name}" args must be an array`);
        }
        
        if (serverConfig.env && typeof serverConfig.env !== 'object') {
          errors.push(`Server "${name}" env must be an object`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }
}

/**
 * Registry of available transformers
 */
export class TransformerRegistry {
  private static transformers: Map<string, ConfigTransformer> = new Map([
    ['standard', new StandardTransformer()],
    ['claude-code', new ClaudeCodeTransformer()]
  ]);
  
  /**
   * Get a transformer by name
   */
  static getTransformer(name: string): ConfigTransformer {
    const transformer = this.transformers.get(name);
    if (!transformer) {
      // Default to standard transformer
      return this.transformers.get('standard')!;
    }
    return transformer;
  }
  
  /**
   * Register a custom transformer
   */
  static registerTransformer(name: string, transformer: ConfigTransformer): void {
    this.transformers.set(name, transformer);
  }
}