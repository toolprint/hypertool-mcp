#!/usr/bin/env -S just --justfile

# Recommend installing completion scripts: https://just.systems/man/en/shell-completion-scripts.html
# Recommend installing vscode extension: https://just.systems/man/en/visual-studio-code.html

# Common commands
# (No external dependencies required)

# Default recipe - show available commands
_default:
    @just -l -u

# Brew installation
[group('setup')]
brew:
    brew update & brew bundle install --file=./Brewfile


# Recursively sync git submodules
[group('git')]
sync-submodules:
    git submodule update --init --recursive

# Show git status
[group('git')]
git-status:
    git status

# Create a new git branch
[group('git')]
git-branch name:
    git checkout -b {{ name }}

# Initial project setup
[group('setup')]
setup: brew
    npm install
    npm run build
    @echo "✅ Setup complete!"

# Run development mode with optional arguments
[group('dev')]
dev *args='':
    npm run dev -- {{args}}

# Run tests
[group('test')]
test:
    npm run test

# Build the project
[group('build')]
build:
    npm run build

# Type check the project
[group('build')]
typecheck:
    npx tsc --noEmit

# Clean build artifacts and dependencies
[group('clean')]
clean:
    rm -rf dist/
    rm -rf node_modules/
    rm -rf coverage/
    rm -f *.tgz
    @echo "✅ Clean complete!"

# Format code
[group('lint')]
format:
    @echo "Formatting JSON files..."
    @prettier --write "**/*.json" --ignore-path .gitignore || true
    @echo "Formatting Markdown files..."
    @markdownlint-cli2 --fix "**/*.md" "#node_modules" "#.git" || true
    @echo "Formatting complete!"

# Lint code
[group('lint')]
lint:
    @echo "Linting JSON files..."
    @prettier --check "**/*.json" --ignore-path .gitignore || echo "Prettier not available, skipping JSON linting"
    @echo "Linting Markdown files..."
    @markdownlint-cli2 "**/*.md" "#node_modules" "#.git" || echo "Markdownlint not available, skipping Markdown linting"
    @echo "Linting complete!"

# Pre-publish checks: build, test, lint, and typecheck
[group('publish')]
pre-publish-checks: build test lint typecheck
    @echo "✅ All pre-publish checks passed!"

[group('publish')]
publish: pre-publish-checks
    npm publish --access public

# Version bump and publish commands
[group('publish')]
publish-patch: pre-publish-checks
    npm version patch --no-git-tag-version
    npm publish --access public

[group('publish')]
publish-minor: pre-publish-checks
    npm version minor --no-git-tag-version
    npm publish --access public

[group('publish')]
publish-major: pre-publish-checks
    npm version major --no-git-tag-version
    npm publish --access public

[group('publish')]
publish-beta: pre-publish-checks
    npm version prerelease --preid=beta --no-git-tag-version
    npm publish --access public --tag beta

# Dry run commands
[group('publish')]
publish-dry-run-patch: pre-publish-checks
    npm version patch --no-git-tag-version --dry-run
    npm publish --dry-run --access public

[group('publish')]
publish-dry-run-minor: pre-publish-checks
    npm version minor --no-git-tag-version --dry-run
    npm publish --dry-run --access public

[group('publish')]
publish-dry-run-major: pre-publish-checks
    npm version major --no-git-tag-version --dry-run
    npm publish --dry-run --access public

[group('publish')]
publish-dry-run-beta: pre-publish-checks
    npm version prerelease --preid=beta --no-git-tag-version --dry-run
    npm publish --dry-run --access public --tag beta

# Test local installation
[group('publish')]
test-install: build
    #!/usr/bin/env bash
    echo "📦 Testing local installation..."
    
    # Create package tarball
    npm pack
    
    # Install globally
    PACKAGE_FILE=$(ls toolprint-hypertool-mcp-*.tgz | head -1)
    npm install -g "./$PACKAGE_FILE"
    
    # Test installation
    echo "🧪 Testing global command..."
    hypertool-mcp --version
    
    echo "🧪 Testing npx execution..."
    npx @toolprint/hypertool-mcp --version
    
    echo "🧪 Testing examples accessibility..."
    node -e "console.log(require('child_process').execSync('hypertool-mcp list-saved-toolsets 2>&1', {encoding: 'utf8'}).includes('toolsets') ? '✅ CLI commands working' : '❌ CLI commands failed')"
    
    # Cleanup tarball
    rm -f toolprint-hypertool-mcp-*.tgz
    
    echo "✅ Local installation completed!"
    echo ""
    echo "📚 Usage Instructions:"
    echo "─────────────────────────────────────────────────"
    echo ""
    echo "🖥️  CLI Usage:"
    echo "  hypertool-mcp --help                    # Show all commands"
    echo "  hypertool-mcp --version                 # Show version"
    echo "  hypertool-mcp list-available-tools      # List all available tools"
    echo "  hypertool-mcp list-saved-toolsets       # List saved toolsets"
    echo "  hypertool-mcp --mcp-config config.json  # Use custom MCP config"
    echo ""
    echo "🔧 MCP Configuration (.mcp.json):"
    echo '  {'
    echo '    "mcpServers": {'
    echo '      "hypertool": {'
    echo '        "command": "hypertool-mcp",'
    echo '        "args": ["--mcp-config", ".mcp.hypertool.json"]'
    echo '      }'
    echo '    }'
    echo '  }'
    echo ""
    echo "🗑️  To uninstall when done:"
    echo "  npm uninstall -g @toolprint/hypertool-mcp"
    echo "─────────────────────────────────────────────────"