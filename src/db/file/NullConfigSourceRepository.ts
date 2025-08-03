/**
 * Null implementation of ConfigSource repository
 * File-based storage doesn't need config source tracking
 */

import { IConfigSource, IConfigSourceRepository } from "../interfaces.js";

/**
 * Stub implementation that returns empty results
 * ConfigSources are only needed for NeDB to track imports
 */
export class NullConfigSourceRepository implements IConfigSourceRepository {
  async add(source: Omit<IConfigSource, "id">): Promise<IConfigSource> {
    throw new Error("ConfigSource tracking not supported in file-based mode");
  }

  async update(source: IConfigSource): Promise<IConfigSource | null> {
    return null;
  }

  async delete(id: string): Promise<boolean> {
    return false;
  }

  async findById(id: string): Promise<IConfigSource | null> {
    return null;
  }

  async findByPath(path: string): Promise<IConfigSource | null> {
    return null;
  }

  async findByAppId(appId: string): Promise<IConfigSource[]> {
    return [];
  }

  async findAll(): Promise<IConfigSource[]> {
    return [];
  }
}