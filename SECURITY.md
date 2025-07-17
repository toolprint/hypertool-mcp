# Security Policy

## Reporting Security Vulnerabilities

We take the security of Hypertool MCP seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please email us at: **support@onegrep.dev**

Include the following information:
- Type of issue (e.g., buffer overflow, command injection, privilege escalation, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### Response Timeline

- We will acknowledge your email within 48 hours
- We will provide a detailed response within 7 days indicating our next steps
- We will keep you informed of progress towards fixing the issue
- We may ask for additional information or guidance

### Security Best Practices

When using Hypertool MCP:

1. **Authentication**: Ensure proper authentication for all underlying MCP servers
2. **Environment Variables**: Store sensitive tokens and API keys in environment variables, never in code
3. **Configuration Security**: 
   - Protect your `.mcp.json` configuration files
   - Use appropriate file permissions
   - Never commit sensitive configuration to version control
4. **Network Security**: 
   - Use secure transports when available
   - Be cautious when exposing HTTP endpoints
5. **Tool Permissions**: 
   - Only enable tools you trust
   - Regularly audit enabled toolsets
   - Use the principle of least privilege
6. **Regular Updates**: Keep the package updated to the latest version for security patches

### Security Considerations for MCP Proxy

- **Tool Isolation**: Each tool call is routed to the appropriate server without cross-contamination
- **Input Validation**: All tool calls are validated before routing
- **Error Handling**: Errors from underlying servers are handled gracefully without exposing sensitive information
- **Connection Security**: Each underlying MCP server connection is isolated
- **Configuration Validation**: All configuration files are validated against strict schemas

### Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | ✅ Yes             |
| < 0.0   | ❌ No              |

### Known Security Considerations

1. **Insecure Mode**: The `--insecure` flag bypasses tool hash verification. Use only in development environments.
2. **HTTP Transport**: When using HTTP transport, ensure proper network isolation or use HTTPS proxies.
3. **Tool Permissions**: Hypertool inherits the permissions of the underlying MCP servers it connects to.

### Security Acknowledgments

We appreciate the security research community and will acknowledge security researchers who responsibly disclose vulnerabilities.