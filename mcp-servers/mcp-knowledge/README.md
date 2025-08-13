# MCP Knowledge Server

A unified MCP server providing Neo4j graph operations and Qdrant vector operations with shared embeddings model for consistency and efficiency.

## Features

- **Unified Embeddings**: Single model (nomic-ai/nomic-embed-text-v1.5) for both Neo4j and Qdrant
- **Neo4j Integration**: Graph database operations with vector search capabilities
- **Qdrant Integration**: High-performance vector similarity search
- **HTTP/SSE Transport**: Compatible with Tauri's HTTP-based MCP implementation
- **Docker-based**: Easy deployment and resource management

## Architecture

```
┌─────────────────┐     HTTP/SSE      ┌──────────────────────┐
│  Tauri Backend  │ ←───────────────→ │  MCP-Knowledge       │
│  (Rust + HTTP)  │                   │  Docker Container    │
└─────────────────┘                   │  (Python + MCP)      │
                                      │  - Single Model      │
                                      │  - Neo4j Tools       │
                                      │  - Qdrant Tools      │
                                      └──────┬───────────────┘
                                             │
                                      ┌──────┴────────┐
                                      │ Neo4j & Qdrant│
                                      │   Databases   │
                                      └───────────────┘
```

## Available Tools

### Neo4j Tools

- `neo4j_query` - Execute Cypher queries
- `neo4j_create_node` - Create nodes with automatic embeddings
- `neo4j_create_relationship` - Create relationships between nodes
- `neo4j_vector_search` - Search for similar nodes using vector similarity

### Qdrant Tools

- `embeddings_generate` - Generate embeddings for text
- `qdrant_create_collection` - Create vector collections
- `qdrant_upsert_points` - Insert/update vectors
- `qdrant_search` - Semantic similarity search
- `qdrant_get_collection_info` - Get collection metadata
- `qdrant_delete_points` - Delete vectors
- `embeddings_model_info` - Get model information

## Configuration

Environment variables:

- `NEO4J_URI` - Neo4j connection URI (default: bolt://neo4j:7687)
- `NEO4J_USER` - Neo4j username (default: neo4j)
- `NEO4J_PASSWORD` - Neo4j password
- `QDRANT_HOST` - Qdrant host (default: qdrant)
- `QDRANT_PORT` - Qdrant port (default: 6333)
- `EMBEDDING_MODEL` - Model for embeddings (default: nomic-ai/nomic-embed-text-v1.5)
- `MODEL_CACHE_DIR` - Directory for model cache (default: /app/models)
- `SERVER_PORT` - Server port (default: 8100)

## Running with Docker

The server is designed to run as part of the docker-compose setup:

```bash
# From the project root
docker-compose up mcp-knowledge
```

## Testing

### Unit Tests

```bash
cd mcp-servers/mcp-knowledge
python -m pytest tests/ -v
```

### Integration Tests

```bash
./test_integration.sh
```

## API Endpoints

- `POST /rpc` - JSON-RPC endpoint for MCP protocol
- `GET /sse` - Server-Sent Events for real-time communication
- `GET /health` - Health check endpoint

## Example Usage

### Create a node with embedding in Neo4j

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "neo4j_create_node",
    "arguments": {
      "labels": ["Document"],
      "properties": {
        "title": "Introduction to AI",
        "content": "Artificial Intelligence is..."
      },
      "create_embedding": true,
      "embedding_property": "embedding"
    }
  },
  "id": 1
}
```

### Search for similar documents

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "qdrant_search",
    "arguments": {
      "collection_name": "documents",
      "query_text": "machine learning algorithms",
      "limit": 5,
      "score_threshold": 0.7
    }
  },
  "id": 2
}
```

## Performance Considerations

1. **Model Loading**: First startup may take several minutes to download the embedding model
2. **Memory Usage**: Requires ~2GB RAM for the embedding model
3. **Batch Processing**: Use batch operations when processing multiple texts
4. **Caching**: Model is cached to speed up container restarts

## Troubleshooting

### Container won't start
- Check Docker logs: `docker-compose logs mcp-knowledge`
- Verify Neo4j and Qdrant are healthy: `docker-compose ps`
- Ensure port 8100 is available

### Connection errors
- Verify services are on the same Docker network
- Check environment variables are set correctly
- Test health endpoint: `curl http://localhost:8100/health`

### Out of memory
- Increase Docker memory allocation
- Consider using a smaller embedding model
- Enable swap if necessary