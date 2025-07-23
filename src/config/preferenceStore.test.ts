/**
 * Tests for preference store functionality including last equipped toolset
 * 
 * NOTE: This test uses vi.mock to completely isolate the preferenceStore module
 * and prevent any side effects on the actual user's preference files.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { UserPreferences } from "./preferenceStore.js";

// Mock the entire fs module to prevent any file system access
vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
  },
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

// Mock os.homedir to return a fake path
vi.mock("os", () => ({
  homedir: () => "/fake/home/dir",
}));

describe("PreferenceStore - Last Equipped Toolset", () => {
  let mockPreferences: UserPreferences;
  let preferenceStore: any;
  
  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Initialize mock preferences
    mockPreferences = {
      toolsets: {},
      version: "1.0.0",
    };
    
    // Set up fs mock behaviors
    const fsMock = await import("fs/promises");
    
    // Mock readFile to return our mock preferences
    vi.mocked(fsMock.readFile).mockImplementation(async () => {
      return JSON.stringify(mockPreferences);
    });
    
    // Mock writeFile to update our mock preferences
    vi.mocked(fsMock.writeFile).mockImplementation(async (_path: any, content: any) => {
      mockPreferences = JSON.parse(content as string);
      return undefined;
    });
    
    // Mock mkdir to always succeed
    vi.mocked(fsMock.mkdir).mockResolvedValue(undefined);
    
    // Mock access to always succeed (file exists)
    vi.mocked(fsMock.access).mockResolvedValue(undefined);
    
    // Import the module fresh for each test
    vi.resetModules();
    preferenceStore = await import("./preferenceStore.js");
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("should save and retrieve last equipped toolset", async () => {
    const { saveLastEquippedToolset, getLastEquippedToolset } = preferenceStore;
    
    // Save a toolset name
    await saveLastEquippedToolset("my-toolset");
    
    // Verify it was saved in our mock
    expect(mockPreferences.lastEquippedToolset).toBe("my-toolset");
    
    // Retrieve it
    const retrieved = await getLastEquippedToolset();
    expect(retrieved).toBe("my-toolset");
  });

  it("should clear last equipped toolset when setting undefined", async () => {
    const { saveLastEquippedToolset, getLastEquippedToolset } = preferenceStore;
    
    // Save a toolset name
    await saveLastEquippedToolset("my-toolset");
    expect(mockPreferences.lastEquippedToolset).toBe("my-toolset");
    
    // Clear it
    await saveLastEquippedToolset(undefined);
    
    // Verify it's cleared in our mock
    expect(mockPreferences.lastEquippedToolset).toBeUndefined();
    
    // Verify it's cleared when retrieved
    const retrieved = await getLastEquippedToolset();
    expect(retrieved).toBeUndefined();
  });

  it("should return undefined when no toolset has been equipped", async () => {
    const { getLastEquippedToolset } = preferenceStore;
    
    // Don't save anything, just try to retrieve
    const retrieved = await getLastEquippedToolset();
    expect(retrieved).toBeUndefined();
  });

  it("should persist last equipped toolset across preference loads", async () => {
    const { saveLastEquippedToolset, loadUserPreferences, saveUserPreferences, getLastEquippedToolset } = preferenceStore;
    
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
    expect(mockPreferences.mcpConfigPath).toBe("/some/path");
  });

  it("should work alongside toolset storage", async () => {
    const { saveStoredToolsets, saveLastEquippedToolset, loadStoredToolsets, getLastEquippedToolset } = preferenceStore;
    
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
