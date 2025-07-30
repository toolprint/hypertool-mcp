/**
 * Unit tests for Enhanced Hypertool MCP server
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EnhancedMetaMCPServer } from "./enhanced.js";
import { MetaMCPServerConfig, ServerState } from "./types.js";
import { ServerConfig } from "../config/index.js";

describe("EnhancedMetaMCPServer", () => {
  let server: EnhancedMetaMCPServer;
  let config: MetaMCPServerConfig;

  beforeEach(() => {
    config = {
      name: "test-enhanced-server",
      version: "1.0.0",
      description: "Test enhanced server",
      transport: {
        type: "stdio",
      },
    };
    server = new EnhancedMetaMCPServer(config);
  });

  afterEach(async () => {
    if (server.getStatus().state === ServerState.RUNNING) {
      await server.stop();
    }
  });

  describe("Self-Reference Detection", () => {
    it("should detect NPX hypertool-mcp references", () => {
      const config: ServerConfig = {
        type: "stdio",
        command: "npx",
        args: ["-y", "@toolprint/hypertool-mcp"],
      };

      const result = (server as any).isSelfReferencingServer(config);
      expect(result).toBe(true);
    });

    it("should detect direct hypertool-mcp command references", () => {
      const config: ServerConfig = {
        type: "stdio",
        command: "hypertool-mcp",
        args: [],
      };

      const result = (server as any).isSelfReferencingServer(config);
      expect(result).toBe(true);
    });

    it("should detect NPX references with package name variation", () => {
      const config: ServerConfig = {
        type: "stdio",
        command: "npx",
        args: ["hypertool-mcp"],
      };

      const result = (server as any).isSelfReferencingServer(config);
      expect(result).toBe(true);
    });

    it("should detect Node.js references to hypertool-mcp", () => {
      const config: ServerConfig = {
        type: "stdio",
        command: "node",
        args: ["./node_modules/@toolprint/hypertool-mcp/dist/bin.js"],
      };

      const result = (server as any).isSelfReferencingServer(config);
      expect(result).toBe(true);
    });

    it("should not flag legitimate external servers", () => {
      const config: ServerConfig = {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-docker"],
      };

      const result = (server as any).isSelfReferencingServer(config);
      expect(result).toBe(false);
    });

    it("should not flag HTTP/SSE servers", () => {
      const config: ServerConfig = {
        type: "sse",
        url: "https://example.com/mcp",
      };

      const result = (server as any).isSelfReferencingServer(config);
      expect(result).toBe(false);
    });
  });

  describe("Server Configuration Filtering", () => {
    it("should filter out self-referencing servers", () => {
      const serverConfigs: Record<string, ServerConfig> = {
        "legitimate-server": {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-docker"],
        },
        "self-reference": {
          type: "stdio",
          command: "npx",
          args: ["-y", "@toolprint/hypertool-mcp"],
        },
        "another-legitimate": {
          type: "sse",
          url: "https://example.com/mcp",
        },
      };

      const filtered = (server as any).filterSelfReferencingServers(
        serverConfigs
      );

      expect(Object.keys(filtered)).toHaveLength(2);
      expect(filtered["legitimate-server"]).toBeDefined();
      expect(filtered["another-legitimate"]).toBeDefined();
      expect(filtered["self-reference"]).toBeUndefined();
    });

    it("should return all servers when no self-references exist", () => {
      const serverConfigs: Record<string, ServerConfig> = {
        docker: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-docker"],
        },
        "api-server": {
          type: "sse",
          url: "https://api.example.com/mcp",
        },
      };

      const filtered = (server as any).filterSelfReferencingServers(
        serverConfigs
      );

      expect(Object.keys(filtered)).toHaveLength(2);
      expect(filtered).toEqual(serverConfigs);
    });

    it("should return empty object when all servers are self-references", () => {
      const serverConfigs: Record<string, ServerConfig> = {
        "self-ref-1": {
          type: "stdio",
          command: "hypertool-mcp",
        },
        "self-ref-2": {
          type: "stdio",
          command: "npx",
          args: ["@toolprint/hypertool-mcp"],
        },
      };

      const filtered = (server as any).filterSelfReferencingServers(
        serverConfigs
      );

      expect(Object.keys(filtered)).toHaveLength(0);
    });
  });
});
