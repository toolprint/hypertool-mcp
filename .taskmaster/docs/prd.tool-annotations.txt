PRODUCT REQUIREMENTS DOCUMENT: TOOL ANNOTATIONS
==============================================

Version: 1.0
Date: 2025-01-21
Status: Draft

## Executive Summary

This PRD outlines the implementation of a tool annotation system for hypertool-mcp that allows users to attach contextual notes to tools within their toolsets. These annotations provide LLMs with additional guidance, best practices, and usage instructions specific to the user's workflow, improving tool execution accuracy and effectiveness.

## Problem Statement

Currently, when LLMs use tools from MCP servers, they only have access to the tool's basic description provided by the server. This lacks:
- User-specific context about how the tool should be used in their environment
- Best practices learned from experience
- Warnings about common pitfalls
- Integration patterns with other tools
- Project-specific requirements

This leads to suboptimal tool usage and requires users to repeatedly provide the same context in their prompts.

## Solution Overview

Implement a tool annotation system that:
1. Allows users to attach persistent notes to tools within their toolsets
2. Automatically includes these annotations when tools are exposed to LLMs
3. Preserves annotations across toolset loading/unloading
4. Formats annotations in an LLM-friendly way for optimal comprehension

## Detailed Requirements

### 1. Data Model

#### 1.1 Type Definitions (Already Implemented)
```typescript
interface ToolsetToolNote {
  name: string;  // Annotation identifier (e.g., "usage-with-project")
  note: string;  // The actual annotation content
}

interface ToolsetToolNotes {
  toolRef: DynamicToolReference;  // Reference to the tool
  notes: ToolsetToolNote[];       // Array of annotations
}

interface ToolsetConfig {
  // ... existing fields ...
  toolNotes?: ToolsetToolNotes[];  // Optional annotations array
}
```

#### 1.2 Storage Requirements
- Annotations are stored as part of the toolset configuration
- Each tool can have multiple annotations (array of notes)
- Annotations are additive only (no modification/deletion in v1)
- Annotations persist in the toolset's JSON configuration
- Annotations are specific to a tool within a particular toolset

### 2. New Tool: add-tool-annotation

#### 2.1 Tool Definition
```typescript
{
  name: "add-tool-annotation",
  description: "Add contextual annotations to a tool in the current toolset to guide LLM usage",
  inputSchema: {
    type: "object",
    properties: {
      toolRef: {
        type: "object",
        description: "Reference to the tool (use namespacedName or refId)",
        properties: {
          namespacedName: {
            type: "string",
            description: "Tool reference by namespaced name (e.g., 'linear.create_issue')"
          },
          refId: {
            type: "string",
            description: "Tool reference by unique hash identifier"
          }
        }
      },
      notes: {
        type: "array",
        description: "Array of annotations to add to the tool",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Identifier for this annotation (e.g., 'usage-with-project')",
              pattern: "^[a-z0-9-]+$"
            },
            note: {
              type: "string",
              description: "The annotation content to help guide LLM usage"
            }
          },
          required: ["name", "note"]
        },
        minItems: 1
      }
    },
    required: ["toolRef", "notes"]
  }
}
```

#### 2.2 Tool Behavior
1. Validates that a toolset is currently equipped
2. Resolves the tool reference using the discovery engine (same as toolset resolution)
3. Validates that the tool exists in the current toolset
4. For each note in the input:
   - Checks if a note with the same name already exists for this tool (additive, not replace)
   - Adds new notes to the tool's annotation array
5. Persists the updated toolset configuration
6. Returns success confirmation with details of added annotations

#### 2.3 Error Handling
- Error if no toolset is equipped
- Error if tool reference cannot be resolved
- Error if resolved tool is not in the current toolset
- Warning if annotation name already exists (skip that annotation)
- Validation of annotation name format (lowercase, numbers, hyphens)

### 3. Annotation Hydration

#### 3.1 Implementation in ToolsetManager
The `_hydrateToolNotes` method should:
1. Look up any notes for the current tool using its reference
2. Format annotations into an LLM-readable section
3. Append this section to the tool's description

#### 3.2 Annotation Format
Annotations should be appended to tool descriptions in this format:
```
[Original tool description]

### Additional Tool Notes

• **[annotation-name-1]**: [annotation text 1]
• **[annotation-name-2]**: [annotation text 2]
```

Example:
```
Creates a new issue in Linear

### Additional Tool Notes

• **usage-with-project**: Always load linear projects using the linear_search_projects tool and reflect with the user on which team to add an issue to
• **priority-handling**: For urgent issues, always set priority to 1 (Urgent) and add the 'urgent' label
```

### 4. Integration Points

#### 4.1 Tool Discovery Flow
1. ToolsetManager.getMcpTools() calls _getToolFromDiscoveredTool()
2. Then calls _hydrateToolNotes() to add annotations
3. Returns the enhanced tool definition to MCP clients

#### 4.2 Toolset Operations
- **equip-toolset**: Loads annotations with the toolset
- **build-toolset**: Creates new toolset without annotations (can be added later)
- **add-tool-annotation**: Adds annotations to equipped toolset

### 5. Implementation Notes

