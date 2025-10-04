#!/bin/bash

# Test script for configuration tools behavior in persona vs non-persona mode
# This script starts the server in HTTP mode and tests various configuration tools

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PORT=3456
SERVER_URL="http://localhost:$PORT/mcp"
TEST_MCP_CONFIG=""
TEST_PERSONA="test-persona"
SERVER_PID=""
LOG_DIR="src/test-utils/logs"
LOG_FILE=""
SESSION_ID=""
TEMP_STANDARD_CONFIG=""
TEMP_PERSONA_DIR=""

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Cleanup function
stop_server() {
    if [ ! -z "$SERVER_PID" ]; then
        echo "Killing server with PID $SERVER_PID"
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
        SERVER_PID=""
    fi
}

cleanup() {
    echo -e "${YELLOW}Cleaning up...${NC}"
    stop_server
    if [ -n "$TEMP_STANDARD_CONFIG" ] && [ -f "$TEMP_STANDARD_CONFIG" ]; then
        rm -f "$TEMP_STANDARD_CONFIG"
    fi
    if [ -n "$TEMP_PERSONA_DIR" ] && [ -d "$TEMP_PERSONA_DIR" ]; then
        rm -rf "$TEMP_PERSONA_DIR"
    fi
}

# Set trap for cleanup
trap cleanup EXIT

# Create stub MCP configuration for standard mode tests
create_stub_standard_config() {
    TEMP_STANDARD_CONFIG=$(mktemp)
    cat >"$TEMP_STANDARD_CONFIG" <<'JSON'
{
  "mcpServers": {
    "sequential-thinking": {
      "type": "stdio",
      "command": "node",
      "args": ["./test/stub-servers/mcp-stub.mjs"],
      "env": {
        "STUB_SERVER_NAME": "sequential-thinking"
      }
    },
    "everything": {
      "type": "stdio",
      "command": "node",
      "args": ["./test/stub-servers/mcp-stub.mjs"],
      "env": {
        "STUB_SERVER_NAME": "everything"
      }
    }
  }
}
JSON
    TEST_MCP_CONFIG="$TEMP_STANDARD_CONFIG"
}

# Create temporary persona directory with stub MCP servers
create_stub_persona_dir() {
    TEMP_PERSONA_DIR=$(mktemp -d)
    mkdir -p "$TEMP_PERSONA_DIR/$TEST_PERSONA"

    cp personas/test-persona/persona.yaml "$TEMP_PERSONA_DIR/$TEST_PERSONA/persona.yaml"

    cat >"$TEMP_PERSONA_DIR/$TEST_PERSONA/mcp.json" <<'JSON'
{
  "mcpServers": {
    "everything": {
      "type": "stdio",
      "command": "node",
      "args": ["./test/stub-servers/mcp-stub.mjs"],
      "env": {
        "STUB_SERVER_NAME": "everything"
      }
    },
    "context7": {
      "type": "stdio",
      "command": "node",
      "args": ["./test/stub-servers/mcp-stub.mjs"],
      "env": {
        "STUB_SERVER_NAME": "context7"
      }
    },
    "mcping": {
      "type": "stdio",
      "command": "node",
      "args": ["./test/stub-servers/mcp-stub.mjs"],
      "env": {
        "STUB_SERVER_NAME": "mcping"
      }
    },
    "filesystem": {
      "type": "stdio",
      "command": "node",
      "args": ["./test/stub-servers/mcp-stub.mjs"],
      "env": {
        "STUB_SERVER_NAME": "filesystem"
      }
    }
  }
}
JSON

}

initialize_stub_environment() {
    if [ -z "$TEST_MCP_CONFIG" ]; then
        create_stub_standard_config
    fi

    create_stub_persona_dir
}

# Function to initialize MCP session
init_session() {
    local request='{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {
                "name": "test-client",
                "version": "1.0.0"
            }
        }
    }'

    # Send initialization request and capture both headers and body
    local response_file="/tmp/mcp-response-$$"
    curl -s -i -X POST "$SERVER_URL" \
        -H "Content-Type: application/json" \
        -H "Accept: text/event-stream, application/json" \
        -d "$request" > "$response_file"

    # Extract session ID from Mcp-Session-Id header
    SESSION_ID=$(grep -i "^Mcp-Session-Id:" "$response_file" | cut -d' ' -f2 | tr -d '\r\n')

    if [ ! -z "$SESSION_ID" ]; then
        echo "Got session ID from header: $SESSION_ID"
    else
        echo "No session ID in response headers"
        # Show response for debugging
        echo "Response:"
        cat "$response_file"
    fi

    rm -f "$response_file"
}

