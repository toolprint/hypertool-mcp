/**
 * PersonaToolsetBridge - Bridge between persona toolsets and existing ToolsetManager
 *
 * This bridge converts persona toolset definitions to the existing toolset system format,
 * enabling seamless integration between the persona content pack system and the
 * established toolset infrastructure without breaking existing functionality.
 *
 * @fileoverview Bridge implementation for persona-toolset integration
 */

import type { IToolDiscoveryEngine } from "../discovery/types.js";
import type {
  ToolsetConfig,
  DynamicToolReference,
} from "../server/tools/toolset/types.js";
import type { PersonaToolset } from "./types.js";
import { createChildLogger } from "../utils/logging.js";

const logger = createChildLogger({ module: "persona-toolset-bridge" });

/**
 * Result of persona toolset conversion
 */
export interface ToolsetConversionResult {
  /** Whether the conversion was successful */
  success: boolean;

  /** Converted toolset configuration if successful */
  toolsetConfig?: ToolsetConfig;

  /** Error message if conversion failed */
  error?: string;

  /** Validation warnings (non-blocking) */
  warnings?: string[];

  /** Tool resolution statistics */
  stats?: {
    /** Total tools in persona toolset */
    totalTools: number;
    /** Successfully resolved tools */
    resolvedTools: number;
    /** Failed tool resolutions */
    failedTools: number;
    /** Tools that couldn't be resolved */
    unresolvableTools: string[];
  };
}

/**
 * Bridge configuration options
 */
export interface BridgeOptions {
  /** Whether to validate tool resolution during conversion */
  validateTools?: boolean;

  /** Whether to allow partial toolset creation even if some tools fail */
  allowPartialToolsets?: boolean;

  /** Custom toolset name prefix for converted persona toolsets */
  namePrefix?: string;

  /** Whether to include detailed metadata in the converted toolset */
  includeMetadata?: boolean;
}

/**
 * PersonaToolsetBridge - Converts persona toolsets to ToolsetConfig format
 *
 * This bridge enables the persona system to work seamlessly with the existing
 * toolset infrastructure by converting PersonaToolset definitions into the
 * ToolsetConfig format expected by the ToolsetManager.
 */
export class PersonaToolsetBridge {
  private readonly getToolDiscoveryEngine?: () =>
    | IToolDiscoveryEngine
    | undefined;
  private readonly options: Required<BridgeOptions>;

  constructor(
    getToolDiscoveryEngine?: () => IToolDiscoveryEngine | undefined,
    options: BridgeOptions = {}
  ) {
    this.getToolDiscoveryEngine = getToolDiscoveryEngine;

    // Apply default options
    this.options = {
      validateTools: options.validateTools ?? true,
      allowPartialToolsets: options.allowPartialToolsets ?? false,
      namePrefix: options.namePrefix ?? "persona",
      includeMetadata: options.includeMetadata ?? true,
      ...options,
    };

    logger.debug("PersonaToolsetBridge initialized", {
      hasDiscoveryEngine: !!this.getToolDiscoveryEngine?.(),
      options: this.options,
    });
  }

