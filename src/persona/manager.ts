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

/**
 * Persona manager configuration options
 */
export interface PersonaManagerConfig {
  /** Tool discovery engine for validation */
  toolDiscoveryEngine?: IToolDiscoveryEngine;

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
  private readonly loader: PersonaLoader;
  private readonly cache: PersonaCache;
  private readonly discovery: PersonaDiscovery;
  private readonly toolsetBridge: PersonaToolsetBridge;
  private readonly config: Omit<
    Required<PersonaManagerConfig>,
    "toolDiscoveryEngine" | "toolsetManager"
  > & { 
    toolDiscoveryEngine?: IToolDiscoveryEngine;
    toolsetManager?: ToolsetManager;
  };

  private activeState: ActivePersonaState | null = null;
  private discoveredPersonas: PersonaReference[] = [];
  private lastDiscovery: Date | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: PersonaManagerConfig = {}) {
    super();

    // Apply default configuration
    this.config = {
      toolDiscoveryEngine: config.toolDiscoveryEngine,
      toolsetManager: config.toolsetManager,
      cacheConfig: config.cacheConfig || {},
      discoveryConfig: config.discoveryConfig || {},
      defaultLoadOptions: config.defaultLoadOptions || {},
      autoDiscover: config.autoDiscover ?? true,
      validateOnActivation: config.validateOnActivation ?? true,
      persistState: config.persistState ?? false,
      stateKey: config.stateKey ?? "hypertool-mcp-persona-state",
      bridgeOptions: config.bridgeOptions || {},
    };

    // Initialize components
    this.cache = new PersonaCache(this.config.cacheConfig);
    this.discovery = new PersonaDiscovery(this.config.cacheConfig);
    this.loader = new PersonaLoader(
      this.config.toolDiscoveryEngine,
      this.discovery
    );
    this.toolsetBridge = new PersonaToolsetBridge(
      this.config.toolDiscoveryEngine,
      this.config.bridgeOptions
    );

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
      // Restore previous state if available
      if (this.activeState.previousState) {
        await this.restorePreviousState(this.activeState.previousState);
      }

      // Clear active state
      this.activeState = null;

      // Clear persisted state if enabled
      if (this.config.persistState) {
        this.clearPersistedState();
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
        `Failed to load persona "${personaName}": ${loadResult.errors.join(", ")}`,
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
        toolsResolved = await this.applyToolset(selectedToolset);
      } catch (error) {
        warnings.push(
          `Some tools could not be resolved: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Apply MCP configuration if present (placeholder)
    if (persona.mcpConfig) {
      try {
        await this.applyMcpConfig(persona.mcpConfig);
      } catch (error) {
        warnings.push(
          `MCP config application failed: ${error instanceof Error ? error.message : String(error)}`
        );
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
      },
    };

    // Persist state if enabled
    if (this.config.persistState) {
      this.persistActiveState();
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
      const toolsResolved = await this.applyToolset(toolset);

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
  private async applyToolset(toolset: PersonaToolset): Promise<number> {
    if (!this.activeState?.persona) {
      throw new Error("No active persona to apply toolset for");
    }

    const personaName = this.activeState.persona.config.name;

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
        return conversionResult.stats?.resolvedTools || conversionResult.toolsetConfig.tools.length;
      } else {
        // No toolset manager available - fall back to basic tool resolution count
        return conversionResult.stats?.resolvedTools || toolset.toolIds.length;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to apply persona toolset: ${errorMessage}`);
    }
  }

  /**
   * Apply MCP configuration (placeholder for MCP integration)
   */
  private async applyMcpConfig(mcpConfig: any): Promise<void> {
    // This would integrate with the actual MCP configuration system
    // Placeholder implementation
    return Promise.resolve();
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

      // Restore previous MCP configuration if available
      if (previousState?.mcpConfig) {
        await this.applyMcpConfig(previousState.mcpConfig);
      }
    } catch (error) {
      // Log error but don't fail deactivation
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to restore previous state: ${errorMessage}`);
    }
  }

  /**
   * Persist active state for session restoration
   */
  private persistActiveState(): void {
    if (!this.activeState || typeof localStorage === "undefined") {
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

      localStorage.setItem(this.config.stateKey, JSON.stringify(stateData));
    } catch (error) {
      // Ignore persistence errors
    }
  }

  /**
   * Restore persisted state
   */
  private async restorePersistedState(): Promise<void> {
    if (typeof localStorage === "undefined") {
      return;
    }

    try {
      const stateJson = localStorage.getItem(this.config.stateKey);
      if (!stateJson) {
        return;
      }

      const stateData = JSON.parse(stateJson);

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
      // Clear invalid persisted state
      this.clearPersistedState();
    }
  }

  /**
   * Clear persisted state
   */
  private clearPersistedState(): void {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(this.config.stateKey);
      } catch {
        // Ignore cleanup errors
      }
    }
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
