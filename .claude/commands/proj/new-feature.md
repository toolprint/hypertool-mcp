---
description: Create a new feature PRD for hypertool-mcp
argument-hint: [feature-name]
allowed-tools: Read, Write, Edit, Bash(git log*), Bash(git branch*), LS, Grep
---

# Create a New Feature PRD

## Purpose

Collaboratively author a Product Requirements Document (PRD) for a new feature in the hypertool-mcp project.

## Command Flow

### Step 1: Context Gathering

1. Read `@CLAUDE.md` to understand project development standards
2. Read `@README.md` to understand the project's purpose and architecture
3. Review existing PRDs in `@docs/features/` for reference

### Step 2: Initial Discussion

1. Ask the user to describe the feature they want to implement
2. Understand the problem being solved
3. Discuss high-level approach and goals

### Step 3: Clarification Questions

1. Based on the initial description, prepare clarifying questions about:
   - Specific behavior and edge cases
   - User experience considerations
   - Technical implementation details
   - Backwards compatibility concerns
   - Integration with existing features
   - Performance implications
   - Testing requirements
2. Ask these questions to ensure complete understanding before drafting

### Step 4: PRD Creation

1. Use `@docs/prd-template.md` as the base template
2. Fill in all sections with the gathered information:
   - Metadata (get commit hash with `git log -1 --format="%H"`)
   - Executive Summary
   - Problem Statement
   - Goals & Non-Goals
   - User Stories
   - Proposed Solution (including architecture diagrams if helpful)
   - Technical Design
   - Alternative Solutions Considered
   - Testing Requirements
   - Impact Analysis
   - Success Criteria
3. Save the PRD in the appropriate location:
   - Feature PRDs: `docs/features/prd-[feature-name].md`
   - Bug PRDs: `docs/bugs/[bug-name].md`
   - General PRDs: `docs/[prd-name].md`

### Step 5: Review & Refinement

1. Present the draft PRD to the user
2. Iterate based on feedback
3. Ensure all open questions are addressed
4. Update status to "Final Draft" when complete

## Best Practices

### For Effective PRD Creation

- **Be Specific**: Include concrete examples and clear requirements
- **Consider Edge Cases**: Think through unusual scenarios and error conditions
- **Architecture First**: Include diagrams to visualize component relationships
- **Backwards Compatibility**: Always consider impact on existing users
- **Testability**: Define clear success criteria and testing strategies

### For Clear Communication

- **Ask First, Draft Second**: Gather all information before creating the PRD
- **Iterative Refinement**: Don't hesitate to revise based on new insights
- **Visual Aids**: Use diagrams, flowcharts, and examples to clarify complex concepts
- **Concrete Examples**: Provide specific use cases and scenarios

## Example Usage

```
User: /proj:new-feature configuration-mode

Claude: I'll help you create a PRD for the configuration-mode feature. Let me first gather context about the project...

[Reads CLAUDE.md, README.md, and existing PRDs]

Now, let's discuss your feature. Can you describe what problem the configuration mode is trying to solve?

User: Currently all configuration tools are mixed with operational tools, making it confusing for AI assistants...

Claude: I understand. Let me ask some clarifying questions:
1. Should the mode persist across server restarts?
2. What happens when entering configuration mode - should it unequip the current toolset?
3. Should there be auto-exit triggers?
[... continues with clarification questions ...]

User: [Provides answers to questions]

Claude: Based on our discussion, I'll now create a comprehensive PRD for the configuration mode feature...

[Creates docs/features/prd-configuration-mode.md with full specifications]
```

## Command Integration

This command follows the flow we demonstrated in creating the configuration mode PRD:

1. Gather project context
2. Understand the feature requirements
3. Ask clarifying questions to resolve ambiguities
4. Create a comprehensive PRD with architecture diagrams
5. Save in the appropriate location under `docs/`

The command ensures consistent, thorough PRD creation for all new features in the hypertool-mcp project.
