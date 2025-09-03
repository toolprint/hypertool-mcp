#!/bin/bash

# Test persona mode tools behavior
set -e

PORT=3456
SERVER_URL="http://localhost:$PORT/mcp"
SERVER_PID=""
SESSION_ID=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
}

trap cleanup EXIT

# Start server in persona mode with debug
echo -e "${YELLOW}Starting server in persona mode with debug logging...${NC}"
dist/bin.js mcp run --persona test-persona --transport http --port $PORT --debug --log-level debug > persona-debug.log 2>&1 &
SERVER_PID=$!

# Wait for server
echo "Waiting for server to start..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s --max-time 1 "$SERVER_URL" > /dev/null 2>&1; then
        echo "Server is ready!"
        break
    fi
    sleep 1
    attempt=$((attempt + 1))
    if [ $((attempt % 5)) -eq 0 ]; then
        echo "Waiting... attempt $attempt/$max_attempts"
    fi
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}Server failed to start. Check persona-debug.log for details${NC}"
    tail -50 persona-debug.log
    exit 1
fi

# Initialize session
echo -e "${YELLOW}Initializing MCP session...${NC}"
response=$(curl -s -i --max-time 5 -X POST "$SERVER_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}')

SESSION_ID=$(echo "$response" | grep -i "^Mcp-Session-Id:" | cut -d' ' -f2 | tr -d '\r\n')
echo "Session ID: $SESSION_ID"

if [ -z "$SESSION_ID" ]; then
    echo -e "${RED}Failed to get session ID. Response:${NC}"
    echo "$response" | head -10
    exit 1
fi

# List tools
echo -e "${YELLOW}Listing tools...${NC}"
response=$(curl -s --max-time 5 -X POST "$SERVER_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')

# Extract tool names from SSE response
tool_names=$(echo "$response" | grep "^data:" | sed 's/^data: //' | jq -r '.result.tools[].name' 2>/dev/null || echo "Failed to parse")

echo "Available tools:"
echo "$tool_names"

# Check for restricted tools
echo -e "\n${YELLOW}Checking for restricted tools...${NC}"
if echo "$tool_names" | grep -q "^list-personas$"; then
    echo -e "${RED}✗ FAIL - list-personas should NOT be available in persona mode${NC}"
else
    echo -e "${GREEN}✓ PASS - list-personas is correctly hidden${NC}"
fi

if echo "$tool_names" | grep -q "^build-toolset$"; then
    echo -e "${RED}✗ FAIL - build-toolset should NOT be available in persona mode${NC}"
else
    echo -e "${GREEN}✓ PASS - build-toolset is correctly hidden${NC}"
fi

if echo "$tool_names" | grep -q "^delete-toolset$"; then
    echo -e "${RED}✗ FAIL - delete-toolset should NOT be available in persona mode${NC}"
else
    echo -e "${GREEN}✓ PASS - delete-toolset is correctly hidden${NC}"
fi

# Show relevant debug logs
echo -e "\n${YELLOW}Relevant debug logs:${NC}"
grep -E "(persona|Skipping|Including tool|active persona)" persona-debug.log | tail -20

cleanup