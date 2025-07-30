/**
 * Tests for the configuration transformers
 */

import { describe, it, expect } from 'vitest';
import { StandardTransformer } from './base.js';

describe('StandardTransformer', () => {
  const transformer = new StandardTransformer();

  describe('validation', () => {
    it('should validate stdio transport with command', () => {
      const config = {
        mcpServers: {
          'test-server': {
            type: 'stdio',
            command: 'test-command',
            args: ['arg1', 'arg2']
          }
        }
      };

      const result = transformer.validate(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate sse transport with url', () => {
      const config = {
        mcpServers: {
          'context7': {
            type: 'sse',
            url: 'https://mcp.context7.com/sse'
          }
        }
      };

      const result = transformer.validate(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate http transport with url', () => {
      const config = {
        mcpServers: {
          'http-server': {
            type: 'http',
            url: 'https://example.com/mcp'
          }
        }
      };

      const result = transformer.validate(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject stdio transport without command', () => {
      const config = {
        mcpServers: {
          'test-server': {
            type: 'stdio',
            url: 'https://example.com' // Wrong field
          }
        }
      };

      const result = transformer.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Server \"test-server\" with type 'stdio' missing required field: command");
    });

    it('should reject sse transport without url', () => {
      const config = {
        mcpServers: {
          'sse-server': {
            type: 'sse',
            command: 'some-command' // Wrong field
          }
        }
      };

      const result = transformer.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Server \"sse-server\" with type 'sse' missing required field: url");
    });

    it('should warn about command field in http/sse transport', () => {
      const config = {
        mcpServers: {
          'mixed-server': {
            type: 'sse',
            url: 'https://example.com/sse',
            command: 'unnecessary-command' // This should generate a warning
          }
        }
      };

      const result = transformer.validate(config);
      expect(result.valid).toBe(true); // Still valid, just warning
      expect(result.warnings).toContain("Server \"mixed-server\" with type 'sse' should use 'url' instead of 'command'");
    });

    it('should reject invalid transport type', () => {
      const config = {
        mcpServers: {
          'bad-server': {
            type: 'invalid-type',
            command: 'test'
          }
        }
      };

      const result = transformer.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Server "bad-server" has invalid type: invalid-type');
    });
  });

  describe('toStandard', () => {
    it('should pass through standard format', () => {
      const config = {
        mcpServers: {
          'test': {
            type: 'stdio',
            command: 'test'
          }
        }
      };

      const result = transformer.toStandard(config);
      expect(result).toEqual(config);
    });

    it('should wrap bare server objects', () => {
      const bareConfig = {
        'server1': {
          type: 'stdio',
          command: 'cmd1'
        },
        'server2': {
          type: 'sse',
          url: 'https://example.com'
        }
      };

      const result = transformer.toStandard(bareConfig);
      expect(result.mcpServers).toEqual(bareConfig);
    });
  });
});