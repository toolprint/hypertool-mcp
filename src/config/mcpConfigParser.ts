import * as fs from "fs/promises";
import * as path from "path";
import {
  MCPConfig,
  ServerConfig,
  StdioServerConfig,
  HttpServerConfig,
  SSEServerConfig,
  ParseResult,
  ParserOptions,
} from "../types/config.js";

/**
 * MCP Configuration Parser
 * Reads and validates .mcp.json configuration files
 */
export class MCPConfigParser {
  private options: Required<ParserOptions>;

  constructor(options: ParserOptions = {}) {
    this.options = {
      validatePaths: options.validatePaths ?? true,
      allowRelativePaths: options.allowRelativePaths ?? true,
      strict: options.strict ?? false,
    };
  }

  /**
   * Parse an MCP configuration file
   * @param filePath Path to the .mcp.json file
   * @returns ParseResult with the parsed configuration or errors
   */
  async parseFile(filePath: string): Promise<ParseResult> {
    try {
      // Resolve relative paths to absolute paths based on current working directory
      const resolvedPath = path.resolve(filePath);

      // Check if file exists
      await fs.access(resolvedPath);

      // Read and parse the file
      const content = await fs.readFile(resolvedPath, "utf-8");
      return this.parseContent(content, path.dirname(resolvedPath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          success: false,
          error: `Configuration file not found: ${filePath} (resolved to: ${path.resolve(filePath)})`,
        };
      }
      return {
        success: false,
        error: `Failed to read configuration file: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Parse MCP configuration content
   * @param content JSON content to parse
   * @param basePath Base path for resolving relative paths
   * @returns ParseResult with the parsed configuration or errors
   */
  parseContent(content: string, basePath: string = process.cwd()): ParseResult {
    try {
      const rawConfig = JSON.parse(content);

      // Validate the basic structure
      const validationErrors = this.validateStructure(rawConfig);
      if (validationErrors.length > 0) {
        return {
          success: false,
          validationErrors,
        };
      }

      // Parse and validate each server configuration
      const config: MCPConfig = { mcpServers: {} };
      const serverErrors: string[] = [];
      const serverNames = Object.keys(rawConfig.mcpServers);

      // Check for potential duplicate server names (case sensitivity, whitespace, etc.)
      this.validateServerNameUniqueness(serverNames, serverErrors);

      for (const [serverName, serverConfig] of Object.entries(
        rawConfig.mcpServers
      )) {
        try {
          const result = this.parseServerConfig(
            serverName,
            serverConfig as any,
            basePath
          );

          if (result.errors.length > 0) {
            serverErrors.push(...result.errors);
            if (this.options.strict) {
              return {
                success: false,
                validationErrors: serverErrors,
              };
            }
          }

          if (result.config) {
            config.mcpServers[serverName] = result.config;
          }
        } catch (error) {
          // Log error for this server but continue with others
          const errorMessage = `Failed to parse config for server "${serverName}": ${(error as Error).message}`;
          serverErrors.push(errorMessage);
          console.error(errorMessage);

          if (this.options.strict) {
            return {
              success: false,
              validationErrors: serverErrors,
            };
          }
        }
      }

      return {
        success: serverErrors.length === 0,
        config,
        validationErrors: serverErrors.length > 0 ? serverErrors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `Invalid JSON: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Validate the basic structure of the configuration
   *
   * NOTE: Allow empty server configurations for initial setup
   */
  private validateStructure(rawConfig: any): string[] {
    const errors: string[] = [];

    if (!rawConfig || typeof rawConfig !== "object") {
      errors.push("Configuration must be a valid object");
      return errors;
    }

    if (!rawConfig.mcpServers || typeof rawConfig.mcpServers !== "object") {
      errors.push('Configuration must have an "mcpServers" object');
      return errors;
    }

    return errors;
  }

  /**
   * Parse and validate a single server configuration
   */
  private parseServerConfig(
    name: string,
    config: any,
    basePath: string
  ): { config?: ServerConfig; errors: string[] } {
    const errors: string[] = [];

    if (!config || typeof config !== "object") {
      errors.push(`Server "${name}" configuration must be an object`);
      return { errors };
    }

    // Require explicit type field for clarity
    if (!config.type) {
      errors.push(
        `Server "${name}" is missing required "type" field. Must be "stdio", "http", or "sse"`
      );
      return { errors };
    }

    if (
      config.type !== "stdio" &&
      config.type !== "http" &&
      config.type !== "sse"
    ) {
      errors.push(
        `Server "${name}" has invalid type "${config.type}". Must be "stdio", "http", or "sse"`
      );
      return { errors };
    }

    if (config.type === "stdio") {
      return this.parseStdioConfig(name, config, basePath);
    } else if (config.type === "http") {
      return this.parseHttpConfig(name, config);
    } else {
      return this.parseSSEConfig(name, config);
    }
  }

  /**
   * Parse and validate stdio server configuration
   */
  private parseStdioConfig(
    name: string,
    config: any,
    basePath: string
  ): { config?: StdioServerConfig; errors: string[] } {
    const errors: string[] = [];

    if (!config.command || typeof config.command !== "string") {
      errors.push(`Stdio server "${name}" must have a "command" string`);
      return { errors };
    }

    if (config.args && !Array.isArray(config.args)) {
      errors.push(`Stdio server "${name}" args must be an array`);
      return { errors };
    }

    if (config.args) {
      for (let i = 0; i < config.args.length; i++) {
        if (typeof config.args[i] !== "string") {
          errors.push(`Stdio server "${name}" args[${i}] must be a string`);
        }
      }
    }

    if (
      config.env &&
      (typeof config.env !== "object" || Array.isArray(config.env))
    ) {
      errors.push(`Stdio server "${name}" env must be an object`);
      return { errors };
    }

    // Validate command path if requested
    if (this.options.validatePaths) {
      const commandPath = this.resolveCommandPath(config.command, basePath);
      if (!commandPath) {
        errors.push(
          `Stdio server "${name}" command "${config.command}" not found in PATH or as absolute/relative path`
        );
      }
    }

    const stdioConfig: StdioServerConfig = {
      type: "stdio",
      command: config.command,
      args: config.args || [],
      env: config.env || {},
    };

    return { config: stdioConfig, errors };
  }

  /**
   * Parse and validate HTTP server configuration
   */
  private parseHttpConfig(
    name: string,
    config: any
  ): { config?: HttpServerConfig; errors: string[] } {
    const errors: string[] = [];

    if (!config.url || typeof config.url !== "string") {
      errors.push(`HTTP server "${name}" must have a "url" string`);
      return { errors };
    }

    try {
      new URL(config.url);
    } catch {
      errors.push(`HTTP server "${name}" has invalid URL: ${config.url}`);
      return { errors };
    }

    if (
      config.headers &&
      (typeof config.headers !== "object" || Array.isArray(config.headers))
    ) {
      errors.push(`HTTP server "${name}" headers must be an object`);
      return { errors };
    }

    if (
      config.env &&
      (typeof config.env !== "object" || Array.isArray(config.env))
    ) {
      errors.push(`HTTP server "${name}" env must be an object`);
      return { errors };
    }

    const httpConfig: HttpServerConfig = {
      type: "http",
      url: config.url,
      headers: config.headers || {},
      env: config.env || {},
    };

    return { config: httpConfig, errors };
  }

  /**
   * Parse and validate SSE server configuration
   */
  private parseSSEConfig(
    name: string,
    config: any
  ): { config?: SSEServerConfig; errors: string[] } {
    const errors: string[] = [];

    if (!config.url || typeof config.url !== "string") {
      errors.push(`SSE server "${name}" must have a "url" string`);
      return { errors };
    }

    try {
      new URL(config.url);
    } catch {
      errors.push(`SSE server "${name}" has invalid URL: ${config.url}`);
      return { errors };
    }

    if (
      config.headers &&
      (typeof config.headers !== "object" || Array.isArray(config.headers))
    ) {
      errors.push(`SSE server "${name}" headers must be an object`);
      return { errors };
    }

    if (
      config.env &&
      (typeof config.env !== "object" || Array.isArray(config.env))
    ) {
      errors.push(`SSE server "${name}" env must be an object`);
      return { errors };
    }

    const sseConfig: SSEServerConfig = {
      type: "sse",
      url: config.url,
      headers: config.headers || {},
      env: config.env || {},
    };

    return { config: sseConfig, errors };
  }

  /**
   * Resolve a command path, checking PATH and relative/absolute paths
   */
  private resolveCommandPath(command: string, basePath: string): string | null {
    // Check if it's an absolute path
    if (path.isAbsolute(command)) {
      return command;
    }

    // Check if it's a relative path
    if (
      this.options.allowRelativePaths &&
      (command.startsWith("./") || command.startsWith("../"))
    ) {
      return path.resolve(basePath, command);
    }

    // For commands in PATH, we can't easily validate without executing
    // Return the command as-is for PATH-based commands
    return command;
  }

  /**
   * Get a list of server names from a configuration
   */
  static getServerNames(config: MCPConfig): string[] {
    return Object.keys(config.mcpServers);
  }

  /**
   * Get a specific server configuration
   */
  static getServerConfig(
    config: MCPConfig,
    serverName: string
  ): ServerConfig | undefined {
    return config.mcpServers[serverName];
  }

  /**
   * Validate server name uniqueness and catch common naming issues
   */
  private validateServerNameUniqueness(
    serverNames: string[],
    errors: string[]
  ): void {
    const normalizedNames = new Map<string, string[]>();

    for (const name of serverNames) {
      // Normalize: lowercase, trim whitespace
      const normalized = name.toLowerCase().trim();

      if (!normalizedNames.has(normalized)) {
        normalizedNames.set(normalized, []);
      }
      normalizedNames.get(normalized)!.push(name);
    }

    // Check for conflicts
    for (const [, originalNames] of normalizedNames) {
      if (originalNames.length > 1) {
        errors.push(
          `❌ Server name conflict detected: Multiple servers with similar names: [${originalNames.join(", ")}].\n` +
            `   💡 Server names must be unique (case-insensitive, whitespace-normalized).\n` +
            `   🚫 Please rename one of these servers to avoid conflicts.`
        );
      }
    }

    // Check for empty or invalid names
    for (const name of serverNames) {
      if (!name || typeof name !== "string" || name.trim() === "") {
        errors.push(
          `❌ Invalid server name: Server names cannot be empty or whitespace-only.`
        );
      }

      if (name !== name.trim()) {
        errors.push(
          `⚠️ Server name "${name}" has leading/trailing whitespace. Consider trimming it.`
        );
      }
    }
  }
}
