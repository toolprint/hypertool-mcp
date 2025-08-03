/**
 * Test utilities for configuration manager tests
 */

import { MCPConfig } from "./types/index.js";

/**
 * Create a mock Claude Code configuration for testing
 */
export function createMockClaudeCodeConfig(overrides?: Partial<any>) {
  return {
    numStartups: 1,
    installMethod: "test",
    autoUpdates: true,
    tipsHistory: {},
    mcpServers: {},
    projects: {},
    userID: "test-user",
    firstStartTime: "2025-01-01T00:00:00.000Z",
    oauthAccount: {
      accountUuid: "test-uuid",
      emailAddress: "test@example.com",
      organizationUuid: "test-org",
      organizationRole: "member",
      workspaceRole: null,
      organizationName: "Test Org",
    },
    isQualifiedForDataSharing: false,
    shiftEnterKeyBindingInstalled: true,
    hasCompletedOnboarding: true,
    lastOnboardingVersion: "1.0.0",
    cachedChangelog: "",
    changelogLastFetched: 0,
    fallbackAvailableWarningThreshold: 0.5,
    subscriptionNoticeCount: 0,
    hasAvailableSubscription: false,
    lastReleaseNotesSeen: "1.0.0",
    ...overrides,
  };
}

/**
 * Create a standard MCP configuration for testing
 */
export function createMockMCPConfig(
  servers?: Record<string, any>
): MCPConfig {
  return {
    mcpServers: servers || {
      "test-server": {
        type: "stdio",
        command: "test",
        args: ["arg1"],
      },
    },
  };
}

/**
 * Compare two configurations ignoring dynamic fields
 */
export function compareConfigs(
  actual: any,
  expected: any,
  ignorePaths: string[] = []
): boolean {
  const actualCopy = JSON.parse(JSON.stringify(actual));
  const expectedCopy = JSON.parse(JSON.stringify(expected));

  // Remove dynamic fields
  for (const path of ignorePaths) {
    deletePath(actualCopy, path);
    deletePath(expectedCopy, path);
  }

  return JSON.stringify(actualCopy) === JSON.stringify(expectedCopy);
}

/**
 * Delete a path from an object
 */
function deletePath(obj: any, path: string): void {
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) return;
    current = current[parts[i]];
  }

  delete current[parts[parts.length - 1]];
}

/**
 * Create a mock application definition for testing
 */
export function createMockApplication(overrides?: Partial<any>) {
  return {
    name: "Test App",
    enabled: true,
    platforms: {
      all: {
        configPath: "~/.test/config.json",
        format: "standard",
      },
    },
    detection: {
      type: "file",
      path: "~/.test/config.json",
    },
    ...overrides,
  };
}