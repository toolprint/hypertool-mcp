#!/bin/bash

# Test persona toolset activation and tool routing
set -e

PORT=3458
SERVER_URL="http://localhost:$PORT/mcp"
SERVER_PID=""
SESSION_ID=""
PERSONA_YAML="test/fixtures/personas/test-persona/persona.yaml"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cleanup() {
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
}

trap cleanup EXIT

# Function to parse tool IDs from persona.yaml for a given toolset
get_toolset_tools() {
    local toolset_name="$1"
    local in_toolset=false
    local in_toolids=false
    local tools=""
    
    while IFS= read -r line; do
        # Check if we're entering a toolset definition
        if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*name:[[:space:]]*${toolset_name}$ ]]; then
            in_toolset=true
            continue
        fi
        
        # If we're in the right toolset and find toolIds
        if [ "$in_toolset" = true ] && [[ "$line" =~ ^[[:space:]]*toolIds: ]]; then
            in_toolids=true
            continue
        fi
        
        # If we're reading tool IDs
        if [ "$in_toolids" = true ]; then
            # Check if we've hit the next toolset or section
            if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*name: ]] || [[ "$line" =~ ^[a-zA-Z] ]]; then
                break
            fi
            
            # Extract tool ID
            if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*(.+)$ ]]; then
                local tool_id="${BASH_REMATCH[1]}"
                # Convert tool ID format (e.g., everything.echo -> echo)
                local tool_name="${tool_id#*.}"
                tools="$tools $tool_name"
            fi
        fi
    done < "$PERSONA_YAML"
    
    echo "$tools"
}

# Function to check if a tool exists in the response
check_tool_exists() {
    local tool_name="$1"
    local tool_list="$2"
    
    if echo "$tool_list" | grep -q "^${tool_name}$"; then
        return 0
    else
        return 1
    fi
}

echo -e "${YELLOW}=== Persona Toolset Activation Test ===${NC}"
echo -e "${BLUE}Testing that PersonaManager.getMcpTools() properly routes tools when persona toolsets are activated${NC}"
echo -e "${BLUE}Reading expected tools from: $PERSONA_YAML${NC}\n"

# Verify persona.yaml exists
if [ ! -f "$PERSONA_YAML" ]; then
    echo -e "${RED}✗ Persona YAML file not found: $PERSONA_YAML${NC}"
    exit 1
fi

# Start server in persona mode with debug and default toolset
echo -e "${YELLOW}1. Starting server in persona mode (test-persona) with default toolset (utility-tools)...${NC}"
dist/bin.js mcp run --persona test-persona --equip-toolset utility-tools --transport http --port $PORT --debug --log-level debug > persona-toolset-test.log 2>&1 &
SERVER_PID=$!

# Wait for server
echo "   Waiting for server to start..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s --max-time 1 "$SERVER_URL" > /dev/null 2>&1; then
        echo -e "   ${GREEN}✓ Server is ready!${NC}"
        break
    fi
    sleep 1
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}✗ Server failed to start${NC}"
    tail -50 persona-toolset-test.log
    exit 1
fi

# Initialize session
echo -e "\n${YELLOW}2. Initializing MCP session...${NC}"
response=$(curl -s -i --max-time 5 -X POST "$SERVER_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream, application/json" \
    -d '{
        "jsonrpc":"2.0",
        "id":1,
        "method":"initialize",
        "params":{
            "protocolVersion":"2025-06-18",
            "capabilities":{},
            "clientInfo":{"name":"test","version":"1.0.0"}
        }
    }')

SESSION_ID=$(echo "$response" | grep -i "^Mcp-Session-Id:" | cut -d' ' -f2 | tr -d '\r\n')
echo "   Session ID: $SESSION_ID"

if [ -z "$SESSION_ID" ]; then
    echo -e "${RED}✗ Failed to get session ID${NC}"
    exit 1
fi

