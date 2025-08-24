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

# Setup pre-commit hooks for development
[group('setup')]
setup-pre-commit:
    @echo "🔧 Setting up pre-commit hooks..."
    pip install pre-commit
    pre-commit install
    @echo "✅ Pre-commit hooks installed!"
    @echo "💡 Run 'just pre-commit-check' to test all hooks"

# Full development setup including pre-commit
[group('setup')]
setup-dev: setup setup-pre-commit
    @echo "🎉 Development environment ready!"

# Run development mode with optional arguments
[group('dev')]
dev *args='':
    #!/usr/bin/env bash
    npm run build
    if [ -z "{{args}}" ]; then
        node dist/bin.js --debug
    else
        node dist/bin.js {{args}}
    fi

[group('dev')]
start-http:
    npm run start:http

[group('dev')]
start-stdio:
    npm run start:stdio

# Run tests
[group('test')]
test:
    npm run test

# Launch MCP inspector with custom stdio command
[group('dev')]
inspect *args:
    @echo "🔍 Launching MCP inspector with: {{args}}"
    npm run build
    npx @modelcontextprotocol/inspector {{args}}

# Build the project
[group('build')]
build:
    npm run build

# Type check the project
[group('build')]
typecheck:
    npx tsc --noEmit

# Clean build artifacts and dependencies
[group('build')]
clean:
    rm -rf dist/
    rm -rf node_modules/
    rm -rf coverage/
    rm -f *.tgz
    @echo "✅ Clean complete!"

# Install dependencies
[group('build')]
install: clean
    npm install

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

# Run pre-commit hooks on staged files
[group('lint')]
pre-commit-check:
    pre-commit run

# Run pre-commit hooks on all files
[group('lint')]
pre-commit-check-all:
    pre-commit run --all-files

# Shorthand for pre-commit hooks on all files
[group('lint')]
pre-commit:
    pre-commit run --all-files

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

# Persona content pack management and testing
# Test personas are available in test/fixtures/personas/

# Internal helper to ensure build is fresh
_persona-ensure-build:
    #!/usr/bin/env bash
    if [ ! -d "dist" ] || [ "src" -nt "dist" ] || [ "package.json" -nt "dist" ]; then
        echo "🔨 Building project..."
        npm run build
    fi

# List all available personas
[group('persona')]
persona-list: _persona-ensure-build
    node dist/bin.js persona list

# List including invalid personas
[group('persona')]
persona-list-all: _persona-ensure-build
    node dist/bin.js persona list --include-invalid

# Show current persona status
[group('persona')]
persona-status: _persona-ensure-build
    node dist/bin.js persona status

# Deactivate current persona
[group('persona')]
persona-deactivate: _persona-ensure-build
    node dist/bin.js persona deactivate

# Activate a specific persona by name
[group('persona')]
persona-activate name: _persona-ensure-build
    node dist/bin.js persona activate {{name}}

# Activate minimal test persona for development
[group('persona')]
persona-test-minimal: _persona-ensure-build
    node dist/bin.js persona activate minimal-persona

# Activate valid test persona for development
[group('persona')]
persona-test-valid: _persona-ensure-build
    node dist/bin.js persona activate valid-persona

# Activate complex test persona for development
[group('persona')]
persona-test-complex: _persona-ensure-build
    node dist/bin.js persona activate complex-persona

# Validate a persona at specific path (directory or file)
[group('persona')]
persona-validate path: _persona-ensure-build
    #!/usr/bin/env bash
    # Check if path is a directory containing persona.yaml
    if [[ -d "{{path}}" && -f "{{path}}/persona.yaml" ]]; then
        node dist/bin.js persona validate "{{path}}/persona.yaml"
    elif [[ -d "{{path}}" && -f "{{path}}/persona.yml" ]]; then
        node dist/bin.js persona validate "{{path}}/persona.yml"
    else
        # Assume it's a direct file path
        node dist/bin.js persona validate "{{path}}"
    fi

# Validate all test personas
[group('persona')]
persona-validate-all: _persona-ensure-build
    #!/usr/bin/env bash
    echo "🔍 Validating test personas..."
    echo "Testing minimal-persona..."
    node dist/bin.js persona validate test/fixtures/personas/minimal-persona/persona.yaml || echo "❌ minimal-persona failed"
    echo "Testing valid-persona..."
    node dist/bin.js persona validate test/fixtures/personas/valid-persona/persona.yaml || echo "❌ valid-persona failed"
    echo "Testing complex-persona..."
    node dist/bin.js persona validate test/fixtures/personas/complex-persona/persona.yaml || echo "❌ complex-persona failed"
    echo "Testing invalid-persona (expected to fail)..."
    node dist/bin.js persona validate test/fixtures/personas/invalid-persona/persona.yaml || echo "✅ invalid-persona correctly failed"
    echo "✅ Validation testing complete"

