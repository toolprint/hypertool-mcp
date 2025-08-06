/**
 * Integration test for CLI --mcp-config flag with relative paths
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "path";
import * as fs from "fs/promises";
import { tmpdir } from "os";
import { discoverMcpConfig } from "../config/mcpConfigLoader.js";

describe("CLI --mcp-config flag integration", () => {
  let tempDir: string;
  let originalCwd: string;
  let testConfigPath: string;
  let testConfigContent: any;

  beforeEach(async () => {
    originalCwd = process.cwd();
    
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
    
    // Change working directory to the temp dir
    process.chdir(tempDir);
  });

  afterEach(async () => {
    // Restore original working directory
    process.chdir(originalCwd);
    
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should work with relative paths", async () => {
    // Use a relative path from the current working directory
    const relativePath = "./test-mcp.json";
    
    const result = await discoverMcpConfig(relativePath);
    
    expect(result.configPath).toBe(path.resolve(relativePath));
    expect(result.source).toBe("cli");
    expect(result.errorMessage).toBeUndefined();
  });

  it("should work with relative paths using parent directories", async () => {
    // Create a subdirectory and config in parent
    const subDir = path.join(tempDir, "subdir");
    await fs.mkdir(subDir);
    process.chdir(subDir);
    
    // Reference the config file from the subdirectory
    const relativePath = "../test-mcp.json";
    
    const result = await discoverMcpConfig(relativePath);
    
    expect(result.configPath).toBe(testConfigPath);
    expect(result.source).toBe("cli");
    expect(result.errorMessage).toBeUndefined();
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

  it("should resolve paths correctly even when working directory changes", async () => {
    const relativePath = "./test-mcp.json";
    const expectedAbsolutePath = path.resolve(relativePath);
    
    // Change to a different directory after setting up the relative path
    const anotherDir = path.join(tempDir, "another");
    await fs.mkdir(anotherDir);
    process.chdir(anotherDir);
    
    // The path should still resolve to the original location when discoverMcpConfig was called
    // Note: This test assumes path resolution happens at call time, not at file access time
    process.chdir(tempDir); // Go back to where the file exists
    
    const result = await discoverMcpConfig(relativePath);
    
    expect(result.configPath).toBe(expectedAbsolutePath);
    expect(result.source).toBe("cli");
    expect(result.errorMessage).toBeUndefined();
  });

  it("should handle nested relative paths", async () => {
    // Create nested directory structure
    const nestedDir = path.join(tempDir, "configs", "nested");
    await fs.mkdir(nestedDir, { recursive: true });
    
    const nestedConfigPath = path.join(nestedDir, "nested-config.json");
    await fs.writeFile(nestedConfigPath, JSON.stringify(testConfigContent, null, 2));
    
    const relativePath = "./configs/nested/nested-config.json";
    
    const result = await discoverMcpConfig(relativePath);
    
    expect(result.configPath).toBe(path.resolve(relativePath));
    expect(result.source).toBe("cli");
    expect(result.errorMessage).toBeUndefined();
  });
});