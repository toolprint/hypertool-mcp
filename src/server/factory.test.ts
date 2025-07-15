/**
 * Unit tests for Meta-MCP server factory
 */

import { describe, it, expect } from 'vitest';
import { MetaMCPServerFactory } from "./factory.js";
import { MetaMCPServer } from "./base.js";
import { MetaMCPServerConfig, TransportConfig } from "./types.js";

describe("MetaMCPServerFactory", () => {
  describe("createServer", () => {
    it("should create server with provided config", () => {
      const config: MetaMCPServerConfig = {
        name: "test-server",
        version: "1.0.0",
        description: "Test server",
        transport: { type: "stdio" },
      };

      const server = MetaMCPServerFactory.createServer(config);

      expect(server).toBeInstanceOf(MetaMCPServer);
      expect(server.getConfig()).toEqual(config);
    });
  });

  describe("createDefaultServer", () => {
    it("should create server with default config for stdio transport", () => {
      const transport: TransportConfig = { type: "stdio" };
      const server = MetaMCPServerFactory.createDefaultServer(transport);

      expect(server).toBeInstanceOf(MetaMCPServer);

      const config = server.getConfig();
      expect(config.name).toBe("meta-mcp");
      expect(config.version).toBe("1.0.0");
      expect(config.description).toContain("Meta-MCP proxy server");
      expect(config.transport).toEqual(transport);
    });

    it("should create server with default config for HTTP transport", () => {
      const transport: TransportConfig = {
        type: "http",
        port: 3000,
        host: "localhost",
      };
      const server = MetaMCPServerFactory.createDefaultServer(transport);

      expect(server).toBeInstanceOf(MetaMCPServer);

      const config = server.getConfig();
      expect(config.transport).toEqual(transport);
    });
  });

  describe("createInitOptions", () => {
    it("should create default initialization options", () => {
      const options = MetaMCPServerFactory.createInitOptions();

      expect(options).toEqual({
        transport: { type: "stdio" },
        debug: false,
      });
    });

    it("should merge provided overrides with defaults", () => {
      const overrides = {
        transport: { type: "http" as const, port: 4000 },
        debug: true,
        configPath: "/test/config.json",
      };

      const options = MetaMCPServerFactory.createInitOptions(overrides);

      expect(options).toEqual({
        transport: { type: "http", port: 4000 },
        debug: true,
        configPath: "/test/config.json",
      });
    });

    it("should partially override transport options", () => {
      const overrides = {
        transport: { type: "http" as const, port: 8080 },
      };

      const options = MetaMCPServerFactory.createInitOptions(overrides);

      expect(options.transport).toEqual({
        type: "http",
        port: 8080,
      });
    });
  });
});
