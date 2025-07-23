/**
 * Utility functions for detecting MCP servers configured outside of HyperTool
 */

import { join } from "path";
import { homedir } from "os";
import { fileExists, readJsonFile, MCPConfig } from "./mcpSetupUtils.js";

export interface ExternalMCPInfo {
  name: string;
  source: string;
  config: any;
}

/**
 * Read Claude Code configuration (both global and local)
 */
async function readClaudeCodeConfigs(): Promise<{
  global?: MCPConfig;
  local?: MCPConfig;
}> {
  const result: { global?: MCPConfig; local?: MCPConfig } = {};

  // Check global config
  const globalPath = join(homedir(), ".claude.json");
  if (await fileExists(globalPath)) {
    try {
      result.global = await readJsonFile(globalPath);
    } catch {
      // Ignore read errors
    }
  }

  // Check local config
  const localPath = join(process.cwd(), ".mcp.json");
  if (await fileExists(localPath)) {
    try {
      result.local = await readJsonFile(localPath);
    } catch {
      // Ignore read errors
    }
  }

  return result;
}

/**
 * Read Claude Desktop configuration
 */
async function readClaudeDesktopConfig(): Promise<MCPConfig | undefined> {
  const configPath = join(
    homedir(),
    "Library/Application Support/Claude/claude_desktop_config.json"
  );

  if (await fileExists(configPath)) {
    try {
      return await readJsonFile(configPath);
    } catch {
      // Ignore read errors
    }
  }

  return undefined;
}

/**
 * Read Cursor configuration
 */
async function readCursorConfig(): Promise<MCPConfig | undefined> {
  const configPath = join(homedir(), ".cursor/mcp.json");

  if (await fileExists(configPath)) {
    try {
      return await readJsonFile(configPath);
    } catch {
      // Ignore read errors
    }
  }

  return undefined;
}

/**
 * Detect all external MCP servers not managed by HyperTool
 */
export async function detectExternalMCPs(): Promise<ExternalMCPInfo[]> {
  const externalMCPs: ExternalMCPInfo[] = [];
  const processedNames = new Set<string>();

  // Helper to add MCPs from a config
  const addMCPsFromConfig = (config: MCPConfig | undefined, source: string) => {
    if (!config?.mcpServers) return;

    for (const [name, mcpConfig] of Object.entries(config.mcpServers)) {
      // Skip hypertool itself
      if (name.toLowerCase().includes("hypertool")) continue;

      // Skip duplicates
      const key = `${name}:${source}`;
      if (processedNames.has(key)) continue;
      processedNames.add(key);

      externalMCPs.push({
        name,
        source,
        config: mcpConfig,
      });
    }
  };

  // Check Claude Code configs
  const claudeCodeConfigs = await readClaudeCodeConfigs();
  addMCPsFromConfig(claudeCodeConfigs.global, "Claude Code (global)");
  addMCPsFromConfig(claudeCodeConfigs.local, "Claude Code (project)");

  // Check Claude Desktop config
  const claudeDesktopConfig = await readClaudeDesktopConfig();
  addMCPsFromConfig(claudeDesktopConfig, "Claude Desktop");

  // Check Cursor config
  const cursorConfig = await readCursorConfig();
  addMCPsFromConfig(cursorConfig, "Cursor");

  return externalMCPs;
}

/**
 * Format external MCPs for display
 */
export function formatExternalMCPsMessage(
  externalMCPs: ExternalMCPInfo[]
): string {
  if (externalMCPs.length === 0) return "";

  const mcpsBySource = new Map<string, string[]>();

  for (const mcp of externalMCPs) {
    if (!mcpsBySource.has(mcp.source)) {
      mcpsBySource.set(mcp.source, []);
    }
    mcpsBySource.get(mcp.source)!.push(mcp.name);
  }

  let message = "⚠️  Other MCP servers detected in your configurations:\n";

  for (const [source, names] of mcpsBySource) {
    message += `   ${source}:\n`;
    for (const name of names) {
      message += `     - ${name}\n`;
    }
  }

  message += "\n   These servers won't be managed by hypertool.\n";
  message +=
    "   Run 'hypertool --install' to import them into your hypertool configuration.";

  return message;
}
