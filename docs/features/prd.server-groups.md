 Architectural Proposal: Internal MCP Server & Group Management (NeDB & Repository Pattern)

  1. Vision & Rationale

  The primary goal is to establish a robust, flexible, and performant internal system for managing MCP Server configurations and their logical "Server Groups." This system will abstract away the complexities of parsing and reconciling multiple mcp.json files, providing a
  unified, indexed, and persistent view of all server and group data. By leveraging NeDB as our lightweight, file-based document database and strictly adhering to the Repository Pattern, we ensure a clean separation of concerns, efficient data access, and maintain the
  flexibility to swap the underlying database technology in the future if needed.

  This approach addresses the need for:
   * Centralized storage of server configurations.
   * Flexible, user-defined grouping of these configurations.
   * Efficient lookup and retrieval of servers and groups.
   * Decoupling the internal representation from the mcp.json file format.
   * Simplified synchronization with external mcp.json changes.

  2. Core Concepts & Entities

   * Internal Document Database (NeDB): We will utilize NeDB, a pure JavaScript, file-backed embedded database. Each conceptual "collection" (e.g., servers, groups) will correspond to a NeDB Datastore instance, persisting its data to a dedicated file within a designated
     application data directory (e.g., ~/.toolprint/hypertool-mcp/db/mcp-servers.db). NeDB's automatic persistence and MongoDB-like API make it an ideal choice for this local, lightweight storage requirement.

   * `ServerConfigRecord` (Document): This entity represents a canonical, internally managed MCP server configuration. Each ServerConfigRecord will be stored as a document in the servers collection.
       * id (string): A globally unique identifier (UUID) for this server configuration record. This will be the primary key in our internal system.
       * name (string): The user-defined name of the server, as specified in the mcp.json file.
       * type (string): The type of the server, e.g., 'stdio', 'http', 'sse'.
       * config (object): The complete, parsed configuration details of the server (e.g., command, args, url, headers, env). This will be stored as a native JSON object within the document.
       * lastModified (number): A Unix timestamp indicating when this server configuration record was last updated in the internal database. Useful for reconciliation.
       * checksum (string): A cryptographic hash (e.g., SHA256) of the config object. This allows for efficient detection of changes to the server's configuration during synchronization, avoiding unnecessary updates.

   * `ServerConfigGroup` (Document): This entity represents a named, user-defined collection of ServerConfigRecord IDs. Each ServerConfigGroup will be stored as a document in the groups collection.
       * id (string): A globally unique identifier (UUID) for this server configuration group.
       * name (string): The user-defined name for the group (e.g., "development-stack", "production-apis"). This name will be unique across all groups.
       * description (string, optional): An optional, brief textual description of the group's purpose or contents.
       * serverIds (array of strings): An array containing the ids of the ServerConfigRecords that belong to this group. This establishes the relationship between groups and servers.

  3. Data Model (NeDB Collections)

  We will utilize two distinct NeDB Datastore instances, each persisting to a separate file within the application's data directory (e.g., ~/.toolprint/hypertool-mcp/db/):

  servers Collection (backed by mcp-servers.db)

  This collection will store ServerConfigRecord documents.

  Example `ServerConfigRecord` Document:

    1 {
    2   "_id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    3   "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    4   "name": "devApiServer",
    5   "type": "http",
    6   "config": {
    7     "type": "http",
    8     "url": "http://localhost:3000/api",
    9     "headers": {}
   10   },
   11   "lastModified": 1722457200000,
   12   "checksum": "sha256-..."
   13 }

  Indexes to be created on this collection for efficient querying:
   * id (unique): Ensures fast lookup by unique ID.
   * name (unique): Ensures fast lookup by user-defined name and prevents duplicate server names.

  groups Collection (backed by mcp-groups.db)

  This collection will store ServerConfigGroup documents.

  Example `ServerConfigGroup` Document:

    1 {
    2   "_id": "f0e9d8c7-b6a5-4321-fedc-ba9876543210",
    3   "id": "f0e9d8c7-b6a5-4321-fedc-ba9876543210",
    4   "name": "development-stack",
    5   "description": "All development-related servers for local testing",
    6   "serverIds": [
    7     "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    8     "b2c3d4e5-f6a7-8901-2345-67890abcdef0"
    9   ]
   10 }

  Indexes to be created on this collection for efficient querying:
   * id (unique): Ensures fast lookup by unique ID.
   * name (unique): Ensures fast lookup by group name and prevents duplicate group names.

  4. Repository Pattern Implementation

  The Repository Pattern is central to this architecture, providing an abstraction layer over the NeDB implementation. This ensures that the application's business logic interacts with well-defined interfaces, making the underlying database technology interchangeable.

  Interfaces (src/db/interfaces.ts)

  These TypeScript interfaces define the contract for our data access layer, independent of NeDB.

    1 // src/db/interfaces.ts
    2 
    3 import { ServerConfig } from '../types/config.js'; // Assuming this is your existing type
    4 
    5 /**
    6  * Represents a canonical, internally managed MCP server configuration record.
    7  * Stored in the 'servers' collection.
    8  */
    9 export interface ServerConfigRecord {
   10   id: string; // Unique ID generated by the DB layer (e.g., UUID)
   11   name: string; // User-defined name from mcp.json
   12   type: 'stdio' | 'http' | 'sse';
   13   config: ServerConfig; // The actual server configuration object
   14   lastModified: number; // Unix timestamp
   15   checksum: string; // Checksum of the config for change detection
   16 }
   17 
   18 /**
   19  * Represents a named, user-defined collection of ServerConfigRecord IDs.
   20  * Stored in the 'groups' collection.
   21  */
   22 export interface ServerConfigGroup {
   23   id: string; // Unique ID generated by the DB layer
   24   name: string; // User-defined group name (unique)
   25   description?: string; // Optional description
   26   serverIds: string[]; // Array of ServerConfigRecord.id strings
   27 }
   28 
   29 /**
   30  * Interface for interacting with ServerConfigRecord data.
   31  */
   32 export interface IServerConfigRecordRepository {
   33   add(server: Omit<ServerConfigRecord, 'id'>): Promise<ServerConfigRecord>;
   34   update(server: ServerConfigRecord): Promise<ServerConfigRecord | null>;
   35   delete(id: string): Promise<boolean>;
   36   findById(id: string): Promise<ServerConfigRecord | null>;
   37   findByName(name: string): Promise<ServerConfigRecord | null>;
   38   findAll(): Promise<ServerConfigRecord[]>;
   39   // Additional query methods can be added as needed (e.g., findByType)
   40 }
   41 
   42 /**
   43  * Interface for interacting with ServerConfigGroup data.
   44  */
   45 export interface IServerConfigGroupRepository {
   46   add(group: Omit<ServerConfigGroup, 'id'>): Promise<ServerConfigGroup>;
   47   update(group: ServerConfigGroup): Promise<ServerConfigGroup | null>;
   48   delete(id: string): Promise<boolean>;
   49   findByName(name: string): Promise<ServerConfigGroup | null>;
   50   findAll(): Promise<ServerConfigGroup[]>;
   51   /**
   52    * Retrieves all ServerConfigRecord objects that are members of a specific group.
   53    * This method will internally query the IServerConfigRecordRepository.
   54    */
   55   findServersInGroup(groupId: string): Promise<ServerConfigRecord[]>;
   56   // Additional query methods can be added as needed
   57 }
   58 
   59 /**
   60  * Central service interface for managing the database and providing access to repositories.
   61  */
   62 export interface IDatabaseService {
   63   servers: IServerConfigRecordRepository;
   64   groups: IServerConfigGroupRepository;
   65   init(): Promise<void>; // Initializes the database (loads data, sets up indexes)
   66   close(): Promise<void>; // Closes the database connection (flushes data to disk)
   67 }

  NeDB Repository Implementations

  Concrete classes will implement the above interfaces using NeDB's Datastore API.

   * `NeDBServerConfigRecordRepository` (`src/db/nedbServerConfigRecordRepository.ts`):
       * Implements IServerConfigRecordRepository.
       * Uses a Datastore instance for the servers collection.
       * Handles CRUD operations for ServerConfigRecord documents.
       * Ensures id and name indexes are created.
   * `NeDBServerConfigGroupRepository` (`src/db/nedbServerConfigGroupRepository.ts`):
       * Implements IServerConfigGroupRepository.
       * Uses a Datastore instance for the groups collection.
       * Handles CRUD operations for ServerConfigGroup documents.
       * Requires an instance of IServerConfigRecordRepository (dependency injection) to resolve ServerConfigRecord objects when findServersInGroup is called.
       * Ensures id and name indexes are created.

  NeDB Database Service (src/db/nedbService.ts)

  This class will implement IDatabaseService and serve as the central entry point for database operations.

   * `NeDBService`:
       * Manages the initialization and loading of the NeDB Datastore instances for both servers and groups collections.
       * Instantiates and provides access to the NeDBServerConfigRecordRepository and NeDBServerConfigGroupRepository instances.
       * Determines the file paths for the NeDB data files (e.g., within ~/.toolprint/hypertool-mcp/db/).
       * Handles the init() method to load databases and close() for graceful shutdown (flushing data).

  5. Operational Flow & Synchronization

  The internal database will act as the authoritative source for server configurations and groups. Synchronization with external mcp.json files will be a key process.

   1. Application Startup/Database Initialization:
       * Upon application launch, the main CLI entry point will instantiate NeDBService and call its init() method. This will load the mcp-servers.db and mcp-groups.db files into memory, making the data immediately available via the repositories.
   2. `mcp.json` Synchronization (`src/config-manager/serverSync.ts`):
       * A dedicated serverSync module will be responsible for reconciling the contents of discovered mcp.json files with the servers collection in the internal database.
       * It will:
           * Utilize existing mcpConfigLoader.ts and mcpConfigParser.ts to read and parse mcp.json files into a temporary list of ServerConfig objects.
           * For each parsed ServerConfig, it will calculate a checksum.
           * It will then compare these with existing ServerConfigRecords in the servers collection (primarily by name).
           * Additions: If a server from mcp.json is new (no matching name in the DB), it will be added as a ServerConfigRecord via dbService.servers.add(), generating a new id.
           * Updates: If a server exists in the DB but its checksum differs from the mcp.json version, its config and lastModified fields will be updated via dbService.servers.update().
           * Deletions: If a ServerConfigRecord exists in the DB but its corresponding server is no longer found in any mcp.json file, it will be deleted via dbService.servers.delete().
           * Group Consistency: After any ServerConfigRecord is added, updated, or deleted, a critical step will be to ensure consistency within ServerConfigGroups. If a ServerConfigRecord is deleted, its id must be removed from the serverIds array of any ServerConfigGroup that
             references it. This will involve querying dbService.groups for groups containing the deleted id and updating those ServerConfigGroup documents.
   3. Server Group Management (New CLI/API):
       * New CLI commands (e.g., hypertool-mcp mcp group create <name>, hypertool-mcp mcp group add <groupName> <serverName>, hypertool-mcp mcp group list) will be introduced.
       * These commands will interact directly with dbService.groups (our IServerConfigGroupRepository instance) to perform CRUD operations on ServerConfigGroup documents.
       * When adding servers to a group, the CLI will first resolve the ServerConfigRecord.id using dbService.servers.findByName() to ensure valid references.
   4. Runtime Server Resolution:
       * When a command requires running servers (e.g., hypertool-mcp --group production):
           * The command will query dbService.groups.findByName('production') to retrieve the ServerConfigGroup document.
           * It will then call dbService.groups.findServersInGroup(groupId) to get the actual ServerConfigRecord objects.
           * These ServerConfigRecord objects (containing their full config payload) will then be used to launch the respective MCP servers.

  6. Benefits of this Architecture

   * Clean Separation of Concerns: The Repository Pattern clearly separates data access logic from business logic, improving maintainability and testability.
   * Database Agnostic: The application's core logic is decoupled from NeDB. Switching to another database (e.g., LokiJS, SQLite) in the future would primarily involve implementing new repository classes, without altering the main application code.
   * Native JSON Storage: NeDB's document-oriented nature is a natural fit for storing complex ServerConfig objects directly as JSON, eliminating the need for manual serialization/deserialization.
   * Automatic Persistence: NeDB's autoload feature simplifies file management, automatically loading data on startup and persisting changes.
   * Efficient Lookups: NeDB's indexing capabilities ensure fast retrieval of ServerConfigRecords by id or name, and ServerConfigGroups by id or name.
   * UUIDs for Robustness: Explicitly generated UUIDs provide stable, globally unique identifiers for ServerConfigRecords and ServerConfigGroups, independent of their user-defined names or file paths.
   * Simplified Synchronization: The checksum and lastModified fields, combined with the serverSync module, provide a clear mechanism for keeping the internal database up-to-date with external mcp.json changes.
