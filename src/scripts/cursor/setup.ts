#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import chalk from "chalk";
import inquirer from "inquirer";
import { output } from "../../logging/output.js";

const CURSOR_CONFIG_PATH = path.join(os.homedir(), ".cursor", "mcp.json");
const BACKUP_PATH = path.join(os.homedir(), ".cursor", "mcp.backup.json");
const HYPERTOOL_CONFIG_PATH = path.join(
  os.homedir(),
  ".cursor",
  ".mcp.ht.json"
);

interface SetupOptions {
  dryRun?: boolean;
}

export default async function main(options: SetupOptions = {}) {
  const { dryRun = false } = options;
  output.clearTerminal();
  output.displayHeader("🚀 Cursor IDE Integration Setup");
  output.displaySubHeader("HyperTool MCP Configuration");
  
  if (dryRun) {
    output.warn("🧪 DRY RUN MODE - No actual changes will be made");
    output.displaySpaceBuffer(1);
  }
  
  output.displaySpaceBuffer(1);

  // 1. Validation Phase
  output.info("📋 Checking for existing Cursor configuration...");
  output.displaySpaceBuffer(1);

  if (!fs.existsSync(CURSOR_CONFIG_PATH)) {
    output.error("❌ No mcp.json exists yet");
    output.displayInstruction("Please set up at least one MCP server in Cursor first");
    process.exit(1);
  }

  let originalConfig;
  try {
    const configContent = fs.readFileSync(CURSOR_CONFIG_PATH, "utf8");
    originalConfig = JSON.parse(configContent);
  } catch (error) {
    output.error("❌ Invalid JSON in mcp.json");
    output.displayInstruction("Please fix the JSON syntax and try again");
    process.exit(1);
  }

  output.success("✅ Found valid Cursor configuration");
  output.displaySpaceBuffer(1);

  // Show current MCP servers
  const existingServers = Object.keys(originalConfig.mcpServers || {});
  if (existingServers.length > 0) {
    output.info("📋 Current MCP servers:");
    existingServers.forEach((server) => {
      output.displayHelpContext(`   • ${server}`);
    });
    output.displaySpaceBuffer(1);
  }

  // Check if hypertool already exists
  if (originalConfig.mcpServers?.hypertool) {
    output.warn("⚠️  HyperTool MCP is already configured in Cursor");
    output.displaySpaceBuffer(1);
    
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: "Would you like to overwrite the existing HyperTool configuration?",
        default: false,
      },
    ]);

    if (!overwrite) {
      output.info("✨ Setup cancelled. No changes made.");
      process.exit(0);
    }
    output.displaySpaceBuffer(1);
  }

  // 2. Get user permission to proceed
  output.displaySubHeader("Setup Overview");
  output.info("🔧 This tool will:");
  output.displayHelpContext("   • Create a backup of your current configuration");
  output.displayHelpContext("   • Copy all your existing MCP servers to HyperTool's config");
  output.displayHelpContext("   • Add HyperTool as a new MCP server in Cursor");
  output.displayHelpContext("   • Optionally clean up your original configuration");
  output.displaySpaceBuffer(1);

  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Do you want to proceed with the HyperTool MCP setup?",
      default: true,
    },
  ]);

  if (!proceed) {
    output.info("✨ Setup cancelled. No changes made.");
    process.exit(0);
  }
  output.displaySpaceBuffer(1);

  // 3. Backup Phase
  output.displaySubHeader("Configuration Backup");
  output.info("💾 Creating backup of original configuration...");

  if (dryRun) {
    output.displayHelpContext("WOULD: Copy ~/.cursor/mcp.json → ~/.cursor/mcp.backup.json");
    output.success("✅ [DRY RUN] Backup would be created at ~/.cursor/mcp.backup.json");
  } else {
    try {
      fs.copyFileSync(CURSOR_CONFIG_PATH, BACKUP_PATH);
      output.success("✅ Backup created at ~/.cursor/mcp.backup.json");
    } catch (error) {
      output.error("❌ Failed to create backup");
      output.displayInstruction("Please check file permissions and try again");
      process.exit(1);
    }
  }
  output.displaySpaceBuffer(1);

  // 4. Configuration Copy Phase
  output.info("📁 Copying existing MCP servers to HyperTool config...");

  if (dryRun) {
    output.displayHelpContext("WOULD: Write configuration to ~/.cursor/.mcp.ht.json");
    output.displayHelpContext(`WOULD: Include ${existingServers.length} existing server(s)`);
    output.success("✅ [DRY RUN] Existing servers would be copied to ~/.cursor/.mcp.ht.json");
  } else {
    try {
      fs.writeFileSync(
        HYPERTOOL_CONFIG_PATH,
        JSON.stringify(originalConfig, null, 2)
      );
      output.success("✅ Existing servers copied to ~/.cursor/.mcp.ht.json");
    } catch (error) {
      output.error("❌ Failed to create HyperTool config");
      output.displayInstruction("Please check file permissions and try again");
      process.exit(1);
    }
  }
  output.displaySpaceBuffer(1);

  // 5. HyperTool Integration Phase
  output.info("🔧 Adding HyperTool entry to Cursor configuration...");

  const hypertoolEntry = {
    type: "stdio",
    command: "npx",
    args: [
      "-y",
      "@toolprint/hypertool-mcp",
      "--config",
      "~/.cursor/.mcp.ht.json",
    ],
  };

  const newConfig = {
    ...originalConfig,
    mcpServers: {
      ...originalConfig.mcpServers,
      hypertool: hypertoolEntry,
    },
  };

  if (dryRun) {
    output.displayHelpContext("WOULD: Add 'hypertool' entry to ~/.cursor/mcp.json");
    output.displayCodeBlock(JSON.stringify(hypertoolEntry, null, 2));
    output.success("✅ [DRY RUN] HyperTool entry would be added to Cursor configuration");
  } else {
    try {
      fs.writeFileSync(CURSOR_CONFIG_PATH, JSON.stringify(newConfig, null, 2));
      output.success("✅ HyperTool entry added to Cursor configuration");
    } catch (error) {
      output.error("❌ Failed to update Cursor configuration");
      output.displayInstruction("Restoring from backup...");
      fs.copyFileSync(BACKUP_PATH, CURSOR_CONFIG_PATH);
      process.exit(1);
    }
  }
  output.displaySpaceBuffer(1);

  // 6. Cleanup Choice Phase
  output.displaySubHeader("Configuration Cleanup");
  output.warn("🧹 Configuration Cleanup Options:");
  output.displayHelpContext("   • Keep both: Your original servers + HyperTool");
  output.displayHelpContext("   • Clean up: Only HyperTool (original servers accessible through HyperTool)");
  output.displaySpaceBuffer(1);

  const { cleanupChoice } = await inquirer.prompt([
    {
      type: "list",
      name: "cleanupChoice",
      message: "How would you like to manage your MCP configuration?",
      choices: [
        {
          name: "Keep both configurations (recommended for testing)",
          value: "keep",
        },
        {
          name: "Clean up - only HyperTool in main config",
          value: "cleanup",
        },
      ],
      default: "keep",
    },
  ]);

  output.displaySpaceBuffer(1);

  if (cleanupChoice === "cleanup") {
    const cleanConfig = {
      mcpServers: {
        hypertool: hypertoolEntry,
      },
    };

    if (dryRun) {
      output.displayHelpContext("WOULD: Replace ~/.cursor/mcp.json with only HyperTool entry");
      output.displayHelpContext(`WOULD: Remove ${existingServers.length} existing server(s) from main config`);
      output.success("✅ [DRY RUN] Cursor config would be cleaned up to only include HyperTool");
      output.info("ℹ️  Your original servers would still be accessible through HyperTool");
    } else {
      try {
        fs.writeFileSync(
          CURSOR_CONFIG_PATH,
          JSON.stringify(cleanConfig, null, 2)
        );
        output.success("✅ Cursor config cleaned up to only include HyperTool");
        output.info("ℹ️  Your original servers are still accessible through HyperTool");
      } catch (error) {
        output.error("❌ Failed to clean up configuration");
        output.displayInstruction("Your original config with HyperTool added is still intact");
      }
    }
  } else {
    output.info("ℹ️  Your original servers are still in the main config alongside HyperTool");
    output.displayHelpContext("You can manually remove them later if desired");
  }

  // Final Summary
  output.displaySpaceBuffer(2);
  output.displaySeparator();
  
  if (dryRun) {
    output.success("🎉 Cursor IDE integration setup preview complete!");
    output.displaySpaceBuffer(1);
    
    output.displaySubHeader("Summary of Changes (DRY RUN)");
    output.info("📝 What WOULD be changed:");
    output.displayHelpContext("   • Backup created: ~/.cursor/mcp.backup.json");
    output.displayHelpContext("   • HyperTool config: ~/.cursor/.mcp.ht.json");
    output.displayHelpContext("   • Updated: ~/.cursor/mcp.json");
    output.displaySpaceBuffer(1);
    
    output.displaySubHeader("Next Steps");
    output.info("🚀 To apply these changes:");
    output.displayTerminalInstruction("npx hypertool-mcp install cursor");
    output.displaySpaceBuffer(1);
  } else {
    output.success("🎉 Cursor IDE integration setup complete!");
    output.displaySpaceBuffer(1);
    
    output.displaySubHeader("Summary of Changes");
    output.info("📝 What was changed:");
    output.displayHelpContext("   • Backup created: ~/.cursor/mcp.backup.json");
    output.displayHelpContext("   • HyperTool config: ~/.cursor/.mcp.ht.json");
    output.displayHelpContext("   • Updated: ~/.cursor/mcp.json");
    output.displaySpaceBuffer(1);
    
    output.displaySubHeader("Next Steps");
    output.info("🚀 Next steps:");
    output.displayInstruction("1. Restart Cursor IDE", true);
    output.displayInstruction("2. HyperTool should now appear in your MCP servers", true);
    output.displayInstruction("3. Use HyperTool to create focused toolsets!", true);
    output.displaySpaceBuffer(1);
  }
}

// ESM equivalent of require.main === module
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    output.error("❌ Setup failed:");
    output.error(error.message || error);
    process.exit(1);
  });
}
