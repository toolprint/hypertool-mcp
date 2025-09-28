# Tool Alias Support for Standard Toolsets

**Created**: 2025-02-14
**Author**: ChatGPT-5 (autonomous session)
**Reference Commit**: 015aa596b576983009fafe562cb3987cb8f03306
**Branch**: work
**Related Tasks**: TBD
**Status**: Draft
**Priority**: P1 (High)

## Executive Summary

Users of the standard tool system can currently equip tools only under the names exposed by their source MCP servers. This limits their ability to design human-friendly workflows, reduce tool name collisions, and maintain consistency across environments. We propose adding alias support to toolsets so that the standard configuration pipeline—rooted in the `build-toolset` configuration tool—can resolve user-defined aliases to the canonical tool definitions supplied by MCP servers. This will reduce friction for multi-server setups and enable more intuitive command vocabularies without modifying downstream servers.

## Problem Statement

### What is broken or missing
- Toolsets today accept the server-provided tool name verbatim and expose it directly to LLM agents.
- There is no built-in mechanism to define a custom name or shorthand for an existing tool.

### Who is affected
- Hypertool users configuring standard toolsets in the manager UI or JSON definitions.
- Developers integrating multiple MCP servers with overlapping tool namespaces.
- LLM agents that must reason about verbose or conflicting tool names.

### Why it needs to be fixed
- Without aliases, administrators cannot tailor tool names to their workflow jargon or shorten verbose server names.
- Tool name collisions between servers (e.g., multiple `search` tools) make selection ambiguous.
- LLM prompts must include the original names, reducing accuracy when users expect friendlier handles.

### Current vs expected behavior
- **Current**: Toolsets only expose canonical tool identifiers. Any name collision must be resolved by editing upstream servers or avoiding a tool.
- **Expected**: Toolset authors can assign alias names per toolset. When an alias is invoked, the manager resolves it to the original tool reference without modifying server metadata.

## Goals & Non-Goals

### Goals
- Allow standard toolset configurations to declare alias names for tools they include.
- Ensure aliases are respected uniformly across tool discovery, invocation, and reflection logs.
- Provide users with validation and conflict detection for alias declarations.
- Surface alias information to LLMs so prompt planners understand both the alias and canonical name.

### Non-Goals
- No changes to the persona system (handled separately).
- No dynamic alias editing via conversation in this phase; configuration-driven only.
- No guarantee that third-party MCP servers adopt alias awareness; resolution stays within Hypertool manager.

## User Stories

1. **As a toolset administrator**, I want to assign a short alias (`git_status`) to a verbose MCP tool name so that LLMs can invoke it succinctly.
2. **As an LLM operator**, I want to differentiate between two `search` tools from different servers by aliasing them `web_search` and `docs_search`, preventing accidental misuse.
3. **As a developer**, I want validation errors if I define the same alias twice or collide with an existing canonical name.

## Proposed Solution

### Overview
Extend the standard toolset configuration schema and manager logic to support alias metadata for each included tool. During toolset hydration, the manager will map alias names to canonical tool references, ensuring invocation requests using either name resolve correctly. Discovery responses will include both the alias and canonical name to aid LLM selection. Because the standard system does not expose a separate CLI for editing stored toolsets, alias assignment will be available exclusively through the existing `build-toolset` configuration tool flow.

### Architecture & Component Impact

The changes touch the configuration tool pipeline described in `src/server/tools/CLAUDE.md` and `src/server/tools/config-tools/CLAUDE.md`, which route all standard toolset management through `ConfigToolsManager` and `ToolsetManager`. Key components and functions requiring updates are:

- **Config Tools surface** (`src/server/tools/config-tools/tools/build-toolset.ts`)
  - Extend the JSON schema accepted by the `build-toolset` tool to allow an optional `alias` field per `DynamicToolReference` entry.
  - Ensure handler passes alias metadata through to `ToolsetManager.buildToolset`.
- **ToolsetManager** (`src/server/tools/toolset/manager.ts`)
  - `buildToolset(...)`: Persist alias metadata alongside canonical references, validate naming and collision rules, and emit descriptive errors when aliases conflict with canonical names or each other.
  - `getMcpTools()` / `_getToolFromDiscoveredTool(...)`: Include alias data when shaping MCP tool descriptors so LLM-facing prompts contain both alias and canonical names.
  - `getOriginalToolName(...)`: Resolve from alias → canonical tool reference before delegating to the request router.
  - Internal helpers such as `validateToolReferences(...)` and `generateToolsetInfo(...)`: surface alias context in structured responses, telemetry, and saved toolset metadata.
- **EnhancedServer request routing** (`src/server/enhanced.ts`)
  - Calls to `toolsetManager.getOriginalToolName(name)` must consider alias mappings to ensure invocation goes to the correct downstream server even when the alias is supplied.
