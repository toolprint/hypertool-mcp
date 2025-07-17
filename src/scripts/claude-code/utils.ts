/**
 * Utility functions for Claude Code integration
 */


/**
 * Command template data structure
 */
interface CommandTemplate {
  name: string;
  description: string;
  toolName: string;
  usage: string;
  parameters: string;
  examples: string;
  useCases: string;
  tips: string;
  relatedCommands: string;
}

/**
 * Generate command templates for all MCP tools
 */
export async function createCommandTemplates(): Promise<Record<string, string>> {
  const commandTemplates: Record<string, string> = {};
  
  // Template for list-available-tools.md
  commandTemplates['list-available-tools.md'] = generateCommandFile({
    name: 'List Available Tools',
    description: 'Discover all tools from connected MCP servers via HyperTool proxy',
    toolName: 'list-available-tools',
    usage: 'Use the list-available-tools tool from the HyperTool MCP server to see all discovered tools',
    parameters: 'None required - this command shows all available tools from connected servers.',
    examples: `Use the list-available-tools tool to see all tools discovered from your configured MCP servers.

This will show you:
- Tool names (namespaced with server names)
- Descriptions of what each tool does
- Server sources
- Current availability status`,
    useCases: `- Before creating a new toolset, see what tools are available
- Troubleshooting tool discovery issues
- Understanding which servers are connected and working`,
    tips: `- Run this command after adding new MCP servers to your configuration
- Use the output to select tools for new toolsets
- Tools are namespaced (e.g., "git.status") to avoid conflicts`,
    relatedCommands: `- Use /build-toolset to create toolsets with discovered tools
- Use /equip-toolset to activate toolsets with these tools`
  });

  // Template for build-toolset.md
  commandTemplates['build-toolset.md'] = generateCommandFile({
    name: 'Build Toolset',
    description: 'Creates new toolset with selected tools from available MCP servers via HyperTool',
    toolName: 'build-toolset',
    usage: 'Use the build-toolset tool from the HyperTool MCP server with toolset name and tool selections',
    parameters: `- toolsetName: Name for the new toolset (required)
- toolList: Array of tool names to include (use namespaced names from list-available-tools)
- description: Optional description for the toolset`,
    examples: `Use the build-toolset tool with parameters:
{
  "toolsetName": "development",
  "toolList": ["git.status", "git.commit", "docker.list_containers"],
  "description": "Essential development tools"
}

This will create a new toolset called "development" with the specified tools.`,
    useCases: `- Create project-specific toolsets for different workflows
- Group related tools together for easier management
- Build specialized toolsets for different team members or contexts`,
    tips: `- Use descriptive names for your toolsets
- Include only the tools you actually need to reduce complexity
- Run list-available-tools first to see what tools are available`,
    relatedCommands: `- Use /list-available-tools to see available tools before building
- Use /equip-toolset to activate your new toolset
- Use /list-saved-toolsets to see all your created toolsets`
  });

  // Template for equip-toolset.md
  commandTemplates['equip-toolset.md'] = generateCommandFile({
    name: 'Equip Toolset',
    description: 'Switches to a different toolset via HyperTool, making its tools available for use',
    toolName: 'equip-toolset',
    usage: 'Use the equip-toolset tool from the HyperTool MCP server with the name of the toolset to activate',
    parameters: `- toolsetName: Name of the toolset to activate (required)`,
    examples: `Use the equip-toolset tool with parameters:
{
  "toolsetName": "development"
}

This will activate the "development" toolset and make its tools available.`,
    useCases: `- Switch between different tool configurations for different projects
- Activate specialized toolsets for specific workflows
- Change context quickly without reconfiguring tools manually`,
    tips: `- Only one toolset can be active at a time
- Equipping a new toolset will replace the currently active one
- Use get-active-toolset to see what's currently equipped`,
    relatedCommands: `- Use /list-saved-toolsets to see available toolsets
- Use /get-active-toolset to see what's currently active
- Use /build-toolset to create new toolsets`
  });

  // Template for list-saved-toolsets.md
  commandTemplates['list-saved-toolsets.md'] = generateCommandFile({
    name: 'List Saved Toolsets',
    description: 'Shows all existing toolsets with their tool counts, descriptions, and metadata via HyperTool',
    toolName: 'list-saved-toolsets',
    usage: 'Use the list-saved-toolsets tool from the HyperTool MCP server to see all your saved toolsets',
    parameters: 'None required - this command shows all saved toolsets.',
    examples: `Use the list-saved-toolsets tool to see all your saved toolsets including:
- Toolset names and descriptions
- Number of tools in each toolset
- Creation dates and last modified times
- Current active status`,
    useCases: `- Review all available toolsets before choosing one to equip
- Manage and organize your toolset collection
- See toolset metadata and usage statistics`,
    tips: `- Use this command to get an overview of your toolset organization
- Look for toolsets with similar tools that could be consolidated
- Check creation dates to identify outdated toolsets`,
    relatedCommands: `- Use /equip-toolset to activate any of the listed toolsets
- Use /build-toolset to create new toolsets
- Use /get-active-toolset to see detailed info about the active toolset`
  });

  // Template for get-active-toolset.md
  commandTemplates['get-active-toolset.md'] = generateCommandFile({
    name: 'Get Active Toolset',
    description: 'Shows currently active toolset with detailed information about its tools and configuration via HyperTool',
    toolName: 'get-active-toolset',
    usage: 'Use the get-active-toolset tool from the HyperTool MCP server to see details about the current toolset',
    parameters: 'None required - this command shows the currently active toolset.',
    examples: `Use the get-active-toolset tool to see detailed information about the currently active toolset:
- Toolset name and description
- Complete list of active tools
- Server sources for each tool
- Tool descriptions and capabilities`,
    useCases: `- Verify which toolset is currently active
- See detailed information about available tools in the active toolset
- Debug toolset configuration issues
- Understand tool capabilities and sources`,
    tips: `- Run this command if you're unsure what tools are available
- Use the output to understand tool namespacing and server sources
- Check this before using specific tools to verify they're available`,
    relatedCommands: `- Use /equip-toolset to change the active toolset
- Use /list-saved-toolsets to see other available toolsets
- Use /list-available-tools to see all discoverable tools`
  });

  return commandTemplates;
}

/**
 * Generate a command file from template data with proper YAML frontmatter
 */
function generateCommandFile(template: CommandTemplate): string {
  return `---
allowed-tools:
  - ${template.toolName}
description: ${template.description}
---

# ${template.name}

${template.description}

## Usage
${template.usage}

## Parameters
${template.parameters}

## Examples
${template.examples}

## Common Use Cases
${template.useCases}

## Tips
${template.tips}

## Related Commands
${template.relatedCommands}
`;
}