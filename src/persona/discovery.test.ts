/**
 * PersonaDiscovery Test Suite
 *
 * Comprehensive tests for persona discovery engine, including discovery orchestration,
 * caching behavior, quick validation, event emission, statistics tracking,
 * and integration with scanner and parser modules.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  beforeAll,
  afterAll,
} from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { EventEmitter } from "events";
import {
  PersonaDiscovery,
  defaultPersonaDiscovery,
  discoverPersonas,
  refreshPersonaDiscovery,
  hasAvailablePersonas,
  getDiscoveryCacheStats,
  clearDiscoveryCache,
} from "./discovery.js";
import {
  PersonaEvents,
  type PersonaDiscoveryResult,
  type PersonaDiscoveryConfig,
  type PersonaCacheConfig,
} from "./types.js";

// Mock console.warn to avoid noise in tests
const originalConsoleWarn = console.warn;
beforeAll(() => {
  console.warn = vi.fn();
});

afterAll(() => {
  console.warn = originalConsoleWarn;
});

describe("PersonaDiscovery", () => {
  let tempDir: string;
  let discovery: PersonaDiscovery;
  let testStructure: { [key: string]: any };

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(join(tmpdir(), "persona-discovery-test-"));

    // Create test directory structure
    testStructure = {
      "valid-persona": {
        "persona.yaml": `
name: valid-persona
description: A valid persona for testing discovery functionality
toolsets:
  - name: development
    toolIds: ["git.status", "docker.ps"]
`,
      },

      "minimal-persona": {
        "persona.yml": `
name: minimal-persona
description: Minimal persona configuration
`,
      },

      "invalid-yaml-persona": {
        "persona.yaml": "invalid yaml: [unclosed bracket",
      },

      "missing-name-persona": {
        "persona.yaml": `
description: Persona missing name field
`,
      },

      "mismatch-name-persona": {
        "persona.yaml": `
name: different-name
description: Name doesn't match folder name
`,
      },

      "short-description-persona": {
        "persona.yaml": `
name: short-description-persona
description: Short
`,
      },

      "archive-persona.htp": "mock archive content",

      nested: {
        "deep-persona": {
          "persona.yaml": `
name: deep-persona
description: Deeply nested persona for testing
`,
        },
      },

      "duplicate-name": {
        "persona.yaml": `
name: test-duplicate
description: First persona with duplicate name
`,
      },

      "duplicate-name-2": {
        "persona.yaml": `
name: test-duplicate
description: Second persona with duplicate name
`,
      },
    };

    await createTestStructure(tempDir, testStructure);

    // Create discovery instance with fast TTL for testing
    discovery = new PersonaDiscovery({
      ttl: 100, // 100ms for fast expiration in tests
      maxSize: 10,
      enableStats: true,
    });
  });

  afterEach(async () => {
    // Clean up discovery instance
    if (discovery) {
      discovery.dispose();
    }

    // Clean up temporary files
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("PersonaDiscovery Class", () => {
    describe("Discovery Operations", () => {
      it("should discover personas in configured paths", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        const result = await discovery.discoverPersonas(config);

        expect(result.personas).toBeDefined();
        expect(result.personas.length).toBeGreaterThan(0);
        expect(result.errors).toBeDefined();
        expect(result.warnings).toBeDefined();
        expect(result.searchPaths).toContain(tempDir);

        // Check specific personas
        const personaNames = result.personas.map((p) => p.name);
        expect(personaNames).toContain("valid-persona");
        expect(personaNames).toContain("minimal-persona");

        // Verify persona properties
        const validPersona = result.personas.find(
          (p) => p.name === "valid-persona"
        );
        expect(validPersona).toBeDefined();
        expect(validPersona?.isValid).toBe(true);
        expect(validPersona?.description).toContain("valid persona");
        expect(validPersona?.isArchive).toBe(false);
      });

      it("should discover archive files", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        const result = await discovery.discoverPersonas(config);
        const archivePersona = result.personas.find(
          (p) => p.name === "archive-persona"
        );

        expect(archivePersona).toBeDefined();
        expect(archivePersona?.isArchive).toBe(true);
      });

      it("should perform quick validation", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        const result = await discovery.discoverPersonas(config);

        // Invalid YAML should be marked invalid but still discovered
        const invalidYamlPersona = result.personas.find(
          (p) => p.name === "invalid-yaml-persona"
        );
        expect(invalidYamlPersona?.isValid).toBe(false);
        expect(invalidYamlPersona?.issues).toContain("Invalid YAML syntax");

        // Missing name should be invalid
        const missingNamePersona = result.personas.find(
          (p) => p.name === "missing-name-persona"
        );
        expect(missingNamePersona?.isValid).toBe(false);
        expect(
          missingNamePersona?.issues?.some((i) =>
            i.includes("Missing required 'name' field")
          )
        ).toBe(true);

        // Mismatched name should be invalid
        const mismatchPersona = result.personas.find(
          (p) => p.name === "mismatch-name-persona"
        );
        expect(mismatchPersona?.isValid).toBe(false);
        expect(
          mismatchPersona?.issues?.some((i) =>
            i.includes("doesn't match folder name")
          )
        ).toBe(true);

        // Short description should be invalid
        const shortDescPersona = result.personas.find(
          (p) => p.name === "short-description-persona"
        );
        expect(shortDescPersona?.isValid).toBe(false);
        expect(
          shortDescPersona?.issues?.some((i) =>
            i.includes("at least 10 characters")
          )
        ).toBe(true);
      });

      it("should detect duplicate persona names", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        const result = await discovery.discoverPersonas(config);

        expect(
          result.warnings.some(
            (w) =>
              w.includes("Duplicate persona name") &&
              w.includes("test-duplicate")
          )
        ).toBe(true);
      });

      it("should handle discovery errors gracefully", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: ["/non/existent/path"],
        };

        const result = await discovery.discoverPersonas(config);

        expect(result.personas).toEqual([]);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe("Caching Behavior", () => {
      it("should cache discovery results", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        // First discovery - should be cache miss
        const result1 = await discovery.discoverPersonas(config);
        expect(result1.personas.length).toBeGreaterThan(0);

        // Second discovery - should be cache hit
        const result2 = await discovery.discoverPersonas(config);
        expect(result2).toEqual(result1);

        const cacheStats = discovery.getCacheStats();
        expect(cacheStats.hits).toBe(1);
        expect(cacheStats.misses).toBe(1);
      });

      it("should expire cached results after TTL", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        // First discovery
        await discovery.discoverPersonas(config);

        // Wait for TTL expiration
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Second discovery should be cache miss
        await discovery.discoverPersonas(config);

        const cacheStats = discovery.getCacheStats();
        expect(cacheStats.misses).toBe(2);
      });

      it("should refresh discovery and clear cache", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        // First discovery
        await discovery.discoverPersonas(config);

        // Refresh should clear cache and perform new discovery
        const refreshedResult = await discovery.refreshDiscovery(config);
        expect(refreshedResult.personas.length).toBeGreaterThan(0);

        const cacheStats = discovery.getCacheStats();
        expect(cacheStats.misses).toBe(2); // Original + refresh
      });

      it("should enforce cache size limit", async () => {
        // Create discovery with small cache size
        const smallCacheDiscovery = new PersonaDiscovery({
          maxSize: 2,
          ttl: 60000, // Long TTL to prevent expiration
        });

        try {
          // Fill cache beyond limit
          for (let i = 0; i < 5; i++) {
            const config: PersonaDiscoveryConfig = {
              additionalPaths: [tempDir],
              maxDepth: i + 1, // Different config for different cache keys
            };
            await smallCacheDiscovery.discoverPersonas(config);
          }

          const cacheStats = smallCacheDiscovery.getCacheStats();
          expect(cacheStats.size).toBeLessThanOrEqual(2);
        } finally {
          smallCacheDiscovery.dispose();
        }
      });

      it("should clear cache on demand", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        await discovery.discoverPersonas(config);
        expect(discovery.getCacheStats().size).toBe(1);

        discovery.clearCache();
        expect(discovery.getCacheStats().size).toBe(0);
        expect(discovery.getCacheStats().hits).toBe(0);
        expect(discovery.getCacheStats().misses).toBe(0);
      });
    });

    describe("Event Emission", () => {
      it("should emit discovery events", async () => {
        const events: any[] = [];
        discovery.on(PersonaEvents.PERSONA_DISCOVERED, (event) => {
          events.push(event);
        });

        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        await discovery.discoverPersonas(config);

        expect(events).toHaveLength(1);
        expect(events[0].count).toBeGreaterThan(0);
        expect(events[0].fromCache).toBe(false);
        expect(events[0].duration).toBeDefined();
      });

      it("should emit cache hit events", async () => {
        const events: any[] = [];
        discovery.on(PersonaEvents.PERSONA_DISCOVERED, (event) => {
          events.push(event);
        });

        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        // First discovery
        await discovery.discoverPersonas(config);

        // Second discovery (cache hit)
        await discovery.discoverPersonas(config);

        expect(events).toHaveLength(2);
        expect(events[0].fromCache).toBe(false);
        expect(events[1].fromCache).toBe(true);
        expect(events[1].duration).toBeUndefined();
      });
    });

    describe("Statistics Tracking", () => {
      it("should track discovery statistics", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        await discovery.discoverPersonas(config);

        const stats = discovery.getDiscoveryStats();
        expect(stats.totalDiscoveries).toBe(1);
        expect(stats.lastDiscovery).toBeDefined();
        expect(stats.averageDiscoveryTime).toBeGreaterThan(0);
        expect(stats.lastPersonaCount).toBeGreaterThan(0);
      });

      it("should calculate rolling average discovery time", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        // Multiple discoveries
        await discovery.discoverPersonas(config);
        await discovery.refreshDiscovery(config);
        await discovery.refreshDiscovery(config);

        const stats = discovery.getDiscoveryStats();
        expect(stats.totalDiscoveries).toBe(3);
        expect(stats.averageDiscoveryTime).toBeGreaterThan(0);
      });

      it("should track cache statistics", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        // Cache miss
        await discovery.discoverPersonas(config);

        // Cache hit
        await discovery.discoverPersonas(config);

        const cacheStats = discovery.getCacheStats();
        expect(cacheStats.hits).toBe(1);
        expect(cacheStats.misses).toBe(1);
        expect(cacheStats.hitRate).toBe(0.5);
        expect(cacheStats.size).toBe(1);
        expect(cacheStats.memoryUsage).toBeGreaterThan(0);
      });
    });

    describe("Utility Methods", () => {
      it("should provide standard search paths", () => {
        const paths = discovery.getStandardSearchPaths();
        expect(paths).toHaveLength(1); // Changed from 3 to 1
        expect(paths[0]).toContain(".toolprint");
        expect(paths[0]).toContain("hypertool-mcp");
        expect(paths[0]).toContain("personas");
      });

      it("should validate search paths", async () => {
        const validPath = await discovery.validateSearchPath(tempDir);
        expect(validPath).toBe(true);

        const invalidPath =
          await discovery.validateSearchPath("/non/existent/path");
        expect(invalidPath).toBe(false);
      });

      it("should check for available personas", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        const hasPersonas = await discovery.hasPersonas(config);
        expect(hasPersonas).toBe(true);

        const emptyConfig: PersonaDiscoveryConfig = {
          additionalPaths: ["/non/existent/path"],
        };

        const hasNoPersonas = await discovery.hasPersonas(emptyConfig);
        expect(hasNoPersonas).toBe(false);
      });
    });

    describe("Resource Management", () => {
      it("should dispose resources properly", () => {
        const testDiscovery = new PersonaDiscovery();

        // Add some listeners to verify cleanup
        testDiscovery.on(PersonaEvents.PERSONA_DISCOVERED, () => {});

        expect(
          testDiscovery.listenerCount(PersonaEvents.PERSONA_DISCOVERED)
        ).toBe(1);

        testDiscovery.dispose();

        expect(
          testDiscovery.listenerCount(PersonaEvents.PERSONA_DISCOVERED)
        ).toBe(0);
        expect(testDiscovery.getCacheStats().size).toBe(0);
      });

      it("should handle memory usage estimation", async () => {
        const config: PersonaDiscoveryConfig = {
          additionalPaths: [tempDir],
        };

        await discovery.discoverPersonas(config);

        const cacheStats = discovery.getCacheStats();
        expect(cacheStats.memoryUsage).toBeGreaterThan(0);
        expect(typeof cacheStats.memoryUsage).toBe("number");
      });
    });
  });

  describe("Default Discovery Instance", () => {
    afterEach(() => {
      // Clear default instance cache after each test
      clearDiscoveryCache();
    });

    it("should provide default discovery functions", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
      };

      const result = await discoverPersonas(config);
      expect(result.personas.length).toBeGreaterThan(0);
    });

    it("should refresh discovery using default instance", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
      };

      const result = await refreshPersonaDiscovery(config);
      expect(result.personas.length).toBeGreaterThan(0);
    });

    it("should check for available personas", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
      };

      const hasPersonas = await hasAvailablePersonas(config);
      expect(hasPersonas).toBe(true);
    });

    it("should provide cache statistics", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
      };

      await discoverPersonas(config);
      const stats = getDiscoveryCacheStats();

      expect(stats.size).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
    });

    it("should clear cache", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
      };

      await discoverPersonas(config);
      expect(getDiscoveryCacheStats().size).toBeGreaterThan(0);

      clearDiscoveryCache();
      expect(getDiscoveryCacheStats().size).toBe(0);
    });
  });

  describe("Cache Key Generation", () => {
    it("should generate consistent cache keys for same configuration", async () => {
      const config1: PersonaDiscoveryConfig = {
        additionalPaths: ["/path/a", "/path/b"],
        maxDepth: 2,
        followSymlinks: true,
      };

      const config2: PersonaDiscoveryConfig = {
        additionalPaths: ["/path/b", "/path/a"], // Different order
        maxDepth: 2,
        followSymlinks: true,
      };

      // Both should result in cache hits since arrays are sorted for caching
      await discovery.discoverPersonas(config1);
      await discovery.discoverPersonas(config2);

      const stats = discovery.getCacheStats();
      expect(stats.hits).toBe(1); // Second call should be a hit
    });

    it("should generate different cache keys for different configurations", async () => {
      const config1: PersonaDiscoveryConfig = {
        maxDepth: 2,
      };

      const config2: PersonaDiscoveryConfig = {
        maxDepth: 3,
      };

      await discovery.discoverPersonas(config1);
      await discovery.discoverPersonas(config2);

      const stats = discovery.getCacheStats();
      expect(stats.misses).toBe(2); // Both should be misses
      expect(stats.size).toBe(2); // Two different cache entries
    });
  });

  describe("Error Handling", () => {
    it("should handle scanner errors gracefully", async () => {
      // Mock scanner to throw an error
      const mockScanner = vi
        .fn()
        .mockRejectedValue(new Error("Scanner failure"));

      // This would require dependency injection or module mocking
      // For now, we'll test with invalid paths which naturally cause errors
      const config: PersonaDiscoveryConfig = {
        additionalPaths: ["/completely/invalid/path/that/does/not/exist"],
      };

      const result = await discovery.discoverPersonas(config);

      // Should return empty result with errors, not throw
      expect(result.personas).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle validation errors for individual personas", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
      };

      const result = await discovery.discoverPersonas(config);

      // Should still discover personas even if some have validation issues
      expect(result.personas.length).toBeGreaterThan(0);

      // Some personas should have issues
      const personasWithIssues = result.personas.filter(
        (p) => p.issues && p.issues.length > 0
      );
      expect(personasWithIssues.length).toBeGreaterThan(0);
    });
  });

  describe("Performance Characteristics", () => {
    it("should complete discovery within reasonable time", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
      };

      const startTime = Date.now();
      await discovery.discoverPersonas(config);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it("should cache results for performance", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: [tempDir],
      };

      // First call - will be slower (cache miss)
      const start1 = Date.now();
      await discovery.discoverPersonas(config);
      const duration1 = Date.now() - start1;

      // Second call - should be faster (cache hit)
      const start2 = Date.now();
      await discovery.discoverPersonas(config);
      const duration2 = Date.now() - start2;

      expect(duration2).toBeLessThan(duration1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty discovery results", async () => {
      const emptyDir = join(tempDir, "empty");
      await fs.mkdir(emptyDir);

      const config: PersonaDiscoveryConfig = {
        additionalPaths: [emptyDir],
      };

      const result = await discovery.discoverPersonas(config);

      expect(result.personas).toEqual([]);
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.searchPaths).toContain(emptyDir);
    });

    it("should handle discovery with no search paths", async () => {
      const config: PersonaDiscoveryConfig = {
        additionalPaths: [],
      };

      const result = await discovery.discoverPersonas(config);

      // Should still use standard paths
      expect(result.searchPaths.length).toBeGreaterThan(0);
    });

    it("should handle very large persona counts", async () => {
      // Create many personas
      const manyPersonasDir = join(tempDir, "many-personas");
      await fs.mkdir(manyPersonasDir);

      for (let i = 0; i < 50; i++) {
        const personaDir = join(manyPersonasDir, `persona-${i}`);
        await fs.mkdir(personaDir);
        await fs.writeFile(
          join(personaDir, "persona.yaml"),
          `name: persona-${i}\ndescription: Generated persona number ${i} for testing`
        );
      }

      const config: PersonaDiscoveryConfig = {
        additionalPaths: [manyPersonasDir],
      };

      const result = await discovery.discoverPersonas(config);

      expect(result.personas.length).toBe(50);
      expect(result.personas.every((p) => p.isValid)).toBe(true);
    });
  });
});

// Helper function to create test directory structure
async function createTestStructure(
  basePath: string,
  structure: { [key: string]: string | { [key: string]: string } }
): Promise<void> {
  for (const [name, content] of Object.entries(structure)) {
    const itemPath = join(basePath, name);

    if (typeof content === "string") {
      // It's a file
      const dir = itemPath.substring(0, itemPath.lastIndexOf("/"));
      if (dir !== basePath) {
        await fs.mkdir(dir, { recursive: true });
      }
      await fs.writeFile(itemPath, content);
    } else {
      // It's a directory structure
      await fs.mkdir(itemPath, { recursive: true });
      await createTestStructure(itemPath, content);
    }
  }
}
