# Contributing to Hypertool MCP

First off, thank you for considering contributing to Hypertool MCP! It's people like you that make Hypertool MCP such a great tool.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible using our issue template.

**Note:** If you find a **Closed** issue that seems like it is the same thing that you're experiencing, open a new issue and include a link to the original issue in the body of your new one.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please use the feature request template and provide:

- A clear and descriptive title
- A detailed description of the proposed enhancement
- Explain why this enhancement would be useful
- List any alternative solutions you've considered

### Your First Code Contribution

Unsure where to begin contributing? You can start by looking through these issues:

- Issues labeled `good first issue` - issues which should only require a few lines of code
- Issues labeled `help wanted` - issues which could use extra attention

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Git

### Installation

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/hypertool-mcp.git
   cd hypertool-mcp
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Build the project:

   ```bash
   npm run build
   ```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Development Workflow

1. Create a new branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes
3. Run tests and ensure they pass
4. Run linting:

   ```bash
   npm run lint
   ```

5. Format your code:

   ```bash
   npm run format
   ```

6. **Add a changeset** to describe your changes (see changeset guidelines below)
7. Commit your changes (see commit message guidelines below)
8. Push to your fork and submit a pull request

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Ensure strict type checking passes
- Avoid using `any` types
- Document complex types with JSDoc comments

### Code Style

- We use ESLint and Prettier for code formatting
- Run `npm run lint` and `npm run format` before committing
- Follow existing patterns in the codebase

### Testing

- Write tests for new features
- Ensure existing tests pass
- Aim for high test coverage
- Use descriptive test names

#### Configuration Transformer Testing

When adding or modifying configuration transformers:

1. **Create comprehensive tests** for your transformer in `src/config-manager/transformers/[name].test.ts`
2. **Test all transformer methods**:
   - `toStandard()`: Converting from app format to standard MCP format
   - `fromStandard()`: Converting from standard format to app format
   - `validate()`: Validating configuration structure
3. **Test configuration preservation**: Ensure `fromStandard()` preserves existing configuration when the `existingConfig` parameter is provided
4. **Use realistic test fixtures**: Create test data that represents real-world configurations
5. **Test edge cases**: Handle missing fields, invalid data, and error scenarios

Example test structure:

```typescript
describe("MyTransformer", () => {
  describe("toStandard", () => {
    it("should convert app format to standard format", () => {
      // Test conversion logic
    });
  });

  describe("fromStandard", () => {
    it("should preserve existing config when provided", () => {
      // Test that all non-MCP fields are preserved
    });
  });

  describe("validate", () => {
    it("should validate correct configuration", () => {
      // Test validation logic
    });
  });
});
```

#### Integration Testing

For application integrations:

1. **Create integration tests** in `src/integration/[app-name]-integration.test.ts`
2. **Test the full setup flow**: Import → Link → Verify
3. **Test unlink and restore**: Ensure clean removal and restoration
4. **Test error scenarios**: Handle corrupted configs, missing files, permissions
5. **Use the test utilities** from `src/config-manager/test-utils.ts`

## Changeset Guidelines

