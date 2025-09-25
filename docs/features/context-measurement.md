# Context Measurement Feature PRD

## Metadata

- **Title**: Context Measurement for MCP Tools
- **Created**: 2025-09-19
- **Status**: Draft
- **Priority**: P2
- **Reference Commit**: cdfc953
- **Current Branch**: main
- **Author**: Claude

## Overview

Add context measurement capabilities to existing config tools (`list-available-tools` and `get-active-toolset`) to quantify the token overhead of MCP tools exposed to LLMs. This feature helps developers understand and optimize the context window usage of their toolsets.

## Problem Statement

When MCP tools are exposed to LLMs, each tool consumes part of the model's context window. Currently, there's no visibility into:
- How much context each tool consumes
- Which tools are the most "expensive" in terms of tokens
- The total context overhead of a toolset
- The potential maximum context if all tools were exposed

This lack of visibility makes it difficult to optimize toolsets for efficient context usage.

## Requirements

### Functional Requirements

#### 1. Token Calculation

**What counts as context for MCP tools:**
- **Tool name**: The namespacedName field (e.g., "git.git_status")
- **Description**: The complete description string
- **Parameter schema**: The full JSON Schema definition including:
  - Parameter names
  - Type definitions
  - Description fields
  - Required/optional status
  - Enum values
  - Pattern constraints
  - Nested object properties
  - Array item schemas
  - All other schema properties

**Token counting strategy (UPDATED):**
- **Approach**: Fast BPE-based approximation using word-length heuristics
- **Rationale**:
  - Different LLMs use different tokenizers (GPT uses tiktoken, Claude uses its own)
  - We don't know which LLM will consume the tools at runtime
  - Installing model-specific tokenizers adds unnecessary dependencies
  - For comparing relative tool sizes, estimates are sufficient
- **Algorithm**:
  - Short words (1-3 chars): 1 token (common words like "the", "is")
  - Medium words (4-7 chars): ~1-2 tokens based on length
  - Long words (8+ chars): Multiple tokens (length/4)
  - Based on how BPE tokenization typically splits words
- **Accuracy**: Estimates for comparison, not exact counts
- **Documentation**: Clear notes that these are estimates, not exact token counts

#### 2. Context Schema

Define a standard schema for context information:

```typescript
interface ContextInfo {
  tokens: number;           // Total token count for this item
  percentTotal: number | null;  // Percentage of total context (null if not applicable)
}
```

#### 3. Integration with `get-active-toolset`

Enhance the response to include:

```typescript
interface GetActiveToolsetResponse {
  // ... existing fields ...

  meta: {
    context: ContextInfo;  // Total context for the active toolset
    // ... other meta fields ...
  };

  tools: Array<{
    // ... existing tool fields ...
    context: ContextInfo;  // Context for this specific tool
  }>;
}
```

#### 4. Integration with `list-available-tools`

Enhance the response to include:

```typescript
interface ListAvailableToolsResponse {
  // ... existing fields ...

  meta: {
    totalPossibleContext: ContextInfo;  // Context if ALL tools were exposed
    // ... other meta fields ...
  };

  toolsByServer: Array<{
    // ... existing server fields ...
    context: ContextInfo;  // Context for all tools in this server
    tools: Array<{
      // ... existing tool fields ...
      context: ContextInfo;  // Context for this specific tool
    }>;
  }>;
}
```

### Non-Functional Requirements

1. **Performance**: Token calculation should not significantly impact response time (<10ms overhead with caching)
2. **Accuracy**: Token estimates should provide consistent relative comparisons between tools
3. **Caching**: Token counts should be cached per tool and invalidated only on tool definition changes
4. **Simplicity**: No external dependencies for tokenization - pure TypeScript implementation

## Technical Implementation

### Components

1. **TokenCounter Module** (`src/server/tools/utils/token-counter.ts`)
   - Fast BPE-based approximation using word-length heuristics
   - Memory-based caching for performance
   - Clear documentation about estimation approach
   - No external dependencies

