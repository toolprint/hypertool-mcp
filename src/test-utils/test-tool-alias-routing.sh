#!/bin/bash

set -euo pipefail

PORT=3460
SERVER_URL="http://localhost:$PORT/mcp"
LOG_DIR="src/test-utils/logs"
LOG_FILE=""
SESSION_ID=""
SERVER_PID=""
TEMP_CONFIG=""

mkdir -p "$LOG_DIR"

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$TEMP_CONFIG" ] && [ -f "$TEMP_CONFIG" ]; then
    rm -f "$TEMP_CONFIG"
  fi
}

trap cleanup EXIT

create_temp_config() {
  TEMP_CONFIG=$(mktemp)
  cat >"$TEMP_CONFIG" <<'JSON'
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
    "sequential-thinking": {
      "type": "stdio",
      "command": "node",
      "args": ["./test/stub-servers/mcp-stub.mjs"],
      "env": {
        "STUB_SERVER_NAME": "sequential-thinking"
      }
    }
  }
}
JSON
}

wait_for_server() {
  local attempts=0
  local max_attempts=30
  while [ $attempts -lt $max_attempts ]; do
    if curl -s "$SERVER_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempts=$((attempts + 1))
  done
  echo "Server failed to start" >&2
  return 1
}

start_server() {
  LOG_FILE="$LOG_DIR/test-tool-alias-routing.log"
  dist/bin.js mcp run --mcp-config "$TEMP_CONFIG" --transport http --port "$PORT" --debug --log-level debug >"$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  wait_for_server
}

init_session() {
  local response_file="/tmp/mcp-init-$$"
  curl -s -i -X POST "$SERVER_URL" \
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
          "name": "tool-alias-test",
          "version": "1.0.0"
        }
      }
    }' >"$response_file"

  SESSION_ID=$(grep -i "^Mcp-Session-Id:" "$response_file" | cut -d' ' -f2 | tr -d '\r\n' || true)
  rm -f "$response_file"

  if [ -z "$SESSION_ID" ]; then
    echo "Failed to obtain MCP session id" >&2
    exit 1
  fi
}

build_request() {
  local tool_name="$1"
  local args_json="${2:-}"

  if [ -n "$args_json" ]; then
    jq -n --arg name "$tool_name" --argjson args "$args_json" '{
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: $name,
        arguments: $args
      }
    }'
  else
    jq -n --arg name "$tool_name" '{
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: $name
      }
    }'
  fi
}

call_tool() {
  local tool_name="$1"
  local args_json="${2:-}"
  local request=$(build_request "$tool_name" "$args_json")

  local response=$(curl -s -X POST "$SERVER_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d "$request")

  if echo "$response" | grep -q "^event:"; then
    echo "$response" | grep "^data:" | sed 's/^data: //' | jq -r '.result'
  else
    echo "$response" | jq -r '.result'
  fi
}

list_tools() {
  local request='{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

  local response=$(curl -s -X POST "$SERVER_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d "$request")

  if echo "$response" | grep -q "^event:"; then
    echo "$response" | grep "^data:" | sed 's/^data: //' | jq -r '.result.tools[].name'
  else
    echo "$response" | jq -r '.result.tools[].name'
  fi
}

main() {
  npm run build >/dev/null 2>&1
  create_temp_config
  start_server
  init_session

  local build_payload='{
    "name": "alias-suite",
    "tools": [
      {"namespacedName": "everything.echo", "alias": "echo_alias"},
      {"namespacedName": "everything.add"}
    ],
    "autoEquip": true
  }'

  local build_result=$(call_tool "build-toolset" "$build_payload")
  echo "$build_result" | jq '.meta.success' | grep -q true

  call_tool "exit-configuration-mode" "{}" >/dev/null 2>&1 || true

  local tools=$(list_tools)
  echo "$tools" | grep -q '^echo_alias$'
  echo "$tools" | grep -q '^everything_add$'

  local alias_result=$(call_tool "echo_alias" '{"text": "alias success"}')
  echo "$alias_result" | jq -r '.content[0].text' | grep -q 'alias success'

  local canonical_result=$(call_tool "everything_add" '{"a": 2, "b": 3}')
  echo "$canonical_result" | jq -r '.content[0].text' | grep -q '^5$'

  local available=$(call_tool "list-available-tools" "{}")
  echo "$available" | jq '.toolsByServer[] | select(.serverName=="everything") | .tools[] | select(.namespacedName=="everything.echo").alias' | grep -q '"echo_alias"'
}

main
