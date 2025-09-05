# Connection Module

## Purpose
Maintains client connections and pooling to underlying MCP servers and monitors health.

## Architecture
```mermaid
graph TD
  Server --> ConnectionManager
  ConnectionManager --> MCPServer
```

## Delegate
The server instantiates `ConnectionManager` to spawn and manage connections.

## Example
```ts
import { ConnectionManager } from './manager.js';
const manager = new ConnectionManager();
await manager.addServer(serverConfig);
```
