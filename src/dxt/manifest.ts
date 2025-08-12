/**
 * DXT Manifest Parser
 * Phase 0: Basic JSON parsing with minimal validation
 */

import { readFile } from "fs/promises";
import * as path from "path";
import { DxtManifest } from "../config/dxt-config.js";

/**
 * Parse DXT manifest.json file
 */
export async function parseManifest(extractDir: string): Promise<DxtManifest> {
  const manifestPath = path.join(extractDir, "manifest.json");
  const content = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(content);

  // Basic validation
  if (!manifest.name || !manifest.version || !manifest.main) {
    throw new Error("Manifest missing required fields: name, version, main");
  }

  return {
    name: manifest.name,
    version: manifest.version,
    main: manifest.main,
  };
}
