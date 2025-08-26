/**
 * PersonaManager Implementation
 *
 * This module implements the main PersonaManager class that orchestrates persona lifecycle,
 * activation/deactivation, and state management with event emission. The manager ensures
 * only one persona is active at a time and handles the complete activation workflow
 * including toolset application and MCP configuration integration.
 *
 * @fileoverview Main persona management orchestration with state and event handling
 */

import { EventEmitter } from "events";
import { createChildLogger } from "../utils/logging.js";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { IToolDiscoveryEngine } from "../discovery/types.js";
import type {
  LoadedPersona,
  PersonaReference,
  PersonaDiscoveryResult,
  PersonaDiscoveryConfig,
  ActivationResult,
  PersonaToolset,
  ValidationResult,
  PersonaCacheConfig,
} from "./types.js";
import { PersonaEvents, PersonaErrorCode } from "./types.js";
import { PersonaLoader, type PersonaLoadOptions } from "./loader.js";
import { PersonaCache } from "./cache.js";
import { PersonaDiscovery } from "./discovery.js";
import {
  PersonaError,
  PersonaActivationError,
  createPersonaNotFoundError,
  createActivationFailedError,
  createToolsetNotFoundError,
  isPersonaError,
} from "./errors.js";
import { PersonaToolsetBridge, type BridgeOptions } from "./toolset-bridge.js";
import type { ToolsetManager } from "../server/tools/toolset/manager.js";
import {
  PersonaMcpIntegration,
  type McpConfigMergeOptions,
  type McpConfigMergeResult,
  personaHasMcpConfig,
} from "./mcp-integration.js";
import type { MCPConfig } from "../types/config.js";

/**
 * Persona manager configuration options
 */
export interface PersonaManagerConfig {
  /** Tool discovery engine getter for validation - returns current instance */
  getToolDiscoveryEngine?: () => IToolDiscoveryEngine | undefined;

  /** Toolset manager for integration with existing toolset system */
  toolsetManager?: ToolsetManager;

  /** Cache configuration for loaded personas */
  cacheConfig?: PersonaCacheConfig;

  /** Discovery configuration for finding personas */
  discoveryConfig?: PersonaDiscoveryConfig;

  /** Default loading options for personas */
  defaultLoadOptions?: PersonaLoadOptions;

  /** Whether to auto-discover personas on initialization */
  autoDiscover?: boolean;

  /** Whether to validate personas on activation */
  validateOnActivation?: boolean;

  /** Whether to persist state across sessions */
  persistState?: boolean;

  /** State persistence key for local storage */
  stateKey?: string;

  /** Bridge configuration options for toolset conversion */
  bridgeOptions?: BridgeOptions;

  /** MCP configuration handlers for persona integration */
  mcpConfigHandlers?: {
    getCurrentConfig: () => Promise<MCPConfig | null>;
    setCurrentConfig: (config: MCPConfig) => Promise<void>;
    restartConnections?: () => Promise<void>;
  };

  /** MCP configuration merge options */
  mcpMergeOptions?: Partial<McpConfigMergeOptions>;
}

/**
 * Active persona state information
 */
export interface ActivePersonaState {
  /** Currently active loaded persona */
  persona: LoadedPersona;

  /** Active toolset name if any */
  activeToolset?: string;

  /** Activation timestamp */
  activatedAt: Date;

  /** Previous state for restoration */
  previousState?: {
    toolsetName?: string;
    mcpConfig?: any;
    customState?: Record<string, any>;
  };

  /** Activation metadata */
  metadata: {
    activationSource: "manual" | "automatic" | "restored";
    validationPassed: boolean;
    toolsResolved: number;
    warnings: string[];
    mcpConfigApplied?: boolean;
    mcpConfigWarnings?: string[];
  };
}

/**
 * Persona listing options
 */
export interface PersonaListOptions {
  /** Include invalid personas in results */
  includeInvalid?: boolean;

  /** Filter by persona name pattern */
  namePattern?: string;

  /** Filter by tags */
  tags?: string[];

