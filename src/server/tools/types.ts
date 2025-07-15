/**
 * Core types for the tool factory pattern
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolsetManager } from "../../toolset/manager.js";
import { IToolDiscoveryEngine } from "../../discovery/types.js";
import { RuntimeOptions } from "../../types/runtime.js";

export interface ToolModule {
  toolName: string;
  definition: Tool;
  handler: (args: any) => Promise<any>;
}

export interface ToolDependencies {
  toolsetManager: ToolsetManager;
  discoveryEngine?: IToolDiscoveryEngine;
  runtimeOptions?: RuntimeOptions;
}

export interface ToolModuleFactory {
  (deps: ToolDependencies): ToolModule;
}