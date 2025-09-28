# Hypertool Management UI - Single-Developer Dashboard PRD

**Created**: 2025-09-28
**Author**: claude-squad
**Reference Commit**: 27ff90f18109290383f7fa195a595f67d7e96ed1
**Branch**: work
**Related Tasks**: Linear issue (blocked: GraphQL request returned 403 using $LINEAR_API_KEY)
**Status**: Draft
**Priority**: P1 (High)

## Executive Summary

Hypertool MCP currently requires developers to inspect JSON files and run CLI tools to understand which downstream MCP servers are connected and which tools are exposed through a toolset. Those downstream servers only expose individual tools; Hypertool virtualizes those tools across servers to build curated toolsets that it re-exposes through Hypertool as MCP tools. This PRD proposes a standalone Vite + React management UI (using shadcn/ui) that surfaces the exact information already provided by Hypertool—server availability summaries, discovered tools, saved toolsets, personas, and configuration paths—and wraps configuration tools such as `list-saved-toolsets`, `list-available-tools`, `get-active-toolset`, and `equip-toolset` in an intuitive interface tailored to a single developer running Hypertool locally.

## Problem Statement

Hypertool MCP virtualizes tools from multiple MCP servers and lets developers curate toolsets, but day-to-day management still relies on:

- Manually editing `.mcp.json` or persona configs to see which servers are defined.
- Running CLI commands (`list-saved-toolsets`, `equip-toolset`, `persona list`, etc.) to discover available toolsets and tools.
- Watching terminal output to guess whether an underlying server is currently reachable.

This workflow is error-prone (JSON typos, forgetting tool names), slow (context switching between editor and CLI), and opaque (no quick overview of which toolset is active). A small, local-first dashboard focused on a single developer needs to present exactly the information the Hypertool server already knows without inventing new telemetry or multi-user controls.

## Goals & Non-Goals

### Goals
- Provide a read/write UI for the data Hypertool already exposes: server list, discovered tools, saved toolsets, active toolset, personas, and current configuration file paths.
- Make toolset creation and switching easier by layering search and multi-select UI over the existing configuration tools API surface.
- Visualize server availability using the existing counts in `get-active-toolset` and highlight `unavailableServers` without introducing speculative metrics.
- Document the precise shadcn/ui components that will be used for each screen to ensure the design can be implemented faithfully.

### Non-Goals
- Managing multiple end users, permissions, or audit logs (Hypertool is single-user local tooling).
- Displaying analytics that Hypertool does not calculate today (e.g., latency histograms, CPU usage).
- Replacing CLI-only operations that mutate state outside of existing MCP management tools.
- Building any additional HTTP façade or proxy endpoints; all interactions must use the existing MCP surfaces directly.

## User Stories

1. **As a developer using Hypertool locally**, I want to see every configured MCP server and whether it is currently connected so that I can troubleshoot missing tools quickly.
2. **As a developer**, I want to browse all discovered tools and assemble a new toolset using search and filters so that I do not have to craft JSON manually.
3. **As a developer**, I want to inspect which persona (if any) is active and review its bundled toolsets so that I understand which tools Hypertool is exposing when persona mode is on.
4. **As a developer**, I want a quick way to open the relevant configuration file in my editor from the UI so that edits stay in sync with what Hypertool is running.

## Proposed Solution

### Overview

Build a Vite + React single-page application that connects to the running Hypertool MCP server using the official Model Context Protocol (MCP) SDK, exactly as an MCP client would. The UI will surface:

- **Dashboard Overview**: Active toolset, equipped persona (if any), and server availability counts derived from `get-active-toolset` (`enabled`, `available`, `unavailable`, `disabled`) alongside quick actions that call `enter-configuration-mode` or trigger discovery refresh.
- **Servers View**: Table of servers derived from Hypertool configuration (using `list-available-tools` and `get-active-toolset` data) with status badges showing whether a server appears in `unavailableServers` and the tools each server provides (namespaced names like `git.status`).
- **Tool Catalog**: Searchable view of the discovery cache returned by `list-available-tools`, allowing filtering by server and text search of tool descriptions.
- **Toolsets Manager**: List of saved toolsets from `list-saved-toolsets`, indication of which delegate (regular vs persona) is active via `get-active-toolset`, and flows to equip/delete/build toolsets using the corresponding configuration tools.
- **Persona Inspector**: For persona mode, call persona management tools exposed through MCP (e.g., `list-personas`, `get-active-persona` when available) to show available personas, current activation state, and the toolsets bundled in each persona.
- **Configuration Inspector**: Show resolved configuration file paths (via `toolsetInfo.location` and persona metadata), call-to-action buttons that open files locally, and provide copy/download options for JSON payloads without editing them directly.

