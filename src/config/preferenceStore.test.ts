/**
 * Tests for preference store functionality including last equipped toolset
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  loadUserPreferences,
  saveUserPreferences,
  getLastEquippedToolset,
  saveLastEquippedToolset,
  loadStoredToolsets,
  saveStoredToolsets,
} from "./preferenceStore.js";

describe("PreferenceStore - Last Equipped Toolset", () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create a temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pref-test-"));

    // Override HOME to use temp directory
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir; // For Windows compatibility
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore errors
    }
  });

  it("should save and retrieve last equipped toolset", async () => {
    // Save a toolset name
    await saveLastEquippedToolset("my-toolset");

    // Retrieve it
    const retrieved = await getLastEquippedToolset();
    expect(retrieved).toBe("my-toolset");
  });

  it("should clear last equipped toolset when setting undefined", async () => {
    // Save a toolset name
    await saveLastEquippedToolset("my-toolset");

    // Clear it
    await saveLastEquippedToolset(undefined);

    // Verify it's cleared
    const retrieved = await getLastEquippedToolset();
    expect(retrieved).toBeUndefined();
  });

  it("should return undefined when no toolset has been equipped", async () => {
    // Don't save anything, just try to retrieve
    const retrieved = await getLastEquippedToolset();
    expect(retrieved).toBeUndefined();
  });

  it("should persist last equipped toolset across preference loads", async () => {
    // Save a toolset name
    await saveLastEquippedToolset("persistent-toolset");

    // Load preferences directly
    const prefs = await loadUserPreferences();
    expect(prefs.lastEquippedToolset).toBe("persistent-toolset");

    // Modify something else and save
    prefs.mcpConfigPath = "/some/path";
    await saveUserPreferences(prefs);

    // Verify toolset name is still there
    const retrieved = await getLastEquippedToolset();
    expect(retrieved).toBe("persistent-toolset");
  });

  it("should work alongside toolset storage", async () => {
    // Save some toolsets
    const toolsets = {
      "toolset-1": {
        name: "toolset-1",
        tools: [],
        version: "1.0.0",
        createdAt: new Date(),
      },
      "toolset-2": {
        name: "toolset-2",
        tools: [],
        version: "1.0.0",
        createdAt: new Date(),
      },
    };
    await saveStoredToolsets(toolsets);

    // Save last equipped
    await saveLastEquippedToolset("toolset-1");

    // Verify both work independently
    const loadedToolsets = await loadStoredToolsets();
    expect(Object.keys(loadedToolsets)).toHaveLength(2);

    const lastEquipped = await getLastEquippedToolset();
    expect(lastEquipped).toBe("toolset-1");
  });
});