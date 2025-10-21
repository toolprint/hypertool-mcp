/**
 * Prompt registry for managing and serving MCP prompts
 */

import { Prompt, GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { PromptTemplate, IPromptRegistry } from "./types.js";
import { newToolsetPrompt } from "./new-toolset.js";

/**
 * Registry implementation for managing server prompts
 */
export class PromptRegistry implements IPromptRegistry {
  private prompts: Map<string, PromptTemplate> = new Map();

  constructor() {
    // Register all available prompts
    this.registerPrompt(newToolsetPrompt);
  }

  /**
   * Register a new prompt template
   */
  private registerPrompt(template: PromptTemplate): void {
    this.prompts.set(template.name, template);
  }

  /**
   * Get list of all available prompts
   */
  getPrompts(): Prompt[] {
    return Array.from(this.prompts.values()).map((template) => ({
      name: template.name,
      title: template.title,
      description: template.description,
      arguments: template.arguments,
    }));
  }

  /**
   * Get a specific prompt by name with optional arguments
   */
  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<GetPromptResult> {
    const template = this.prompts.get(name);
    if (!template) {
      throw new Error(`Prompt "${name}" not found`);
    }

    return await template.handler(args);
  }

  /**
   * Check if a prompt exists
   */
  hasPrompt(name: string): boolean {
    return this.prompts.has(name);
  }
}
