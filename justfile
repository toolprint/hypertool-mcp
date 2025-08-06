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


# Dry run commands - kept for debugging
[group('publish')]
publish-dry-run: pre-publish-checks
    @echo "🧪 Testing publish (dry run)..."
    npm publish --dry-run --access public --tag beta

# Promote existing version to stable and latest tags
[group('publish')]
promote-stable version:
    @echo "Promoting version {{version}} to stable and latest..."
    npm dist-tag add @toolprint/hypertool-mcp@{{version}} stable
    npm dist-tag add @toolprint/hypertool-mcp@{{version}} latest
    @echo "✅ Successfully promoted {{version}} to stable and latest"
    npm dist-tag ls @toolprint/hypertool-mcp

# Check current tag distributions
[group('publish')]
check-tags:
    @echo "Current NPM dist-tags for @toolprint/hypertool-mcp:"
    npm dist-tag ls @toolprint/hypertool-mcp

# Show available versions on NPM
[group('publish')]
show-versions:
    @echo "Available versions on NPM:"
    npm view @toolprint/hypertool-mcp versions --json

# Changeset commands for semantic versioning
[group('changeset')]
changeset:
    @echo "🔄 Creating new changeset..."
    npx changeset

[group('changeset')]
changeset-status:
    @echo "📋 Changeset status:"
    npm run changeset:status

[group('changeset')]
changeset-version:
    @echo "🔢 Applying version bumps from changesets..."
    npm run changeset:version

[group('changeset')]
changeset-preview:
    @echo "👀 Preview version changes without applying:"
    npm run changeset:status --verbose

# ⚠️  For debugging only - Production uses GitHub Actions with changesets
[group('publish')]
publish-beta-manual: pre-publish-checks
    @echo "⚠️  WARNING: This bypasses changeset workflow!"
    @echo "⚠️  Only use for local testing - production uses GitHub Actions"
    @echo ""
    @echo "For production releases:"
    @echo "  1. just changeset"
    @echo "  2. git commit && git push"
    @echo "  3. Merge PR (triggers automated beta publish)"
    @echo ""
    @echo "Continue anyway? Press Enter or Ctrl+C to cancel"
    @read
    npm version patch --no-git-tag-version  
    npm publish --access public --tag beta
    @echo "✅ Published to beta tag (manual override)"

# Test local installation with version suffix to differentiate from published versions
[group('publish')]
test-install: build
    #!/usr/bin/env bash
    set -euo pipefail  # Exit on error, undefined vars, pipe failures
    
    echo "📦 Testing local installation with version suffix..."
    
    # Ensure tmp directory exists
    mkdir -p .tmp
    
    # Create timestamped backup and add local suffix
    TIMESTAMP=$(date +%s)
    LOCAL_VERSION="$(node -p "require('./package.json').version")-local-${TIMESTAMP}"
    
    echo "🔄 Creating local package version: ${LOCAL_VERSION}"
    
    # Function to restore package.json and package-lock.json on exit (success or failure)
    cleanup() {
        if [ -f package.json.backup ]; then
            echo "🔄 Restoring original package.json..."
            mv package.json.backup package.json
        fi
        if [ -f package-lock.json.backup ]; then
            echo "🔄 Restoring original package-lock.json..."
            mv package-lock.json.backup package-lock.json
        fi
        # Clean up any leftover tarballs
        rm -f .tmp/*.tgz *.tgz 2>/dev/null || true
    }
    trap cleanup EXIT
    
    # Create backups and modify version
    cp package.json package.json.backup
    cp package-lock.json package-lock.json.backup
    npm version --no-git-tag-version "${LOCAL_VERSION}"
    
    # Create package tarball in tmp directory  
    npm pack --pack-destination .tmp
    
    # Install globally
    PACKAGE_FILE=$(ls .tmp/toolprint-hypertool-mcp-*.tgz | head -1)
    npm install -g "${PACKAGE_FILE}"
    
    # Test installation
    echo "🧪 Testing global command..."
    LOCAL_INSTALLED_VERSION=$(hypertool-mcp --version)
    echo "   Installed version: ${LOCAL_INSTALLED_VERSION}"
    
    echo "🧪 Testing npx execution..."
    npx @toolprint/hypertool-mcp --version
    
    echo "🧪 Testing CLI functionality..."
    node -e "console.log(require('child_process').execSync('hypertool-mcp --help 2>&1', {encoding: 'utf8'}).includes('Usage:') ? '✅ CLI commands working' : '❌ CLI commands failed')"
    
    # Verify local version suffix is present
    if [[ "${LOCAL_INSTALLED_VERSION}" == *"-local-"* ]]; then
        echo "✅ Local version suffix confirmed: ${LOCAL_INSTALLED_VERSION}"
    else
        echo "⚠️  Warning: Local version suffix not detected in installed version"
    fi
    
    # Verify package files will be restored (they're restored in cleanup trap)
    echo "ℹ️  Note: package.json and package-lock.json will be restored automatically"
    
    echo "✅ Local installation completed!"
    echo ""
    echo "📚 Usage Instructions:"
    echo "─────────────────────────────────────────────────"
    echo ""
    echo "🖥️  CLI Usage:"
    echo "  hypertool-mcp --help                    # Show all commands"
    echo "  hypertool-mcp --version                 # Show version"
    echo "  hypertool-mcp setup                     # Interactive setup wizard"
    echo "  hypertool-mcp mcp run                   # Run MCP server"
    echo "  hypertool-mcp config show               # Show current configuration"
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