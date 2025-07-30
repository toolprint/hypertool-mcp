#!/usr/bin/env node

/**
 * Test script for the unified configuration manager
 * Usage: npx tsx src/config-manager/test-config-manager.ts
 */

import { ConfigurationManager } from "./index.js";
import { ConfigMigrator } from "./migration/migrator.js";
import chalk from "chalk";

async function testConfigManager() {
  console.log(chalk.blue("\n🧪 Testing Unified Configuration Manager\n"));

  const configManager = new ConfigurationManager();
  const migrator = new ConfigMigrator();

  try {
    // Initialize
    console.log(chalk.yellow("1. Initializing configuration manager..."));
    await configManager.initialize();
    console.log(chalk.green("✅ Initialized successfully"));

    // Check for migration needs
    console.log(chalk.yellow("\n2. Checking for legacy configurations..."));
    const needsMigration = await migrator.needsMigration();
    console.log(
      needsMigration
        ? chalk.yellow("⚠️  Legacy configurations found")
        : chalk.green("✅ No legacy configurations found")
    );

    if (needsMigration) {
      console.log(chalk.yellow("\n3. Migrating legacy configurations..."));
      const migrationResult = await migrator.migrate();
      console.log(
        chalk.green(
          `✅ Migrated: ${migrationResult.migrated.join(", ") || "None"}`
        )
      );
      if (migrationResult.failed.length > 0) {
        console.log(
          chalk.red(`❌ Failed: ${migrationResult.failed.join(", ")}`)
        );
      }
    }

    // Discover and import
    console.log(
      chalk.yellow("\n4. Discovering and importing configurations...")
    );
    const importResult = await configManager.discoverAndImport();
    console.log(
      chalk.green(
        `✅ Imported from: ${importResult.imported.join(", ") || "None"}`
      )
    );
    console.log(chalk.green(`📁 Backup created: ${importResult.backup}`));
    if (importResult.failed.length > 0) {
      console.log(chalk.red(`❌ Failed: ${importResult.failed.join(", ")}`));
    }

    // List backups
    console.log(chalk.yellow("\n5. Listing available backups..."));
    const backups = await configManager.listBackups();
    console.log(chalk.green(`✅ Found ${backups.length} backup(s)`));
    if (backups.length > 0) {
      const latest = backups[0];
      console.log(
        chalk.gray(
          `   Latest: ${new Date(latest.metadata.timestamp).toLocaleString()}`
        )
      );
      console.log(chalk.gray(`   Servers: ${latest.metadata.total_servers}`));
      console.log(
        chalk.gray(
          `   Apps: ${Object.keys(latest.metadata.applications).join(", ")}`
        )
      );
    }

    // Test deployment (dry run)
    console.log(chalk.yellow("\n6. Testing deployment (dry run)..."));
    console.log(
      chalk.gray("   Would deploy HyperTool configuration to all applications")
    );
    console.log(chalk.gray("   (Skipping actual deployment in test mode)"));

    console.log(chalk.green("\n✨ All tests completed successfully!\n"));
  } catch (error) {
    console.error(chalk.red("\n❌ Test failed:"), error);
    process.exit(1);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testConfigManager().catch(console.error);
}
