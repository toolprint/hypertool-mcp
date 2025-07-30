/**
 * Test data builders for creating configurations
 */

import { MCPServerConfig, MCPConfig } from '../../src/config-manager/types/index.js';

/**
 * Builder for MCP server configurations
 */
export class ServerBuilder {
  private config: MCPServerConfig = {
    type: 'stdio',
    command: 'default-mcp-server'
  };

  static stdio(): ServerBuilder {
    return new ServerBuilder().withType('stdio');
  }

  static http(): ServerBuilder {
    return new ServerBuilder().withType('http');
  }

  static sse(): ServerBuilder {
    return new ServerBuilder().withType('sse');
  }

  withType(type: 'stdio' | 'http' | 'sse' | 'websocket'): this {
    this.config.type = type;
    return this;
  }

  withCommand(command: string): this {
    this.config.command = command;
    return this;
  }

  withUrl(url: string): this {
    this.config.url = url;
    return this;
  }

  withArgs(...args: string[]): this {
    this.config.args = args;
    return this;
  }

  withEnv(env: Record<string, string>): this {
    this.config.env = env;
    return this;
  }

  withHeaders(headers: Record<string, string>): this {
    this.config.headers = headers;
    return this;
  }

  build(): MCPServerConfig {
    // Validate based on type
    if (this.config.type === 'stdio' && !this.config.command) {
      throw new Error('stdio server requires command');
    }
    if ((this.config.type === 'http' || this.config.type === 'sse') && !this.config.url) {
      throw new Error(`${this.config.type} server requires url`);
    }
    return { ...this.config };
  }
}

/**
 * Builder for MCP configurations
 */
export class ConfigBuilder {
  private servers: Record<string, MCPServerConfig> = {};

  static empty(): ConfigBuilder {
    return new ConfigBuilder();
  }

  static withServers(servers: Record<string, MCPServerConfig>): ConfigBuilder {
    const builder = new ConfigBuilder();
    builder.servers = servers;
    return builder;
  }

  addServer(name: string, server: MCPServerConfig): this {
    this.servers[name] = server;
    return this;
  }

  addStdioServer(name: string, command: string, args?: string[]): this {
    const server = ServerBuilder.stdio()
      .withCommand(command);
    
    if (args) {
      server.withArgs(...args);
    }
    
    this.servers[name] = server.build();
    return this;
  }

  addHttpServer(name: string, url: string, headers?: Record<string, string>): this {
    const server = ServerBuilder.http()
      .withUrl(url);
    
    if (headers) {
      server.withHeaders(headers);
    }
    
    this.servers[name] = server.build();
    return this;
  }

  build(): MCPConfig {
    return {
      mcpServers: this.servers
    };
  }

  toJson(pretty: boolean = true): string {
    return JSON.stringify(this.build(), null, pretty ? 2 : 0);
  }
}

/**
 * Pre-built test configurations
 */
export const TestConfigs = {
  /**
   * Empty configuration
   */
  empty(): MCPConfig {
    return ConfigBuilder.empty().build();
  },

  /**
   * Single stdio server
   */
  singleServer(): MCPConfig {
    return ConfigBuilder.empty()
      .addStdioServer('test-server', 'test-mcp', ['--verbose'])
      .build();
  },

  /**
   * Multiple stdio servers
   */
  multipleServers(): MCPConfig {
    return ConfigBuilder.empty()
      .addStdioServer('git', 'git-mcp-server')
      .addStdioServer('fs', 'fs-mcp', ['--root', '/home'])
      .addStdioServer('db', 'postgres-mcp')
      .build();
  },

  /**
   * Mixed server types
   */
  mixedTypes(): MCPConfig {
    return ConfigBuilder.empty()
      .addServer('stdio-server', ServerBuilder.stdio()
        .withCommand('stdio-mcp')
        .build())
      .addServer('http-server', ServerBuilder.http()
        .withUrl('http://localhost:3000/mcp')
        .withHeaders({ 'Authorization': 'Bearer token' })
        .build())
      .addServer('sse-server', ServerBuilder.sse()
        .withUrl('http://localhost:3001/events')
        .build())
      .build();
  },

  /**
   * Complex server with all options
   */
  complexServer(): MCPConfig {
    return ConfigBuilder.empty()
      .addServer('complex', ServerBuilder.stdio()
        .withCommand('/usr/local/bin/complex-mcp')
        .withArgs('--config', '/etc/config.yaml', '--verbose', '--max-connections', '100')
        .withEnv({
          'NODE_ENV': 'production',
          'LOG_LEVEL': 'debug',
          'API_KEY': 'secret-key-123'
        })
        .build())
      .build();
  },

  /**
   * Hypertool proxy configuration
   */
  hypertoolProxy(configPath: string): MCPConfig {
    return ConfigBuilder.empty()
      .addServer('hypertool-mcp', ServerBuilder.stdio()
        .withCommand('npx')
        .withArgs('-y', '@toolprint/hypertool-mcp', '--mcp-config', configPath)
        .build())
      .build();
  }
};

/**
 * Create a random server configuration
 */
export function randomServer(index: number = 0): MCPServerConfig {
  return ServerBuilder.stdio()
    .withCommand(`random-mcp-${index}`)
    .withArgs(`--id=${index}`)
    .withEnv({ [`RANDOM_VAR_${index}`]: `value_${index}` })
    .build();
}

/**
 * Create multiple random servers
 */
export function randomServers(count: number): Record<string, MCPServerConfig> {
  const servers: Record<string, MCPServerConfig> = {};
  
  for (let i = 0; i < count; i++) {
    servers[`server-${i}`] = randomServer(i);
  }
  
  return servers;
}