  /**
   * Convert a PersonaToolset to ToolsetConfig format
   */
  async convertPersonaToolset(
    personaToolset: PersonaToolset,
    personaName: string
  ): Promise<ToolsetConversionResult> {
    try {
      logger.debug("Converting persona toolset", {
        personaName,
        toolsetName: personaToolset.name,
        toolCount: personaToolset.toolIds.length,
      });

      // Convert tool IDs to DynamicToolReference format
      const toolReferences: DynamicToolReference[] = personaToolset.toolIds.map(
        (toolId) => ({
          namespacedName: toolId,
        })
      );

      // Initialize statistics
      const stats = {
        totalTools: personaToolset.toolIds.length,
        resolvedTools: 0,
        failedTools: 0,
        unresolvableTools: [] as string[],
      };

      const warnings: string[] = [];

      // Validate tool resolution if enabled and discovery engine is available
      if (this.options.validateTools && this.getToolDiscoveryEngine?.()) {
        const validationResult = await this.validateToolReferences(
          toolReferences,
          stats,
          warnings
        );

        // Check if we should fail on unresolvable tools
        if (!this.options.allowPartialToolsets && stats.failedTools > 0) {
          return {
            success: false,
            error: `Failed to resolve ${stats.failedTools} tools: ${stats.unresolvableTools.join(", ")}. Enable 'allowPartialToolsets' to create toolset with available tools only.`,
            stats,
          };
        }

        // Filter out unresolvable tools if partial toolsets are allowed
        if (this.options.allowPartialToolsets && stats.failedTools > 0) {
          const validToolIds = new Set(
            personaToolset.toolIds.filter(
              (toolId) => !stats.unresolvableTools.includes(toolId)
            )
          );

          toolReferences.splice(0, toolReferences.length);
          toolReferences.push(
            ...Array.from(validToolIds).map((toolId) => ({
              namespacedName: toolId,
            }))
          );

          warnings.push(
            `${stats.failedTools} tools could not be resolved and were excluded from the toolset`
          );
        }
      }

      // Generate toolset name
      const toolsetName = this.generateToolsetName(
        personaName,
        personaToolset.name
      );

      // Create ToolsetConfig
      const toolsetConfig: ToolsetConfig = {
        name: toolsetName,
        description: this.generateToolsetDescription(
          personaName,
          personaToolset
        ),
        version: "1.0.0",
        createdAt: new Date(),
        tools: toolReferences,
      };

      logger.debug("Persona toolset conversion completed", {
        personaName,
        originalToolsetName: personaToolset.name,
        convertedToolsetName: toolsetName,
        totalTools: stats.totalTools,
        resolvedTools: stats.resolvedTools,
        failedTools: stats.failedTools,
      });

      return {
        success: true,
        toolsetConfig,
        warnings: warnings.length > 0 ? warnings : undefined,
        stats,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Failed to convert persona toolset", {
        personaName,
        toolsetName: personaToolset.name,
        error: errorMessage,
      });

      return {
        success: false,
        error: `Failed to convert persona toolset: ${errorMessage}`,
      };
    }
  }

  /**
   * Convert multiple persona toolsets to ToolsetConfig format
   */
  async convertMultiplePersonaToolsets(
    personaToolsets: PersonaToolset[],
    personaName: string
  ): Promise<{
    success: boolean;
    toolsetConfigs: ToolsetConfig[];
    errors: Array<{ toolsetName: string; error: string }>;
    warnings: string[];
  }> {
    const toolsetConfigs: ToolsetConfig[] = [];
    const errors: Array<{ toolsetName: string; error: string }> = [];
    const allWarnings: string[] = [];

    for (const personaToolset of personaToolsets) {
      const result = await this.convertPersonaToolset(
        personaToolset,
        personaName
      );

      if (result.success && result.toolsetConfig) {
        toolsetConfigs.push(result.toolsetConfig);
        if (result.warnings) {
          allWarnings.push(
            ...result.warnings.map((w) => `${personaToolset.name}: ${w}`)
          );
        }
      } else {
        errors.push({
          toolsetName: personaToolset.name,
          error: result.error || "Unknown conversion error",
        });
      }
    }

    return {
      success: errors.length === 0,
      toolsetConfigs,
      errors,
      warnings: allWarnings,
    };
  }

  /**
   * Generate a unique toolset name from persona and toolset names
   */
  private generateToolsetName(
    personaName: string,
    toolsetName: string
  ): string {
    // Convert to lowercase and replace invalid characters
    const cleanPersonaName = personaName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const cleanToolsetName = toolsetName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    // Combine with prefix
    return `${this.options.namePrefix}-${cleanPersonaName}-${cleanToolsetName}`;
  }

  /**
   * Generate a descriptive toolset description
   */
  private generateToolsetDescription(
    personaName: string,
    personaToolset: PersonaToolset
  ): string {
    const baseDescription = `Toolset "${personaToolset.name}" from persona "${personaName}"`;

    if (!this.options.includeMetadata) {
      return baseDescription;
    }

    const toolCount = personaToolset.toolIds.length;
    const toolCountText = `Contains ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
    const timestamp = new Date().toISOString();

    return `${baseDescription}. ${toolCountText}. Generated on ${timestamp}.`;
  }

  /**
   * Validate tool references against the discovery engine
   */
  private async validateToolReferences(
    toolReferences: DynamicToolReference[],
    stats: ToolsetConversionResult["stats"],
    warnings: string[]
  ): Promise<void> {
    const toolDiscoveryEngine = this.getToolDiscoveryEngine?.();
    if (!toolDiscoveryEngine || !stats) {
      return;
    }

    for (const toolRef of toolReferences) {
      try {
        const resolution = toolDiscoveryEngine.resolveToolReference(toolRef, {
          allowStaleRefs: false,
        });

        if (resolution && resolution.exists) {
          stats.resolvedTools++;

          // Log any warnings from resolution
          if (resolution.warnings.length > 0) {
            warnings.push(
              `Tool "${toolRef.namespacedName}": ${resolution.warnings.join(", ")}`
            );
          }
        } else {
          stats.failedTools++;
          if (toolRef.namespacedName) {
            stats.unresolvableTools.push(toolRef.namespacedName);
          }

          // Log resolution errors
          if (resolution && resolution.errors.length > 0) {
            logger.debug("Tool resolution failed", {
              toolRef,
              errors: resolution.errors,
            });
          }
        }
      } catch (error) {
        stats.failedTools++;
        if (toolRef.namespacedName) {
          stats.unresolvableTools.push(toolRef.namespacedName);
        }

        logger.debug("Tool resolution threw error", {
          toolRef,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Get bridge statistics and configuration
   */
  getConfiguration(): {
    hasDiscoveryEngine: boolean;
    options: Required<BridgeOptions>;
    version: string;
  } {
    return {
      hasDiscoveryEngine: !!this.getToolDiscoveryEngine?.(),
      options: this.options,
      version: "1.0.0",
    };
  }

  /**
   * Test tool resolution capabilities
   */
  async testToolResolution(): Promise<{
    discoveryEngineAvailable: boolean;
    totalTools: number;
    connectedServers: number;
  }> {
    const toolDiscoveryEngine = this.getToolDiscoveryEngine?.();
    if (!toolDiscoveryEngine) {
      return {
        discoveryEngineAvailable: false,
        totalTools: 0,
        connectedServers: 0,
      };
    }

    try {
      const stats = toolDiscoveryEngine.getStats();
      return {
        discoveryEngineAvailable: true,
        totalTools: stats.totalTools,
        connectedServers: stats.connectedServers,
      };
    } catch (error) {
      logger.warn("Failed to get discovery engine stats", { error });
      return {
        discoveryEngineAvailable: false,
        totalTools: 0,
        connectedServers: 0,
      };
    }
  }
}

/**
 * Create a PersonaToolsetBridge instance with default configuration
 */
export function createPersonaToolsetBridge(
  toolDiscoveryEngine?: IToolDiscoveryEngine,
  options?: BridgeOptions
): PersonaToolsetBridge {
  return new PersonaToolsetBridge(() => toolDiscoveryEngine, options);
}

/**
 * Utility function to convert a single persona toolset
 */
export async function convertPersonaToolset(
  personaToolset: PersonaToolset,
  personaName: string,
  toolDiscoveryEngine?: IToolDiscoveryEngine,
  options?: BridgeOptions
): Promise<ToolsetConversionResult> {
  const bridge = new PersonaToolsetBridge(() => toolDiscoveryEngine, options);
  return bridge.convertPersonaToolset(personaToolset, personaName);
}
