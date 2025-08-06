/**
 * Integration test for CLI --mcp-config flag with relative paths
 * 
 * Note: These tests work without process.chdir() since it's not supported in Vitest workers.
 * Instead, we create files at specific absolute paths and test relative path resolution
 * by simulating what would happen from different working directory contexts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "path";
import * as fs from "fs/promises";
import { tmpdir } from "os";
import { discoverMcpConfig } from "../config/mcpConfigLoader.js";

describe("CLI --mcp-config flag integration", () => {
  let tempDir: string;
  let testConfigPath: string;
  let testConfigContent: any;

  beforeEach(async () => {
    // Create a temporary directory for the test
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "hypertool-test-"));
    
    // Create a test config file
    testConfigContent = {
      mcpServers: {
        "test-server": {
          type: "stdio",
          command: "echo",
          args: ["test"]
        }
      }
    };

    testConfigPath = path.join(tempDir, "test-mcp.json");
    await fs.writeFile(testConfigPath, JSON.stringify(testConfigContent, null, 2));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should work with relative paths", async () => {
    // Create a config file in the current working directory context
    const currentDirConfigPath = path.join(process.cwd(), "test-mcp.json");
    await fs.writeFile(currentDirConfigPath, JSON.stringify(testConfigContent, null, 2));
    
    try {
      const relativePath = "./test-mcp.json";
      const result = await discoverMcpConfig(relativePath);
      
      expect(result.configPath).toBe(path.resolve(relativePath));
      expect(result.source).toBe("cli");
      expect(result.errorMessage).toBeUndefined();
    } finally {
      // Clean up the test file in the current directory
      try {
        await fs.unlink(currentDirConfigPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it("should work with relative paths using parent directories", async () => {
    // Create a config file in the parent directory of the current working directory
    // This simulates the scenario where a user runs the command from a subdirectory
    // and wants to reference a config file in the parent directory
    const parentDir = path.dirname(process.cwd());
    const parentConfigPath = path.join(parentDir, "parent-config.json");
    
    await fs.writeFile(parentConfigPath, JSON.stringify(testConfigContent, null, 2));
    
    try {
      const relativePath = "../parent-config.json";
      const result = await discoverMcpConfig(relativePath);
      
      // The path should be resolved relative to the current working directory  
      expect(result.configPath).toBe(path.resolve(relativePath));
      expect(result.source).toBe("cli");
      expect(result.errorMessage).toBeUndefined();
    } finally {
      // Clean up the parent config file
      try {
        await fs.unlink(parentConfigPath);
      } catch (error) {
        // Ignore cleanup errors - the parent directory might not be writable
      }
    }
  });

  it("should work with absolute paths", async () => {
    const result = await discoverMcpConfig(testConfigPath);
    
    expect(result.configPath).toBe(testConfigPath);
    expect(result.source).toBe("cli");
    expect(result.errorMessage).toBeUndefined();
  });

  it("should provide helpful error for non-existent relative paths", async () => {
    const relativePath = "./non-existent-config.json";
    
    const result = await discoverMcpConfig(relativePath);
    
    expect(result.configPath).toBeNull();
    expect(result.source).toBe("none");
    expect(result.errorMessage).toContain(relativePath);
    expect(result.errorMessage).toContain(path.resolve(relativePath));
  });

  it("should resolve relative paths consistently", async () => {
    // Test that relative paths are resolved consistently based on process.cwd()
    // Create a config file at the expected resolved location
    const relativePath = "./consistent-test.json";
    const expectedAbsolutePath = path.resolve(relativePath);
    
    await fs.writeFile(expectedAbsolutePath, JSON.stringify(testConfigContent, null, 2));
    
    try {
      const result = await discoverMcpConfig(relativePath);
      
      expect(result.configPath).toBe(expectedAbsolutePath);
      expect(result.source).toBe("cli");
      expect(result.errorMessage).toBeUndefined();
    } finally {
      // Clean up
      try {
        await fs.unlink(expectedAbsolutePath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it("should handle nested relative paths", async () => {
    // Create the nested config file in the current working directory context
    const configsDir = path.join(process.cwd(), "configs");
    const nestedDir = path.join(configsDir, "nested");
    await fs.mkdir(nestedDir, { recursive: true });
    
    const nestedConfigPath = path.join(nestedDir, "nested-config.json");
    await fs.writeFile(nestedConfigPath, JSON.stringify(testConfigContent, null, 2));
    
    try {
      const relativePath = "./configs/nested/nested-config.json";
      const result = await discoverMcpConfig(relativePath);
      
      expect(result.configPath).toBe(path.resolve(relativePath));
      expect(result.source).toBe("cli");
      expect(result.errorMessage).toBeUndefined();
    } finally {
      // Clean up the nested directory structure
      try {
        await fs.rm(configsDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
});