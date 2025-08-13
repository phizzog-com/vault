# Docker-based MCP Servers

This document describes the Docker-based MCP servers that provide advanced ML capabilities for Gaimplan.

## Overview

As part of Phase 3.2 of the Hybrid MCP Architecture, we're implementing a unified Docker-based MCP server that provides both graph and vector operations:

**MCP-Knowledge Server (Docker)** - Unified container handling Neo4j graph operations and Qdrant vector operations with a single embedding model for consistency and efficiency

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

## Service

### MCP-Knowledge Server (Port 8100)

Provides unified graph and vector operations with consistent embeddings:

**Neo4j Tools:**
- `neo4j_query` - Execute Cypher queries
- `neo4j_create_node` - Create nodes with automatic embeddings
- `neo4j_create_relationship` - Create relationships between nodes
- `neo4j_vector_search` - Search for similar nodes using vector similarity

**Qdrant Tools:**
- `embeddings_generate` - Generate embeddings for text
- `qdrant_create_collection` - Create vector collections
- `qdrant_upsert_points` - Insert/update vectors
- `qdrant_search` - Semantic similarity search
- `qdrant_get_collection_info` - Get collection metadata
- `qdrant_delete_points` - Delete vectors
- `embeddings_model_info` - Get model information

**Key Features:**
- Single embedding model: nomic-ai/nomic-embed-text-v1.5 (768 dimensions)
- Consistent vector space across Neo4j and Qdrant
- Reduced memory usage (one model loaded)
- Batch embedding generation
- Unified error handling and logging

## Setup Instructions

### 1. Prerequisites

- Docker and Docker Compose installed
- Neo4j and Qdrant containers running (via `docker-compose up`)
- Python 3.11+ (handled by Docker)

### 2. Build and Start Services

```bash
# Build and start all services
docker-compose up -d

# Or start the knowledge service
docker-compose up -d mcp-knowledge

# Check service status
docker-compose ps

# View logs
docker-compose logs -f mcp-knowledge
```

### 3. Enable in Gaimplan

1. Open Gaimplan
2. Go to MCP Settings (gear icon)
3. Enable "Knowledge Service (Docker)"
4. The server will automatically connect via HTTP and provide both Neo4j and Qdrant operations

### 4. Verify Setup

```bash
# Run integration tests
./mcp-servers/test-docker-mcp.sh

# Test unified server
./mcp-servers/mcp-knowledge/test_integration.sh
```

## Configuration

### Environment Variables

**MCP-Knowledge Server:**
- `NEO4J_URI` - Neo4j connection URI (default: bolt://neo4j:7687)
- `NEO4J_USER` - Neo4j username (default: neo4j)
- `NEO4J_PASSWORD` - Neo4j password
- `QDRANT_HOST` - Qdrant host (default: qdrant)
- `QDRANT_PORT` - Qdrant port (default: 6333)
- `EMBEDDING_MODEL` - Unified model for all embeddings (default: nomic-ai/nomic-embed-text-v1.5)

### Docker Compose Configuration

The unified service is configured in `docker-compose.yml`:

```yaml
mcp-knowledge:
  build: ./mcp-servers/mcp-knowledge
  ports:
    - "8100:8100"
  environment:
    - NEO4J_URI=bolt://neo4j:7687
    - NEO4J_USER=neo4j
    - NEO4J_PASSWORD=GaimplanKnowledgeGraph2025
    - QDRANT_HOST=qdrant
    - QDRANT_PORT=6333
    - EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
  depends_on:
    neo4j:
      condition: service_healthy
    qdrant:
      condition: service_healthy
  volumes:
    - ./models:/app/models  # Shared model cache
```

## Development

### Running Tests

```bash
# Unit tests
cd mcp-servers/mcp-knowledge
python -m pytest test_server.py -v

# Integration tests
./test_integration.sh
```

### Debugging

1. Check container logs:
   ```bash
   docker-compose logs -f mcp-knowledge
   ```

2. Test HTTP endpoints directly:
   ```bash
   # Health check
   curl http://localhost:8100/health
   
   # List tools
   curl -X POST http://localhost:8100/rpc \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
   ```

3. Enter container for debugging:
   ```bash
   docker-compose exec mcp-knowledge /bin/bash
   ```

## Performance Considerations

1. **First Start**: Initial model download may take several minutes
2. **Memory Usage**: Single container requires ~2GB RAM for the unified ML model
3. **CPU Usage**: Embedding generation is CPU-intensive
4. **Caching**: Model is cached in container and shared volume for faster restarts
5. **Efficiency**: Single model serving both Neo4j and Qdrant reduces memory by ~50%

## Troubleshooting

### Container Won't Start

1. Check Docker is running: `docker info`
2. Check port availability: `lsof -i :8100`
3. Clean rebuild: `docker-compose build --no-cache`

### Connection Errors

1. Verify services are healthy: `docker-compose ps`
2. Check network connectivity: `docker network ls`
3. Ensure Tauri can reach containers: `curl http://localhost:8100/health`

### Performance Issues

1. Allocate more Docker resources
2. Use smaller embedding models
3. Enable GPU support (if available)

## Future Enhancements

1. GPU acceleration for embedding generation
2. Support for more embedding models
3. Batch processing optimizations
4. Model fine-tuning capabilities
5. Distributed processing support