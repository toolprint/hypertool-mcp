/**
 * File-based implementation of ServerConfigGroup repository
 * Stores groups in a simple JSON file
 */

import { promises as fs } from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  ServerConfigGroup,
  IServerConfigGroupRepository,
  ServerConfigRecord,
  IServerConfigRecordRepository,
} from "../interfaces.js";
import { createChildLogger } from "../../utils/logging.js";
import { getHomeDir } from "../../utils/paths.js";

const logger = createChildLogger({
  module: "FileServerConfigGroupRepository",
});

interface GroupsFileContent {
  version: string;
  groups: ServerConfigGroup[];
}

/**
 * File-based server configuration group repository
 */
export class FileServerConfigGroupRepository
  implements IServerConfigGroupRepository
{
  private groupsFilePath: string;
  private serverRepository: IServerConfigRecordRepository;

  constructor(
    serverRepository: IServerConfigRecordRepository,
    basePath?: string
  ) {
    const baseDir = basePath || path.join(getHomeDir(), ".toolprint/hypertool-mcp");
    this.groupsFilePath = path.join(baseDir, "groups.json");
    this.serverRepository = serverRepository;
  }

  /**
   * Initialize the repository (ensure file exists)
   */
  async init(): Promise<void> {
    const dir = path.dirname(this.groupsFilePath);
    await fs.mkdir(dir, { recursive: true });

    // Create file if it doesn't exist
    try {
      await fs.access(this.groupsFilePath);
    } catch {
      await this.saveGroups([]);
    }
  }

  /**
   * Load groups from file
   */
  private async loadGroups(): Promise<ServerConfigGroup[]> {
    try {
      const content = await fs.readFile(this.groupsFilePath, "utf-8");
      const data: GroupsFileContent = JSON.parse(content);
      return data.groups || [];
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        return [];
      }
      logger.error("Failed to load groups:", error);
      throw error;
    }
  }

  /**
   * Save groups to file
   */
  private async saveGroups(groups: ServerConfigGroup[]): Promise<void> {
    const content: GroupsFileContent = {
      version: "1.0.0",
      groups,
    };
    await fs.writeFile(
      this.groupsFilePath,
      JSON.stringify(content, null, 2),
      "utf-8"
    );
  }

  /**
   * Add a new group
   */
  async add(
    group: Omit<ServerConfigGroup, "id">
  ): Promise<ServerConfigGroup> {
    const groups = await this.loadGroups();

    // Check if name already exists
    if (groups.some((g) => g.name === group.name)) {
      throw new Error(`Group with name "${group.name}" already exists`);
    }

    // Create new group with ID
    const newGroup: ServerConfigGroup = {
      ...group,
      id: uuidv4(),
    };

    // Add to groups and save
    groups.push(newGroup);
    await this.saveGroups(groups);

    return newGroup;
  }

  /**
   * Update an existing group
   */
  async update(group: ServerConfigGroup): Promise<ServerConfigGroup | null> {
    const groups = await this.loadGroups();
    const index = groups.findIndex((g) => g.id === group.id);

    if (index === -1) {
      return null;
    }

    // Check for name conflicts (excluding current group)
    const nameConflict = groups.some(
      (g) => g.name === group.name && g.id !== group.id
    );
    if (nameConflict) {
      throw new Error(`Group with name "${group.name}" already exists`);
    }

    // Update and save
    groups[index] = group;
    await this.saveGroups(groups);

    return group;
  }

  /**
   * Delete a group
   */
  async delete(id: string): Promise<boolean> {
    const groups = await this.loadGroups();
    const initialLength = groups.length;
    const filteredGroups = groups.filter((g) => g.id !== id);

    if (filteredGroups.length === initialLength) {
      return false; // Group not found
    }

    await this.saveGroups(filteredGroups);
    return true;
  }

  /**
   * Find a group by ID
   */
  async findById(id: string): Promise<ServerConfigGroup | null> {
    const groups = await this.loadGroups();
    return groups.find((g) => g.id === id) || null;
  }

  /**
   * Find a group by name
   */
  async findByName(name: string): Promise<ServerConfigGroup | null> {
    const groups = await this.loadGroups();
    return groups.find((g) => g.name === name) || null;
  }

  /**
   * Find all groups
   */
  async findAll(): Promise<ServerConfigGroup[]> {
    return this.loadGroups();
  }

  /**
   * Find all servers in a group
   */
  async findServersInGroup(groupId: string): Promise<ServerConfigRecord[]> {
    const group = await this.findById(groupId);
    if (!group) {
      return [];
    }

    // Fetch all servers
    const allServers = await this.serverRepository.findAll();

    // Filter servers that are in the group
    const groupServers = allServers.filter((server) =>
      group.serverIds.includes(server.id)
    );

    return groupServers;
  }
}