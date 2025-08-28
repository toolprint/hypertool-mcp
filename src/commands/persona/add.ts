/**
 * Persona Add Command
 *
 * CLI command to install personas from folder paths or .htp archives
 * into the standard personas directory (~/.toolprint/hypertool-mcp/personas).
 *
 * @fileoverview Persona installation CLI command
 */

import { Command } from "commander";
import { resolve } from "path";
import { promises as fs } from "fs";
import inquirer from "inquirer";
import { theme, semantic } from "../../utils/theme.js";
import { createChildLogger } from "../../utils/logging.js";
import {
  installPersona,
  analyzeSource,
  checkPersonaExists,
  getStandardPersonasDir,
  SourceType,
  type InstallOptions,
} from "../../persona/installer.js";
import { isPersonaError } from "../../persona/errors.js";
import { PersonaErrorCode } from "../../persona/types.js";

const logger = createChildLogger({ module: "persona-add-cli" });

/**
 * Command options interface
 */
interface AddCommandOptions {
  /** Force overwrite existing personas */
  force?: boolean;
  /** Skip validation during installation */
  skipValidation?: boolean;
  /** Create backup of existing persona before overwriting */
  backup?: boolean;
  /** Custom installation directory */
  installDir?: string;
}

/**
 * Check for environment variables in MCP config that need configuration
 */
async function checkEnvironmentVariables(installPath: string): Promise<{
  hasEnvVars: boolean;
  envVars: Array<{server: string; vars: string[]}>;
  configPath: string;
}> {
  const mcpConfigPath = `${installPath}/mcp.json`;
  
  try {
    const configContent = await fs.readFile(mcpConfigPath, "utf-8");
    const config = JSON.parse(configContent);
    
    const envVars: Array<{server: string; vars: string[]}> = [];
    
    if (config.mcpServers) {
      for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
        if (typeof serverConfig === 'object' && serverConfig !== null && 'env' in serverConfig) {
          const env = (serverConfig as any).env;
          if (env && typeof env === 'object') {
            const vars = Object.keys(env);
            if (vars.length > 0) {
              envVars.push({
                server: serverName,
                vars: vars
              });
            }
          }
        }
      }
    }
    
    return {
      hasEnvVars: envVars.length > 0,
      envVars,
      configPath: mcpConfigPath
    };
  } catch (error) {
    // If we can't read the MCP config, that's okay
    return {
      hasEnvVars: false,
      envVars: [],
      configPath: mcpConfigPath
    };
  }
}

/**
 * Interactive environment variable configuration using inquirer (simplified)
 */
async function interactiveEnvVarConfig(
  envCheck: {
    hasEnvVars: boolean;
    envVars: Array<{server: string; vars: string[]}>;
    configPath: string;
  },
  personaName: string
): Promise<void> {
  const { shouldConfigure } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldConfigure',
      message: 'Configure now?',
      default: true,
    },
  ]);

  if (!shouldConfigure) {
    console.log(theme.warning(`⏭️  Configure later with: ${theme.info('hypertool persona inspect ' + personaName)}`));
    return;
  }

  const envValues: Record<string, string> = {};

  // Collect values for all environment variables
  for (const serverEnv of envCheck.envVars) {
    for (const envVar of serverEnv.vars) {
      const { value } = await inquirer.prompt([
        {
          type: 'input',
          name: 'value',
          message: `${serverEnv.server}.${envVar}:`,
          validate: (input: string) => input.trim() ? true : 'Required',
        },
      ]);
      envValues[envVar] = value;
    }
  }

  // Update the MCP config file with the new values
  try {
    const configContent = await fs.readFile(envCheck.configPath, "utf-8");
    const config = JSON.parse(configContent);

    // Update environment variables in the config
    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      if (typeof serverConfig === 'object' && serverConfig !== null && 'env' in serverConfig) {
        const env = (serverConfig as any).env;
        if (env && typeof env === 'object') {
          for (const [envVar, currentValue] of Object.entries(env)) {
            if (envValues[envVar]) {
              env[envVar] = envValues[envVar];
            }
          }
        }
      }
    }

    // Write the updated config back to file
    await fs.writeFile(envCheck.configPath, JSON.stringify(config, null, 2));

    console.log(theme.success(`✅ Configured! Run: ${theme.warning(`hypertool persona activate ${personaName}`)}`));
    console.log(`   ${theme.muted("Config:")} ${envCheck.configPath}`);

  } catch (error) {
    console.error(theme.error(`❌ Config failed. Edit manually: ${envCheck.configPath}`));
  }
}

