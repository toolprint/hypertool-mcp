/**
 * Console color theme for HyperTool
 * Optimized for visibility on dark terminal backgrounds
 */

import chalk from "chalk";

/**
 * Color theme optimized for dark backgrounds
 * Avoids low-contrast colors like dim blue on black
 */
export const theme = {
  // Primary colors
  primary: chalk.cyan, // Bright cyan instead of blue for better visibility
  secondary: chalk.magenta, // Magenta for secondary elements
  success: chalk.green, // Green for success messages
  warning: chalk.yellow, // Yellow for warnings
  error: chalk.red, // Red for errors

  // Text variations
  heading: chalk.bold.cyan, // Bold cyan for headers
  subheading: chalk.bold.white, // Bold white for subheadings
  label: chalk.white, // Plain white for labels
  value: chalk.green, // Green for values

  // Informational text
  info: chalk.cyan, // Cyan instead of blue for info
  muted: chalk.gray, // Gray instead of dim for less important text
  subtle: chalk.hex("#999999"), // Light gray for subtle text (better than dim)

  // Interactive elements
  link: chalk.underline.cyan, // Underlined cyan for links
  command: chalk.bold.yellow, // Bold yellow for commands
  code: chalk.green, // Green for code snippets

  // Special formatting
  emphasis: chalk.bold, // Bold for emphasis
  strong: chalk.bold.white, // Bold white for strong text
  dimmed: chalk.hex("#666666"), // Medium gray instead of dim

  // Background colors (use sparingly)
  bgPrimary: chalk.bgCyan, // Cyan background
  bgSuccess: chalk.bgGreen, // Green background
  bgWarning: chalk.bgYellow, // Yellow background
  bgError: chalk.bgRed, // Red background

  // Compound styles
  errorText: chalk.bold.red,
  warningText: chalk.bold.yellow,
  successText: chalk.bold.green,
  infoText: chalk.cyan,

  // ASCII art and decorative
  banner: chalk.bold.cyan, // Bold cyan for banners
  decoration: chalk.gray, // Gray for decorative elements
  separator: chalk.gray, // Gray for separators
};

/**
 * Semantic theme mappings for consistent usage
 */
export const semantic = {
  // Status indicators
  statusOk: theme.success,
  statusWarning: theme.warning,
  statusError: theme.error,
  statusInfo: theme.info,

  // UI elements
  title: theme.heading,
  subtitle: theme.subheading,
  description: theme.muted,

  // Data display
  fieldName: theme.label,
  fieldValue: theme.value,

  // Actions
  actionPrimary: theme.primary,
  actionSecondary: theme.secondary,
  actionDanger: theme.error,

  // Messages
  messageError: theme.errorText,
  messageWarning: theme.warningText,
  messageSuccess: theme.successText,
  messageInfo: theme.infoText,
};

/**
 * Helper function to test color visibility
 * Useful for development/debugging
 */
export function testTheme(): void {
  console.log("\n🎨 HyperTool Color Theme Test\n");

  console.log(theme.heading("Heading Text"));
  console.log(theme.subheading("Subheading Text"));
  console.log(theme.info("Information Text"));
  console.log(theme.muted("Muted Text"));
  console.log(theme.subtle("Subtle Text"));
  console.log(theme.dimmed("Dimmed Text"));

  console.log("\nStatus Messages:");
  console.log(semantic.statusOk("✓ Success"));
  console.log(semantic.statusWarning("⚠ Warning"));
  console.log(semantic.statusError("✗ Error"));
  console.log(semantic.statusInfo("ℹ Information"));

  console.log("\nLinks and Commands:");
  console.log(theme.link("https://example.com"));
  console.log(theme.command("npm install"));
  console.log(theme.code('const foo = "bar"'));

  console.log("\nCombined Styles:");
  console.log(theme.label("Server:"), theme.value("localhost:3000"));
  console.log(theme.label("Status:"), semantic.statusOk("Running"));

  console.log();
}
