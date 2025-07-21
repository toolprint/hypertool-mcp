# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- MIT license and comprehensive open source documentation
- Security policy (SECURITY.md)
- Code of conduct (CODE_OF_CONDUCT.md)
- Contributing guidelines (CONTRIBUTING.md)
- GitHub issue and pull request templates
- Toolprint branding and attribution

### Changed
- License changed from ISC to MIT

## [0.0.5] - 2025-01-17

### Added
- Initial public release
- Dynamic toolset management for MCP servers
- Support for both stdio and HTTP/SSE transports
- Hot-swapping toolsets without restart
- Secure tool reference validation
- Integration scripts for Claude Desktop, Cursor, and Claude Code
- Comprehensive test suite

### Features
- Connect to multiple MCP servers as a client
- Discover and expose tools from underlying servers
- Create custom toolsets from available tools
- Real-time toolset switching with client notification
- Tool reference hash validation for security

[Unreleased]: https://github.com/toolprint/hypertool-mcp/compare/v0.0.5...HEAD
[0.0.5]: https://github.com/toolprint/hypertool-mcp/releases/tag/v0.0.5