#### 5.1 Annotation Lookup Algorithm
```typescript
_hydrateToolNotes(tool: Tool): Tool {
  if (!this.currentToolset?.toolNotes) {
    return tool;
  }

  // Find the original discovered tool to get its reference
  const discoveredTool = this.findDiscoveredToolByFlattenedName(tool.name);
  if (!discoveredTool) {
    return tool;
  }

  // Look for notes matching this tool by checking both namespacedName and refId
  const toolNotesEntry = this.currentToolset.toolNotes.find(entry => {
    // Match by namespacedName if provided
    if (entry.toolRef.namespacedName && 
        entry.toolRef.namespacedName === discoveredTool.namespacedName) {
      return true;
    }
    // Match by refId if provided
    if (entry.toolRef.refId && 
        entry.toolRef.refId === discoveredTool.toolHash) {
      return true;
    }
    return false;
  });

  if (!toolNotesEntry || toolNotesEntry.notes.length === 0) {
    return tool;
  }

  // Format and append notes
  const notesSection = this.formatNotesForLLM(toolNotesEntry.notes);
  tool.description = tool.description 
    ? `${tool.description}\n\n${notesSection}`
    : notesSection;

  return tool;
}
```

#### 5.2 Notes Formatting
```typescript
formatNotesForLLM(notes: ToolsetToolNote[]): string {
  const formattedNotes = notes
    .map(note => `• **${note.name}**: ${note.note}`)
    .join('\n');
  
  return `### Additional Tool Notes\n\n${formattedNotes}`;
}
```

#### 5.3 Finding Discovered Tool Helper
```typescript
findDiscoveredToolByFlattenedName(flattenedName: string): DiscoveredTool | null {
  const activeTools = this.getActiveDiscoveredTools();
  
  for (const tool of activeTools) {
    if (this.flattenToolName(tool.namespacedName) === flattenedName) {
      return tool;
    }
  }
  
  return null;
}
```

### 6. Technical Considerations

1. **Performance**: Annotation lookup is O(n) where n is number of annotated tools
2. **Storage**: Annotations stored in toolset JSON, typical size <2KB per annotated tool
3. **Compatibility**: Optional field ensures backward compatibility
4. **Validation**: Annotation names must be validated but duplicates are skipped (additive)
5. **Resolution**: Tool references must be resolved before adding annotations

### 7. Example Usage Scenario

```typescript
// User workflow
1. Equip a toolset with Linear tools
2. Call add-tool-annotation:
   {
     "toolRef": {
       "namespacedName": "linear.create_issue"
     },
     "notes": [
       {
         "name": "team-selection",
         "note": "Always ask user to confirm the team before creating. Our main teams are: Engineering (id: eng-123), Design (id: des-456), Product (id: prod-789)"
       },
       {
         "name": "label-convention",
         "note": "Apply labels based on issue type: bug → 'bug' label, feature → 'enhancement' label"
       }
     ]
   }

3. LLM sees enhanced tool description:
   "Creates a new issue in Linear
   
   ### Additional Tool Notes
   
   • **team-selection**: Always ask user to confirm the team before creating. Our main teams are: Engineering (id: eng-123), Design (id: des-456), Product (id: prod-789)
   • **label-convention**: Apply labels based on issue type: bug → 'bug' label, feature → 'enhancement' label"

4. LLM now has context-specific guidance for using the tool
```

### 8. Implementation Priority

1. ✅ Type definitions (complete)
2. 🔲 add-tool-annotation tool implementation
3. 🔲 _hydrateToolNotes method implementation
4. 🔲 formatNotesForLLM helper method
5. 🔲 findDiscoveredToolByFlattenedName helper
6. 🔲 Integration testing
7. 🔲 Documentation updates

## Acceptance Criteria

1. Users can add multiple annotations to any tool in their equipped toolset
2. Annotations persist across toolset equip/unequip cycles
3. Annotations appear in tool descriptions seen by LLMs in markdown format
4. Multiple annotations can be added in a single call
5. Annotations are additive (existing annotations are not replaced)
6. Tool references are properly resolved before adding annotations
7. System maintains backward compatibility with existing toolsets

## Dependencies

- Existing toolset management system
- Tool discovery and resolution mechanisms
- Preference storage system
- MCP tool execution framework

## Limitations (v1)

1. No annotation modification or deletion
2. No export/import of annotations
3. Annotations lost if tool's schema fundamentally changes (can't be resolved)
4. No global annotations (each toolset has its own)
5. No annotation templates or categories

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Annotation accumulation | Too many annotations clutter description | Future: annotation management tools |
| Tool resolution failure | Annotations lost if tool changes | Document limitation clearly |
| Performance impact | Slow tool loading with many annotations | Efficient lookup, limit annotation count |
| LLM context overflow | Too much text in descriptions | Reasonable length limits per annotation |

## Appendix: Implementation Checklist

- [ ] Implement add-tool-annotation tool in server/tools/
- [ ] Add tool to BUILTIN_TOOLS array
- [ ] Update tool schemas for new input format
- [ ] Implement _hydrateToolNotes in ToolsetManager
- [ ] Implement formatNotesForLLM helper
- [ ] Implement findDiscoveredToolByFlattenedName helper
- [ ] Update toolset persistence to handle annotations
- [ ] Add validation for annotation names and content
- [ ] Handle additive behavior (skip existing annotation names)
- [ ] Write unit tests for annotation functionality
- [ ] Test tool reference resolution
- [ ] Test with real MCP servers and LLMs
- [ ] Verify markdown formatting appears correctly
- [ ] Update documentation with examples