/**
 * Types for MCP prompt definitions
 */

import { Prompt, GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Prompt template interface for defining server prompts
 */
export interface PromptTemplate {
  /** Programmatic name for the prompt */
  name: string;
  /** Human-readable title for UI display */
  title?: string;
  /** Description of what this prompt provides */
  description?: string;
  /** Optional arguments for templating */
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  /** Handler function that generates the prompt content */
  handler: (args?: Record<string, string>) => Promise<GetPromptResult>;
}

/**
 * Prompt registry interface for managing available prompts
 */
export interface IPromptRegistry {
  /** Get all available prompts */
  getPrompts(): Prompt[];
  /** Get a specific prompt by name */
  getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<GetPromptResult>;
}