We use [Changesets](https://github.com/changesets/changesets) for version management and automatic changelog generation. Every PR that changes functionality should include a changeset.

### When to Add a Changeset

**Always add a changeset when your PR includes:**

- 🐛 Bug fixes → **patch**
- ✨ New features → **minor**
- 💥 Breaking changes → **major**
- 🔧 Internal improvements that affect users

**Skip changeset when your PR is:**

- 📖 Documentation only
- 🧪 Test improvements only
- 🔧 Internal tooling that doesn't affect users
- 🎨 Code formatting/style only

### How to Add a Changeset

1. **Run the changeset command:**

   ```bash
   npx changeset
   # or
   just changeset
   ```

2. **Select version bump type:**
   - **patch** (1.0.0 → 1.0.1) - Bug fixes, small improvements
   - **minor** (1.0.0 → 1.1.0) - New features, API additions
   - **major** (1.0.0 → 2.0.0) - Breaking changes

3. **Write a clear description:**

   ```bash
   # Good examples:
   "Add support for custom toolset configurations"
   "Fix connection timeout handling in MCP clients"
   "Breaking: Rename 'server' config key to 'mcpServer'"

   # Less helpful:
   "Fix bug"
   "Update code"
   "Changes"
   ```

4. **Commit the changeset file:**

   ```bash
   git add .changeset/*.md
   git commit -m "add changeset for [your feature]"
   ```

### Changeset Commands

```bash
# Create new changeset (interactive)
just changeset

# Check current status
just changeset-status

# Preview version changes
just changeset-preview

# Apply version bumps (maintainers only)
just changeset-version
```

### PR Automation

Our GitHub Actions bot will:

- ✅ Check if your PR includes a changeset
- 💬 Comment with helpful guidance if missing
- 📝 Show changeset details in PR comments
- ⚠️ Warn if automatic patch release will be triggered

**Pro tip:** Add changeset early in your development process, not as an afterthought!

## Release Strategy

Understanding our release process helps you contribute effectively:

### 🚀 What Happens After Your PR Merges

1. **Automatic Beta Release**:
   - Every merge to `main` triggers GitHub Actions
   - Version determined by changesets (or defaults to patch)
   - Published to NPM with `beta` tag: `npm install @toolprint/hypertool-mcp@beta`
   - Git tag created: `v0.0.32`, `v0.1.0`, etc. (clean semver, no `-beta` suffix)
   - **No GitHub release created** (tags only)

2. **Manual Stable Promotion**:
   - Maintainers manually promote specific versions to stable
   - Updates both `stable` AND `latest` NPM tags simultaneously
   - Creates GitHub release with changelog and installation instructions
   - Users installing normally get stable versions: `npm install @toolprint/hypertool-mcp`

### 📋 Release Channels

| Channel | Purpose | How to Install | When Updated |
|---------|---------|----------------|--------------|
| `latest` = `stable` | Production use | `npm install @toolprint/hypertool-mcp` | Manual promotion only |
| `beta` | Internal testing | `npm install @toolprint/hypertool-mcp@beta` | Every merge to main |

### 🏷️ Git Tags vs GitHub Releases

- **Git Tags**: Created for every successful NPM publish (automatic)
- **GitHub Releases**: Created only when promoting to stable (manual)
- **Result**: Clean release page showing only stable versions to users

### 🔍 For Contributors

- **Your changes** → Beta channel immediately after merge
- **Stable promotion** → Happens separately, when maintainers are confident
- **GitHub releases** → Only stable versions get full release notes

This strategy ensures users get stable versions by default while allowing rapid iteration through the beta channel.

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc)
- `refactor:` Code refactoring
- `test:` Test additions or modifications
- `chore:` Build process or auxiliary tool changes

Examples:

```
feat: add support for custom toolset configurations
fix: handle connection errors gracefully
docs: update installation instructions
```

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add a changeset if your changes affect functionality (CHANGELOG is generated automatically)
4. Fill out the pull request template completely
5. Request review from maintainers

### PR Title Format

Use the same format as commit messages (e.g., `feat: add new feature`)

## Project Structure

```
hypertool-mcp/
├── src/                    # Source code
│   ├── server/            # Core MCP server implementation
│   ├── config/            # Configuration handling
│   ├── connection/        # Connection management
│   ├── discovery/         # Tool discovery
│   ├── router/            # Request routing
│   ├── scripts/           # Setup scripts for integrations
│   └── types/             # TypeScript type definitions
├── tests/                 # Test files
├── docs/                  # Documentation
└── examples/              # Example configurations
```

## Questions?

Feel free to open an issue with the question label or reach out to the maintainers.

## Recognition

Contributors will be recognized in our README. Thank you for your contributions!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