### UI Composition and Shadcn Components

The UI will exclusively use shadcn/ui primitives to guarantee consistency:

| Feature | shadcn/ui Components | Notes |
|---------|----------------------|-------|
| App shell (sidebar + header) | `NavigationMenu`, `ScrollArea`, `Separator`, `Button`, custom theme toggle composed from `Switch` + `DropdownMenu` | Sticky sidebar with scrollable content list. |
| Dashboard summary cards | `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Badge` for status chips, `Skeleton` for loading states | Cards show active toolset, persona, server counts. |
| Server status table | `Table`, `TableHeader`, `TableRow`, `TableCell`, `Badge` (success/destructive variants), `Tooltip` for availability explanation, `Button` with `DropdownMenu` for actions | Each row expands via a `Sheet` side panel. |
| Server detail panel | `Sheet`, `SheetHeader`, `SheetContent`, `Tabs` (Overview / Tools), `ScrollArea` for long tool lists, `<pre>` block styled with Tailwind inside `ScrollArea` for configuration snippet | Sheet triggered from server table row. |
| Tool catalog search | `Command` (command palette) embedded in `Popover`, `Input` for filters, `Checkbox` for multi-select, `Badge` to represent selected tools, `ScrollArea` for results | Allows selecting multiple tools at once. |
| Toolset list | `Card` with `Table`, `Badge` for delegate type (`persona` vs `regular`), `Button` actions, `DropdownMenu` for equip/delete | Highlights currently active toolset. |
| Toolset builder | `Dialog` with `DialogHeader`/`DialogContent`, stepper built using `Tabs` + `Progress`, `Command` multi-select for tools, `Select` for persona/servers, `Textarea` for description, `Alert` for validation errors | Finishes with JSON preview in a `ScrollArea`. |
| Persona inspector | `Accordion` per persona showing metadata, `Badge` for active marker, `Tabs` for Persona vs Toolsets content, `Button` to activate/deactivate persona | Data read-only except activation toggle. |
| Configuration inspector | `Card`, `Tabs` (Paths / Details), `<pre>` block within `ScrollArea`, `Button` with `DropdownMenu` for "Copy path" / "Open in editor" actions, `Alert` when configuration tools are hidden (detected by missing MCP capabilities) | Only surfaces existing config values. |
| Notifications | `Sonner` (shadcn toast integration) for success/error toasts, `AlertDialog` for destructive actions (delete toolset). |
| Loading & error handling | `Skeleton` placeholders, `Alert` components, `Empty` states built with `Card` and `Button` to retry | Keeps UI responsive. |

#### Component Composition Diagram

```mermaid
flowchart TD
    AppShell[App Shell
    (NavigationMenu, Sidebar, Header)] --> DashboardPage
    AppShell --> ServersPage
    AppShell --> ToolCatalogPage
    AppShell --> ToolsetsPage
    AppShell --> PersonaPage
    AppShell --> ConfigPage

    subgraph DashboardPage[Dashboard Overview]
        DashboardCards[Summary Cards
        (Card, Badge)]
        ServerStatusWidget[Server Status Widget
        (Table + Sheet)]
    end

    subgraph ServersPage[Servers View]
        ServerTable[Server Table
        (Table, Badge, Tooltip)] --> ServerSheet[Server Detail Sheet
        (Sheet, Tabs, ScrollArea)]
    end

    subgraph ToolCatalogPage[Tool Catalog]
        ToolCommandPalette[Tool Command Palette
        (Command, Popover, Input, Checkbox)]
        SelectedTools[Selected Tools Bar
        (Badge, Button)]
    end

    subgraph ToolsetsPage[Toolsets Manager]
        ToolsetList[Toolset List
        (Card, Table, DropdownMenu)] --> ToolsetActions[Toolset Actions
        (Button, AlertDialog)]
        ToolsetBuilder[Toolset Builder Dialog
        (Dialog, Tabs, Progress, Command)]
    end

    subgraph PersonaPage[Persona Inspector]
        PersonaAccordion[Persona Accordion
        (Accordion, Tabs, Badge, Button)]
    end

    subgraph ConfigPage[Configuration Inspector]
        ConfigCards[Configuration Cards
        (Card, Tabs, ScrollArea, Button)]
    end

    Notifications[Toast & Alerts
    (Sonner, Alert)] -->|Global Feedback| AppShell
    MCPClient[MCP Client Hooks
    (TanStack Query + SDK)] -->|Data| AppShell
    MCPClient --> DashboardPage
    MCPClient --> ServersPage
    MCPClient --> ToolCatalogPage
    MCPClient --> ToolsetsPage
    MCPClient --> PersonaPage
    MCPClient --> ConfigPage
```

