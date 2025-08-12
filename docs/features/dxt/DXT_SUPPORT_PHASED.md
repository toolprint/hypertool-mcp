# DXT Extension Support - Phased Implementation Plan

## Overview

This document outlines a phased approach to implementing DXT (Dynamic eXtension Template) support in hypertool-mcp, based on architectural review feedback that identified significant over-engineering in the original design.

**Key Principle**: Start with the absolute minimum to prove the concept works, then expand based on validated needs and learnings.

## Phase 0: Proof of Concept (THIS PHASE ONLY)
**Timeline**: 3-5 days maximum  
**Code Target**: <200 lines total  
**Goal**: Prove DXT files can be loaded and integrated

### 🎯 Success Criteria
- [ ] Load a single DXT file from local filesystem
- [ ] Extract ZIP and parse basic manifest.json
- [ ] Spawn Node.js process with stdio transport
- [ ] Connect DXT server through existing hypertool-mcp proxy
- [ ] Access at least one tool from DXT server via proxy
- [ ] Document learnings and pain points

### ✅ What's Included
- **ZIP Extraction**: Basic unzip to temp directory
- **Manifest Parsing**: Simple JSON parsing for name, version, main
- **Process Spawning**: Direct `child_process.spawn()` for Node.js only
- **Config Integration**: Extend existing config parser to support DXT type
- **Connection**: Reuse existing StdioClient infrastructure

### ❌ What's Explicitly Excluded
- Templates, variables, or parameter substitution
- Security, sandboxing, or permissions
- Python/binary runtime support
- Registry integration or remote packages
- Health monitoring or process management
- Resource limits or timeouts
- Package validation beyond basic schema
- Error recovery or graceful shutdown
- Performance optimization
- Comprehensive testing

### 📁 Code Structure
```
src/
├── config/
│   └── dxt-config.ts           # ~30 lines: Minimal config schema
├── dxt/
│   ├── loader.ts               # ~50 lines: ZIP extraction + manifest
│   └── manifest.ts             # ~20 lines: Basic types
└── connection/
    └── dxt-client.ts           # ~30 lines: Process spawn wrapper
```

### 🔧 Configuration Schema (Prototype)
```json
{
  "mcpServers": {
    "my-dxt-tool": {
      "type": "dxt",
      "path": "./extensions/my-tool.dxt"
    }
  }
}
```

### 📄 Manifest Schema (Prototype)
```json
{
  "name": "my-extension",
  "version": "1.0.0", 
  "main": "server.js"
}
```

### 🏗️ Implementation Approach
1. Extract ZIP to `os.tmpdir()/hypertool-dxt-{random}`
2. Parse `manifest.json` with basic validation
3. Spawn `node ${main}` in extracted directory
4. Connect stdio streams to existing StdioClient
5. Register as server type in existing factory

### 📝 Example Usage
```typescript
// Entire implementation concept:
async function loadDxt(path: string): Promise<StdioClient> {
  const extractDir = await extractZip(path)
  const manifest = await parseManifest(extractDir)
  const child = spawn('node', [manifest.main], {
    cwd: extractDir,
    stdio: 'pipe'
  })
  return new StdioClient(child.stdin, child.stdout)
}
```

### 🧪 Testing Strategy
- **Manual Testing**: Create 2-3 example DXT files
- **Integration**: Verify tools appear in proxy tool list
- **Basic Smoke Test**: One automated test for happy path
- **No performance, stress, or edge case testing**

---

## Phase 1: Basic Features (FUTURE - NOT NOW)
**Timeline**: 1-2 weeks  
**Prerequisites**: Phase 0 validates concept and shows value

### 🎯 Goals
- Make prototype more reliable for regular use
- Add minimal error handling
- Support basic configuration

### ✅ What's Added
- Basic error handling and logging
- Environment variable support in DXT processes
- Graceful process shutdown
- Simple manifest validation
- Support for 3-5 common DXT use cases

### ❌ Still Excluded
- Templates or complex configuration
- Multiple runtimes
- Security features
- Registry support

---

## Phase 2: Enhanced Integration (FUTURE - NOT NOW)
**Timeline**: 2-3 weeks  
**Prerequisites**: Phase 1 demonstrates regular usage patterns

### 🎯 Goals
- Support broader range of extensions
- Add convenience features based on learnings

### ✅ What's Added
- Template variable support (if proven necessary)
- Python runtime support
- Binary executable support
- Better process lifecycle management
- Configuration validation and helpful errors

### ❌ Still Excluded
- Security and sandboxing
- Registry or remote packages
- Performance optimizations

---

## Phase 3+: Production Features (FUTURE VISION)
**Timeline**: 4-6 weeks  
**Prerequisites**: Phases 1-2 show significant adoption and need

### 🎯 Goals
- Production-ready implementation
- Security and robustness
- Full feature set from original design

### ✅ What's Added
- Security model and sandboxing
- Package signing and validation
- Registry support and remote packages
- Resource limits and monitoring
- Performance optimizations
- Comprehensive testing suite
- Documentation and examples

---

## Critical Implementation Notes

### 🚨 Phase 0 Constraints
- **NO abstraction layers** - direct implementation only
- **NO forward compatibility** - code can be thrown away
- **NO production features** - focus purely on concept validation
- **Single Node.js runtime** - no multi-runtime complexity
- **Local files only** - no network, registry, or remote concerns
- **Trust everything** - no security, validation, or sandboxing

### 🎯 Phase 0 Decision Criteria
For any feature question, ask: "Is this necessary to prove DXT files can be loaded?"
- If NO → exclude completely
- If YES → implement the absolute minimum

### 📏 Success Metrics for Phase 0
1. **Technical**: Can load and use a DXT file end-to-end
2. **Usability**: Configuration is simpler than alternative approaches
3. **Learning**: Clear understanding of real requirements vs assumptions
4. **Timeline**: Completed in 3-5 days, not weeks

### 🔄 Phase Advancement Criteria
- **Phase 0 → Phase 1**: Concept validated, users want to use it regularly
- **Phase 1 → Phase 2**: Clear use cases for additional runtimes/features
- **Phase 2 → Phase 3**: Production deployment needs or security requirements

### 📋 Phase 0 Deliverables
1. Working code that loads DXT files (<200 lines)
2. 2-3 example DXT files for testing
3. Basic documentation (setup + usage)
4. Lessons learned document for future phases

### ⚠️ Anti-Patterns to Avoid
- Building abstractions "for future flexibility"
- Implementing features "just in case"
- Adding error handling for scenarios that haven't occurred
- Optimizing before understanding real usage patterns
- Planning for scale before proving core value

---

## Conclusion

**Phase 0 is the ONLY phase being implemented now.** All other phases are future possibilities that depend on:
1. Phase 0 proving the concept has value
2. Real user feedback identifying actual needs
3. Clear understanding of performance, security, and scale requirements

The original comprehensive design is preserved as a vision document for eventual production implementation, but the immediate focus is solely on answering: "Can we load and use DXT files through hypertool-mcp's configuration system?"

**Success means**: A developer can create a simple Node.js MCP server, package it as a .dxt file, reference it in config, and use its tools through the proxy - all within a single afternoon of work.