  /** Sort order */
  sortBy?: "name" | "lastModified" | "created";

  /** Sort direction */
  sortDirection?: "asc" | "desc";

  /** Maximum number of results */
  limit?: number;

  /** Refresh discovery before listing */
  refresh?: boolean;
}

/**
 * Persona activation options
 */
export interface PersonaActivationOptions {
  /** Specific toolset to activate (defaults to defaultToolset) */
  toolsetName?: string;

  /** Whether to force activation even if validation fails */
  force?: boolean;

  /** Whether to backup current state for restoration */
  backupState?: boolean;

  /** Custom state to preserve during activation */
  preserveState?: Record<string, any>;

  /** Whether to emit events for this activation */
  silent?: boolean;
}

/**
 * Main PersonaManager class for lifecycle orchestration
 *
 * Manages persona activation, deactivation, state tracking, and event emission.
 * Ensures only one persona is active at a time and provides comprehensive
 * state management with cleanup and restoration capabilities.
 */
export class PersonaManager extends EventEmitter {
  private readonly logger = createChildLogger({ module: "persona/manager" });
  private readonly loader: PersonaLoader;
  private readonly cache: PersonaCache;
  private readonly discovery: PersonaDiscovery;
  private readonly toolsetBridge: PersonaToolsetBridge;
  private readonly mcpIntegration: PersonaMcpIntegration;
  private readonly config: Omit<
    Required<PersonaManagerConfig>,
    "getToolDiscoveryEngine" | "toolsetManager" | "mcpConfigHandlers"
  > & {
    getToolDiscoveryEngine?: () => IToolDiscoveryEngine | undefined;
    toolsetManager?: ToolsetManager;
    mcpConfigHandlers?: {
      getCurrentConfig: () => Promise<MCPConfig | null>;
      setCurrentConfig: (config: MCPConfig) => Promise<void>;
      restartConnections?: () => Promise<void>;
    };
  };

