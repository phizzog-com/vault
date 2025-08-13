#!/bin/bash
# Integration test script for MCP Knowledge Server

set -e

echo "MCP Knowledge Server Integration Tests"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SERVER_URL="http://localhost:8100"
MAX_WAIT=60
WAIT_INTERVAL=2

# Function to print colored output
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        exit 1
    fi
}

# Function to make RPC call
rpc_call() {
    local method=$1
    local params=$2
    local id=${3:-1}
    
    curl -s -X POST $SERVER_URL/rpc \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":$params,\"id\":$id}"
}

# Function to check if server is healthy
check_health() {
    curl -s $SERVER_URL/health | jq -r '.status' 2>/dev/null || echo "error"
}

echo "1. Waiting for server to be healthy..."
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
    health=$(check_health)
    if [ "$health" = "healthy" ]; then
        print_status 0 "Server is healthy"
        break
    fi
    echo -e "${YELLOW}...${NC} Server status: $health (waited ${elapsed}s)"
    sleep $WAIT_INTERVAL
    elapsed=$((elapsed + WAIT_INTERVAL))
done

if [ "$health" != "healthy" ]; then
    print_status 1 "Server failed to become healthy after ${MAX_WAIT}s"
fi

echo ""
echo "2. Testing RPC endpoints..."

# Test initialize
echo -n "   Testing initialize... "
response=$(rpc_call "initialize" "{\"capabilities\":{}}")
if echo "$response" | jq -e '.result.capabilities' > /dev/null 2>&1; then
    print_status 0 "Initialize successful"
else
    print_status 1 "Initialize failed: $response"
fi

# Test tools/list
echo -n "   Testing tools/list... "
response=$(rpc_call "tools/list" "{}")
tool_count=$(echo "$response" | jq '.result.tools | length' 2>/dev/null || echo "0")
if [ "$tool_count" -gt 0 ]; then
    print_status 0 "Found $tool_count tools"
else
    print_status 1 "No tools found: $response"
fi

echo ""
echo "3. Testing embeddings tools..."

# Test embeddings model info
echo -n "   Testing embeddings_model_info... "
response=$(rpc_call "tools/call" "{\"name\":\"embeddings_model_info\",\"arguments\":{}}" 3)
if echo "$response" | jq -e '.result.model_name' > /dev/null 2>&1; then
    model_name=$(echo "$response" | jq -r '.result.model_name')
    dim=$(echo "$response" | jq -r '.result.embedding_dimension')
    print_status 0 "Model: $model_name (${dim}d)"
else
    print_status 1 "Model info failed: $response"
fi

# Test single embedding generation
echo -n "   Testing single embedding generation... "
response=$(rpc_call "tools/call" "{\"name\":\"embeddings_generate\",\"arguments\":{\"text\":\"test embedding\"}}" 4)
if echo "$response" | jq -e '.result.embedding' > /dev/null 2>&1; then
    embedding_size=$(echo "$response" | jq '.result.embedding | length')
    print_status 0 "Generated embedding with $embedding_size dimensions"
else
    print_status 1 "Embedding generation failed: $response"
fi

# Test batch embedding generation
echo -n "   Testing batch embedding generation... "
response=$(rpc_call "tools/call" "{\"name\":\"embeddings_generate\",\"arguments\":{\"texts\":[\"text 1\",\"text 2\",\"text 3\"]}}" 5)
if echo "$response" | jq -e '.result.embeddings' > /dev/null 2>&1; then
    batch_size=$(echo "$response" | jq '.result.embeddings | length')
    print_status 0 "Generated $batch_size embeddings"
else
    print_status 1 "Batch embedding generation failed: $response"
fi

echo ""
echo "4. Testing Neo4j tools..."

# Create a test node
echo -n "   Creating test node with embedding... "
response=$(rpc_call "tools/call" "{\"name\":\"neo4j_create_node\",\"arguments\":{\"labels\":[\"TestDocument\"],\"properties\":{\"title\":\"Test Document\",\"content\":\"This is a test document for integration testing.\"},\"create_embedding\":true,\"embedding_property\":\"embedding\"}}" 6)
if echo "$response" | jq -e '.result.success' > /dev/null 2>&1 && [ "$(echo "$response" | jq -r '.result.success')" = "true" ]; then
    node_id=$(echo "$response" | jq -r '.result.node.id')
    print_status 0 "Created node with ID: $node_id"
else
    print_status 1 "Node creation failed: $response"
fi

# Query nodes
echo -n "   Querying nodes... "
response=$(rpc_call "tools/call" "{\"name\":\"neo4j_query\",\"arguments\":{\"query\":\"MATCH (n:TestDocument) RETURN count(n) as count\"}}" 7)
if echo "$response" | jq -e '.result.data[0].count' > /dev/null 2>&1; then
    count=$(echo "$response" | jq -r '.result.data[0].count')
    print_status 0 "Found $count TestDocument nodes"