### Technical Design

#### Architecture
- **Frontend**: Vite + React + TypeScript project colocated inside the repository at `src/management-ui` so it can import existing Hypertool utilities (e.g., shared zod schemas). Uses shadcn/ui and Tailwind CSS per project conventions.
- **State Management**: TanStack Query handles server state for management tools; Zustand stores local UI state (open sheets, filters, wizard progress).
- **MCP Client Integration**: The UI uses the official `@modelcontextprotocol/sdk` packages (web transport) to establish a client session with the running Hypertool MCP server. All management data is retrieved by calling the same MCP tools (e.g., `list-saved-toolsets`, `list-available-tools`, persona commands) that terminal-based agents invoke today. No bespoke HTTP endpoints are added.
- **Transport**: Use the MCP HTTP + SSE transport in browser mode (via `@modelcontextprotocol/sdk/http`), falling back to WebSocket transport if/when Hypertool exposes it. The client negotiates capabilities, subscribes to tool result streams, and listens for push notifications through MCP `notifications` events.
- **Security**: Reuse the existing MCP HTTP token (same header the CLI supplies). Token stored in `sessionStorage`; future enhancement will support in-browser auth prompts.

#### Data Flow
1. UI loads → initializes MCP client session and calls `get-active-toolset` plus `list-saved-toolsets` to infer whether configuration or persona delegates are in control. If personas are enabled, the client also checks `list-personas`/`get-active-persona` when exposed.
2. Parallel tool invocations gather tool discovery data via `list-available-tools`, active toolset details via `get-active-toolset` (including `serverStatus`, `toolSummary`, and `unavailableServers`), and persona metadata via `list-personas` (when available). Responses populate TanStack Query caches and drive derived views like server summaries (`summary.totalServers`) and tool counts.
3. When the user starts the "Build toolset" wizard, the UI invokes `list-available-tools` (filtered client-side) to provide selection options, then calls `build-toolset` followed by `equip-toolset` if the user chooses to activate immediately.
4. MCP notifications (e.g., `tools_changed`, persona activation events) are consumed through the SDK's event stream to invalidate relevant queries without polling. If a notification is unavailable for a capability, the UI schedules background refetches.

#### Code Locations
- **Primary Files**: `src/management-ui/app/(routes)`, `src/management-ui/components`, `src/management-ui/lib/mcp`.
- **New Files**: `src/management-ui/tailwind.config.ts`, `src/management-ui/vite.config.ts`, shadcn component directories (`src/management-ui/components/ui/*`).
- **Test Files**: React component tests using Vitest + Testing Library in `src/management-ui/__tests__`. MCP client layer tests using MSW (or custom SDK mocks) to emulate tool responses and notifications.

### Implementation Plan
1. **Phase 1 – Foundations**
   - Scaffold Vite + React app with Tailwind + shadcn/ui.
   - Implement app shell, dashboard summary cards, and read-only server list consuming mocked MCP responses.
   - Integrate MCP SDK session bootstrap (token prompt, connection status indicator) and replace mocks with live tool invocations.
2. **Phase 2 – Tool Catalog & Toolsets**
   - Build tool catalog search experience (Command + Popover + multi-select badges).
   - Implement toolset list, equip button, and active state indicator driven by MCP tool responses.
   - Create toolset builder dialog and invoke `build-toolset` / `equip-toolset` via the SDK.
3. **Phase 3 – Persona & Configuration Inspectors**
    - Add persona accordion with activate/deactivate actions backed by MCP persona tools.
    - Surface configuration inspector (paths, configuration file discovery, JSON preview) via configuration tools results.
    - Subscribe to MCP notifications for live updates (tool list changes, persona activation, server health).
4. **Phase 4 – Polish & Validation**
   - Accessibility pass (keyboard navigation, aria attributes on shadcn components).
   - Error states, skeleton loaders, offline handling, documentation updates.

## Alternative Solutions Considered