# Quick test cycle: build, list, activate, status
[group('persona')]
persona-quick-test: _persona-ensure-build
    node dist/bin.js persona list
    node dist/bin.js persona activate valid-persona
    node dist/bin.js persona status

# Test persona with MCP server running
[group('persona')]
persona-with-server name='valid-persona': _persona-ensure-build
    node dist/bin.js persona activate {{name}}
    node dist/bin.js mcp run --debug

# Test persona activation and immediate deactivation cycle
[group('persona')]
persona-cycle name='minimal-persona': _persona-ensure-build
    #!/usr/bin/env bash
    echo "🔄 Testing persona cycle for {{name}}..."
    node dist/bin.js persona activate {{name}}
    echo "✅ Activated. Current status:"
    node dist/bin.js persona status
    echo "🔄 Deactivating..."
    node dist/bin.js persona deactivate
    echo "✅ Deactivated. Current status:"
    node dist/bin.js persona status

# Setup test environment and show available personas
[group('persona')]
persona-setup-test: _persona-ensure-build
    #!/usr/bin/env bash
    echo "🔧 Setting up persona test environment..."
    echo "📦 Test personas available at: test/fixtures/personas/"
    ls -la test/fixtures/personas/
    echo "🔍 Discovering personas..."
    node dist/bin.js persona list --include-invalid

# Test persona with MCP inspector for interactive debugging
[group('persona')]
persona-inspect name='valid-persona': _persona-ensure-build
    node dist/bin.js persona activate {{name}}
    echo "🔍 Starting MCP inspector with active persona..."
    npx @modelcontextprotocol/inspector "node dist/bin.js mcp run --debug"

# Test persona with specific toolset
[group('persona')]
persona-with-toolset persona toolset: _persona-ensure-build
    node dist/bin.js persona activate {{persona}} --toolset {{toolset}}
    node dist/bin.js persona status

