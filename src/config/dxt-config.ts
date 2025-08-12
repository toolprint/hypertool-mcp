/**
 * DXT Extension Configuration Types
 * Phase 0: Minimal types for DXT package support
 */

import { BaseServerConfig } from "../types/config.js";

/**
 * Configuration for DXT-based MCP servers
 */
export interface DxtServerConfig extends BaseServerConfig {
  type: "dxt";
  path: string; // Path to .dxt file
}

/**
 * Basic DXT manifest schema
 * Phase 0: Only name, version, and main fields
 */
export interface DxtManifest {
  name: string;
  version: string;
  main: string; // Entry point JS file
}