### Option 1: CLI-Only Enhancements
- **Description**: Improve existing CLI commands, add richer text output.
- **Pros**: No frontend build, lowest overhead.
- **Cons**: Still requires manual parsing, no visual overview, hard to multi-select tools.
- **Reason Not Chosen**: Does not solve usability pain points; PRD explicitly requests a UI.

### Option 2: Embed UI Inside Existing MCP Client (e.g., Claude Code)
- **Description**: Build client-specific panels instead of standalone web app.
- **Pros**: Immediate availability inside IDE/assistant.
- **Cons**: Tight coupling to specific clients, limited control over UI framework, harder to reuse.
- **Reason Not Chosen**: Requirement specifies a separately launched Vite + React service.

## Testing Requirements

### Unit Tests
- Components render correct shadcn primitives (e.g., `ServerTable` shows `Badge` color based on connection state derived from tool responses).
- MCP client hooks correctly interpret responses (e.g., converts delegate type to badge labels).

### Integration Tests
- Mock MCP tool invocations (via SDK test harness or MSW intercepting HTTP transport) to validate toolset builder flow end-to-end.
- Ensure MCP notification handling updates TanStack Query caches (tool list refreshes after `tools_changed`).

### Manual Testing
- Run Hypertool locally with sample config; verify dashboard reflects real server states.
- Build and equip toolset via UI and confirm CLI `list-saved-toolsets` shows updated state.

## Impact Analysis

### Breaking Changes
None. The management UI is an additional client that uses existing MCP tools without altering server behavior.

### Performance Impact
Minimal. Queries mirror existing CLI calls; streaming notifications delivered through the MCP transport avoid heavy polling. The UI only fetches data when open.

### Security Considerations
Keep the Hypertool MCP server bound to localhost by default. Require the same API token Hypertool already uses for HTTP connections and avoid persisting the token beyond `sessionStorage`.

### Compatibility
Works with both standard mode (regular toolsets) and persona mode by honoring `ConfigToolsManager` routing rules. UI hides create/delete toolset actions when persona is active, matching backend constraints.

## Success Criteria
1. Developer can identify disconnected servers within 5 seconds of opening the dashboard.
2. Creating and equipping a new toolset via the UI takes ≤3 clicks per tool (selection + confirm) with no manual JSON edits.
3. Persona activation status visible and toggleable from the UI with round-trip confirmation in ≤2 seconds.

## Rollout Plan

### Phase 1: Development
- Timeline: 4 weeks
- Resources: 1 frontend engineer, 1 backend engineer familiar with Hypertool internals.

### Phase 2: Testing
- Timeline: 1 week
- Resources: Same developers + manual verification by Hypertool maintainers.

### Phase 3: Deployment
- Timeline: 1 week
- Deployment strategy: Ship Docker image + npm script to start UI alongside Hypertool server.
- Rollback plan: Ship a feature flag that disables the UI bundle and fall back to CLI workflow.

## Documentation Updates

- [ ] Update `README.md` with instructions for launching the management UI and connecting via MCP token.
- [ ] Add screenshots of the UI to `docs/features/` once implemented.
- [ ] Mention UI setup in persona/configuration guides if necessary.
- [ ] Add changelog entry under "Added" for management UI availability.

## External Tracking

- Linear issue creation attempted via GraphQL API (2025-09-28 and retried with the `$LINEAR_API_KEY` secret) but continues to return HTTP 403; once the credential authenticates successfully, the implementation work will be tracked under the Toolprint project for visibility alongside other Hypertool initiatives.

## Open Questions

1. What MCP transport should the UI prefer by default (HTTP+SSE vs WebSocket) given browser constraints and Hypertool's current deployment story?
2. Are the `serverStatus` counts and `unavailableServers` list from `get-active-toolset` sufficient for expressing server availability, or do we need to request an additional MCP tool for per-server diagnostics?
3. How should the UI behave when configuration mode is disabled via `HYPERTOOL_ENABLE_CONFIG_TOOLS_MENU`—should we prompt the user to enable it for full functionality?

## References

- `src/CLAUDE.md` – Hypertool operational modes and toolset workflow overview.
- `src/server/tools/CLAUDE.md` – ConfigToolsManager delegate routing rules for toolsets and personas.
- `src/connection/README.md` – Connection health monitoring and server discovery architecture.

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-09-28 | claude-squad | Replaced over-scoped PRD with single-developer UI plan grounded in existing Hypertool capabilities |