# Test function for a specific toolset
test_toolset() {
    local toolset_name="$1"
    local equip_name="$2"
    
    echo -e "\n${YELLOW}Testing toolset: ${toolset_name}${NC}"
    
    # Get expected tools from YAML
    local expected_tools=$(get_toolset_tools "$toolset_name")
    local expected_count=$(echo $expected_tools | wc -w | tr -d ' ')
    
    echo "   Expected tools from YAML ($expected_count tools):"
    for tool in $expected_tools; do
        echo "   - $tool"
    done
    
    # Equip the toolset if not default
    if [ ! -z "$equip_name" ]; then
        echo -e "\n   ${BLUE}Equipping toolset: $equip_name${NC}"
        response=$(curl -s --max-time 5 -X POST "$SERVER_URL" \
            -H "Content-Type: application/json" \
            -H "Accept: text/event-stream, application/json" \
            -H "Mcp-Session-Id: $SESSION_ID" \
            -d "{
                \"jsonrpc\":\"2.0\",
                \"id\":1,
                \"method\":\"tools/call\",
                \"params\":{
                    \"name\":\"equip-toolset\",
                    \"arguments\":{\"name\":\"$equip_name\"}
                }
            }")
        
        success=$(echo "$response" | grep "^data:" | sed 's/^data: //' | jq -r '.result.content[0].text' 2>/dev/null | grep -i "success" || echo "")
        if [ ! -z "$success" ]; then
            echo -e "   ${GREEN}✓ Successfully equipped $equip_name${NC}"
        else
            echo -e "   ${RED}✗ Failed to equip $equip_name${NC}"
            echo "$response" | grep "^data:" | sed 's/^data: //' | jq '.result.content[0].text' -r 2>/dev/null
            return 1
        fi
    fi
    
    # Get actual tools from server
    echo -e "\n   ${BLUE}Fetching tools from server...${NC}"
    response=$(curl -s --max-time 5 -X POST "$SERVER_URL" \
        -H "Content-Type: application/json" \
        -H "Accept: text/event-stream, application/json" \
        -H "Mcp-Session-Id: $SESSION_ID" \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
    
    # Extract MCP tools (excluding config tools)
    local tool_names=$(echo "$response" | grep "^data:" | sed 's/^data: //' | jq -r '.result.tools[].name' 2>/dev/null || echo "Failed to parse")
    
    # Filter out configuration tools
    local mcp_tools=$(echo "$tool_names" | grep -v -E "^(list-available-tools|list-saved-toolsets|equip-toolset|unequip-toolset|get-active-toolset|add-tool-annotation|list-personas|enter-configuration-mode|exit-configuration-mode)$")
    
    local actual_count=$(echo "$mcp_tools" | grep -v "^$" | wc -l | tr -d ' ')
    
    echo "   Actual MCP tools from server ($actual_count tools):"
    echo "$mcp_tools" | grep -v "^$" | while read tool; do
        echo "   - $tool"
    done
    
    # Verify each expected tool
    echo -e "\n   ${BLUE}Verifying expected tools...${NC}"
    local all_found=true
    for expected_tool in $expected_tools; do
        if check_tool_exists "$expected_tool" "$mcp_tools"; then
            echo -e "   ${GREEN}✓ Found: $expected_tool${NC}"
        else
            echo -e "   ${RED}✗ Missing: $expected_tool${NC}"
            all_found=false
        fi
    done
    
    # Check for unexpected tools (tools that shouldn't be in this toolset)
    echo -e "\n   ${BLUE}Checking for unexpected tools...${NC}"
    local has_unexpected=false
    echo "$mcp_tools" | grep -v "^$" | while read actual_tool; do
        if ! echo "$expected_tools" | grep -q "\b$actual_tool\b"; then
            echo -e "   ${YELLOW}⚠ Unexpected tool found: $actual_tool${NC}"
            has_unexpected=true
        fi
    done
    
    if [ "$all_found" = true ] && [ "$has_unexpected" = false ]; then
        echo -e "\n   ${GREEN}✅ PASS: Toolset '$toolset_name' has exactly the expected tools${NC}"
        return 0
    else
        echo -e "\n   ${RED}❌ FAIL: Toolset '$toolset_name' tool mismatch${NC}"
        return 1
    fi
}

# Test 1: Default toolset (utility-tools)
echo -e "\n${YELLOW}=== Test 1: Default Toolset (utility-tools) ===${NC}"
echo "The default toolset should be active on startup"
test_toolset "utility-tools" ""
test1_result=$?

# Test 2: Documentation toolset
echo -e "\n${YELLOW}=== Test 2: Documentation Toolset ===${NC}"
test_toolset "documentation" "documentation"
test2_result=$?

# Test 3: All-tools toolset
echo -e "\n${YELLOW}=== Test 3: All-Tools Toolset ===${NC}"
test_toolset "all-tools" "all-tools"
test3_result=$?

# Test 4: Switch back to utility-tools
echo -e "\n${YELLOW}=== Test 4: Switch Back to Utility-Tools ===${NC}"
test_toolset "utility-tools" "utility-tools"
test4_result=$?

# Verify PersonaManager is being used (check logs)
echo -e "\n${YELLOW}=== Verifying PersonaManager.getMcpTools() Usage ===${NC}"
if grep -q "Normal mode: got .* tools from persona manager" persona-toolset-test.log; then
    echo -e "${GREEN}✓ PersonaManager.getMcpTools() is being called${NC}"
    echo "  Recent calls:"
    grep "Normal mode: got .* tools from persona manager" persona-toolset-test.log | tail -5 | sed 's/^/   /'
else
    echo -e "${RED}✗ PersonaManager.getMcpTools() NOT detected in logs${NC}"
    echo "  Checking for alternative routing:"
    grep "Normal mode: got .* tools from" persona-toolset-test.log | tail -5 | sed 's/^/   /' || echo "   No tool routing logs found"
fi

# Summary
echo -e "\n${YELLOW}=== Test Summary ===${NC}"
total_tests=4
passed_tests=0

[ $test1_result -eq 0 ] && passed_tests=$((passed_tests + 1))
[ $test2_result -eq 0 ] && passed_tests=$((passed_tests + 1))
[ $test3_result -eq 0 ] && passed_tests=$((passed_tests + 1))
[ $test4_result -eq 0 ] && passed_tests=$((passed_tests + 1))

if [ $passed_tests -eq $total_tests ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED ($passed_tests/$total_tests)${NC}"
    echo -e "${BLUE}PersonaManager tool routing is working correctly!${NC}"
else
    echo -e "${RED}❌ SOME TESTS FAILED ($passed_tests/$total_tests passed)${NC}"
    echo -e "${YELLOW}Check the output above for details${NC}"
fi

cleanup
exit $((total_tests - passed_tests))