/**
 * Display installation progress and results (simplified and compact)
 */
async function displayInstallationResult(
  sourcePath: string,
  result: any,
  sourceType: SourceType
): Promise<void> {
  if (result.success) {
    console.log(theme.success(`✅ Installed "${result.personaName}"`));
    console.log(`   ${theme.muted("Location:")} ${result.installPath}`);
    
    // Check for environment variables that need configuration
    const envCheck = await checkEnvironmentVariables(result.installPath);
    if (envCheck.hasEnvVars) {
      console.log();
      console.log(theme.warning("⚙️  Configuration needed:"));
      
      for (const serverEnv of envCheck.envVars) {
        const vars = serverEnv.vars.join(", ");
        console.log(`   ${theme.info(serverEnv.server)}: ${theme.warning(vars)}`);
      }

      // Offer interactive configuration
      await interactiveEnvVarConfig(envCheck, result.personaName);
    } else {
      console.log();
      console.log(theme.success(`🚀 Ready to use! Run: ${theme.warning(`hypertool persona activate ${result.personaName}`)}`));
    }
  } else {
    console.error(semantic.messageError("❌ Installation failed"));
    if (result.errors && result.errors.length > 0) {
      for (const error of result.errors) {
        console.error(`   ${theme.error(error)}`);
      }
    }
  }
}

/**
 * Display helpful error messages based on error type
 */
function displayError(error: Error, sourcePath: string): void {
  console.error(semantic.messageError("❌ Failed to install persona:"));

  if (isPersonaError(error)) {
    console.error(`   ${theme.error(error.message)}`);

    // Provide specific guidance based on error type
    switch (error.code) {
      case PersonaErrorCode.PERSONA_NOT_FOUND:
        console.log();
        console.error(
          theme.info("💡 Check that the path exists and is accessible")
        );
        console.error(theme.info("💡 Use absolute paths to avoid confusion"));
        break;

      case PersonaErrorCode.INVALID_SCHEMA:
        console.log();
        console.error(
          theme.info(
            "💡 Use 'hypertool persona validate <path>' to see detailed validation errors"
          )
        );
        console.error(
          theme.info("💡 Ensure persona.yaml file has correct structure")
        );
        break;

      case PersonaErrorCode.DUPLICATE_PERSONA_NAME:
        console.log();
        console.error(
          theme.info("💡 Use --force to overwrite existing persona")
        );
        console.error(
          theme.info("💡 Use --backup to create backup before overwriting")
        );
        console.error(
          theme.info("💡 Use 'hypertool persona list' to see existing personas")
        );
        break;

      case PersonaErrorCode.ARCHIVE_EXTRACTION_FAILED:
        console.log();
        console.error(theme.info("💡 Ensure the .htp file is not corrupted"));
        console.error(
          theme.info(
            "💡 Check that you have write permissions to the installation directory"
          )
        );
        break;

      case PersonaErrorCode.FILE_SYSTEM_ERROR:
        console.log();
        console.error(theme.info("💡 Check file permissions and disk space"));
        console.error(
          theme.info("💡 Ensure installation directory is writable")
        );
        break;

      default:
        console.log();
        console.error(
          theme.info("💡 Check the persona structure and try again")
        );
    }

    if (error.suggestions && error.suggestions.length > 0) {
      console.log();
      console.error(theme.info("💡 Suggestions:"));
      for (const suggestion of error.suggestions) {
        console.error(`   • ${theme.info(suggestion)}`);
      }
    }
  } else {
    console.error(`   ${theme.error(error.message)}`);
  }
}

