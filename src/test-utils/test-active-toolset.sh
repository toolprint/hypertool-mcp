#!/bin/bash

PORT=3458
SESSION_ID=""

# Start server in background
dist/bin.js mcp run --mcp-config mcp.test.json --transport http --port $PORT > /tmp/test-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Initialize session
INIT_RESPONSE=$(curl -s -X POST "http://localhost:$PORT/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream, application/json" \
  -d '{
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
  }')

# Extract session ID from headers (parse from response)
SESSION_ID=$(echo "$INIT_RESPONSE" | grep -i "mcp-session-id" | cut -d: -f2 | tr -d ' \r')

# If SESSION_ID not in response body, extract from headers
if [ -z "$SESSION_ID" ]; then
  SESSION_ID=$(curl -i -s -X POST "http://localhost:$PORT/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    -d '{
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
    }' | grep -i "^mcp-session-id:" | cut -d: -f2 | tr -d ' \r')
fi

echo "Session ID: $SESSION_ID"

# Call get-active-toolset
echo "Calling get-active-toolset..."
curl -s -X POST "http://localhost:$PORT/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream, application/json" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get-active-toolset",
      "arguments": {}
    }
  }' | grep "^data:" | cut -d: -f2- | jq .

# Kill server
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
