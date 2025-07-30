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

6. Commit your changes (see commit message guidelines below)
7. Push to your fork and submit a pull request

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
3. Add your changes to the CHANGELOG if applicable
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
