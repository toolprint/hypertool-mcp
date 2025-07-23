import figlet from "figlet";
import chalk from "chalk";
import { Console } from "console";
import { spawnSync } from "child_process";
import { isDefined } from "../utils/helpers.js";
import { APP_CONFIG, APP_NAME, BRAND_NAME } from "../config/appConfig.js";
import { getActiveLoggingConfig } from "./logging.js";

// For stdio transport, use stderr for all display output to avoid interfering with MCP protocol
const getStdioDisplay = () => {
  const currentLoggingConfig = getActiveLoggingConfig();
  // When enableConsole is false (stdio mode), use stderr for all output
  // When enableConsole is true (HTTP mode), use stdout
  if (currentLoggingConfig && !currentLoggingConfig.enableConsole) {
    return new Console({
      stdout: process.stderr,
      stderr: process.stderr,
    });
  }

  return new Console({
    stdout: process.stdout,
    stderr: process.stderr,
  });
};

const getPreferredOutputStream = () => {
  const currentLoggingConfig = getActiveLoggingConfig();
  // When enableConsole is false (stdio mode), use stderr
  // When enableConsole is true (HTTP mode), use stdout
  if (currentLoggingConfig && !currentLoggingConfig.enableConsole) {
    return process.stderr;
  }
  return process.stdout;
};

enum FigletFont {
  Standard = "Standard",
  SubZero = "Sub-Zero",
  Slant = "Slant",
  ANSIShadow = "ANSI Shadow",
  Block = "Block",
  Doom = "Doom",
  ThreeDASCII = "3D-ASCII",
  Small = "Small",
  Speed = "Speed",
}

const PREFERRED_FONT = FigletFont.SubZero;

/**
 * Custom console display output that also conditionally
 * logs to the console and the logger where appropriate
 */