- **Preference Store Serialization** (`src/server/config/preferenceStore.ts` and related loaders/validators)
  - Update serialization/deserialization to persist alias strings, ensuring round-trip through disk works without data loss.
- **Schema Definitions** (`src/server/tools/toolset/types.ts`, `validator.ts`, and `src/server/tools/schemas.ts`)
  - Introduce `alias?: string` on stored tool references and expand validation to enforce casing, length, and uniqueness constraints.

#### Process Flow Diagram

```mermaid
flowchart LR
    subgraph ConfigTools
      BT[build-toolset tool]
      CTM[ConfigToolsManager]
    end
    subgraph ToolsetRuntime
      TM[ToolsetManager]
      PS[Preference Store]
    end
    subgraph Execution
      ES[EnhancedServer]
      RR[RequestRouter]
      DS[Downstream MCP Server]
    end

    BT -->|alias + canonical refs| CTM -->|delegate| TM
    TM -->|validate & persist| PS
    ES -->|tool discovery| TM
    ES -->|tool call (alias)| TM
    TM -->|canonical name| ES --> RR --> DS
    TM -->|alias + canonical metadata| ES
```

This flow highlights that alias assignment enters the system exclusively through the `build-toolset` call and is resolved by `ToolsetManager` before routing to downstream servers.

### Technical Design

#### Schema Updates
- Update `ToolsetToolConfig` (and the runtime `DynamicToolReference` type in `src/server/tools/toolset/types.ts`) to optionally include an `alias` field (`string`, lowercase, snake_case enforced).
- Persist alias metadata when writing toolsets to the preference store (`saveStoredToolsets`) and when reloading them via `loadToolsetConfig` so aliases survive restart cycles.
- Expand the `build-toolset` tool's input schema to accept `alias` alongside `namespacedName`/`refId`, noting that alias assignment happens only inside this configuration tool flow.

#### Toolset Manager Enhancements
- When equipping or loading a toolset, build an in-memory alias registry keyed by alias name storing `{ alias, canonicalName, serverId, refId }` for O(1) lookup inside `getOriginalToolName` and related routing helpers.
- Validate aliases inside `buildToolset` and any load path:
  - Reject duplicates within the same toolset and raise actionable `meta.error` messages back through the `build-toolset` response payload.
  - Reject aliases equal to an existing canonical name unless they map to that exact tool, preventing accidental shadowing of different tools.
  - Enforce naming conventions via the validator (`^[a-z0-9_:-]{2,64}$`, final pattern to be agreed) and reuse validation in both CLI-driven and config-file load paths.
- Modify tool discovery output (`getMcpTools` + `_hydrateToolNotes`) to include alias metadata. Recommended approach: append alias detail to tool description and extend structured payloads (e.g., `ToolInfoResponse`) with an `alias` field so LLM prompts and logs highlight the mapping.
- Update invocation routing so that when a call references an alias, the manager translates it to the underlying tool reference before dispatching to the MCP transport, ensuring parity for alias and canonical names.

#### Config Tools & LLM Exposure
- Update tool descriptors passed to LLMs to annotate alias usage, e.g., `Alias: web_search (maps to linear.search)` in the prompt context emitted by `ToolsetManager.getMcpTools`.
- Ensure transcripts/logs capture both alias and canonical name to aid debugging.
- Extend `list-saved-toolsets`, `equip-toolset`, and `get-active-toolset` responses to surface alias metadata so users can verify configurations via configuration mode.

#### API / CLI Touchpoints
- The only supported alias entry point is the `build-toolset` tool invoked through configuration mode (either manually or via automation). Update in-product documentation and help text to describe the new `alias` argument.
- If we later expose helper commands in scripts or UI, they must internally call `build-toolset` with the alias metadata to stay consistent with the single source of truth.
- JSON schema validation (if exposed) must document the new field with examples.

### Code Locations
- **Primary Files**:
  - `src/server/tools/toolset/manager.ts` (alias registry, routing, metadata exposure)
  - `src/server/tools/toolset/types.ts` and `validator.ts` (schema updates)
  - `src/server/tools/config-tools/tools/build-toolset.ts` (input schema and handler passthrough)
  - `src/server/tools/schemas.ts` (JSON schema surfaced to clients)
  - `src/server/enhanced.ts` (request routing via alias-aware lookup)
  - `src/server/config/preferenceStore.ts` (persisting alias data)
- **Support Files**: Update toolset loader/persistence helpers and any developer documentation describing toolset JSON structure.
- **New Files**: Optional migration helper for existing stored toolsets (`scripts/migrations/add-alias-defaults.ts`) if we need to backfill alias fields safely.
- **Test Files**: Extend existing suites under `src/server/tools/toolset/*.test.ts` and add focused alias tests for configuration tools and enhanced server routing.

