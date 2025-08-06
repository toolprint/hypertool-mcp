#!/bin/bash
# Demo script for non-interactive setup command

echo "=== Hypertool MCP Non-Interactive Setup Demo ==="
echo ""
echo "This demonstrates various non-interactive setup scenarios."
echo "Using the top-level 'setup' command"
echo ""

# Function to run a demo
run_demo() {
    local title="$1"
    local cmd="$2"

    echo "----------------------------------------"
    echo "📦 $title"
    echo "Command: $cmd"
    echo ""
    echo "Running (dry-run mode)..."
    eval "$cmd --dry-run"
    echo ""
}

# Demo 1: Basic non-interactive setup
run_demo "Basic Non-Interactive Setup" \
    "npx hypertool-mcp setup --yes"

# Demo 2: Select specific apps
run_demo "Configure Only Claude Desktop" \
    "npx hypertool-mcp setup --yes --apps claude-desktop"

# Demo 3: Fresh start without imports
run_demo "Fresh Installation (No Imports)" \
    "npx hypertool-mcp setup --yes --import-none"

# Demo 4: Development mode
run_demo "Development Installation" \
    "npx hypertool-mcp setup --yes --development"

# Demo 5: Skip toolsets
run_demo "Setup Without Toolsets" \
    "npx hypertool-mcp setup --yes --skip-toolsets"

# Demo 6: Complete CI/CD setup
run_demo "CI/CD Optimized Setup" \
    "npx hypertool-mcp setup --yes --import-none --skip-toolsets --apps claude-desktop,cursor"

echo "=== Demo Complete ==="
echo ""
echo "💡 Tips:"
echo "  - Remove --dry-run to actually make changes"
echo "  - Use --verbose for detailed output"
echo "  - Check docs/setup-noninteractive.md for more examples"
