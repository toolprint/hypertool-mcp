/**
 * Persona Tools Registry
 *
 * Central registry of all persona management tools for HyperTool MCP.
 * This provides a single source of truth for persona tool management.
 */

import { ToolModuleFactory } from "../types.js";
import { createListPersonasModule } from "./list-personas.js";
import { createValidatePersonaModule } from "./validate-persona.js";
import { createActivatePersonaModule } from "./activate-persona.js";
import { createGetActivePersonaModule } from "./get-active-persona.js";

/**
 * Registry of all persona tool factories
 */
export const PERSONA_TOOL_FACTORIES: ToolModuleFactory[] = [
  createListPersonasModule,
  createValidatePersonaModule,
  createActivatePersonaModule,
  createGetActivePersonaModule,
];

/**
 * List of persona tool names (derived from factories)
 */
export const PERSONA_TOOL_NAMES = [
  "list-personas",
  "validate-persona",
  "activate-persona",
  "get-active-persona",
] as const;

export type PersonaToolName = (typeof PERSONA_TOOL_NAMES)[number];