2. **Integration Points**
   - ToolsetManager: Enhanced `getActiveToolset()` method
   - Enhanced `formatAvailableTools()` method
   - Minimal changes to existing code structure

### Token Calculation Algorithm

```typescript
// BPE-based approximation using word patterns
function approximateTokens(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0);

  let totalTokens = 0;
  for (const word of words) {
    if (word.length <= 3) {
      totalTokens += 1;  // Short common words = 1 token
    } else if (word.length <= 7) {
      totalTokens += Math.ceil(word.length / 5);  // Medium words
    } else {
      totalTokens += Math.ceil(word.length / 4);  // Long words split more
    }
  }

  return totalTokens;
}

// Tool token calculation
function calculateToolTokens(tool: Tool): number {
  const components = [
    tool.namespacedName,
    tool.description,
    JSON.stringify(tool.inputSchema)  // Compact JSON schema
  ];

  const text = components.join(' ');
  return approximateTokens(text);
}
```

### Caching Strategy

- Cache token counts at the tool level using tool.refId as key
- Cache invalidation on:
  - Tool definition updates
  - Tokenizer strategy changes
- Cache stored in memory with optional persistence

## User Experience

### Example Response for `get-active-toolset`

```json
{
  "name": "claude-dev",
  "meta": {
    "context": {
      "tokens": 15234,
      "percentTotal": null
    }
  },
  "tools": [
    {
      "namespacedName": "git.git_status",
      "description": "Shows the working tree status",
      "context": {
        "tokens": 145,
        "percentTotal": 0.0095
      }
    },
    {
      "namespacedName": "task-master.update_task",
      "description": "Updates a single task by ID...",
      "context": {
        "tokens": 892,
        "percentTotal": 0.0586
      }
    }
  ]
}
```

### Example Response for `list-available-tools`

```json
{
  "meta": {
    "totalPossibleContext": {
      "tokens": 48392,
      "percentTotal": null
    }
  },
  "toolsByServer": [
    {
      "serverName": "git",
      "context": {
        "tokens": 3421,
        "percentTotal": 0.0707
      },
      "tools": [...]
    }
  ]
}
```

## Testing Requirements

1. **Unit Tests**
   - Token calculation accuracy for various tool schemas
   - Percentage calculations
   - Cache behavior

2. **Integration Tests**
   - Verify context info appears in API responses
   - Test with different toolset configurations
   - Performance benchmarks

3. **Test Cases**
   - Tools with simple parameters
   - Tools with complex nested schemas
   - Tools with large descriptions
   - Empty toolsets
   - Maximum toolsets (all tools)

## Success Criteria

1. Users can see the estimated token cost of their active toolset
2. Users can identify which tools use more context relative to others
3. Token estimates are consistent and useful for comparison
4. Minimal performance impact (<10ms with caching)
5. Clear documentation that these are estimates, not exact counts
6. Context information helps users make informed decisions about toolset composition

## Future Enhancements

1. **Recommendations Engine**: Suggest tool removal/alternatives based on usage patterns
2. **Context Budgets**: Set limits and warnings for toolset context usage
3. **Historical Tracking**: Track context usage over time
4. **Model-Specific Counts**: Different token counts for different LLM models
5. **Compression Strategies**: Suggest description simplifications to reduce tokens

## Dependencies

- Tokenizer library (tiktoken or equivalent)
- Existing config tools implementation
- Tool definition schema

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tokenizer differences between models | Token counts may be inaccurate | Support multiple tokenizers, document which is used |
| Performance impact of token counting | Slow API responses | Implement caching, use approximation for large schemas |
| Complex schemas hard to accurately measure | Underestimated token counts | Thorough testing with real-world schemas |

## Implementation Notes

- This feature enhances existing tools rather than creating new ones
- The context schema is designed to be consistent and reusable
- Percentages are calculated relative to the total context of the current scope
- The implementation should be defensive against missing or malformed schemas

## Revision History

- **2025-09-19**: Initial draft created
