Restructuring Shared Objects and Boot Sequence

    Architecture Philosophy

    Create once, update state, never recreate. All major services should be
    singleton-like instances that update their configuration rather than being
    recreated.

    Shared Object Structure

    class EnhancedMetaMCPServer {
      // Core services - created once, never recreated
      private personaManager?: PersonaManager;
      private connectionManager?: ConnectionManager;
      private discoveryEngine?: ToolDiscoveryEngine;
      private toolsetManager: ToolsetManager; // Created in constructor

      // Getter functions for safe access
      private getPersonaManager = () => this.personaManager;
      private getConnectionManager = () => this.connectionManager;
      private getDiscoveryEngine = () => this.discoveryEngine;
      private getToolsetManager = () => this.toolsetManager;
    }

    New Boot Sequence

    Phase 1: Core Initialization

    private async initializeCore() {
      // 1. Database MUST be first
      await this.initDatabase();

      // 2. Create PersonaManager immediately after database
      this.personaManager = new PersonaManager({
        getToolDiscoveryEngine: this.getDiscoveryEngine, // Getter, not direct ref
        getToolsetManager: this.getToolsetManager,
        // Disable MCP config handlers initially
        mcpConfigHandlers: null,
      });
      await this.personaManager.initialize();
    }

    Phase 2: Collect ALL MCP Configurations

    private async collectAllMcpConfigs() {
      let allServers = {};

      // 3. If --persona flag, activate and get its MCP servers
      if (this.runtimeOptions?.persona) {
        const result = await this.personaManager.activatePersona(personaName);
        if (result.mcpServers) {
          allServers = { ...allServers, ...result.mcpServers };
        }
      }

      // 4. Load regular MCP config (file or database)
      const fileServers = await this.loadMcpConfigOrExit(options);
      allServers = { ...allServers, ...fileServers };

      // 5. Add extension servers if DXT enabled
      if (this.extensionManager) {
        const extServers =
    this.extensionManager.getEnabledExtensionsAsServerConfigs();
        allServers = { ...allServers, ...extServers };
      }

      // 6. Filter self-referencing servers
      return this.filterSelfReferencingServers(allServers);
    }

    Phase 3: Single Connection Attempt

    private async initializeConnections(allServers) {
      // 7. Create ConnectionManager ONCE
      this.connectionManager = new ConnectionManager(poolConfig);
      await this.connectionManager.initialize(allServers);

      // 8. Start all connections with timeout
      await this.connectionManager.start();
      // Log connection status for each server
    }

    Phase 4: Discovery Engine Initialization

    private async initializeDiscovery() {
      // 9. Create DiscoveryEngine ONCE after connections
      this.discoveryEngine = new ToolDiscoveryEngine(this.getConnectionManager());
      await this.discoveryEngine.initialize({ autoDiscovery: true });
      await this.discoveryEngine.start();

      // 10. Wire up toolset manager
      this.toolsetManager.setDiscoveryEngine(this.getDiscoveryEngine);

      // 11. Set up event listeners
      this.discoveryEngine.on('toolsChanged', this.handleToolsChanged);
    }

    Phase 5: Update PersonaManager Handlers

    private async finalizePersonaIntegration() {
      // 12. NOW set the MCP handlers that can update connections
      this.personaManager.setMcpHandlers({
        getCurrentConfig: () => this.getAllCurrentServers(),

        addServers: async (servers) => {
          // Use ConnectionManager.addServer() for each
          for (const [name, config] of Object.entries(servers)) {
            await this.connectionManager.addServer(name, config);
          }
          // Refresh discovery
          await this.discoveryEngine.refreshCache();
        },

        removeServers: async (serverNames) => {
          for (const name of serverNames) {
            await this.connectionManager.removeServer(name);
          }
          await this.discoveryEngine.refreshCache();
        }
      });
    }

    Key Changes

    1. PersonaManager Changes:
      - Remove ability to recreate discovery engine
      - Return MCP servers during activation
      - Use dynamic add/remove instead of full restart
    2. Enhanced Server Changes (enhanced.ts):
      - Move PersonaManager creation to right after database
      - Collect ALL servers before ANY connections
      - Create ConnectionManager and DiscoveryEngine exactly once
      - Remove the current initializePersona that recreates everything
    3. Connection Manager Usage:
      - Use addServer() and removeServer() for dynamic updates
      - Never stop/restart all connections
    4. Discovery Engine Usage:
      - Use refreshCache() and discoverTools() for updates
      - Never recreate the engine

    Files to Modify

    1. src/server/enhanced.ts:
      - Restructure initializeRouting() method
      - Remove discovery engine recreation in persona MCP handlers
      - Add new phase-based initialization methods
    2. src/persona/manager.ts:
      - Change activatePersona() to return MCP servers
      - Remove ability to stop/restart connections
      - Add setMcpHandlers() method for late binding
    3. src/connection/manager.ts:
      - Ensure addServer() and removeServer() work correctly
      - Add batch update methods if needed
    4. src/discovery/service.ts:
      - Ensure refreshCache() properly updates after connection changes
      - Add connection change listeners if needed

    This architecture ensures:
    - No object recreation (solving reference issues)
    - Clear initialization phases
    - Proper dependency management via getters
    - Persona MCP servers are loaded BEFORE initial connections
    - Single connection phase for all servers
    - Proper timing and ordering