else
    print_status 1 "Query failed: $response"
fi

# Vector search
echo -n "   Testing vector search... "
response=$(rpc_call "tools/call" "{\"name\":\"neo4j_vector_search\",\"arguments\":{\"query_text\":\"integration testing\",\"label\":\"TestDocument\",\"embedding_property\":\"embedding\",\"limit\":5}}" 8)
if echo "$response" | jq -e '.result.results' > /dev/null 2>&1; then
    result_count=$(echo "$response" | jq '.result.results | length')
    print_status 0 "Found $result_count similar nodes"
else
    print_status 1 "Vector search failed: $response"
fi

echo ""
echo "5. Testing Qdrant tools..."

# Create collection
collection_name="test_collection_$(date +%s)"
echo -n "   Creating collection '$collection_name'... "
response=$(rpc_call "tools/call" "{\"name\":\"qdrant_create_collection\",\"arguments\":{\"collection_name\":\"$collection_name\",\"vector_size\":768,\"distance\":\"Cosine\"}}" 9)
if echo "$response" | jq -e '.result.success' > /dev/null 2>&1 && [ "$(echo "$response" | jq -r '.result.success')" = "true" ]; then
    print_status 0 "Collection created"
else
    print_status 1 "Collection creation failed: $response"
fi

# Upsert points
echo -n "   Upserting test points... "
response=$(rpc_call "tools/call" "{\"name\":\"qdrant_upsert_points\",\"arguments\":{\"collection_name\":\"$collection_name\",\"points\":[{\"id\":\"1\",\"text\":\"Python programming language\",\"payload\":{\"language\":\"Python\"}},{\"id\":\"2\",\"text\":\"JavaScript for web development\",\"payload\":{\"language\":\"JavaScript\"}}]}}" 10)
if echo "$response" | jq -e '.result.count' > /dev/null 2>&1; then
    count=$(echo "$response" | jq -r '.result.count')
    print_status 0 "Upserted $count points"
else
    print_status 1 "Point upsert failed: $response"
fi

# Search points
echo -n "   Searching for similar points... "
response=$(rpc_call "tools/call" "{\"name\":\"qdrant_search\",\"arguments\":{\"collection_name\":\"$collection_name\",\"query_text\":\"web programming\",\"limit\":5}}" 11)
if echo "$response" | jq -e '.result.results' > /dev/null 2>&1; then
    result_count=$(echo "$response" | jq '.result.results | length')
    print_status 0 "Found $result_count similar points"
else
    print_status 1 "Search failed: $response"
fi

# Get collection info
echo -n "   Getting collection info... "
response=$(rpc_call "tools/call" "{\"name\":\"qdrant_get_collection_info\",\"arguments\":{\"collection_name\":\"$collection_name\"}}" 12)
if echo "$response" | jq -e '.result.points_count' > /dev/null 2>&1; then
    points=$(echo "$response" | jq -r '.result.points_count')
    print_status 0 "Collection has $points points"
else
    print_status 1 "Get collection info failed: $response"
fi

echo ""
echo "6. Testing error handling..."

# Test invalid tool
echo -n "   Testing invalid tool name... "
response=$(rpc_call "tools/call" "{\"name\":\"invalid_tool\",\"arguments\":{}}" 13)
if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
    print_status 0 "Error handling works"
else
    print_status 1 "Expected error but got: $response"
fi

# Test missing parameters
echo -n "   Testing missing required parameters... "
response=$(rpc_call "tools/call" "{\"name\":\"neo4j_query\",\"arguments\":{}}" 14)
if echo "$response" | jq -e '.result.success' > /dev/null 2>&1 && [ "$(echo "$response" | jq -r '.result.success')" = "false" ]; then
    print_status 0 "Parameter validation works"
else
    print_status 1 "Expected validation error but got: $response"
fi

echo ""
echo "7. Testing SSE endpoint..."
echo -n "   Testing SSE connection... "
# Use timeout to limit the curl execution time
timeout 5 curl -s -N -H "Accept: text/event-stream" $SERVER_URL/sse > /tmp/sse_test.log 2>&1 &
SSE_PID=$!
sleep 2
if ps -p $SSE_PID > /dev/null 2>&1; then
    kill $SSE_PID 2>/dev/null
    print_status 0 "SSE endpoint is responsive"
else
    print_status 1 "SSE endpoint failed"
fi

echo ""
echo "====================================="
echo -e "${GREEN}All integration tests passed!${NC}"
echo ""

# Cleanup note
echo "Note: Test data remains in the databases for manual inspection."
echo "To clean up test data, run:"
echo "  - Neo4j: MATCH (n:TestDocument) DETACH DELETE n"
echo "  - Qdrant: Delete collection '$collection_name'"