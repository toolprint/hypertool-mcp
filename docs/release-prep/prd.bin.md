# PRD: NPM Package Publishing and Distribution for HyperTool MCP

## Overview
Implement comprehensive npm package publishing workflow for HyperTool MCP under the @toolprint organization scope, including automated build processes, version management, and distribution strategies.

## Goals
- Publish HyperTool MCP as a scoped npm package under @toolprint organization
- Enable global installation and npx execution
- Implement automated build and publish workflows
- Provide debug/beta publishing capabilities
- Ensure package discoverability and proper metadata

## User Stories

### Story 1: Global Installation
**As a developer**, I want to install HyperTool MCP globally so that I can use it from anywhere on my system.

**Acceptance Criteria:**
- Package available as `@toolprint/hypertool-mcp` on npm registry
- `npm install -g @toolprint/hypertool-mcp` works correctly
- `hypertool-mcp --help` command available after global installation
- Package includes all necessary dependencies and assets

### Story 2: NPX Execution
**As a developer**, I want to run HyperTool MCP using npx without installing it globally so that I can try it quickly or use it in CI/CD pipelines.

**Acceptance Criteria:**
- `npx @toolprint/hypertool-mcp --help` works without prior installation
- All CLI features available through npx execution
- Package downloads and runs quickly via npx
- Proper error handling for missing dependencies

### Story 3: Developer Publishing
**As a maintainer**, I want automated build and publish commands so that I can release new versions efficiently and safely.

**Acceptance Criteria:**
- `just publish` command builds and publishes stable releases
- `just publish-beta` command publishes beta versions
- `just publish-dry` command tests publishing without actually publishing
- All commands include proper validation and safety checks

## Technical Specifications

### Package Configuration

**Package Name:** `@toolprint/hypertool-mcp`

**Package.json Updates:**
```json
{
  "name": "@toolprint/hypertool-mcp",
  "version": "0.1.0",
  "description": "HyperTool MCP proxy server for routing requests between clients and multiple underlying MCP servers",
  "main": "dist/index.js",
  "bin": {
    "hypertool-mcp": "dist/index.js"
  },
  "keywords": [
    "mcp",
    "model-context-protocol", 
    "ai-tools",
    "toolset",
    "proxy",
    "claude",
    "cursor",
    "ai-assistant"
  ],
  "author": "OneGrep, Inc.",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/toolprint/hypertool-mcp"
  },
  "homepage": "https://github.com/toolprint/hypertool-mcp#readme",
  "bugs": {
    "url": "https://github.com/toolprint/hypertool-mcp/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "engines": {
    "node": ">=16.0.0"
  },
  "files": [
    "dist/**/*",
    "README.md",
    "LICENSE"
  ]
}
```

### Build Process

**TypeScript Compilation:**
- Source code in `src/` directory
- Compiled output in `dist/` directory
- Proper module resolution and type definitions
- ES module support with proper package.json configuration

**Build Validation:**
- TypeScript compilation without errors
- All tests passing
- Linting and formatting checks
- Bundle size optimization

### Publishing Workflow

**Justfile Commands:**

```justfile
# Build project
build:
    npm run build

# Run all pre-publish checks
pre-publish-checks: build
    npm run test
    npm run lint
    npm run typecheck

# Build and publish to npm (stable release)
publish: pre-publish-checks
    npm publish --access public

# Build and publish debug/beta version
publish-beta: pre-publish-checks
    npm version prerelease --preid=beta
    npm publish --access public --tag beta

# Build and publish dry-run (test without actually publishing)
publish-dry: pre-publish-checks
    npm publish --dry-run --access public

# Test local installation
test-install: build
    npm pack
    npm install -g ./toolprint-hypertool-mcp-*.tgz
    hypertool-mcp --version
    npm uninstall -g @toolprint/hypertool-mcp
```

### Version Management

**Semantic Versioning:**
- Major: Breaking changes to CLI or MCP protocol
- Minor: New features, new CLI commands
- Patch: Bug fixes, documentation updates

**Beta Releases:**
- Pre-release versions for testing
- Tagged with `beta` npm tag
- Automatic version increment with beta suffix

**Release Process:**
1. Run `just publish-dry` to test
2. Run `just publish-beta` for beta release
3. Test beta version thoroughly
4. Run `just publish` for stable release

## Implementation Requirements

### Package Structure
- Ensure `dist/` directory contains all compiled assets including `dist/scripts/`
- Include only necessary files in published package
- Proper shebang line in main executable
- Correct file permissions for executable
- Setup scripts in `src/scripts/` compiled to `dist/scripts/` for npx execution

### Dependency Management
- All runtime dependencies in `dependencies`
- All build/dev dependencies in `devDependencies`
- Minimize bundle size by avoiding unnecessary dependencies
- Use peer dependencies where appropriate

### Executable Configuration
- Proper `bin` field configuration
- Executable file has correct shebang: `#!/usr/bin/env node`
- File permissions set correctly (755)
- Works with both global install and npx

### Testing and Validation
- Local installation testing
- NPX execution testing
- Cross-platform compatibility (macOS, Linux, Windows)
- Version reporting and help text validation

## Security Considerations

### Package Security
- No sensitive information in published package
- Proper .npmignore to exclude development files
- Secure dependency versions
- Regular security audits with `npm audit`

### Publishing Security
- Use npm 2FA for publishing
- Verify package contents before publishing
- Use dry-run testing before actual publishing
- Maintain audit trail of published versions

## Quality Assurance

### Pre-Publish Checks
- TypeScript compilation successful
- All tests passing
- Linting and formatting compliance
- Bundle size within acceptable limits
- Documentation up to date

### Post-Publish Validation
- Package installs correctly via npm
- NPX execution works as expected
- All CLI features functional
- Help text and version reporting accurate

## Documentation Requirements

### README Updates
- Installation instructions for global and npx usage
- Usage examples with proper package name
- Badge updates to reflect published package
- Troubleshooting section for installation issues

### Package Documentation
- Comprehensive package.json metadata
- Clear description and keywords
- Proper repository and homepage links
- License information

## Success Metrics

- Package successfully published to npm registry
- Global installation works without errors
- NPX execution functions properly
- Package discoverable through npm search
- Download and installation metrics positive
- No security vulnerabilities detected

## Future Enhancements

- Automated CI/CD publishing pipeline
- Multiple distribution channels (homebrew, etc.)
- Binary releases for major platforms
- Package signing and verification
- Automated dependency updates
- Performance monitoring and optimization

## Rollback Strategy

- Maintain ability to unpublish recent versions if critical issues found
- Version deprecation for problematic releases
- Clear rollback procedures documented
- Communication plan for users if rollback needed