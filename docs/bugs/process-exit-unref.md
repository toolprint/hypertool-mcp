# Bug Fix: CLI Commands Not Exiting Due to Background Timers

## Issue

CLI commands like `hypertool persona list` would complete successfully but the process would not exit, requiring manual termination (Ctrl+C).

## Root Cause

Background `setInterval` timers in three components were keeping the Node.js event loop active:

1. **PersonaDiscovery**: 2-minute cache cleanup interval
2. **PersonaCache**: 30-second TTL cleanup + 60-second metrics update intervals
3. **ToolDiscoveryEngine**: Configurable refresh interval (default 30 seconds)

In Node.js, active timers prevent process exit even when all other work is complete.

## Solution

Added `unref()` to all background intervals. This tells Node.js: "Don't count these timers when deciding whether to keep the process alive."

**Key insight**: `unref()` doesn't stop the timers - they continue running normally. It only affects process exit behavior.

## Safety Analysis

This fix is safe because:

- **CLI Mode**: No active I/O handles after command completion → process can exit cleanly with unref'd timers
- **Server Mode**: Active I/O handles (stdin listeners, HTTP servers) keep process alive regardless of timer unref status
- **Timer Functionality**: Background tasks (cache cleanup, metrics) continue working normally in both modes

## Implementation

See comments in code referencing this documentation:

- `src/persona/discovery.ts` - Cache cleanup interval
- `src/persona/cache.ts` - TTL cleanup and metrics intervals
- `src/discovery/service.ts` - Tool discovery refresh interval