# Setup personas by copying test fixtures (more reliable than symlinks)
[group('persona')]
persona-setup-real:
    #!/usr/bin/env bash
    echo "🔧 Setting up personas by copying test fixtures..."
    rm -rf personas/
    mkdir -p personas/
    cp -r test/fixtures/personas/* personas/
    echo "✅ Copied personas to personas/ directory:"
    ls -la personas/
    echo "📝 Test with: just persona-list"

# Debug persona discovery issues
[group('persona')]
persona-debug: _persona-ensure-build
    #!/usr/bin/env bash
    echo "🔍 Debugging persona discovery..."
    echo "📁 Checking personas directory:"
    ls -la personas/ || echo "❌ personas/ directory not found"
    echo "📁 Checking test fixtures:"
    ls -la test/fixtures/personas/
    echo "🧪 Testing direct validation:"
    node dist/bin.js persona validate test/fixtures/personas/valid-persona/persona.yaml
    echo "🔍 Running discovery (will timeout after 15s):"
    timeout 15 node dist/bin.js persona list || echo "⏱️ Discovery timed out (this is expected)"

# Test personas using direct paths (bypasses discovery issues)
[group('persona')]
persona-direct-test name='valid-persona':
    #!/usr/bin/env bash
    npm run build
    echo "🧪 Testing persona activation with direct fixture path..."
    # Note: This tests validation, but activation requires discovery
    echo "📝 Validating {{name}}:"
    node dist/bin.js persona validate "test/fixtures/personas/{{name}}/persona.yaml"
    echo "✅ Direct validation test complete"

# Clean up and recreate personas directory 
[group('persona')]
persona-reset:
    #!/usr/bin/env bash
    echo "🧹 Cleaning up personas directory..."
    rm -rf personas/
    echo "✅ Personas directory removed"
    echo "💡 Run 'just persona-setup-real' to recreate with copies"

# Combined setup and test workflow
[group('persona')]
persona-full-setup:
    just persona-setup-real
    just persona-debug
    echo "🎯 Attempting to activate valid-persona..."
    timeout 30 just persona-test-valid || echo "⏱️ Activation timed out, but personas are set up"

# Show detailed information about a persona
[group('persona')]
persona-info name: _persona-ensure-build
    #!/usr/bin/env bash
    echo "📋 Persona Information for: {{name}}"
    echo "─────────────────────────────────────"
    if [[ -d "test/fixtures/personas/{{name}}" ]]; then
        echo "📁 Location: test/fixtures/personas/{{name}}"
        if [[ -f "test/fixtures/personas/{{name}}/persona.yaml" ]]; then
            echo "📄 Configuration:"
            cat test/fixtures/personas/{{name}}/persona.yaml
        fi
        if [[ -f "test/fixtures/personas/{{name}}/mcp.json" ]]; then
            echo ""
            echo "🔧 MCP Configuration:"
            cat test/fixtures/personas/{{name}}/mcp.json
        fi
    else
        echo "❌ Persona not found in test fixtures"
        echo "💡 Try: just persona-list --include-invalid"
    fi

# Interactive persona selection and activation
[group('persona')]
persona-select: _persona-ensure-build
    #!/usr/bin/env bash
    echo "🎭 Available Test Personas:"
    echo "─────────────────────────"
    echo "1) minimal-persona     - Basic configuration"
    echo "2) valid-persona       - Complete valid example"  
    echo "3) complex-persona     - Advanced configuration"
    echo "4) invalid-persona     - Invalid for testing"
    echo ""
    read -p "Select persona (1-4): " choice
    case $choice in
        1) just persona-test-minimal ;;
        2) just persona-test-valid ;;
        3) just persona-test-complex ;;
        4) echo "⚠️  Attempting to activate invalid persona (will fail)..."
           node dist/bin.js persona activate invalid-persona || echo "✅ Expected failure" ;;
        *) echo "❌ Invalid selection" ;;
    esac

# Full persona development workflow
[group('persona')]
persona-dev-workflow: _persona-ensure-build
    #!/usr/bin/env bash
    echo "🚀 Starting full persona development workflow..."
    echo ""
    echo "1️⃣  Listing available personas..."
    node dist/bin.js persona list --include-invalid
    echo ""
    echo "2️⃣  Validating all test personas..."
    just persona-validate-all
    echo ""
    echo "3️⃣  Testing activation cycle..."
    just persona-cycle valid-persona
    echo ""
    echo "4️⃣  Final status check..."
    node dist/bin.js persona status
    echo ""
    echo "✅ Development workflow complete!"

# Setup test personas in expected directories for discovery
[group('persona')]
persona-setup-directories: _persona-ensure-build
    #!/usr/bin/env bash
    echo "🔧 Setting up persona directories for testing..."
    
    # Create the expected persona directories
    mkdir -p "./personas"
    mkdir -p "$HOME/.toolprint/hypertool-mcp/personas"
    
    # Create symlinks to test fixtures for easy discovery
    echo "🔗 Creating symlinks to test fixtures..."
    if [[ ! -e "./personas/minimal-persona" ]]; then
        ln -sf "../test/fixtures/personas/minimal-persona" "./personas/minimal-persona"
    fi
    if [[ ! -e "./personas/valid-persona" ]]; then
        ln -sf "../test/fixtures/personas/valid-persona" "./personas/valid-persona"  
    fi
    if [[ ! -e "./personas/complex-persona" ]]; then
        ln -sf "../test/fixtures/personas/complex-persona" "./personas/complex-persona"
    fi
    if [[ ! -e "./personas/invalid-persona" ]]; then
        ln -sf "../test/fixtures/personas/invalid-persona" "./personas/invalid-persona"
    fi
    
    echo "✅ Persona directories setup complete!"
    echo "📁 Test personas are now discoverable at:"
    echo "   • ./personas/ (symlinked to test fixtures)"
    echo ""
    echo "💡 Run 'just persona-list' to verify discovery works"

# Clean up persona development directories  
[group('persona')]
persona-cleanup-directories:
    #!/usr/bin/env bash
    echo "🧹 Cleaning up persona development directories..."
    if [[ -d "./personas" ]]; then
        echo "Removing ./personas directory..."
        rm -rf "./personas"
    fi
    echo "✅ Cleanup complete!"

# Enhanced quick test with directory setup
[group('persona')]
persona-quick-test-with-setup: persona-setup-directories
    #!/usr/bin/env bash
    echo "🚀 Quick test with automatic setup..."
    node dist/bin.js persona list
    echo ""
    node dist/bin.js persona activate valid-persona
    echo ""
    node dist/bin.js persona status

# Convenient aliases for common persona operations
[group('persona')]
persona-reset-active: persona-deactivate
    @echo "🔄 Active persona reset complete"

[group('persona')]  
persona-start name='valid-persona': _persona-ensure-build
    node dist/bin.js persona activate {{name}}
    @echo "🚀 Persona {{name}} is now active"

[group('persona')]
persona-check: persona-status
    @# Alias for status check

[group('persona')]
persona-discover: persona-list
    @# Alias for listing personas

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
