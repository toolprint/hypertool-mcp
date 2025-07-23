# hypertool-mcp Development Instructions

## For Agents Working on This Project

You are working on **hypertool-mcp**: a TypeScript MCP proxy server that routes requests between clients and multiple underlying MCP servers.

### 📋 Essential Reading
**READ FIRST**: `.taskmaster/docs/prd.txt` - Contains complete project requirements, architecture, and technical specifications.

### 🎯 High-Level Goal
Build a single MCP server that:
1. Connects to multiple underlying MCP servers as a client
2. Discovers available tools from those servers
3. Exposes a configurable subset of those tools to its own clients
4. Routes tool calls transparently to the correct underlying server

**Simple Example**: If server A has tools (foo, bar) and server B has tools (bam, bee), this proxy can expose just (foo, bam) and route calls accordingly.

### 🏗️ Agent Instructions

#### Creating PRDs (Product Requirement Documents)

When creating new PRDs for features, bugs, or improvements:
1. **Use the PRD Template**: Copy `docs/prd-template.md` as your starting point
2. **Fill in Metadata**: Always populate the metadata section at the top:
   - Use `git log -1 --format="%H"` to get the reference commit
   - Use `git branch --show-current` to get the current branch
   - Set appropriate priority (P0-P3) based on impact
3. **Save PRDs in Correct Location**:
   - Bug PRDs: `docs/bugs/[bug-name].md`
   - Feature PRDs: `docs/features/[feature-name].md`  
   - General PRDs: `docs/[prd-name].md`
4. **Keep PRDs Updated**: Update status and revision history as work progresses

#### Before Starting Any Task:

**Step 1: Get Your Task Assignment**
- If `TASK_ID` environment variable is set, use that task ID
- If not set, you need to claim an available task using this process:

1. **Find Available Tasks**: Use `mcp__task-master__get_tasks --status pending` to see unassigned tasks
2. **Claim a Task**: Look for tasks whose details DON'T contain "Assigned to claude-squad" 
3. **Mark Assignment**: Use `mcp__task-master__update_task --id <task-id> --append true --prompt "Assigned to claude-squad session-<unique-id>"`
4. **Set In Progress**: Use `mcp__task-master__set_task_status --id <task-id> --status in-progress`

**Step 2: Get Full Context**
1. **Read the Main PRD**: Check `.taskmaster/docs/prd.txt` for complete project context
2. **Get Task Details**: Use `mcp__task-master__get_task --id <your-task-id>` to see your specific requirements
3. **Find Task-Specific PRD**: Look in both locations for PRDs related to your task:
   - **Primary location**: `docs/` directory (bugs, features, etc.)
   - **Legacy location**: `.taskmaster/docs/` directory
   - **Task 29**: `prd.cursor.txt` - Cursor IDE integration
   - **Task 30**: `prd.bin.txt` - NPM publishing workflow
   - **Task 31**: `prd.claude-code.txt` - Claude Code integration
   - **Task 32**: `prd.claude-desktop.txt` - Claude Desktop integration
   - **Bug PRDs**: `docs/bugs/` - Bug fix specifications
   - **Feature PRDs**: `docs/features/` - New feature specifications
4. **Review Dependencies**: Understand which tasks must complete before yours
5. **Study Reference**: Look at https://github.com/toolprint/cco-mcp for TypeScript MCP patterns

#### Development Standards:
- **Language**: TypeScript only with full type safety
- **Transports**: Support both stdio and HTTP/SSE
- **Testing**: Write tests for your components using Jest
- **Error Handling**: Graceful failures with clear messages
- **Logging**: Use structured logging for debugging
- **Dependencies**: Use npm/yarn for package management
- **Code Quality**: Follow ESLint/Prettier standards from justfile

#### Key Patterns to Follow:
- Study cco-mcp repository for MCP server best practices
- Use proper TypeScript interfaces for all MCP protocol types
- Implement connection pooling for multiple server connections
- Cache tool definitions but handle real-time updates
- Route requests without modifying their structure

#### Project Structure:
Create your code in logical directories under `src/`:
- `src/server/` - Core MCP server implementation
- `src/config/` - Configuration parsing and validation  
- `src/connection/` - Connection management and pooling
- `src/discovery/` - Tool discovery and caching
- `src/router/` - Request routing logic
- `src/types/` - TypeScript type definitions
- `src/scripts/` - Setup scripts for integration (Cursor, Claude Code, Claude Desktop)


#### When You're Done:
1. **Test Your Implementation**: 
   - Run ALL tests (`npm test` or `just test`) and verify they pass
   - Ensure tests specifically related to your changes are passing
   - If you added new functionality, write tests for it and verify they pass
   - If you modified existing functionality, ensure existing tests still pass
2. **Run Code Quality**: Use `just lint` and `just format` to ensure code standards
3. **Merge Latest Changes**: Before finalizing, merge the latest changes from your base branch to avoid conflicts:
   ```bash
   # Find your base branch (usually integration, cs-setup, or main)
   git log --oneline --graph | head -10  # Look for where your branch diverged
   git merge <base-branch-name>  # e.g., git merge integration
   
   # IMPORTANT: All branches are LOCAL only - never pull from origin
   # Your base branch is always a local branch, not a remote one
   ```
4. **Commit Your Work**: Create clear commit messages describing your implementation
5. **Mark Task Complete**: Use `mcp__task-master__set_task_status --id <your-task-id> --status completed`
6. **Document Integration**: Update task with merge notes using `mcp__task-master__update_task --id <your-task-id> --append --prompt "Work completed in local branch [branch-name]. Merged latest changes from [base-branch]. Ready for local merge. Integration notes: [any important details]"`
7. **Keep Work Local**: Do NOT push branches to remote - all work stays in local worktrees for manual integration

#### Example Task Assignment Workflow:
```
# Check if task assigned via environment
if TASK_ID is set:
  - Use that task ID
else:
  - Call mcp__task-master__get_tasks --status pending
  - Find first task where details doesn't contain "Assigned to claude-squad"
  - Call mcp__task-master__update_task --id X --append --prompt "Assigned to claude-squad session-$(date +%s)"
  - Call mcp__task-master__set_task_status --id X --status in-progress
  
# Then proceed with development work
```

### 🔗 Quick References
- **Main PRD**: `.taskmaster/docs/prd.txt` - Complete project requirements
- **PRD Template**: `docs/prd-template.md` - Template for new PRDs
- **Bug PRDs**: `docs/bugs/` - Bug fix specifications
- **Feature PRDs**: `docs/features/` - New feature specifications
- **Task-Specific PRDs**: `.taskmaster/docs/` - Legacy task-specific PRDs
- **Tasks**: Use Task Master MCP tools to view your specific task
- **Reference**: https://github.com/toolprint/cco-mcp - TypeScript MCP patterns
- **Example Config**: `.mcp.json` - Shows target server types to support
- **Build Tools**: `justfile` - Available commands for build/test/lint
- **Integration**: Work stays in local worktrees, merges into current feature branch

### ⚠️ Important Reminders
- **NO remote pushing** - keep all work local until manual integration
- **NO pulling from origin** - all branches (main, integration, etc.) are LOCAL only
- **Follow dependencies** - check which tasks must complete before yours
- **Test thoroughly** - your component will be integrated with others
- **Document integration points** - help future tasks understand your interfaces
- **Local-only workflow** - never use `git pull`, `git fetch`, or push to remote