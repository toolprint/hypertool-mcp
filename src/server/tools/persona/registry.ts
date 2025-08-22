/**
 * Persona Tools Registry
 *
 * Central registry of all persona management tools for HyperTool MCP.
 * This provides a single source of truth for persona tool management.
 */

import { ToolModuleFactory } from "../types.js";
import { createListPersonasModule } from "./list-personas.js";

/**
 * Registry of all persona tool factories
 */
export const PERSONA_TOOL_FACTORIES: ToolModuleFactory[] = [
  createListPersonasModule,
];

/**
 * List of persona tool names (derived from factories)
 */
export const PERSONA_TOOL_NAMES = [
  "list-personas",
] as const;

export type PersonaToolName = (typeof PERSONA_TOOL_NAMES)[number];