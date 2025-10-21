/**
 * Prompt template for creating a new toolset with comprehensive workflow guidance
 */

import { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { PromptTemplate } from "./types.js";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for the prompt content to avoid repeated file reads
let cachedPromptContent: string | null = null;

/**
 * Load the prompt content from the markdown file
 */
async function loadPromptContent(): Promise<string> {
  if (cachedPromptContent) {
    return cachedPromptContent;
  }

  const promptPath = join(__dirname, "new-toolset.md");
  cachedPromptContent = await fs.readFile(promptPath, "utf-8");
  return cachedPromptContent;
}

export const newToolsetPrompt: PromptTemplate = {
  name: "new-toolset",
  title: "Create New Toolset",
  description:
    "Interactive workflow for creating a new toolset with guided best practices",
  arguments: [],
  handler: async (): Promise<GetPromptResult> => {
    const promptText = await loadPromptContent();

    return {
      description:
        "Comprehensive guide for creating a new toolset with best practices and validation",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: promptText,
          },
        },
      ],
    };
  },
};