export const output = {
  /**
   * Get the console object for the output
   * @returns The console object
   */
  get console(): Console {
    return getStdioDisplay();
  },

  clearTerminal: () => {
    /** Uses ANSI escape codes to clear the terminal so that it is not platform dependent. */
    getPreferredOutputStream().write("\x1b[2J"); // Clear the entire screen
    getPreferredOutputStream().write("\x1b[H"); // Move cursor to the home position (top-left corner)
  },

  /**
   * Display an unformatted message to the console and NEVER to the logger
   * @param msg - The message to log
   */
  display: (msg: string) => {
    getStdioDisplay().log(msg);
  },

  /**
   * Display text on the same line without a newline
   * @param msg - The message to display
   */
  displaySameLine: (msg: string) => {
    getPreferredOutputStream().write(msg);
  },

  displayTypewriter: async (
    msg: string,
    options?: {
      delayMs?: number;
      byWord?: boolean;
    }
  ) => {
    let { delayMs, byWord } = options ?? {};

    if (!isDefined(byWord)) {
      byWord = false;
    } else {
      // If byWord is true, default to 50ms delay
      if (!isDefined(delayMs)) {
        delayMs = 80;
      }
    }

    if (!isDefined(delayMs)) {
      delayMs = 20;
    }

    if (byWord) {
      const words = msg.split(" ");
      for (const word of words) {
        process.stdout.write(word);
        process.stdout.write(" ");
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } else {
      for (const char of msg) {
        process.stdout.write(char);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    // Add a newline at the end of the message
    process.stdout.write("\n");
  },

  displaySpaceBuffer: (numLines: number = 2) => {
    for (let i = 0; i < numLines; i++) {
      getStdioDisplay().log("");
    }
  },

  /**
   * Display a separator to the console and NEVER to the logger
   * @param length - The length of the separator
   */
  displaySeparator: (length: number = 80) => {
    getStdioDisplay().log(chalk.bold.blueBright.underline(" ".repeat(length)));
    getStdioDisplay().log(chalk.bold.blueBright.underline("".repeat(length)));
  },

  /**
   * Display a header to the console and NEVER to the logger
   * @param msg - The message to log
   */
  displayHeader: (msg: string) => {
    getStdioDisplay().log(chalk.bold.blueBright.underline(msg));
  },

  displaySubHeader: (msg: string) => {
    const fmtMsg = `\n> ${msg}`;
    getStdioDisplay().log(chalk.bold.blue.italic.underline(fmtMsg));
  },

  /**
   * Display text formatted as a terminal instruction with a prompt symbol
   * @param msg - The message to display as a terminal instruction
   * @param copyToClipboard - Whether to copy the command to clipboard (default: false)
   */
  displayTerminalInstruction: (
    msg: string,
    copyToClipboard: boolean = false
  ) => {
    // Create terminal-like prompt with different colors
    const promptSymbol = chalk.cyan("$");
    const command = chalk.white.bold(msg);

    // Copy to clipboard if requested
    if (copyToClipboard) {
      const rawCommand = msg; // Store raw command without styling for clipboard
      spawnSync("pbcopy", { input: rawCommand });

      // Display with padding and notification
      output.displaySpaceBuffer(1);
      getStdioDisplay().log(`${promptSymbol} ${command}`);
      output.displaySpaceBuffer(1);
      getStdioDisplay().log(chalk.dim.italic("Command copied to clipboard!"));
      output.displaySpaceBuffer(1);
    } else {
      // Display with padding only
      output.displaySpaceBuffer(1);
      getStdioDisplay().log(`${promptSymbol} ${command}`);
      output.displaySpaceBuffer(1);
    }
  },

  /**
   * Display a block of text with a border, like a code block.
   * @param code - The string to display as a code block.
   */
  displayCodeBlock: (code: string) => {
    const lines = code.split("\n");
    for (const line of lines) {
      getStdioDisplay().log(`\t${chalk.white.dim(line)}`);
    }
  },

  /**
   * Display an instruction to the console and NEVER to the logger
   * @param msg - The message to log
   */
  displayInstruction: (msg: string, bright: boolean = false) => {
    if (bright) {
      getStdioDisplay().log(chalk.yellow.bold(msg));
    } else {
      getStdioDisplay().log(chalk.blue.dim(msg));
    }
  },

  /**
   * Displays subtle help context to the user
   * @param msg - The message to log
   */
  displayHelpContext: (msg: string) => {
    getStdioDisplay().log(chalk.gray.dim.italic(msg));
  },

  /**
   * Displays a link with a prefix
   * @param prefix - The prefix to display
   * @param link - The link to display
   */
  displayLinkWithPrefix: (prefix: string, link: string) => {
    getStdioDisplay().log(`${chalk.dim(prefix)} ${chalk.blue.bold(link)}`);
  },

  /**
   * Display an unformatted message to the console
   * @param msg - The message to display
   */
  log: (msg: string) => {
    getStdioDisplay().log(msg);
  },

  /**
   * Display a formatted debug message to the console
   * @param msg - The message to display
   */
  debug: (msg: string) => {
    getStdioDisplay().debug(chalk.dim(chalk.yellow(msg)));
  },

  /**
   * Display a formatted info message to the console. General purpose messages for humans.
   * @param msg - The message to display
   */
  info: (msg: string, lowPriority: boolean = false) => {
    if (lowPriority) {
      getStdioDisplay().info(chalk.dim(chalk.gray(msg)));
    } else {
      getStdioDisplay().info(chalk.blue(msg));
    }
  },

  /**
   * Display a formatted success message to the console
   * @param msg - The message to display
   */
  success: (msg: string) => {
    getStdioDisplay().log(chalk.green(msg));
  },

  /**
   * Display a formatted warning message to the console
   * @param msg - The message to display
   */
  warn: (msg: string) => {
    getStdioDisplay().warn(chalk.magenta(msg));
  },

  /**
   * Display a formatted error message to the console
   * @param msg - The message to display
   */
  error: (msg: string) => {
    getStdioDisplay().error(chalk.red(msg));
  },
} as const;

/**
 * Generate ASCII art text using figlet
 * @param text - The text to convert to ASCII art
 * @param font - The figlet font to use
 * @returns The ASCII art string
 */
function getAsciiArt(text: string, font: FigletFont = PREFERRED_FONT): string {
  return figlet.textSync(text, {
    font: font,
    horizontalLayout: "fitted",
    verticalLayout: "default",
  });
}

/**
 * Display the complete Toolprint brand banner with app name
 * This is the canonical function that shows both Toolprint branding and app-specific banner
 * @param appName - The name of the specific application (optional, defaults to APP_NAME)
 * @param useStderr - Whether to output to stderr instead of stdout
 */
export function displayBanner(appName: string = APP_NAME): void {
  // 2. Display the app-specific banner (light blue)
  displayAppBanner(appName);
  output.displaySpaceBuffer(1);
  output.displayLinkWithPrefix(
    "Built and supported by the devs @ ",
    "https://toolprint.ai"
  );
  output.displayLinkWithPrefix(
    "Check out more of our stuff at ",
    "https://github.com/toolprint"
  );

  // 3. Add separator and spacing
  output.displaySeparator(80);
  output.displaySpaceBuffer(1); // Extra newline for spacing
}

/**
 * Display just the app-specific banner (used by displayBanner)
 * @param appName - The name of the specific application
 */
function displayAppBanner(appName: string, maxLenNewLine: number = 10): void {
  // Handle app name - split into lines if too long, use same font as Toolprint
  if (appName.length > maxLenNewLine) {
    const words = appName.split(" ");
    for (const word of words) {
      const wordBanner = getAsciiArt(word, PREFERRED_FONT);
      output.log(chalk.blueBright.bold(wordBanner));
    }
  } else {
    const appNameBanner = getAsciiArt(appName, PREFERRED_FONT);
    output.log(chalk.blueBright.bold(appNameBanner));
  }
}

/**
 * Display a minimal banner for CLI help or quick starts
 * @param appName - The name of the specific application
 */
export function displayMinimalBanner(appName: string = APP_NAME): void {
  console.log(chalk.cyan.bold(`${BRAND_NAME} - ${appName}`));
  output.displaySeparator(40);
}

/**
 * Display server startup banner with additional info
 * @param appName - The name of the specific application
 * @param transport - The transport type being used
 * @param port - The port number (for HTTP transport)
 * @param host - The host address (for HTTP transport)
 */
export function displayServerRuntimeInfo(
  transport: string,
  port?: number,
  host?: string
): void {
  output.log(chalk.blue.bold("Server Configuration:"));
  output.log(chalk.white(`  Transport: ${chalk.yellow(transport)}`));

  if (transport === "http" && port && host) {
    output.log(
      chalk.white(`  Address:   ${chalk.yellow(`http://${host}:${port}`)}`)
    );
  }

  output.log(chalk.white(`  Version:   ${chalk.yellow(APP_CONFIG.version)}`));
  output.displaySpaceBuffer(1);
}
