/**
 * Common response types for toolset operations
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Zod schema for server configuration
 */
export const serverConfigZodSchema = z.object({
  name: z.string().describe("Server name"),
  enabled: z.boolean().describe("Whether the server is enabled"),
  toolCount: z.number().describe("Number of tools from this server"),
});

/**
 * Zod schema for toolset tool reference
 */
export const toolsetToolRefZodSchema = z.object({
  namespacedName: z
    .string()
    .describe('Namespaced name of the tool (e.g., "git.status")'),
  refId: z.string().describe("Unique reference ID/hash for the tool"),
  server: z.string().describe("Server name that provides this tool"),
  active: z
    .boolean()
    .describe("Whether this tool is currently available/active"),
});

/**
 * Zod schema for toolset information
 */
export const toolsetInfoZodSchema = z.object({
  name: z.string().describe("Name of the toolset"),
  description: z
    .string()
    .optional()
    .describe("Optional description of the toolset"),
  version: z.string().optional().describe("Version of the toolset"),
  createdAt: z
    .string()
    .optional()
    .describe("ISO timestamp when the toolset was created"),
  toolCount: z.number().describe("Number of tools in the toolset"),
  active: z.boolean().describe("Whether this toolset is currently active"),
  location: z
    .string()
    .optional()
    .describe("File path where the toolset configuration is stored"),
  totalServers: z
    .number()
    .describe("Total number of servers included in the toolset"),
  enabledServers: z
    .number()
    .describe("Number of enabled servers in the toolset"),
  totalTools: z
    .number()
    .describe("Total number of tools included in the toolset"),
  servers: z
    .array(serverConfigZodSchema)
    .describe("Server configurations in the toolset"),
  tools: z
    .array(toolsetToolRefZodSchema)
    .describe("Detailed tool references with availability status"),
});

/**
 * TypeScript type inferred from Zod schema
 */
export type ToolsetInfo = z.infer<typeof toolsetInfoZodSchema>;

/**
 * Zod schema for listing saved toolsets response
 */
export const listSavedToolsetsResponseZodSchema = z.object({
  success: z.boolean().describe("Whether the operation was successful"),
  toolsets: z
    .array(toolsetInfoZodSchema)
    .describe("Array of toolset information"),
  error: z
    .string()
    .optional()
    .describe("Error message if the operation failed"),
});

/**
 * Zod schema for build toolset response
 */
export const buildToolsetResponseZodSchema = z.object({
  meta: z
    .object({
      success: z
        .boolean()
        .describe("Whether the toolset was successfully created"),
      toolsetName: z
        .string()
        .optional()
        .describe("Name of the created toolset"),
      autoEquipped: z
        .boolean()
        .optional()
        .describe(
          "Whether the toolset was automatically equipped after creation"
        ),
      error: z
        .string()
        .optional()
        .describe("Error message if the operation failed"),
    })
    .describe("Operation metadata"),
  toolset: toolsetInfoZodSchema
    .optional()
    .describe("Toolset information (only present if successful)"),
});

/**
 * Zod schema for equip toolset response
 */
export const equipToolsetResponseZodSchema = z.object({
  success: z
    .boolean()
    .describe("Whether the toolset was successfully equipped"),
  error: z
    .string()
    .optional()
    .describe("Error message if the operation failed"),
  toolset: toolsetInfoZodSchema
    .optional()
    .describe("Equipped toolset information (only present if successful)"),
});

/**
 * Zod schema for get active toolset response
 */
export const getActiveToolsetResponseZodSchema = z.object({
  equipped: z.boolean().describe("Whether a toolset is currently equipped"),
  toolset: toolsetInfoZodSchema
    .optional()
    .describe("Toolset information (only present if equipped)"),
  serverStatus: z
    .object({
      totalConfigured: z
        .number()
        .describe("Total number of configured servers"),
      enabled: z.number().describe("Number of enabled servers"),
      available: z.number().describe("Number of available servers"),
      unavailable: z.number().describe("Number of unavailable servers"),
      disabled: z.number().describe("Number of disabled servers"),
    })
    .optional()
    .describe("Server status summary"),
  toolSummary: z
    .object({
      currentlyExposed: z
        .number()
        .describe("Number of tools currently exposed"),
      totalDiscovered: z.number().describe("Total number of discovered tools"),
      filteredOut: z.number().describe("Number of tools filtered out"),
    })
    .optional()
    .describe("Tool summary information"),
  exposedTools: z
    .record(z.array(z.string()))
    .describe("Tools grouped by server"),
  unavailableServers: z
    .array(z.string())
    .describe("List of unavailable server names"),
  warnings: z.array(z.string()).describe("List of warnings"),
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type ListSavedToolsetsResponse = z.infer<
  typeof listSavedToolsetsResponseZodSchema
>;
export type BuildToolsetResponse = z.infer<
  typeof buildToolsetResponseZodSchema
>;
export type EquipToolsetResponse = z.infer<
  typeof equipToolsetResponseZodSchema
>;
export type GetActiveToolsetResponse = z.infer<
  typeof getActiveToolsetResponseZodSchema
>;

/**
 * JSON Schemas generated from Zod schemas using zod-to-json-schema
 * Note: Using $refStrategy: 'none' to avoid $ref definitions for MCP compatibility
 */
export const serverConfigSchema = zodToJsonSchema(serverConfigZodSchema, {
  $refStrategy: "none",
});

export const toolsetInfoSchema = zodToJsonSchema(toolsetInfoZodSchema, {
  $refStrategy: "none",
});

export const listSavedToolsetsResponseSchema = zodToJsonSchema(
  listSavedToolsetsResponseZodSchema,
  {
    $refStrategy: "none",
  }
);

export const buildToolsetResponseSchema = zodToJsonSchema(
  buildToolsetResponseZodSchema,
  {
    $refStrategy: "none",
  }
);

export const equipToolsetResponseSchema = zodToJsonSchema(
  equipToolsetResponseZodSchema,
  {
    $refStrategy: "none",
  }
);

export const getActiveToolsetResponseSchema = zodToJsonSchema(
  getActiveToolsetResponseZodSchema,
  {
    $refStrategy: "none",
  }
);
