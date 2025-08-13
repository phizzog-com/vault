"""Integration tests for MCP Knowledge Server."""

import pytest
import asyncio
import aiohttp
import json
import time
from typing import Dict, Any

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestIntegration:
    """Integration tests for the complete MCP Knowledge Server."""
    
    @pytest.fixture
    def server_url(self):
        """Base URL for the server."""
        return "http://localhost:8100"
    
    @pytest.fixture
    async def http_session(self):
        """Create an HTTP session for testing."""
        async with aiohttp.ClientSession() as session:
            yield session

    async def wait_for_server(self, session: aiohttp.ClientSession, server_url: str, timeout: int = 30):
        """Wait for server to be ready."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                async with session.get(f"{server_url}/health") as resp:
                    if resp.status == 200:
                        return True
            except aiohttp.ClientError:
                pass
            await asyncio.sleep(1)
        return False

    async def rpc_call(self, session: aiohttp.ClientSession, server_url: str, 
                      method: str, params: Dict[str, Any] = None, id: int = 1) -> Dict[str, Any]:
        """Make an RPC call to the server."""
        request_data = {
            "jsonrpc": "2.0",
            "method": method,
            "id": id
        }
        if params:
            request_data["params"] = params
        
        async with session.post(
            f"{server_url}/rpc",
            json=request_data,
            headers={"Content-Type": "application/json"}
        ) as resp:
            return await resp.json()

    @pytest.mark.integration
    async def test_server_health(self, http_session, server_url):
        """Test server health endpoint."""
        # Wait for server to be ready
        assert await self.wait_for_server(http_session, server_url), "Server failed to start"
        
        # Check health
        async with http_session.get(f"{server_url}/health") as resp:
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "healthy"
            assert all(service == "connected" for service in data["services"].values())

    @pytest.mark.integration
    async def test_full_workflow_neo4j(self, http_session, server_url):
        """Test complete Neo4j workflow: create nodes, relationships, and search."""
        # Wait for server
        assert await self.wait_for_server(http_session, server_url), "Server failed to start"
        
        # 1. Create first node with embedding
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "neo4j_create_node",
            "arguments": {
                "labels": ["Document"],
                "properties": {
                    "title": "Introduction to Machine Learning",
                    "content": "Machine learning is a subset of artificial intelligence that enables systems to learn from data.",
                    "type": "article"
                },
                "create_embedding": True,
                "embedding_property": "embedding"
            }
        })
        
        assert "result" in result
        assert result["result"]["success"] is True
        node1_id = result["result"]["node"]["id"]
        
        # 2. Create second node with embedding
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "neo4j_create_node",
            "arguments": {
                "labels": ["Document"],
                "properties": {
                    "title": "Deep Learning Fundamentals",
                    "content": "Deep learning uses neural networks with multiple layers to learn complex patterns in data.",
                    "type": "article"
                },
                "create_embedding": True,
                "embedding_property": "embedding"
            }
        }, id=2)
        
        assert result["result"]["success"] is True
        node2_id = result["result"]["node"]["id"]
        
        # 3. Create relationship between nodes
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "neo4j_create_relationship",
            "arguments": {
                "start_node_id": node1_id,
                "end_node_id": node2_id,
                "relationship_type": "RELATED_TO",
                "properties": {"weight": 0.8}
            }
        }, id=3)
        
        assert result["result"]["success"] is True
        
        # 4. Search for similar nodes
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "neo4j_vector_search",
            "arguments": {
                "query_text": "neural networks and AI",
                "label": "Document",
                "embedding_property": "embedding",
                "limit": 5,
                "min_similarity": 0.5
            }
        }, id=4)
        
        assert result["result"]["success"] is True
        assert len(result["result"]["results"]) > 0
        # Deep learning node should have higher similarity
        
        # 5. Query using Cypher
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "neo4j_query",
            "arguments": {
                "query": "MATCH (d:Document) RETURN d.title as title, d.type as type ORDER BY d.title",
                "parameters": {}
            }
        }, id=5)
        
        assert result["result"]["success"] is True
        assert len(result["result"]["data"]) >= 2

    @pytest.mark.integration
    async def test_full_workflow_qdrant(self, http_session, server_url):
        """Test complete Qdrant workflow: create collection, add vectors, and search."""
        # Wait for server
        assert await self.wait_for_server(http_session, server_url), "Server failed to start"
        
        # 1. Get embedding model info
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "embeddings_model_info",
            "arguments": {}
        })
        
        assert result["result"]["success"] is True
        embedding_dim = result["result"]["embedding_dimension"]
        
        # 2. Create collection
        collection_name = f"test_collection_{int(time.time())}"
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "qdrant_create_collection",
            "arguments": {
                "collection_name": collection_name,
                "vector_size": embedding_dim,
                "distance": "Cosine"
            }
        }, id=2)
        
        assert result["result"]["success"] is True
        
        # 3. Generate embeddings for texts
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "embeddings_generate",
            "arguments": {
                "texts": [
                    "Python is a versatile programming language",
                    "JavaScript is used for web development",
                    "Rust provides memory safety and performance"
                ]
            }
        }, id=3)
        
        assert result["result"]["success"] is True
        embeddings = result["result"]["embeddings"]
        
        # 4. Upsert points with embeddings
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "qdrant_upsert_points",
            "arguments": {
                "collection_name": collection_name,
                "points": [
                    {
                        "id": "1",
                        "text": "Python is a versatile programming language",
                        "payload": {"language": "Python", "type": "general"}
                    },
                    {
                        "id": "2",
                        "text": "JavaScript is used for web development",
                        "payload": {"language": "JavaScript", "type": "web"}
                    },
                    {
                        "id": "3",
                        "text": "Rust provides memory safety and performance",
                        "payload": {"language": "Rust", "type": "systems"}
                    }
                ]
            }
        }, id=4)
        
        assert result["result"]["success"] is True
        assert result["result"]["count"] == 3
        
        # 5. Search for similar vectors
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "qdrant_search",
            "arguments": {
                "collection_name": collection_name,
                "query_text": "web programming languages",
                "limit": 3,
                "score_threshold": 0.5
            }
        }, id=5)
        
        assert result["result"]["success"] is True
        assert len(result["result"]["results"]) > 0
        # JavaScript should be among top results
        
        # 6. Search with filter
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "qdrant_search",
            "arguments": {
                "collection_name": collection_name,
                "query_text": "programming",
                "filter": {
                    "must": [
                        {"key": "type", "match": {"value": "systems"}}
                    ]
                },
                "limit": 3
            }
        }, id=6)
        
        assert result["result"]["success"] is True
        # Should only return Rust due to filter
        
        # 7. Get collection info
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "qdrant_get_collection_info",
            "arguments": {
                "collection_name": collection_name
            }
        }, id=7)
        
        assert result["result"]["success"] is True
        assert result["result"]["points_count"] == 3
        assert result["result"]["vector_size"] == embedding_dim

    @pytest.mark.integration
    async def test_cross_system_workflow(self, http_session, server_url):
        """Test workflow using both Neo4j and Qdrant with shared embeddings."""
        # Wait for server
        assert await self.wait_for_server(http_session, server_url), "Server failed to start"
        
        # 1. Create a document in Neo4j with embedding
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "neo4j_create_node",
            "arguments": {
                "labels": ["Article"],
                "properties": {
                    "title": "Understanding Vector Databases",
                    "content": "Vector databases enable semantic search by storing and querying high-dimensional embeddings.",
                    "author": "Tech Writer"
                },
                "create_embedding": True,
                "embedding_property": "embedding"
            }
        })
        
        assert result["result"]["success"] is True
        
        # 2. Generate embedding for the same content
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "embeddings_generate",
            "arguments": {
                "text": "Vector databases enable semantic search by storing and querying high-dimensional embeddings."
            }
        }, id=2)
        
        assert result["result"]["success"] is True
        embedding = result["result"]["embedding"]
        
        # 3. Create Qdrant collection and add the same content
        collection_name = f"articles_{int(time.time())}"
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "qdrant_create_collection",
            "arguments": {
                "collection_name": collection_name,
                "vector_size": len(embedding),
                "distance": "Cosine"
            }
        }, id=3)
        
        assert result["result"]["success"] is True
        
        # 4. Add to Qdrant with the same content
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "qdrant_upsert_points",
            "arguments": {
                "collection_name": collection_name,
                "points": [{
                    "id": "article_1",
                    "text": "Vector databases enable semantic search by storing and querying high-dimensional embeddings.",
                    "payload": {
                        "title": "Understanding Vector Databases",
                        "source": "neo4j"
                    }
                }]
            }
        }, id=4)
        
        assert result["result"]["success"] is True
        
        # 5. Search in both systems with same query
        search_query = "semantic search and embeddings"
        
        # Neo4j search
        neo4j_result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "neo4j_vector_search",
            "arguments": {
                "query_text": search_query,
                "label": "Article",
                "embedding_property": "embedding",
                "limit": 5
            }
        }, id=5)
        
        # Qdrant search
        qdrant_result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "qdrant_search",
            "arguments": {
                "collection_name": collection_name,
                "query_text": search_query,
                "limit": 5
            }
        }, id=6)
        
        # Both should find the document with high similarity
        assert neo4j_result["result"]["success"] is True
        assert qdrant_result["result"]["success"] is True
        assert len(neo4j_result["result"]["results"]) > 0
        assert len(qdrant_result["result"]["results"]) > 0

    @pytest.mark.integration
    async def test_error_handling(self, http_session, server_url):
        """Test error handling across different scenarios."""
        # Wait for server
        assert await self.wait_for_server(http_session, server_url), "Server failed to start"
        
        # 1. Invalid tool name
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "invalid_tool",
            "arguments": {}
        })
        
        assert "error" in result
        
        # 2. Missing required parameters
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "neo4j_query",
            "arguments": {}  # Missing query
        }, id=2)
        
        assert "error" in result or not result["result"]["success"]
        
        # 3. Invalid query
        result = await self.rpc_call(http_session, server_url, "tools/call", {
            "name": "neo4j_query",
            "arguments": {
                "query": "INVALID CYPHER SYNTAX %%%",
                "parameters": {}
            }
        }, id=3)
        
        assert "result" in result
        assert result["result"]["success"] is False