/**
 * Create the add subcommand
 */
export function createAddCommand(): Command {
  return new Command("add")
    .description("Install a persona from a folder path or .htp archive")
    .argument("<path>", "Path to persona folder or .htp archive file")
    .option("--force", "Overwrite existing persona if it already exists", false)
    .option(
      "--backup",
      "Create backup of existing persona before overwriting",
      false
    )
    .option(
      "--skip-validation",
      "Skip persona validation during installation",
      false
    )
    .option(
      "--install-dir <dir>",
      "Custom installation directory (defaults to ~/.toolprint/hypertool-mcp/personas)"
    )
    .action(async (sourcePath: string, options: AddCommandOptions) => {
      try {
        const resolvedSourcePath = resolve(sourcePath);

        // Analyze the source to understand what we're installing  
        const sourceInfo = await analyzeSource(resolvedSourcePath);

        if (!sourceInfo.accessible) {
          throw new Error(
            `Source path is not accessible: ${resolvedSourcePath}`
          );
        }

        // Check if persona already exists
        const installDir = options.installDir || getStandardPersonasDir();
        if (sourceInfo.personaName) {
          const exists = await checkPersonaExists(
            sourceInfo.personaName,
            installDir
          );

          if (exists) {
            if (!options.force) {
              console.log(
                theme.warning(
                  `⚠️  Persona '${sourceInfo.personaName}' already exists`
                )
              );
              console.log();
              console.log(
                theme.info(
                  "Use --force to overwrite or --backup to create a backup first"
                )
              );
              process.exit(1);
              return; // Prevent further execution in test environment
            } else {
              console.log(
                theme.warning(
                  `⚠️  Will overwrite existing persona '${sourceInfo.personaName}'`
                )
              );
              if (options.backup) {
                console.log(
                  theme.info("   Creating backup before overwrite...")
                );
              }
              console.log();
            }
          }
        }

        // Prepare installation options
        const installOptions: InstallOptions = {
          force: options.force,
          backup: options.backup,
          skipValidation: options.skipValidation,
          installDir: options.installDir,
        };

        // Install the persona
        const result = await installPersona(resolvedSourcePath, installOptions);

        // Display results
        await displayInstallationResult(resolvedSourcePath, result, sourceInfo.type);

        // Exit with appropriate code
        process.exit(result.success ? 0 : 1);
      } catch (error) {
        displayError(error as Error, sourcePath);
        process.exit(1);
      }
    })
    .addHelpText(
      "after",
      `
${theme.label("Examples:")}
  ${theme.muted("# Install from folder")}
  ${theme.muted("hypertool persona add ./my-persona-folder")}

  ${theme.muted("# Install from archive")}
  ${theme.muted("hypertool persona add ./awesome-persona.htp")}

  ${theme.muted("# Force overwrite existing persona")}
  ${theme.muted("hypertool persona add ./updated-persona.htp --force")}

  ${theme.muted("# Create backup before overwriting")}
  ${theme.muted("hypertool persona add ./updated-persona.htp --force --backup")}

  ${theme.muted("# Install to custom directory")}
  ${theme.muted("hypertool persona add ./persona --install-dir /custom/path")}

${theme.label("Notes:")}
  ${theme.muted("• Persona folders must contain a valid persona.yaml file")}
  ${theme.muted("• Archive files must have .htp extension")}
  ${theme.muted("• Installation validates persona structure by default")}
  ${theme.muted("• Use --skip-validation to bypass validation checks")}
  ${theme.muted("• Backups are created with timestamp: persona.backup.YYYY-MM-DD...")}`
    );
}
