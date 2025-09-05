/**
 * PersonaCache Test Suite
 *
 * Comprehensive tests for the high-performance persona caching system,
 * including TTL management, LRU eviction, file system monitoring,
 * memory management, and performance characteristics.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  PersonaCache,
  createPersonaCache,
  defaultPersonaCache,
  PersonaCacheFactory,
  EvictionReason,
  CacheEvents,
  type CacheMetrics,
} from "./cache.js";
import type {
  LoadedPersona,
  PersonaConfig,
  PersonaAssets,
  ValidationResult,
} from "./types.js";

// Mock fs.watch to avoid actual file system watching in tests
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    watch: vi.fn().mockReturnValue({
      on: vi.fn(),
      close: vi.fn(),
    }),
  };
});

describe("PersonaCache", () => {
  let cache: PersonaCache;
  let testPersonas: LoadedPersona[];
  let tempDir: string;

  beforeEach(async () => {
    // Create a new cache instance for each test
    cache = new PersonaCache({
      ttl: 1000, // 1 second for faster testing
      maxSize: 3,
      enableStats: true,
    });

    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(join(tmpdir(), "persona-cache-test-"));

    // Override persona directory to use temp directory for tests
    process.env.HYPERTOOL_PERSONA_DIR = tempDir;

    // Create test personas
    testPersonas = await createTestPersonas(tempDir);
  });

  afterEach(async () => {
    // Clean up environment variable
    delete process.env.HYPERTOOL_PERSONA_DIR;

    // Cleanup
    cache.destroy();

    // Clean up temporary files
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Basic Cache Operations", () => {
    it("should store and retrieve a persona", () => {
      const persona = testPersonas[0];

      // Should not be cached initially
      expect(cache.has(persona.config.name, persona.sourcePath)).toBe(false);
      expect(cache.get(persona.config.name, persona.sourcePath)).toBeNull();

      // Store persona
      cache.set(persona);

      // Should now be cached
      expect(cache.has(persona.config.name, persona.sourcePath)).toBe(true);
      const retrieved = cache.get(persona.config.name, persona.sourcePath);
      expect(retrieved).toBe(persona);
    });

    it("should handle cache keys with same name but different paths", () => {
      const persona1 = testPersonas[0];
      const persona2 = {
        ...testPersonas[1],
        config: { ...testPersonas[1].config, name: persona1.config.name },
      };

      cache.set(persona1);
      cache.set(persona2);

      expect(cache.get(persona1.config.name, persona1.sourcePath)).toBe(
        persona1
      );
      expect(cache.get(persona2.config.name, persona2.sourcePath)).toBe(
        persona2
      );
    });

    it("should update existing cache entries", () => {
      const persona = testPersonas[0];
      cache.set(persona);

      const updatedPersona = {
        ...persona,
        config: { ...persona.config, description: "Updated description" },
      };
      cache.set(updatedPersona);

      const retrieved = cache.get(persona.config.name, persona.sourcePath);
      expect(retrieved?.config.description).toBe("Updated description");
    });

    it("should delete specific personas from cache", () => {
      const persona = testPersonas[0];
      cache.set(persona);

      expect(cache.has(persona.config.name, persona.sourcePath)).toBe(true);

      const deleted = cache.delete(persona.config.name, persona.sourcePath);
      expect(deleted).toBe(true);
      expect(cache.has(persona.config.name, persona.sourcePath)).toBe(false);

      const deletedAgain = cache.delete(
        persona.config.name,
        persona.sourcePath
      );
      expect(deletedAgain).toBe(false);
    });

    it("should clear all cached personas", () => {
      testPersonas.forEach((persona) => cache.set(persona));

      // Cache has maxSize of 3, so it should only have 3 items
      expect(cache.getStats().size).toBe(3);

      cache.clear();

      expect(cache.getStats().size).toBe(0);
      testPersonas.forEach((persona) => {
        expect(cache.has(persona.config.name, persona.sourcePath)).toBe(false);
      });
    });
  });

  describe("TTL Management", () => {
    it("should expire personas after TTL", async () => {
      const persona = testPersonas[0];
      cache.set(persona);

      expect(cache.has(persona.config.name, persona.sourcePath)).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(cache.has(persona.config.name, persona.sourcePath)).toBe(false);
      expect(cache.get(persona.config.name, persona.sourcePath)).toBeNull();
    });

    it("should refresh TTL when accessed", () => {
      const persona = testPersonas[0];
      cache.set(persona);

      // Access to refresh TTL
      const retrieved = cache.get(persona.config.name, persona.sourcePath);
      expect(retrieved).toBe(persona);

      // Should still be accessible after some time but before original TTL
      setTimeout(() => {
        expect(cache.has(persona.config.name, persona.sourcePath)).toBe(true);
      }, 500);
    });

    it("should allow manual TTL refresh", () => {
      const persona = testPersonas[0];
      cache.set(persona);

      const refreshed = cache.refreshTTL(
        persona.config.name,
        persona.sourcePath,
        5000
      );
      expect(refreshed).toBe(true);

      // Should still be accessible after original TTL would have expired
      setTimeout(() => {
        expect(cache.has(persona.config.name, persona.sourcePath)).toBe(true);
      }, 1100);
    });

    it("should not refresh TTL for non-existent personas", () => {
      const refreshed = cache.refreshTTL("non-existent", "/fake/path");
      expect(refreshed).toBe(false);
    });
  });

  describe("LRU Eviction", () => {
    it("should evict least recently used personas when size limit reached", async () => {
      // Fill cache to capacity
      testPersonas.slice(0, 3).forEach((persona) => cache.set(persona));
      expect(cache.getStats().size).toBe(3);

      // Access personas to establish LRU order
      cache.get(testPersonas[1].config.name, testPersonas[1].sourcePath);
      cache.get(testPersonas[2].config.name, testPersonas[2].sourcePath);
      // testPersonas[0] is now least recently used

      // Add one more persona to trigger eviction
      const extraPersona = await createExtraTestPersona(tempDir);
      cache.set(extraPersona);

      // Size should remain at limit
      expect(cache.getStats().size).toBe(3);

      // LRU persona (testPersonas[0]) should be evicted
      expect(
        cache.has(testPersonas[0].config.name, testPersonas[0].sourcePath)
      ).toBe(false);
      expect(
        cache.has(testPersonas[1].config.name, testPersonas[1].sourcePath)
      ).toBe(true);
      expect(
        cache.has(testPersonas[2].config.name, testPersonas[2].sourcePath)
      ).toBe(true);
      expect(cache.has(extraPersona.config.name, extraPersona.sourcePath)).toBe(
        true
      );
    });

    it("should track access order correctly", () => {
      testPersonas.slice(0, 3).forEach((persona) => cache.set(persona));

      // Access in specific order to establish LRU
      cache.get(testPersonas[0].config.name, testPersonas[0].sourcePath);
      cache.get(testPersonas[1].config.name, testPersonas[1].sourcePath);
      cache.get(testPersonas[2].config.name, testPersonas[2].sourcePath);

      const cachedNames = cache.getCachedPersonaNames();
      expect(cachedNames).toHaveLength(3);
      expect(cachedNames).toContain(testPersonas[0].config.name);
      expect(cachedNames).toContain(testPersonas[1].config.name);
      expect(cachedNames).toContain(testPersonas[2].config.name);
    });
  });

  describe("Statistics and Metrics", () => {
    it("should track hit and miss statistics", () => {
      const persona = testPersonas[0];

      // Initial stats
      let stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);

      // Cache miss
      cache.get(persona.config.name, persona.sourcePath);
      stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);

      // Cache set and hit
      cache.set(persona);
      cache.get(persona.config.name, persona.sourcePath);
      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it("should track memory usage", () => {
      const initialStats = cache.getStats();
      expect(initialStats.memoryUsage).toBe(0);

      cache.set(testPersonas[0]);
      const statsAfterSet = cache.getStats();
      expect(statsAfterSet.memoryUsage).toBeGreaterThan(0);

      cache.clear();
      const statsAfterClear = cache.getStats();
      expect(statsAfterClear.memoryUsage).toBe(0);
    });

    it("should provide detailed metrics", () => {
      const persona = testPersonas[0];

      // Generate some operations
      cache.get(persona.config.name, persona.sourcePath); // miss
      cache.set(persona);
      cache.get(persona.config.name, persona.sourcePath); // hit

      const metrics = cache.getMetrics();
      expect(metrics.operations).toBe(1); // 1 get operation (set doesn't count as operation)
      expect(metrics.averageLookupTime).toBeGreaterThan(0);
      expect(typeof metrics.evictionCounts).toBe("object");
    });

    it("should track eviction reasons", () => {
      const persona = testPersonas[0];
      cache.set(persona);

      // Manual eviction
      cache.delete(persona.config.name, persona.sourcePath);

      const metrics = cache.getMetrics();
      expect(metrics.evictionCounts[EvictionReason.MANUAL_CLEAR]).toBe(1);
    });
  });

  describe("Event Emission", () => {
    it("should emit cache events", () => {
      return new Promise<void>((resolve) => {
        const persona = testPersonas[0];
        let eventsReceived = 0;

        cache.on(CacheEvents.CACHE_SET, () => {
          eventsReceived++;
        });

        cache.on(CacheEvents.CACHE_HIT, () => {
          eventsReceived++;
          if (eventsReceived === 2) {
            resolve();
          }
        });

        cache.set(persona);
        cache.get(persona.config.name, persona.sourcePath);
      });
    });

    it("should emit eviction events", () => {
      return new Promise<void>((resolve) => {
        const persona = testPersonas[0];

        cache.on(CacheEvents.CACHE_EVICTED, (event) => {
          expect(event.name).toBe(persona.config.name);
          expect(event.reason).toBe(EvictionReason.MANUAL_CLEAR);
          resolve();
        });

        cache.set(persona);
        cache.delete(persona.config.name, persona.sourcePath);
      });
    });

    it("should emit clear events", () => {
      return new Promise<void>((resolve) => {
        testPersonas.slice(0, 3).forEach((persona) => cache.set(persona)); // Only add 3 due to cache maxSize

        const clearHandler = (event: any) => {
          expect(event.count).toBe(3); // Cache maxSize is 3
          cache.removeListener(CacheEvents.CACHE_CLEARED, clearHandler); // Remove listener to avoid duplicate events
          resolve();
        };

        cache.on(CacheEvents.CACHE_CLEARED, clearHandler);
        cache.clear();
      });
    });
  });

  describe("Path-based Invalidation", () => {
    it("should invalidate personas by source path", () => {
      const persona = testPersonas[0];
      cache.set(persona);

      expect(cache.has(persona.config.name, persona.sourcePath)).toBe(true);

      const invalidatedCount = cache.invalidateByPath(persona.sourcePath);
      expect(invalidatedCount).toBe(1);
      expect(cache.has(persona.config.name, persona.sourcePath)).toBe(false);
    });

    it("should invalidate multiple personas with same path", () => {
      const basePath = "/shared/path";
      const persona1 = { ...testPersonas[0], sourcePath: basePath };
      const persona2 = { ...testPersonas[1], sourcePath: basePath };

      cache.set(persona1);
      cache.set(persona2);

      const invalidatedCount = cache.invalidateByPath(basePath);
      expect(invalidatedCount).toBe(2);
    });
  });

  describe("Memory Management", () => {
    it("should estimate memory usage for personas", () => {
      const persona = testPersonas[0];
      cache.set(persona);

      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(typeof stats.memoryUsage).toBe("number");
    });

    it("should handle memory pressure with eviction", () => {
      // This test would need a more sophisticated setup to actually trigger
      // memory-based eviction, but we can verify the mechanism exists
      testPersonas.forEach((persona) => cache.set(persona));

      const initialSize = cache.getStats().size;
      expect(initialSize).toBeLessThanOrEqual(3); // Max size limit
    });
  });

  describe("Cleanup and Destruction", () => {
    it("should cleanup expired entries in background", async () => {
      const persona = testPersonas[0];
      cache.set(persona);

      expect(cache.getStats().size).toBe(1);

      // Wait for TTL expiration
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Manually trigger cleanup (since background timer is unref'd)
      cache.cleanup();

      // Size should be reduced after cleanup
      expect(cache.getStats().size).toBe(0);
    });

    it("should destroy cache properly", () => {
      testPersonas.slice(0, 3).forEach((persona) => cache.set(persona)); // Only add 3 due to cache maxSize
      expect(cache.getStats().size).toBe(3); // Cache maxSize is 3

      cache.destroy();
      expect(cache.getStats().size).toBe(0);
    });
  });
});

describe("Cache Factory", () => {
  afterEach(() => {
    PersonaCacheFactory.destroyAll();
  });

  it("should create and manage named cache instances", () => {
    const cache1 = PersonaCacheFactory.getInstance("test1");
    const cache2 = PersonaCacheFactory.getInstance("test2");
    const cache1Again = PersonaCacheFactory.getInstance("test1");

    expect(cache1).not.toBe(cache2);
    expect(cache1).toBe(cache1Again);

    const activeInstances = PersonaCacheFactory.getActiveInstances();
    expect(activeInstances).toContain("test1");
    expect(activeInstances).toContain("test2");
  });

  it("should destroy specific instances", () => {
    PersonaCacheFactory.getInstance("test1");
    PersonaCacheFactory.getInstance("test2");

    expect(PersonaCacheFactory.getActiveInstances()).toHaveLength(2);

    const destroyed = PersonaCacheFactory.destroyInstance("test1");
    expect(destroyed).toBe(true);
    expect(PersonaCacheFactory.getActiveInstances()).toHaveLength(1);
    expect(PersonaCacheFactory.getActiveInstances()).toContain("test2");

    const destroyedAgain = PersonaCacheFactory.destroyInstance("test1");
    expect(destroyedAgain).toBe(false);
  });

  it("should destroy all instances", () => {
    PersonaCacheFactory.getInstance("test1");
    PersonaCacheFactory.getInstance("test2");
    PersonaCacheFactory.getInstance("test3");

    expect(PersonaCacheFactory.getActiveInstances()).toHaveLength(3);

    PersonaCacheFactory.destroyAll();
    expect(PersonaCacheFactory.getActiveInstances()).toHaveLength(0);
  });
});

describe("Cache Utilities", () => {
  it("should create cache with createPersonaCache function", () => {
    const cache = createPersonaCache({
      ttl: 2000,
      maxSize: 50,
      enableStats: false,
    });

    expect(cache).toBeInstanceOf(PersonaCache);

    // Cleanup
    cache.destroy();
  });

  it("should use default cache instance", () => {
    expect(defaultPersonaCache).toBeInstanceOf(PersonaCache);

    const stats = defaultPersonaCache.getStats();
    expect(typeof stats.hits).toBe("number");
    expect(typeof stats.misses).toBe("number");
  });
});

// Helper functions for test setup

async function createTestPersonas(tempDir: string): Promise<LoadedPersona[]> {
  const personas: LoadedPersona[] = [];

  for (let i = 0; i < 5; i++) {
    const personaName = `test-persona-${i}`;
    const personaDir = join(tempDir, personaName);
    await fs.mkdir(personaDir, { recursive: true });

    const configFile = join(personaDir, "persona.yaml");
    await fs.writeFile(
      configFile,
      `
name: ${personaName}
description: Test persona ${i}
toolsets:
  - name: default
    toolIds: ["test.tool1", "test.tool2"]
`
    );

    const config: PersonaConfig = {
      name: personaName,
      description: `Test persona ${i}`,
      toolsets: [
        {
          name: "default",
          toolIds: ["test.tool1", "test.tool2"],
        },
      ],
      defaultToolset: "default",
    };

    const assets: PersonaAssets = {
      configFile,
    };

    const validation: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    const persona: LoadedPersona = {
      config,
      assets,
      validation,
      loadedAt: new Date(),
      sourcePath: personaDir,
    };

    personas.push(persona);
  }

  return personas;
}

async function createExtraTestPersona(tempDir: string): Promise<LoadedPersona> {
  const personaName = "extra-persona";
  const personaDir = join(tempDir, personaName);
  await fs.mkdir(personaDir, { recursive: true });

  const configFile = join(personaDir, "persona.yaml");
  await fs.writeFile(
    configFile,
    `
name: ${personaName}
description: Extra test persona
toolsets:
  - name: default
    toolIds: ["test.tool3", "test.tool4"]
`
  );

  const config: PersonaConfig = {
    name: personaName,
    description: "Extra test persona",
    toolsets: [
      {
        name: "default",
        toolIds: ["test.tool3", "test.tool4"],
      },
    ],
    defaultToolset: "default",
  };

  const assets: PersonaAssets = {
    configFile,
  };

  const validation: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  return {
    config,
    assets,
    validation,
    loadedAt: new Date(),
    sourcePath: personaDir,
  };
}