### Implementation Plan
1. **Phase 1**: Update schemas, TypeScript interfaces, and validation utilities to accept the alias field. Add unit tests covering validation rules and preference store serialization.
2. **Phase 2**: Extend toolset manager resolution logic and discovery responses to include alias metadata. Update LLM prompt formatting and ensure `EnhancedServer` routing logic resolves aliases.
3. **Phase 3**: Update configuration tools (input schema, help text), write integration tests for end-to-end alias invocation, and migrate existing toolsets (no-op if alias omitted).

## Alternative Solutions Considered

### Option 1: Server-Side Aliases
- **Description**: Require MCP servers to expose configurable alias metadata.
- **Pros**: Centralizes alias logic at the source.
- **Cons**: Requires coordination with each server; breaks for third-party servers lacking support.
- **Reason Not Chosen**: Hypertool needs client-side flexibility without waiting for server adoption.

### Option 2: Prompt-Time Alias Mapping Only
- **Description**: Only modify LLM prompts to suggest alias usage without changing invocation routing.
- **Pros**: Minimal engineering effort.
- **Cons**: Does not solve invocation routing; LLM invocations would still use canonical names.
- **Reason Not Chosen**: Fails to remove ambiguity or allow actual alias-based commands.

## Testing Requirements

### Unit Tests
- Extend `src/server/tools/toolset/validator.test.ts` with alias-specific validation cases (valid formats, duplicates, canonical conflicts).
- Add `manager.aliases.test.ts` (new) covering alias registry construction, `getOriginalToolName` lookups, and `getMcpTools` metadata exposure.
- Update `src/server/tools/config-tools/tools/build-toolset.test.ts` (create if missing) to ensure handler forwards alias arguments and surfaces validation errors from the manager.

### Integration Tests
- Extend `src/server/enhanced.test.ts` (or add `enhanced.aliases.test.ts`) to simulate an alias-based tool call and ensure routing to the correct downstream server.
- Update shell-based test scripts in `src/test-utils/` (e.g., extend `test-config-tools.sh`) to build a toolset with aliases via the `build-toolset` tool and verify the alias appears in `list-saved-toolsets`.
- Add regression coverage ensuring reloading stored toolsets with aliases rehydrates alias metadata correctly (persist → restart → equip → call).

### Manual Testing
- Configure a sample toolset via configuration mode using the `build-toolset` tool, supplying aliases for multiple tools. Verify alias usage in prompts and logs during a simulated LLM session.
- Attempt to assign invalid aliases (uppercase characters, duplicates, collision with canonical names) and observe descriptive `build-toolset` failure responses.
- Restart the server, re-enter configuration mode, and confirm `list-saved-toolsets` surfaces alias metadata, proving persistence.

## Impact Analysis

### Breaking Changes
None. Toolsets without aliases continue to operate unchanged.

### Performance Impact
Minimal. Alias lookup adds an in-memory map lookup per invocation, negligible relative to MCP calls.

### Security Considerations
- Ensure alias validation prevents injection of malicious text into prompts or logs.
- Audit logging should capture canonical tool identifiers for traceability even when aliases are used.

### Compatibility
- Backward compatible with existing toolset configurations (alias field optional).
- Forward compatible for future UI enhancements showing multiple aliases per tool.

## Success Criteria

1. Users can define an alias in a toolset configuration (via `build-toolset`) and invoke the tool via the alias in a live session.
2. Tool discovery outputs display alias information alongside canonical names.
3. Validation prevents duplicate or conflicting alias names within a toolset and communicates errors through the configuration tool response payloads.

## Rollout Plan

### Phase 1: Development
- Timeline: 2 weeks
- Resources: 1 engineer familiar with toolset manager and CLI components.

### Phase 2: Testing
- Timeline: 1 week
- Resources: QA engineer plus developer for integration validation.

### Phase 3: Deployment
- Timeline: 1 week
- Deployment strategy: Standard release train with feature flag toggle if necessary.
- Rollback plan: Disable alias resolution code path via configuration flag; existing canonical names remain functional.

## Documentation Updates

- [ ] Update README
- [ ] Update API documentation
- [ ] Update user guides (toolset configuration section)
- [ ] Update developer documentation (schema reference)
- [ ] Update CHANGELOG

## Open Questions

1. Should we allow multiple aliases per tool in the initial release?
2. How should aliases appear in telemetry dashboards and analytics?

## References

- Existing toolset manager code documentation.
- MCP specification for tool naming conventions.

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-02-14 | ChatGPT-5 | Initial draft |