  private activeState: ActivePersonaState | null = null;
  private discoveredPersonas: PersonaReference[] = [];
  private lastDiscovery: Date | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: PersonaManagerConfig = {}) {
    super();

    // Apply default configuration
    this.config = {
      getToolDiscoveryEngine: config.getToolDiscoveryEngine,
      toolsetManager: config.toolsetManager,
      mcpConfigHandlers: config.mcpConfigHandlers,
      cacheConfig: config.cacheConfig || {},
      discoveryConfig: config.discoveryConfig || {},
      defaultLoadOptions: config.defaultLoadOptions || {},
      autoDiscover: config.autoDiscover ?? true,
      validateOnActivation: config.validateOnActivation ?? true,
      persistState: config.persistState ?? false,
      stateKey: config.stateKey ?? "hypertool-mcp-persona-state",
      bridgeOptions: config.bridgeOptions || {},
      mcpMergeOptions: config.mcpMergeOptions || {},
    };

    // Initialize components
    this.cache = new PersonaCache(this.config.cacheConfig);
    this.discovery = new PersonaDiscovery(this.config.cacheConfig);
    this.loader = new PersonaLoader(
      this.config.getToolDiscoveryEngine?.(),
      this.discovery
    );
    this.toolsetBridge = new PersonaToolsetBridge(
      this.config.getToolDiscoveryEngine,
      this.config.bridgeOptions
    );

    // Initialize MCP integration
    if (this.config.mcpConfigHandlers) {
      this.mcpIntegration = new PersonaMcpIntegration(
        this.config.mcpConfigHandlers.getCurrentConfig,
        this.config.mcpConfigHandlers.setCurrentConfig,
        this.config.mcpConfigHandlers.restartConnections,
        this.config.mcpMergeOptions
      );
    } else {
      // Create null integration for personas without MCP config handlers
      this.mcpIntegration = PersonaMcpIntegration.createNullIntegration();
    }

    this.setupEventHandling();
  }

  /**
   * Initialize the persona manager
   */
  public async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  /**
   * Activate a persona by name with optional toolset selection
   */
  public async activatePersona(
    personaName: string,
    options: PersonaActivationOptions = {}
  ): Promise<ActivationResult> {
    try {
      await this.initialize();

      // Deactivate current persona if different
      if (
        this.activeState &&
        this.activeState.persona.config.name !== personaName
      ) {
        await this.deactivatePersona({ silent: options.silent });
      }

      // Return early if same persona is already active
      if (
        this.activeState &&
        this.activeState.persona.config.name === personaName
      ) {
        // Check if we need to switch toolsets
        if (
          options.toolsetName &&
          this.activeState.activeToolset !== options.toolsetName
        ) {
          return this.switchToolset(options.toolsetName, options.silent);
        }

        return {
          success: true,
          personaName,
          activatedToolset: this.activeState.activeToolset,
        };
      }

      // Find and load the persona
      const persona = await this.findAndLoadPersona(personaName);
      if (!persona) {
        throw createPersonaNotFoundError(personaName, [
          "Persona not found in discovered personas",
          "Try refreshing discovery or check persona name spelling",
        ]);
      }

      // Perform activation
      const result = await this.performActivation(persona, options);

      if (!options.silent) {
        this.emit(PersonaEvents.PERSONA_ACTIVATED, {
          persona: persona.config,
          toolset: result.activatedToolset,
          timestamp: new Date(),
          previousPersona: null,
        });
      }

      return result;
    } catch (error) {
      const personaError = isPersonaError(error)
        ? error
        : createActivationFailedError(
            personaName,
            error instanceof Error ? error.message : String(error)
          );

      if (!options.silent) {
        this.emit(PersonaEvents.PERSONA_VALIDATION_FAILED, {
          personaName,
          error: personaError,
          timestamp: new Date(),
        });
      }

      return {
        success: false,
        personaName,
        errors: [personaError.message],
      };
    }
  }

  /**
   * Deactivate the currently active persona
   */
  public async deactivatePersona(
    options: { silent?: boolean } = {}
  ): Promise<ActivationResult> {
    if (!this.activeState) {
      return {
        success: true,
        personaName: "(none)",
        warnings: ["No persona is currently active"],
      };
    }

    const previousPersona = this.activeState.persona;
    const previousToolset = this.activeState.activeToolset;

    try {
      // Restore MCP configuration if it was applied
      if (
        this.activeState.metadata.mcpConfigApplied &&
        this.mcpIntegration.hasBackup()
      ) {
        try {
          await this.mcpIntegration.restoreOriginalConfig();
        } catch (error) {
          this.logger.warn(
            "Failed to restore MCP configuration during deactivation:",
            error
          );
          // Don't fail the entire deactivation for this
        }
      }

      // Restore previous state if available
      if (this.activeState.previousState) {
        await this.restorePreviousState(this.activeState.previousState);
      }

      // Clear active state
      this.activeState = null;

      // Clear persisted state if enabled
      if (this.config.persistState) {
        await this.clearPersistedState();
      }

      if (!options.silent) {
        this.emit(PersonaEvents.PERSONA_DEACTIVATED, {
          persona: previousPersona.config,
          toolset: previousToolset,
          timestamp: new Date(),
        });
      }

      return {
        success: true,
        personaName: previousPersona.config.name,
        activatedToolset: previousToolset,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
        personaName: previousPersona.config.name,
        errors: [`Failed to deactivate persona: ${errorMessage}`],
      };
    }
  }

  /**
   * Get currently active persona state
   */
  public getActivePersona(): ActivePersonaState | null {
    return this.activeState;
  }

  /**
   * Check if a persona is currently active
   */
  public isPersonaActive(personaName?: string): boolean {
    if (!this.activeState) {
      return false;
    }

    if (personaName) {
      return this.activeState.persona.config.name === personaName;
    }

    return true;
  }

  /**
   * List available personas with filtering options
   */
  public async listPersonas(
    options: PersonaListOptions = {}
  ): Promise<PersonaReference[]> {
    try {
      await this.initialize();

      // Refresh discovery if requested
      if (options.refresh) {
        await this.refreshDiscovery();
      }

      let personas = [...this.discoveredPersonas];

      // Apply filters
      if (!options.includeInvalid) {
        personas = personas.filter((p) => p.isValid);
      }

      if (options.namePattern) {
        const pattern = new RegExp(options.namePattern, "i");
        personas = personas.filter((p) => pattern.test(p.name));
      }

      if (options.tags && options.tags.length > 0) {
        // Would need persona metadata loading for tag filtering
        // For now, skip this filter
      }

      // Apply sorting
      if (options.sortBy) {
        personas.sort((a, b) => {
          let aVal: any;
          let bVal: any;

          switch (options.sortBy) {
            case "name":
              aVal = a.name;
              bVal = b.name;
              break;
            default:
              aVal = a.name;
              bVal = b.name;
          }

          const comparison = aVal.localeCompare(bVal);
          return options.sortDirection === "desc" ? -comparison : comparison;
        });
      }

      // Apply limit
      if (options.limit && options.limit > 0) {
        personas = personas.slice(0, options.limit);
      }

      return personas;
    } catch (error) {
      this.emit(PersonaEvents.PERSONA_VALIDATION_FAILED, {
        error: error as Error,
        timestamp: new Date(),
      });
      return [];
    }
  }

  /**
   * Refresh persona discovery
   */
  public async refreshDiscovery(): Promise<PersonaDiscoveryResult> {
    const result = await this.discovery.refreshDiscovery(
      this.config.discoveryConfig
    );
    this.discoveredPersonas = result.personas;
    this.lastDiscovery = new Date();

    this.emit(PersonaEvents.PERSONA_DISCOVERED, {
      count: result.personas.length,
      fromCache: false,
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Get discovery and manager statistics
   */
  public getStats(): {
    discovery: ReturnType<PersonaDiscovery["getDiscoveryStats"]>;
    cache: ReturnType<PersonaCache["getStats"]>;
    activePersona: string | null;
    discoveredCount: number;
    lastDiscovery: Date | null;
    bridge: ReturnType<PersonaToolsetBridge["getConfiguration"]>;
  } {
    return {
      discovery: this.discovery.getDiscoveryStats(),
      cache: this.cache.getStats(),
      activePersona: this.activeState?.persona.config.name || null,
      discoveredCount: this.discoveredPersonas.length,
      lastDiscovery: this.lastDiscovery,
      bridge: this.toolsetBridge.getConfiguration(),
    };
  }

  /**
   * Dispose of the manager and clean up resources
   */
  public async dispose(): Promise<void> {
    // Deactivate current persona
    if (this.activeState) {
      await this.deactivatePersona({ silent: true });
    }

    // Clean up components
    this.cache.destroy();
    this.discovery.dispose();
    this.mcpIntegration.dispose();

    // Clear state
    this.discoveredPersonas = [];
    this.lastDiscovery = null;
    this.initializationPromise = null;

    // Remove all listeners
    this.removeAllListeners();
  }

  /**
   * Perform manager initialization
   */
  private async performInitialization(): Promise<void> {
    try {
      // Restore persisted state if enabled
      if (this.config.persistState) {
        await this.restorePersistedState();
      }

      // Auto-discover personas if enabled
      if (this.config.autoDiscover) {
        const result = await this.discovery.discoverPersonas(
          this.config.discoveryConfig
        );
        this.discoveredPersonas = result.personas;
        this.lastDiscovery = new Date();

        this.emit(PersonaEvents.PERSONA_DISCOVERED, {
          count: result.personas.length,
          fromCache: false,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      // Initialization errors should not prevent usage
      this.emit("error", error);
    }
  }

  /**
   * Find and load a persona by name
   */
  private async findAndLoadPersona(
    personaName: string
  ): Promise<LoadedPersona | null> {
    // Check cache first
    const cached = this.cache.get(personaName);
    if (cached) {
      return cached;
    }

    // Find persona reference
    const personaRef = this.discoveredPersonas.find(
      (p) => p.name === personaName
    );
    if (!personaRef) {
      return null;
    }

    // Load persona
    const loadResult = await this.loader.loadPersonaFromReference(
      personaRef,
      this.config.defaultLoadOptions
    );

    if (!loadResult.success || !loadResult.persona) {
      throw new PersonaError(
        PersonaErrorCode.ACTIVATION_FAILED,
        `Failed to load persona "${personaName}": ${this.formatLoadErrors(loadResult.errors)}`,
        {
          details: { personaName, errors: loadResult.errors },
          recoverable: false,
        }
      );
    }

    // Cache the loaded persona
    this.cache.set(loadResult.persona);

    return loadResult.persona;
  }

  /**
   * Perform persona activation workflow
   */
  private async performActivation(
    persona: LoadedPersona,
    options: PersonaActivationOptions
  ): Promise<ActivationResult> {
    const warnings: string[] = [];

    // Validate persona if required
    if (this.config.validateOnActivation && !options.force) {
      if (!persona.validation.isValid) {
        throw createActivationFailedError(
          persona.config.name,
          `Persona validation failed: ${persona.validation.errors.map((e) => e.message).join(", ")}`
        );
      }

      if (persona.validation.warnings.length > 0) {
        warnings.push(...persona.validation.warnings.map((w) => w.message));
      }
    }

    // Determine toolset to activate
    const toolsetName = options.toolsetName || persona.config.defaultToolset;
    let selectedToolset: PersonaToolset | undefined;

    if (toolsetName) {
      selectedToolset = persona.config.toolsets?.find(
        (t) => t.name === toolsetName
      );
      if (!selectedToolset) {
        throw createToolsetNotFoundError(
          toolsetName,
          persona.config.toolsets?.map((t) => t.name) || []
        );
      }
    }

    // Backup current state if requested
    const previousState = options.backupState
      ? this.captureCurrentState()
      : undefined;

    // Apply toolset configuration (placeholder - would integrate with toolset system)
    let toolsResolved = 0;
    if (selectedToolset) {
      try {
        toolsResolved = await this.applyToolset(selectedToolset, persona);
      } catch (error) {
        warnings.push(
          `Some tools could not be resolved: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Apply MCP configuration if present
    let mcpConfigApplied = false;
    let mcpConfigWarnings: string[] = [];

    if (personaHasMcpConfig(persona.assets)) {
      try {
        const mcpResult = await this.mcpIntegration.applyPersonaConfig(
          persona.assets.mcpConfigFile!,
          this.config.mcpMergeOptions
        );

        mcpConfigApplied = mcpResult.success;

        if (mcpResult.warnings.length > 0) {
          mcpConfigWarnings.push(...mcpResult.warnings);
          warnings.push(...mcpResult.warnings);
        }

        if (mcpResult.errors.length > 0) {
          warnings.push(...mcpResult.errors);
        }

        if (mcpResult.conflicts.length > 0) {
          warnings.push(
            `MCP config conflicts resolved: ${mcpResult.conflicts.length}`
          );
        }
      } catch (error) {
        const errorMessage = `MCP config application failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        warnings.push(errorMessage);
        mcpConfigWarnings.push(errorMessage);
      }
    }

    // Now that MCP config is applied and servers may have started,
    // validate tool availability if we have a discovery engine
    const discoveryEngine = this.config.getToolDiscoveryEngine?.();
    if (mcpConfigApplied && discoveryEngine) {
      try {
        this.logger.info(
          "MCP config applied, waiting for servers to connect before validating tools..."
        );

        // Wait for servers to fully connect and tools to be discovered
        this.logger.debug(
          "Waiting for tools to be discovered from MCP servers..."
        );
        let retries = 0;
        let availableTools: any[] = [];

        while (retries < 20) {
          // Max 10 seconds (20 * 500ms)
          // Force a refresh of the discovery engine
          this.logger.debug(`Tool discovery attempt ${retries + 1}/20`);
          await discoveryEngine.refreshCache();

          availableTools = discoveryEngine.getAvailableTools(true);
          this.logger.debug(
            `Found ${availableTools.length} tools on attempt ${retries + 1}`
          );

          if (availableTools.length > 0) {
            this.logger.info(
              `Tools discovered successfully after ${retries + 1} attempts`
            );
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
          retries++;
        }

        if (availableTools.length === 0) {
          this.logger.warn(
            "No tools discovered after waiting 10 seconds - continuing anyway"
          );
        }

        this.logger.debug(
          "Getting final available tools from discovery engine"
        );

        // Get more detailed info about the discovery engine state
        this.logger.debug("Discovery engine details:", {
          engineType: discoveryEngine.constructor.name,
          hasGetStats: typeof discoveryEngine.getStats === "function",
          stats:
            typeof discoveryEngine.getStats === "function"
              ? discoveryEngine.getStats()
              : "No stats method",
        });

        // Log all tools grouped by server for debugging
        const toolsByServer: Record<string, string[]> = {};
        availableTools.forEach((tool) => {
          const serverName = tool.serverName || "unknown";
          if (!toolsByServer[serverName]) toolsByServer[serverName] = [];
          toolsByServer[serverName].push(tool.namespacedName);
        });

        this.logger.info(
          `Available tools after MCP config: ${availableTools.length}`,
          {
            toolsByServer,
          }
        );

        const { PersonaValidator } = await import("./validator.js");
        const validator = new PersonaValidator(discoveryEngine);
        const toolValidationResult = await validator.validatePersonaConfig(
          persona.config,
          {
            personaPath: persona.sourcePath,
            checkToolAvailability: true,
            validateMcpConfig: false, // Already validated
            toolDiscoveryEngine: discoveryEngine,
          },
          {
            checkToolAvailability: true,
            validateMcpConfig: false,
            includeWarnings: true,
          }
        );

        // Reapply toolset now that MCP servers are connected and tools are available
        if (selectedToolset) {
          try {
            this.logger.info(
              `Reapplying persona toolset '${selectedToolset.name}' with newly available tools...`
            );
            const toolsReapplied = await this.applyToolset(
              selectedToolset,
              persona
            );
            this.logger.info(
              `Successfully applied persona toolset '${selectedToolset.name}' with ${toolsReapplied} tools`
            );
          } catch (error) {
            const errorMessage = `Failed to reapply toolset after MCP connection: ${error instanceof Error ? error.message : String(error)}`;
            warnings.push(errorMessage);
            this.logger.warn(errorMessage);
          }
        }

        if (!toolValidationResult.isValid) {
          const toolErrors = toolValidationResult.errors
            .filter((e) => e.type === "tool-resolution")
            .map((e) => e.message);

          if (toolErrors.length > 0) {
            // Convert tool resolution errors to warnings instead of failing activation
            warnings.push(...toolErrors);
            this.logger.warn(
              "Some tools could not be resolved, but persona activation will continue",
              {
                errors: toolErrors,
              }
            );
          }
        }

        if (toolValidationResult.warnings.length > 0) {
          warnings.push(...toolValidationResult.warnings.map((w) => w.message));
        }
      } catch (error) {
        if (error instanceof PersonaError) {
          throw error;
        }
        const errorMessage = `Tool validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        warnings.push(errorMessage);
      }
    }

    // Create active state
    this.activeState = {
      persona,
      activeToolset: toolsetName,
      activatedAt: new Date(),
      previousState,
      metadata: {
        activationSource: "manual",
        validationPassed: persona.validation.isValid,
        toolsResolved,
        warnings,
        mcpConfigApplied,
        mcpConfigWarnings,
      },
    };

    // Persist state if enabled
    if (this.config.persistState) {
      await this.persistActiveState();
    }

    return {
      success: true,
      personaName: persona.config.name,
      activatedToolset: toolsetName,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Switch active toolset within current persona
   */
  private async switchToolset(
    toolsetName: string,
    silent?: boolean
  ): Promise<ActivationResult> {
    if (!this.activeState) {
      throw new Error("No active persona to switch toolset for");
    }

    const persona = this.activeState.persona;
    const toolset = persona.config.toolsets?.find(
      (t) => t.name === toolsetName
    );

    if (!toolset) {
      throw createToolsetNotFoundError(
        toolsetName,
        persona.config.toolsets?.map((t) => t.name) || []
      );
    }

    try {
      // Apply new toolset
      const toolsResolved = await this.applyToolset(toolset, persona);

      // Update active state
      this.activeState.activeToolset = toolsetName;
      this.activeState.metadata.toolsResolved = toolsResolved;

      if (!silent) {
        this.emit(PersonaEvents.PERSONA_TOOLSET_CHANGED, {
          persona: persona.config,
          previousToolset: this.activeState.activeToolset,
          newToolset: toolsetName,
          timestamp: new Date(),
        });
      }

      return {
        success: true,
        personaName: persona.config.name,
        activatedToolset: toolsetName,
      };
    } catch (error) {
      return {
        success: false,
        personaName: persona.config.name,
        errors: [
          `Failed to switch toolset: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  }

  /**
   * Apply toolset configuration via the toolset bridge
   */
  private async applyToolset(
    toolset: PersonaToolset,
    persona: LoadedPersona
  ): Promise<number> {
    const personaName = persona.config.name;

    try {
      // Convert persona toolset to ToolsetConfig format using the bridge
      const conversionResult = await this.toolsetBridge.convertPersonaToolset(
        toolset,
        personaName
      );

      if (!conversionResult.success || !conversionResult.toolsetConfig) {
        throw new Error(
          `Failed to convert persona toolset: ${conversionResult.error}`
        );
      }

      // Apply the toolset through the toolset manager if available
      if (this.config.toolsetManager) {
        const validation = this.config.toolsetManager.setCurrentToolset(
          conversionResult.toolsetConfig
        );

        if (!validation.valid) {
          throw new Error(
            `Invalid toolset configuration: ${validation.errors.join(", ")}`
          );
        }

        // Return the number of successfully resolved tools
        return (
          conversionResult.stats?.resolvedTools ||
          conversionResult.toolsetConfig.tools.length
        );
      } else {
        // No toolset manager available - fall back to basic tool resolution count
        return conversionResult.stats?.resolvedTools || toolset.toolIds.length;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to apply persona toolset: ${errorMessage}`);
    }
  }

  /**
   * Capture current state for restoration
   */
  private captureCurrentState(): ActivePersonaState["previousState"] {
    // This would capture the current toolset and MCP configuration state
    // Placeholder implementation
    return {
      toolsetName: undefined,
      mcpConfig: undefined,
      customState: {},
    };
  }

  /**
   * Restore previous state
   */
  private async restorePreviousState(
    previousState: ActivePersonaState["previousState"]
  ): Promise<void> {
    try {
      // Restore previous toolset if available
      if (previousState?.toolsetName && this.config.toolsetManager) {
        // Try to restore previous toolset (this is a simplified implementation)
        // In a full implementation, you'd need to restore the exact previous state
        await this.config.toolsetManager.unequipToolset();
      } else if (this.config.toolsetManager) {
        // No previous toolset, just unequip current one
        await this.config.toolsetManager.unequipToolset();
      }

      // Note: MCP configuration restoration is handled by the mcpIntegration.restoreOriginalConfig()
      // during deactivatePersona(), not here
    } catch (error) {
      // Log error but don't fail deactivation
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to restore previous state: ${errorMessage}`);
    }
  }

  /**
   * Persist active state for session restoration
   */
  private async persistActiveState(): Promise<void> {
    if (!this.activeState) {
      return;
    }

    try {
      const stateData = {
        personaName: this.activeState.persona.config.name,
        personaPath: this.activeState.persona.sourcePath,
        activeToolset: this.activeState.activeToolset,
        activatedAt: this.activeState.activatedAt.toISOString(),
        metadata: this.activeState.metadata,
      };

      const stateFilePath = this.getStateFilePath();
      await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
      await fs.writeFile(stateFilePath, JSON.stringify(stateData, null, 2));
    } catch (error) {
      this.logger.debug("Failed to persist persona state", { error });
    }
  }

  /**
   * Restore persisted state
   */
  private async restorePersistedState(): Promise<void> {
    try {
      const stateFilePath = this.getStateFilePath();

      // Check if state file exists
      try {
        await fs.access(stateFilePath);
      } catch {
        // State file doesn't exist, nothing to restore
        return;
      }

      const stateJson = await fs.readFile(stateFilePath, "utf8");
      const stateData = JSON.parse(stateJson);

      this.logger.info(`Restoring persisted persona: ${stateData.personaName}`);

      // Try to restore the persona
      await this.activatePersona(stateData.personaName, {
        toolsetName: stateData.activeToolset,
        silent: true,
      });

      // Update activation source
      if (this.activeState) {
        this.activeState.metadata.activationSource = "restored";
      }
    } catch (error) {
      this.logger.debug("Failed to restore persisted state", { error });
      // Clear invalid persisted state
      await this.clearPersistedState();
    }
  }

  /**
   * Clear persisted state
   */
  private async clearPersistedState(): Promise<void> {
    try {
      const stateFilePath = this.getStateFilePath();
      await fs.unlink(stateFilePath);
    } catch {
      // Ignore cleanup errors (file might not exist)
    }
  }

  /**
   * Get the file path for persisted state
   */
  private getStateFilePath(): string {
    const stateDir = path.join(os.homedir(), ".toolprint", "hypertool-mcp");
    return path.join(stateDir, `${this.config.stateKey}.json`);
  }

  /**
   * Setup event handling between components
   */
  private setupEventHandling(): void {
    // Forward cache events
    this.cache.on("cache:evicted", (event) => {
      if (
        this.activeState &&
        this.activeState.persona.config.name === event.name
      ) {
        // Active persona was evicted, reload it
        this.findAndLoadPersona(event.name).catch(() => {
          // If reload fails, deactivate the persona
          this.deactivatePersona({ silent: true });
        });
      }
    });

    // Forward discovery events
    this.discovery.on(PersonaEvents.PERSONA_DISCOVERED, (event) => {
      this.emit(PersonaEvents.PERSONA_DISCOVERED, event);
    });
  }

  /**
   * Format load errors for better readability
   */
  private formatLoadErrors(errors: string[]): string {
    if (errors.length === 0) {
      return "Unknown error";
    }

    if (errors.length === 1) {
      return errors[0];
    }

    // Group similar errors (especially tool ID format errors)
    const errorGroups = new Map<
      string,
      { count: number; details: Set<string> }
    >();

    for (const error of errors) {
      if (error.includes("Tool ID must follow namespacedName format")) {
        const key = "Tool ID format errors";
        if (!errorGroups.has(key)) {
          errorGroups.set(key, { count: 0, details: new Set() });
        }
        errorGroups.get(key)!.count++;
      } else {
        // Other errors - group by exact message
        const key = error;
        if (!errorGroups.has(key)) {
          errorGroups.set(key, { count: 1, details: new Set() });
        } else {
          errorGroups.get(key)!.count++;
        }
      }
    }

    // Format grouped errors
    const parts: string[] = [];
    for (const [errorType, info] of errorGroups) {
      if (errorType === "Tool ID format errors") {
        parts.push(
          `${info.count} tool ID(s) must follow namespacedName format (e.g., 'server.tool-name')`
        );
      } else {
        if (info.count > 1) {
          parts.push(`${errorType} (${info.count} instances)`);
        } else {
          parts.push(errorType);
        }
      }
    }

    return parts.join(", ");
  }
}

/**
 * Create a PersonaManager instance with default configuration
 */
export function createPersonaManager(
  config?: PersonaManagerConfig
): PersonaManager {
  return new PersonaManager(config);
}

/**
 * Default PersonaManager instance for application-wide use
 */
export const defaultPersonaManager = new PersonaManager();
