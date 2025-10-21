/**
 * Prompt template for creating a new toolset with comprehensive workflow guidance
 */

import { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { PromptTemplate } from "./types.js";

export const newToolsetPrompt: PromptTemplate = {
  name: "new-toolset",
  title: "Create New Toolset",
  description:
    "Interactive workflow for creating a new toolset with guided best practices",
  arguments: [],
  handler: async (): Promise<GetPromptResult> => {
    return {
      description:
        "Comprehensive guide for creating a new toolset with best practices and validation",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are helping the user create a new toolset for HyperTool MCP. Follow this comprehensive workflow to ensure they create an effective, well-organized toolset.

# Creating a New Toolset - Guided Workflow

## Step 1: List Available Tools

First, discover what tools are available from the connected MCP servers:

**Action**: Use the \`list-available-tools\` tool to see all discovered tools.

**What to look for**:
- Tool names (these will be namespaced, e.g., "git__status", "docker__ps")
- Tool descriptions and capabilities
- Which MCP server each tool comes from
- Current availability status

**Important**: Make note of the exact tool names as you'll need them for the toolset.

---

## Step 2: Understand User Needs

Before suggesting tools, ask the user clarifying questions to understand their workflow:

**Questions to ask**:
- "What kind of work are you doing? (e.g., web development, data analysis, DevOps)"
- "What tasks do you perform most frequently?"
- "Are there specific technologies or platforms you work with?"
- "Do you have any existing toolsets or preferences?"

**Goal**: Understand the user's context to suggest the most relevant tools.

---

## Step 3: Check Existing Toolsets

Before creating a new toolset, check if something similar already exists:

**Action**: Use the \`list-saved-toolsets\` tool to see existing toolsets.

**Evaluate**:
- Does an existing toolset already serve this purpose?
- Could an existing toolset be modified instead of creating a new one?
- Are there overlapping toolsets that could be consolidated?

**Best Practice**: Reusing or modifying existing toolsets is often better than creating duplicates.

---

## Step 4: Suggest Tools Based on Needs

Based on the user's workflow and available tools, suggest a curated list:

**Tool Selection Guidelines**:

1. **Start Small**: Suggest 5-10 tools initially
2. **Focus on Essentials**: Include only tools they'll actually use
3. **Group Related Tools**: Keep tools that work together (e.g., git tools, docker tools)
4. **Consider Frequency**: Prioritize frequently-used tools
5. **Explain Choices**: Tell them why you're suggesting each tool

**Example**:
"For web development, I recommend:
- git__status, git__commit, git__push (version control)
- npm__install, npm__run (package management)
- code__format (code quality)"

---

## Step 5: Warn About Toolset Size

**CRITICAL**: Monitor the number of tools being added.

**Size Guidelines**:
- **Optimal**: 5-10 tools
- **Good**: 11-15 tools
- **Warning**: 16-20 tools (warn user about context overhead)
- **Too Large**: 21+ tools (strongly discourage, suggest splitting)

**If exceeding 15 tools**, say:
⚠️ "Warning: This toolset would have [N] tools, which may cause:
- Increased context window usage
- Slower tool selection
- Higher API costs
- Potential confusion about which tool to use

Consider:
- Splitting into multiple focused toolsets (e.g., 'dev-git' and 'dev-docker')
- Removing rarely-used tools
- Creating a smaller 'essential' version"

---

## Step 6: Validate Tool Availability

Before creating the toolset, verify all tools exist:

**Action**: Cross-reference suggested tools with the \`list-available-tools\` output.

**Check for**:
- Exact name matches (tools are case-sensitive and use specific namespacing)
- Tools that may have been disconnected or unavailable
- Typos in tool names

**If a tool is missing**: Suggest alternatives or ask user to add the MCP server providing that tool.

---

## Step 7: Suggest Toolset Name and Description

Help the user choose a good name and description:

**Naming Best Practices**:
- Use lowercase with hyphens (e.g., "web-dev-essentials")
- Keep it short but descriptive (2-4 words)
- Indicate the purpose or context
- Avoid generic names like "tools" or "my-toolset"

**Good Examples**:
- "full-stack-web"
- "data-analysis"
- "devops-kubernetes"
- "content-writing"

**Description Best Practices**:
- One sentence explaining when to use this toolset
- Mention key capabilities
- Note any specific project types

**Example**: "Essential tools for full-stack web development including git, npm, and docker management"

---

## Step 8: Build the Toolset

Only after completing all validation steps above, proceed to create:

**Action**: Use the \`build-toolset\` tool with:
- **toolsetName**: The validated name
- **toolList**: Array of exact tool names (from list-available-tools)
- **description**: The crafted description

**Example**:
\`\`\`json
{
  "toolsetName": "web-dev-essentials",
  "toolList": [
    "git__status",
    "git__commit",
    "git__push",
    "npm__install",
    "npm__run",
    "docker__ps",
    "docker__logs"
  ],
  "description": "Essential tools for full-stack web development with git, npm, and docker"
}
\`\`\`

---

## Step 9: Confirm and Equip

After successful creation:

1. **Confirm**: Tell the user the toolset was created successfully
2. **Show Contents**: List the tools that were included
3. **Suggest Next Step**: Ask if they want to equip it now using \`equip-toolset\`

---

## Common Patterns and Templates

Here are some common toolset patterns to suggest:

### Web Development
\`\`\`
Tools: git, npm, docker, code-formatting, linting
Size: 8-12 tools
Purpose: Full-stack web development workflow
\`\`\`

### Data Science
\`\`\`
Tools: python-repl, jupyter, pandas, matplotlib, database
Size: 6-10 tools
Purpose: Data analysis and visualization
\`\`\`

### DevOps
\`\`\`
Tools: kubernetes, docker, terraform, aws-cli, monitoring
Size: 8-15 tools
Purpose: Infrastructure and deployment management
\`\`\`

### Content Creation
\`\`\`
Tools: markdown, grammar-check, image-processing, file-management
Size: 5-8 tools
Purpose: Writing and content management
\`\`\`

---

## Important Reminders

- ✅ **Always check existing toolsets first**
- ✅ **Validate all tool names before creating**
- ✅ **Warn when toolsets exceed 15 tools**
- ✅ **Suggest descriptive names and clear descriptions**
- ✅ **Explain your tool selection choices**
- ✅ **Offer to equip the toolset after creation**
- ❌ **Never create duplicate toolsets**
- ❌ **Don't include tools the user won't actually use**
- ❌ **Don't use generic or unclear names**

---

## Handling Edge Cases

**If no tools are available**:
"I don't see any tools available from connected MCP servers. You may need to configure MCP servers first using the \`list-available-tools\` tool to verify connectivity."

**If user requests too many tools**:
"I notice you're requesting [N] tools. This is quite large. Let's split this into 2-3 focused toolsets:
1. [Primary toolset name] - [Core tools]
2. [Secondary toolset name] - [Secondary tools]
This will be more efficient and easier to manage."

**If user is unsure what they need**:
"Let's start with a small essential toolset (5-8 tools) for your most common tasks. You can always:
- Create additional specialized toolsets later
- Add more tools to this one
- Build on this foundation as you discover your needs"

---

**Remember**: The goal is to help users create effective, focused toolsets that enhance their workflow without overwhelming them with too many options. Quality over quantity!`,
          },
        },
      ],
    };
  },
};
