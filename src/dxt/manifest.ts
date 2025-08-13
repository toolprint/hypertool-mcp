/**
 * DXT Manifest Parser
 * Phase 0: Basic JSON parsing with minimal validation
 */

import { readFile } from "fs/promises";
import * as path from "path";
import { DxtManifest } from "../config/dxt-config.js";

/**
 * Parse DXT manifest.json file with enhanced schema support
 */
export async function parseManifest(extractDir: string): Promise<DxtManifest> {
  const manifestPath = path.join(extractDir, "manifest.json");
  const content = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(content);

  // Enhanced validation for new schema
  if (manifest.dxt_version) {
    // New schema format
    if (!manifest.name || !manifest.version || !manifest.server) {
      throw new Error(
        "Manifest missing required fields: name, version, server"
      );
    }

    if (!manifest.server.mcp_config) {
      throw new Error("Manifest server missing mcp_config");
    }

    return {
      dxt_version: manifest.dxt_version,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      license: manifest.license,
      repository: manifest.repository,
      server: manifest.server,
      user_config: manifest.user_config,
    };
  } else {
    // Legacy schema support
    if (!manifest.name || !manifest.version || !manifest.main) {
      throw new Error("Manifest missing required fields: name, version, main");
    }

    // Convert legacy format to new format
    return {
      dxt_version: "0.1",
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      license: manifest.license,
      repository: manifest.repository,
      server: {
        type: "node",
        entry_point: manifest.main,
        mcp_config: {
          command: "node",
          args: [manifest.main], // This will be resolved to absolute path in buildServerConfig
        },
      },
      main: manifest.main, // Keep for backwards compatibility
    };
  }
}