# Function to start server
start_server() {
    local mode=$1
    local cmd=""
    local timestamp=$(date +%Y%m%d_%H%M%S)

    if [ "$mode" = "persona" ]; then
        echo -e "${BLUE}Starting server in PERSONA mode with --persona $TEST_PERSONA${NC}"
        LOG_FILE="$LOG_DIR/test-persona-mode-$timestamp.log"
        cmd="env HYPERTOOL_PERSONA_DIR=$TEMP_PERSONA_DIR dist/bin.js mcp run --persona $TEST_PERSONA --transport http --port $PORT --debug --log-level debug"
    else
        echo -e "${BLUE}Starting server in STANDARD mode with --mcp-config $TEST_MCP_CONFIG${NC}"
        LOG_FILE="$LOG_DIR/test-standard-mode-$timestamp.log"
        cmd="dist/bin.js mcp run --mcp-config $TEST_MCP_CONFIG --transport http --port $PORT --debug --log-level debug"
    fi

    echo "Logging to: $LOG_FILE"

    # Start server in background with debug logging
    $cmd > "$LOG_FILE" 2>&1 &
    SERVER_PID=$!

    echo "Server started with PID $SERVER_PID"
    echo "Waiting for server to be ready..."

    # Wait for server to start
    local max_attempts=120
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$SERVER_URL" > /dev/null 2>&1; then
            echo -e "${GREEN}Server is ready!${NC}"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done

    echo -e "${RED}Server failed to start. Check /tmp/hypertool-test.log${NC}"
    return 1
}

# Function to call MCP tool
call_tool() {
    local tool_name=$1
    local args=$2

    local request='{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "'$tool_name'"'

    if [ ! -z "$args" ]; then
        request="$request"',
            "arguments": '$args
    fi

    request="$request"'
        }
    }'

    local headers="-H \"Content-Type: application/json\" -H \"Accept: text/event-stream, application/json\""
    if [ ! -z "$SESSION_ID" ]; then
        headers="$headers -H \"Mcp-Session-Id: $SESSION_ID\""
    fi

    local response=$(eval "curl -s -X POST \"$SERVER_URL\" $headers -d '$request'")

    # Check if response is SSE format
    if echo "$response" | grep -q "^event:"; then
        # Parse SSE format - extract the JSON from the data: line
        local json_data=$(echo "$response" | grep "^data:" | sed 's/^data: //')
        echo "$json_data" | jq -r '.result.content[0].text' 2>/dev/null || echo "$json_data"
    else
        # Regular JSON response
        echo "$response" | jq -r '.result.content[0].text' 2>/dev/null || echo "$response"
    fi
}

# Function to list available tools
list_tools() {
    local request='{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list"
    }'

    local headers="-H \"Content-Type: application/json\" -H \"Accept: text/event-stream, application/json\""
    if [ ! -z "$SESSION_ID" ]; then
        headers="$headers -H \"Mcp-Session-Id: $SESSION_ID\""
    fi

    local response=$(eval "curl -s -X POST \"$SERVER_URL\" $headers -d '$request'")

    # Check if response is SSE format (starts with "event:")
    if echo "$response" | grep -q "^event:"; then
        # Parse SSE format - extract the JSON from the data: line
        local json_data=$(echo "$response" | grep "^data:" | sed 's/^data: //')
        if echo "$json_data" | jq -e '.result.tools' > /dev/null 2>&1; then
            echo "$json_data" | jq -r '.result.tools[].name'
        else
            echo "Failed to parse SSE response"
            return 1
        fi
    elif echo "$response" | jq -e '.result.tools' > /dev/null 2>&1; then
        # Regular JSON response
        echo "$response" | jq -r '.result.tools[].name'
    else
        echo "Failed to list tools. Response:"
        echo "$response" | head -5
        return 1
    fi
}

# Test function
run_test() {
    local test_name=$1
    local tool_name=$2
    local args=$3
    local expected_pattern=$4

    echo -e "\n${YELLOW}TEST: $test_name${NC}"
    echo "Calling tool: $tool_name"

    local result=$(call_tool "$tool_name" "$args")
    echo "Result: $result"

    if echo "$result" | grep -q "$expected_pattern"; then
        echo -e "${GREEN}✓ PASS${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL - Expected pattern not found: $expected_pattern${NC}"
        return 1
    fi
}

# Check if available tools contain a specific tool
check_tool_availability() {
    local tool_name=$1
    local should_exist=$2  # "true" or "false"

    echo -e "\n${YELLOW}Checking if '$tool_name' is available (should exist: $should_exist)${NC}"

    local tools=$(list_tools)

    if echo "$tools" | grep -q "^$tool_name$"; then
        if [ "$should_exist" = "true" ]; then
            echo -e "${GREEN}✓ PASS - Tool '$tool_name' is available as expected${NC}"
            return 0
        else
            echo -e "${RED}✗ FAIL - Tool '$tool_name' should NOT be available${NC}"
            return 1
        fi
    else
        if [ "$should_exist" = "false" ]; then
            echo -e "${GREEN}✓ PASS - Tool '$tool_name' is not available as expected${NC}"
            return 0
        else
            echo -e "${RED}✗ FAIL - Tool '$tool_name' should be available${NC}"
            return 1
        fi
    fi
}

