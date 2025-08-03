/**
 * Tests for BackupManager using the test fixture system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BackupManager } from "./manager.js";
import { TestEnvironment } from "../../../test/fixtures/base.js";
import { resetDatabaseForTesting } from "../../../src/test-utils/database.js";

// Mock the entire database layer to prevent hanging
vi.mock('../../../src/db/compositeDatabaseService.js', () => {
  const mockService = {
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    servers: {
      findAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'mock-server' }),
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    groups: {
      findAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'mock-group' }),
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    configSources: {
      findAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'mock-source' }),
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    resetForTesting: vi.fn(),
    getImplementationType: vi.fn().mockReturnValue('mock')
  };
  
  return {
    CompositeDatabaseService: vi.fn(() => mockService),
    getCompositeDatabaseService: vi.fn(() => mockService),
    resetCompositeDatabaseServiceForTesting: vi.fn()
  };
});
import {
  ExistingConfigScenario,
  FreshInstallScenario,
  MultiServerScenario,
  CorruptedConfigScenario,
  PartialConfigScenario,
} from "../../../test/fixtures/scenarios/index.js";

// Mock NeDB completely to prevent any file system operations
vi.mock('@seald-io/nedb', () => {
  const createMockDB = () => ({
    insert: vi.fn().mockImplementation((doc, callback) => {
      if (callback) callback(null, { ...doc, _id: 'mock-id-' + Date.now() });
      return Promise.resolve({ ...doc, _id: 'mock-id-' + Date.now() });
    }),
    find: vi.fn().mockImplementation((query, callback) => {
      const result = [];
      if (callback) callback(null, result);
      return Promise.resolve(result);
    }),
    findOne: vi.fn().mockImplementation((query, callback) => {
      if (callback) callback(null, null);
      return Promise.resolve(null);
    }),
    update: vi.fn().mockImplementation((query, update, options, callback) => {
      if (typeof options === 'function') callback = options;
      if (callback) callback(null, 0, [], true);
      return Promise.resolve({ numAffected: 0, affectedDocuments: [], upsert: true });
    }),
    remove: vi.fn().mockImplementation((query, options, callback) => {
      if (typeof options === 'function') callback = options;
      if (callback) callback(null, 0);
      return Promise.resolve(0);
    }),
    count: vi.fn().mockImplementation((query, callback) => {
      if (callback) callback(null, 0);
      return Promise.resolve(0);
    }),
    loadDatabase: vi.fn().mockImplementation((callback) => {
      if (callback) callback(null);
      return Promise.resolve();
    }),
    compactDatafile: vi.fn().mockImplementation((callback) => {
      if (callback) callback(null);
      return Promise.resolve();
    }),
    ensureIndex: vi.fn().mockImplementation((options, callback) => {
      if (callback) callback(null);
      return Promise.resolve();
    }),
    removeIndex: vi.fn().mockImplementation((fieldName, callback) => {
      if (callback) callback(null);
      return Promise.resolve();
    }),
    getAllData: vi.fn().mockReturnValue([]),
    resetIndexes: vi.fn(),
    persistence: {
      compactDatafile: vi.fn().mockImplementation((callback) => {
        if (callback) callback(null);
        return Promise.resolve();
      }),
      setAutocompactionInterval: vi.fn(),
      stopAutocompaction: vi.fn()
    },
    // Event emitter methods
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn()
  });
  
  return {
    default: vi.fn(createMockDB),
    Datastore: vi.fn(createMockDB)
  };
});
import {
  assertFileExists,
  assertFileNotExists,
  getConfigContent,
} from "../../../test/helpers/assertions.js";
import { join } from "path";
import * as tar from "tar";
import { vol } from "memfs";

// Mock tar module to work with memfs
vi.mock("tar", () => ({
  create: vi.fn().mockImplementation(({ cwd, file }, paths) => {
    // Simulate tar creation in memfs
    const files: Record<string, string> = {};

    const collectFiles = (basePath: string, relativePath: string = "") => {
      try {
        const stats = vol.statSync(basePath);
        if (stats.isDirectory()) {
          const items = vol.readdirSync(basePath) as string[];
          for (const item of items) {
            const itemPath = join(basePath, item);
            const itemRelativePath = relativePath
              ? join(relativePath, item)
              : item;
            collectFiles(itemPath, itemRelativePath);
          }
        } else if (stats.isFile()) {
          const content = vol.readFileSync(basePath, "utf-8") as string;
          files[relativePath] = content;
        }
      } catch {
        // Skip inaccessible files
      }
    };

    // Collect files to tar
    for (const path of paths) {
      const fullPath = join(cwd || "", path);
      collectFiles(fullPath, path);
    }

    // Create a mock tar file
    const tarContent = JSON.stringify({ type: "mock-tar", files });
    vol.writeFileSync(file, tarContent);

    return Promise.resolve();
  }),

  extract: vi.fn().mockImplementation(({ file, cwd }) => {
    // Simulate tar extraction in memfs
    try {
      const tarContent = vol.readFileSync(file, "utf-8") as string;
      const { files } = JSON.parse(tarContent);

      for (const [path, content] of Object.entries(files)) {
        const fullPath = join(cwd || "", path);
        const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        vol.mkdirSync(dir, { recursive: true });
        vol.writeFileSync(fullPath, content);
      }
    } catch {
      throw new Error("Failed to extract tar file");
    }

    return Promise.resolve();
  }),
}));

describe("BackupManager", () => {
  let env: TestEnvironment;
  let backupManager: BackupManager;
  const baseDir = "/tmp/hypertool-test";

  beforeEach(async () => {
    // Add timeout to prevent hanging
    const setupPromise = (async () => {
      resetDatabaseForTesting();
      env = new TestEnvironment(baseDir);
      await env.setup();
      backupManager = new BackupManager(env.getConfig().configRoot);
    })();
    
    // Race setup against timeout
    await Promise.race([
      setupPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test setup timed out')), 3000)
      )
    ]);
  });

  afterEach(async () => {
    // Add timeout to teardown as well
    const teardownPromise = (async () => {
      if (env) {
        await env.teardown();
      }
      resetDatabaseForTesting();
      vi.clearAllMocks();
    })();
    
    // Race teardown against timeout
    await Promise.race([
      teardownPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test teardown timed out')), 2000)
      )
    ]).catch((error) => {
      console.warn('Teardown timeout:', error.message);
      // Continue with cleanup even if teardown times out
    });
  });

  describe("initialization", () => {
    it("should create backup directory on initialization", async () => {
      const backupDir = join(env.getConfig().configRoot, "backups");
      expect(await env.fileExists(backupDir)).toBe(true);
    });
  });

  describe("createBackup", () => {
    it("should create backup of fresh installation", async () => {
      await env.setup(new FreshInstallScenario());

      // Add timeout handling for this specific test
      const result = await Promise.race([
        backupManager.createBackup(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('createBackup timed out after 5 seconds')), 5000)
        )
      ]) as any;

      expect(result.success).toBe(true);
      expect(result.backupId).toBeDefined();
      expect(result.backupPath).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.total_servers).toBe(0);
      expect(result.metadata?.applications).toEqual({});
    }, 8000);

    it("should create backup with existing configurations", async () => {
      await env.setup(new ExistingConfigScenario(["claude-desktop", "cursor"]));

      // Add timeout for the backup operation
      const result = await Promise.race([
        backupManager.createBackup(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('createBackup timed out after 3 seconds')), 3000)
        )
      ]) as any;

      expect(result.success).toBe(true);
      expect(result.metadata?.total_servers).toBeGreaterThan(0);
      expect(result.metadata?.applications["claude-desktop"]).toBeDefined();
      expect(result.metadata?.applications["cursor"]).toBeDefined();

      // Verify backup file exists
      assertFileExists(result.backupPath!);

      // Verify metadata file exists
      const metadataPath = result.backupPath!.replace(".tar.gz", ".yaml");
      assertFileExists(metadataPath);
    }, 5000);

    it("should handle multi-server configurations", async () => {
      await env.setup(new MultiServerScenario(20, true));

      // Add timeout for the backup operation
      const result = await Promise.race([
        backupManager.createBackup(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Multi-server backup timed out after 3 seconds')), 3000)
        )
      ]) as any;

      expect(result.success).toBe(true);
      expect(result.metadata?.total_servers).toBeGreaterThanOrEqual(20);

      // Check that complex server configs are preserved
      const claudeDesktopBackup =
        result.metadata?.applications["claude-desktop"];
      expect(claudeDesktopBackup?.servers_count).toBeGreaterThanOrEqual(15);
    }, 5000);

    it("should skip corrupted configurations", async () => {
      await env.setup(
        new CorruptedConfigScenario(["claude-desktop"], ["cursor"])
      );

      const result = await backupManager.createBackup();

      expect(result.success).toBe(true);
      // Should only backup the valid cursor config
      expect(result.metadata?.applications["cursor"]).toBeDefined();
      expect(result.metadata?.applications["claude-desktop"]).toBeUndefined();
    });

    it("should handle partial configurations", async () => {
      await env.setup(
        new PartialConfigScenario(["claude-desktop"], ["cursor"])
      );

      const result = await backupManager.createBackup();

      expect(result.success).toBe(true);
      // Should only backup claude-desktop which has config
      expect(result.metadata?.applications["claude-desktop"]).toBeDefined();
      expect(result.metadata?.applications["cursor"]).toBeUndefined();
    });

    it("should include system information in metadata", async () => {
      await env.setup(new ExistingConfigScenario(["claude-desktop"]));

      const result = await backupManager.createBackup();

      expect(result.metadata?.system_info).toBeDefined();
      expect(result.metadata?.system_info.platform).toBeDefined();
      expect(result.metadata?.system_info.arch).toBeDefined();
      expect(result.metadata?.system_info.node_version).toBeDefined();
    });

    it("should generate unique backup IDs", async () => {
      await env.setup(new ExistingConfigScenario(["claude-desktop"]));

      const result1 = await backupManager.createBackup();
      // Add small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result2 = await backupManager.createBackup();

      expect(result1.backupId).not.toBe(result2.backupId);
      expect(result1.backupPath).not.toBe(result2.backupPath);
    });
  });

  describe("listBackups", () => {
    it("should list all created backups", async () => {
      await env.setup(new ExistingConfigScenario(["claude-desktop"]));

      // Create multiple backups
      await backupManager.createBackup();
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay for different timestamps
      await backupManager.createBackup();

      const backups = await backupManager.listBackups();

      expect(backups.length).toBe(2);
      expect(backups[0].id).toBeDefined();
      expect(backups[0].timestamp).toBeDefined();
      expect(backups[0].metadata).toBeDefined();

      // Should be sorted by timestamp (newest first)
      expect(new Date(backups[0].timestamp).getTime()).toBeGreaterThan(
        new Date(backups[1].timestamp).getTime()
      );
    });

    it("should return empty array when no backups exist", async () => {
      const backups = await backupManager.listBackups();
      expect(backups).toEqual([]);
    });
  });

  describe("getBackup", () => {
    it("should retrieve specific backup by ID", async () => {
      await env.setup(new ExistingConfigScenario(["claude-desktop"]));

      const createResult = await backupManager.createBackup();
      const backup = await backupManager.getBackup(createResult.backupId!);

      expect(backup).toBeDefined();
      expect(backup?.id).toBe(createResult.backupId);
      expect(backup?.metadata.total_servers).toBeGreaterThan(0);
    });

    it("should return null for non-existent backup", async () => {
      const backup = await backupManager.getBackup("non-existent-id");
      expect(backup).toBeNull();
    });
  });

  describe("restoreBackup", () => {
    it("should restore configurations from backup", async () => {
      // Setup with initial configs
      await env.setup(new ExistingConfigScenario(["claude-desktop", "cursor"]));

      // Get original configs
      const claudeConfigPath = join(
        baseDir,
        "Library/Application Support/Claude/claude_desktop_config.json"
      );
      const cursorConfigPath = join(baseDir, ".cursor/mcp.json");
      const originalClaudeConfig = getConfigContent(claudeConfigPath);
      const originalCursorConfig = getConfigContent(cursorConfigPath);

      // Create backup
      const backupResult = await backupManager.createBackup();
      expect(backupResult.success).toBe(true);

      // Modify configs (simulate hypertool installation)
      vol.writeFileSync(
        claudeConfigPath,
        JSON.stringify({
          mcpServers: {
            "hypertool-mcp": { type: "stdio", command: "hypertool" },
          },
        })
      );
      vol.writeFileSync(
        cursorConfigPath,
        JSON.stringify({
          mcpServers: {
            "hypertool-mcp": { type: "stdio", command: "hypertool" },
          },
        })
      );

      // Restore from backup
      const restoreResult = await backupManager.restoreBackup(
        backupResult.backupId!
      );

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.restored).toContain("claude-desktop");
      expect(restoreResult.restored).toContain("cursor");

      // Verify configs were restored
      const restoredClaudeConfig = getConfigContent(claudeConfigPath);
      const restoredCursorConfig = getConfigContent(cursorConfigPath);

      expect(restoredClaudeConfig).toEqual(originalClaudeConfig);
      expect(restoredCursorConfig).toEqual(originalCursorConfig);
    });

    it("should handle partial restore when some apps are missing", async () => {
      // Create backup with two apps
      await env.setup(new ExistingConfigScenario(["claude-desktop", "cursor"]));
      const backupResult = await backupManager.createBackup();

      // Remove cursor directory to simulate uninstall
      vol.rmdirSync(join(baseDir, ".cursor"), { recursive: true });

      // Restore should work for claude-desktop but fail for cursor
      const restoreResult = await backupManager.restoreBackup(
        backupResult.backupId!
      );

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.restored).toContain("claude-desktop");
      expect(restoreResult.failed).toContain("cursor");
    });

    it("should fail gracefully for non-existent backup", async () => {
      const restoreResult =
        await backupManager.restoreBackup("non-existent-id");

      expect(restoreResult.success).toBe(false);
      expect(restoreResult.error).toContain("Backup not found");
    });

    it("should create application directories if they don't exist", async () => {
      // Create backup
      await env.setup(new ExistingConfigScenario(["claude-desktop"]));
      const backupResult = await backupManager.createBackup();

      // Remove only the config file but keep the Claude directory to simulate app still installed
      const claudeDir = join(baseDir, "Library/Application Support/Claude");
      const configFile = join(claudeDir, "claude_desktop_config.json");
      vol.unlinkSync(configFile);

      // Restore should recreate the config file
      const restoreResult = await backupManager.restoreBackup(
        backupResult.backupId!
      );

      expect(restoreResult.success).toBe(true);
      expect(await env.fileExists(claudeDir)).toBe(true);
      expect(await env.fileExists(configFile)).toBe(true);
    });
  });

  describe("deleteBackup", () => {
    it("should delete backup and its metadata", async () => {
      await env.setup(new ExistingConfigScenario(["claude-desktop"]));

      const backupResult = await backupManager.createBackup();
      const backupPath = backupResult.backupPath!;
      const metadataPath = backupPath.replace(".tar.gz", ".yaml");

      // Verify files exist
      assertFileExists(backupPath);
      assertFileExists(metadataPath);

      // Delete backup
      const deleteResult = await backupManager.deleteBackup(
        backupResult.backupId!
      );

      expect(deleteResult.success).toBe(true);

      // Verify files are gone
      assertFileNotExists(backupPath);
      assertFileNotExists(metadataPath);
    });

    it("should handle deletion of non-existent backup", async () => {
      const deleteResult = await backupManager.deleteBackup("non-existent-id");

      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toContain("Backup not found");
    });
  });

  describe("error handling", () => {
    it("should handle backup creation errors gracefully", async () => {
      await env.setup(new ExistingConfigScenario(["claude-desktop"]));
      
      // In test mode, we need to mock fs operations instead of tar
      const originalMkdir = vol.promises.mkdir;
      vol.promises.mkdir = vi.fn().mockRejectedValueOnce(
        new Error("Directory creation failed")
      );

      const result = await backupManager.createBackup();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Directory creation failed");
      
      // Restore original
      vol.promises.mkdir = originalMkdir;
    });

    it("should handle restore errors gracefully", async () => {
      await env.setup(new ExistingConfigScenario(["claude-desktop"]));
      const backupResult = await backupManager.createBackup();

      // In test mode, mock fs.readFile to simulate error
      const originalReadFile = vol.promises.readFile;
      vol.promises.readFile = vi.fn().mockImplementation((path: string) => {
        if (path.includes("metadata.yaml")) {
          throw new Error("File read failed");
        }
        return originalReadFile.call(vol.promises, path);
      });

      const restoreResult = await backupManager.restoreBackup(
        backupResult.backupId!
      );

      expect(restoreResult.success).toBe(false);
      expect(restoreResult.error).toContain("File read failed");
      
      // Restore original
      vol.promises.readFile = originalReadFile;
    });
  });

  describe("cross-platform support", () => {
    it("should handle Windows paths correctly", async () => {
      env.setPlatform("win32");
      await env.setup(new FreshInstallScenario());

      // Create Windows-style config
      await env.createAppStructure("claude-desktop", {
        "AppData/Roaming/Claude/claude_desktop_config.json": JSON.stringify({
          mcpServers: { "test-server": { type: "stdio", command: "test.exe" } },
        }),
      });

      const result = await backupManager.createBackup();

      expect(result.success).toBe(true);
      expect(result.metadata?.system_info.platform).toBe("win32");
    });
  });
});
