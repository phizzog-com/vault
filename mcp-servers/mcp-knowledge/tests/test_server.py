"""Test suite for MCP Knowledge Server."""

import pytest
import json
from unittest.mock import MagicMock, patch, AsyncMock
from aiohttp import web
from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop

# Import the server module (will be created later)
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestMCPKnowledgeServer(AioHTTPTestCase):
    """Test cases for the MCP Knowledge Server."""

    async def get_application(self):
        """Create the application for testing."""
        from server import create_app
        return await create_app()

    @unittest_run_loop
    async def test_health_endpoint(self):
        """Test the health check endpoint."""
        resp = await self.client.request("GET", "/health")
        assert resp.status == 200
        data = await resp.json()
        assert data["status"] == "healthy"
        assert "services" in data
        assert data["services"]["neo4j"] == "connected"
        assert data["services"]["qdrant"] == "connected"
        assert data["services"]["embeddings"] == "ready"

    @unittest_run_loop
    async def test_rpc_tools_list(self):
        """Test listing available tools via RPC."""
        request_data = {
            "jsonrpc": "2.0",
            "method": "tools/list",
            "id": 1
        }
        
        resp = await self.client.request(
            "POST", 
            "/rpc",
            json=request_data,
            headers={"Content-Type": "application/json"}
        )
        
        assert resp.status == 200
        data = await resp.json()
        assert data["jsonrpc"] == "2.0"
        assert data["id"] == 1
        assert "result" in data
        
        tools = data["result"]["tools"]
        tool_names = [tool["name"] for tool in tools]
        
        # Check Neo4j tools
        assert "neo4j_query" in tool_names
        assert "neo4j_create_node" in tool_names
        assert "neo4j_create_relationship" in tool_names
        assert "neo4j_vector_search" in tool_names
        
        # Check Qdrant tools
        assert "embeddings_generate" in tool_names
        assert "qdrant_create_collection" in tool_names
        assert "qdrant_upsert_points" in tool_names
        assert "qdrant_search" in tool_names
        assert "qdrant_get_collection_info" in tool_names
        assert "qdrant_delete_points" in tool_names
        assert "embeddings_model_info" in tool_names

    @unittest_run_loop
    async def test_rpc_initialize(self):
        """Test RPC initialize method."""
        request_data = {
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "capabilities": {}
            },
            "id": 1
        }
        
        resp = await self.client.request(
            "POST", 
            "/rpc",
            json=request_data,
            headers={"Content-Type": "application/json"}
        )
        
        assert resp.status == 200
        data = await resp.json()
        assert data["jsonrpc"] == "2.0"
        assert data["id"] == 1
        assert "result" in data
        assert "capabilities" in data["result"]

    @unittest_run_loop
    async def test_rpc_call_tool(self):
        """Test calling a tool via RPC."""
        request_data = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": "embeddings_model_info",
                "arguments": {}
            },
            "id": 1
        }
        
        resp = await self.client.request(
            "POST", 
            "/rpc",
            json=request_data,
            headers={"Content-Type": "application/json"}
        )
        
        assert resp.status == 200
        data = await resp.json()
        assert data["jsonrpc"] == "2.0"
        assert data["id"] == 1
        assert "result" in data
        
        result = data["result"]
        assert "model_name" in result
        assert "embedding_dimension" in result

    @unittest_run_loop
    async def test_rpc_invalid_method(self):
        """Test handling of invalid RPC method."""
        request_data = {
            "jsonrpc": "2.0",
            "method": "invalid/method",
            "id": 1
        }
        
        resp = await self.client.request(
            "POST", 
            "/rpc",
            json=request_data,
            headers={"Content-Type": "application/json"}
        )
        
        assert resp.status == 200
        data = await resp.json()
        assert data["jsonrpc"] == "2.0"
        assert data["id"] == 1
        assert "error" in data
        assert data["error"]["code"] == -32601  # Method not found

    @unittest_run_loop
    async def test_rpc_missing_tool(self):
        """Test calling a non-existent tool."""
        request_data = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": "non_existent_tool",
                "arguments": {}
            },
            "id": 1
        }
        
        resp = await self.client.request(
            "POST", 
            "/rpc",
            json=request_data,
            headers={"Content-Type": "application/json"}
        )
        
        assert resp.status == 200
        data = await resp.json()
        assert data["jsonrpc"] == "2.0"
        assert data["id"] == 1
        assert "error" in data

    @unittest_run_loop
    async def test_sse_endpoint(self):
        """Test Server-Sent Events endpoint."""
        resp = await self.client.request(
            "GET", 
            "/sse",
            headers={"Accept": "text/event-stream"}
        )
        
        assert resp.status == 200
        assert resp.headers["Content-Type"] == "text/event-stream"
        assert resp.headers["Cache-Control"] == "no-cache"

    @unittest_run_loop
    async def test_invalid_json_rpc_request(self):
        """Test handling of invalid JSON in RPC request."""
        resp = await self.client.request(
            "POST", 
            "/rpc",
            data="invalid json",
            headers={"Content-Type": "application/json"}
        )
        
        assert resp.status == 200
        data = await resp.json()
        assert "error" in data
        assert data["error"]["code"] == -32700  # Parse error


@pytest.mark.asyncio
class TestServerInitialization:
    """Test server initialization and configuration."""

    @patch.dict(os.environ, {
        "NEO4J_URI": "bolt://test:7687",
        "NEO4J_USER": "test_user",
        "NEO4J_PASSWORD": "test_pass",
        "QDRANT_HOST": "test_qdrant",
        "QDRANT_PORT": "6333",
        "EMBEDDING_MODEL": "test/model"
    })
    async def test_config_from_environment(self):
        """Test loading configuration from environment variables."""
        from server import load_config
        
        config = load_config()
        assert config["neo4j_uri"] == "bolt://test:7687"
        assert config["neo4j_user"] == "test_user"
        assert config["neo4j_password"] == "test_pass"
        assert config["qdrant_host"] == "test_qdrant"
        assert config["qdrant_port"] == 6333
        assert config["embedding_model"] == "test/model"

    async def test_default_config(self):
        """Test default configuration values."""
        from server import load_config
        
        # Clear environment variables
        env_vars = ["NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD", 
                   "QDRANT_HOST", "QDRANT_PORT", "EMBEDDING_MODEL"]
        for var in env_vars:
            os.environ.pop(var, None)
        
        config = load_config()
        assert config["neo4j_uri"] == "bolt://neo4j:7687"
        assert config["neo4j_user"] == "neo4j"
        assert config["qdrant_host"] == "qdrant"
        assert config["qdrant_port"] == 6333
        assert config["embedding_model"] == "nomic-ai/nomic-embed-text-v1.5"