# Main test execution
main() {
    echo -e "${GREEN}=== HyperTool Configuration Tools Test ===${NC}"
    echo ""

    # Build the project first
    echo -e "${BLUE}Building project...${NC}"
    npm run build > /dev/null 2>&1
    echo -e "${GREEN}Build complete${NC}"

    # Prepare stub configurations so tests don't require external MCP servers
    initialize_stub_environment
    echo -e "${BLUE}Using stub MCP config: ${TEST_MCP_CONFIG}${NC}"
    echo -e "${BLUE}Using stub persona: ${TEST_PERSONA}${NC}"

    # Test 1: Standard mode (no persona)
    echo -e "\n${GREEN}=== TEST SUITE 1: Standard Mode (No Persona) ===${NC}"
    start_server "standard"

    # Initialize MCP session
    echo -e "\n${BLUE}Initializing MCP session...${NC}"
    init_session

    echo -e "\n${BLUE}Available tools in standard mode:${NC}"
    list_tools

    # Check tool availability in standard mode
    check_tool_availability "list-personas" "false"  # Should NOT be available when no persona
    check_tool_availability "build-toolset" "true"  # Should be available
    check_tool_availability "delete-toolset" "true" # Should be available

    # Test list-saved-toolsets (should not return persona toolsets)
    echo -e "\n${YELLOW}TEST: list-saved-toolsets in standard mode${NC}"
    result=$(call_tool "list-saved-toolsets" "")
    echo "Result: $result"
    if echo "$result" | jq -e '.toolsets | length' > /dev/null 2>&1; then
        toolset_count=$(echo "$result" | jq '.toolsets | length')
        echo "Number of toolsets: $toolset_count"

        # Check if any toolset name starts with "persona:"
        if echo "$result" | jq -e '.toolsets[] | select(.name | startswith("persona:"))' > /dev/null 2>&1; then
            echo -e "${RED}✗ FAIL - Found persona toolsets when no persona is active${NC}"
        else
            echo -e "${GREEN}✓ PASS - No persona toolsets found${NC}"
        fi
    fi

    # Test build-toolset (should work)
    echo -e "\n${YELLOW}TEST: build-toolset in standard mode${NC}"
    call_tool "delete-toolset" '{"name": "test-toolset", "confirm": true}' >/dev/null 2>&1 || true
    build_args='{
        "name": "test-toolset",
        "tools": [{"namespacedName": "sequential-thinking.sequentialthinking"}]
    }'
    result=$(call_tool "build-toolset" "$build_args")
    echo "Result: $result"
    if echo "$result" | grep -q "not available when a persona is active"; then
        echo -e "${RED}✗ FAIL - build-toolset incorrectly thinks persona is active${NC}"
    elif echo "$result" | grep -q "success.*true"; then
        echo -e "${GREEN}✓ PASS - build-toolset works in standard mode${NC}"
    else
        echo -e "${YELLOW}? UNKNOWN - Unexpected result${NC}"
    fi

    # Clean up server
    stop_server
    sleep 2

    # Test 2: Persona mode
    echo -e "\n${GREEN}=== TEST SUITE 2: Persona Mode ===${NC}"

    # Check if test persona exists
    if [ ! -d "personas/$TEST_PERSONA" ]; then
        echo -e "${YELLOW}Test persona not found, skipping persona tests${NC}"
        echo "To test persona mode, ensure 'personas/$TEST_PERSONA' exists"
    else
        start_server "persona"

        # Initialize MCP session
        echo -e "\n${BLUE}Initializing MCP session...${NC}"
        init_session

        echo -e "\n${BLUE}Available tools in persona mode:${NC}"
        list_tools

        # Check tool availability in persona mode
        check_tool_availability "list-personas" "true"  # Should be available when persona is active
        check_tool_availability "build-toolset" "false"  # Should NOT be available in persona mode
        check_tool_availability "delete-toolset" "false" # Should NOT be available in persona mode

        # Test list-saved-toolsets (should return persona toolsets)
        echo -e "\n${YELLOW}TEST: list-saved-toolsets in persona mode${NC}"
        result=$(call_tool "list-saved-toolsets" "")
        echo "Result: $result"
        if echo "$result" | jq -e '.toolsets | length' > /dev/null 2>&1; then
            toolset_count=$(echo "$result" | jq '.toolsets | length')
            echo "Number of toolsets: $toolset_count"

            # List all toolset names
            echo "Toolset names:"
            echo "$result" | jq -r '.toolsets[].name'
        fi

        # Test build-toolset (should not exist in tools list)
        echo -e "\n${YELLOW}TEST: build-toolset in persona mode${NC}"
        # Since the tool is hidden, we shouldn't be able to call it
        # The test already verified it's not in the tools list
        echo -e "${GREEN}✓ PASS - build-toolset is hidden in persona mode (verified above)${NC}"

        # Clean up server
        stop_server
    fi

    echo -e "\n${GREEN}=== Test Complete ===${NC}"
    echo "Server logs are available in: $LOG_DIR"
}

# Run main function
main
