"""Test suite for Neo4j tools."""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import json

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.mark.asyncio
class TestNeo4jTools:
    """Test cases for Neo4j tools."""

    @pytest.fixture
    async def mock_neo4j_driver(self):
        """Mock Neo4j driver for testing."""
        driver = MagicMock()
        session = AsyncMock()
        driver.async_session.return_value.__aenter__.return_value = session
        driver.async_session.return_value.__aexit__.return_value = None
        return driver, session

    @pytest.fixture
    async def mock_embeddings(self):
        """Mock embeddings generator."""
        embeddings = MagicMock()
        embeddings.embed.return_value = [0.1] * 768  # 768-dim vector
        return embeddings

    async def test_neo4j_query_tool(self, mock_neo4j_driver):
        """Test Neo4j query execution."""
        from tools.neo4j_tools import Neo4jQueryTool
        
        driver, session = mock_neo4j_driver
        tool = Neo4jQueryTool(driver)
        
        # Mock query result
        mock_result = MagicMock()
        mock_result.data.return_value = [
            {"name": "Node1", "type": "Test"},
            {"name": "Node2", "type": "Test"}
        ]
        session.run.return_value = mock_result
        
        # Execute query
        result = await tool.execute({
            "query": "MATCH (n:Test) RETURN n.name as name, n.type as type",
            "parameters": {}
        })
        
        assert result["success"] is True
        assert len(result["data"]) == 2
        assert result["data"][0]["name"] == "Node1"
        assert result["data"][1]["name"] == "Node2"
        session.run.assert_called_once()

    async def test_neo4j_create_node_tool(self, mock_neo4j_driver, mock_embeddings):
        """Test Neo4j node creation with embeddings."""
        from tools.neo4j_tools import Neo4jCreateNodeTool
        
        driver, session = mock_neo4j_driver
        tool = Neo4jCreateNodeTool(driver, mock_embeddings)
        
        # Mock node creation result
        mock_result = MagicMock()
        mock_record = MagicMock()
        mock_record.data.return_value = {"id": 123, "labels": ["Document"], "properties": {"title": "Test"}}
        mock_result.single.return_value = mock_record
        session.run.return_value = mock_result
        
        # Create node
        result = await tool.execute({
            "labels": ["Document"],
            "properties": {"title": "Test Document", "content": "Test content"},
            "create_embedding": True,
            "embedding_property": "embedding"
        })
        
        assert result["success"] is True
        assert result["node"]["id"] == 123
        assert "Document" in result["node"]["labels"]
        assert result["node"]["properties"]["title"] == "Test"
        
        # Verify embedding was generated
        mock_embeddings.embed.assert_called_once()
        
        # Verify query includes embedding
        call_args = session.run.call_args[0]
        assert "embedding" in call_args[1]

    async def test_neo4j_create_relationship_tool(self, mock_neo4j_driver):
        """Test Neo4j relationship creation."""
        from tools.neo4j_tools import Neo4jCreateRelationshipTool
        
        driver, session = mock_neo4j_driver
        tool = Neo4jCreateRelationshipTool(driver)
        
        # Mock relationship creation result
        mock_result = MagicMock()
        mock_record = MagicMock()
        mock_record.data.return_value = {
            "relationship": {"type": "RELATED_TO", "properties": {"weight": 1.0}},
            "start_node": {"id": 1, "labels": ["Doc"]},
            "end_node": {"id": 2, "labels": ["Doc"]}
        }
        mock_result.single.return_value = mock_record
        session.run.return_value = mock_result
        
        # Create relationship
        result = await tool.execute({
            "start_node_id": 1,
            "end_node_id": 2,
            "relationship_type": "RELATED_TO",
            "properties": {"weight": 1.0}
        })
        
        assert result["success"] is True
        assert result["relationship"]["type"] == "RELATED_TO"
        assert result["start_node"]["id"] == 1
        assert result["end_node"]["id"] == 2

    async def test_neo4j_vector_search_tool(self, mock_neo4j_driver, mock_embeddings):
        """Test Neo4j vector similarity search."""
        from tools.neo4j_tools import Neo4jVectorSearchTool
        
        driver, session = mock_neo4j_driver
        tool = Neo4jVectorSearchTool(driver, mock_embeddings)
        
        # Mock search results
        mock_result = MagicMock()
        mock_result.data.return_value = [
            {"node": {"id": 1, "title": "Doc1"}, "similarity": 0.95},
            {"node": {"id": 2, "title": "Doc2"}, "similarity": 0.85}
        ]
        session.run.return_value = mock_result
        
        # Perform search
        result = await tool.execute({
            "query_text": "test query",
            "label": "Document",
            "embedding_property": "embedding",
            "limit": 10,
            "min_similarity": 0.7
        })
        
        assert result["success"] is True
        assert len(result["results"]) == 2
        assert result["results"][0]["node"]["title"] == "Doc1"
        assert result["results"][0]["similarity"] == 0.95
        
        # Verify embedding was generated for query
        mock_embeddings.embed.assert_called_once_with("test query")

    async def test_neo4j_error_handling(self, mock_neo4j_driver):
        """Test error handling in Neo4j tools."""
        from tools.neo4j_tools import Neo4jQueryTool
        
        driver, session = mock_neo4j_driver
        tool = Neo4jQueryTool(driver)
        
        # Mock query error
        session.run.side_effect = Exception("Connection failed")
        
        # Execute query
        result = await tool.execute({
            "query": "MATCH (n) RETURN n",
            "parameters": {}
        })
        
        assert result["success"] is False
        assert "error" in result
        assert "Connection failed" in result["error"]

    async def test_neo4j_query_validation(self, mock_neo4j_driver):
        """Test query parameter validation."""
        from tools.neo4j_tools import Neo4jQueryTool
        
        driver, session = mock_neo4j_driver
        tool = Neo4jQueryTool(driver)
        
        # Test missing query
        result = await tool.execute({})
        assert result["success"] is False
        assert "Missing required parameter: query" in result["error"]
        
        # Test invalid query type
        result = await tool.execute({"query": 123})
        assert result["success"] is False
        assert "Query must be a string" in result["error"]

    async def test_neo4j_node_validation(self, mock_neo4j_driver, mock_embeddings):
        """Test node creation parameter validation."""
        from tools.neo4j_tools import Neo4jCreateNodeTool
        
        driver, session = mock_neo4j_driver
        tool = Neo4jCreateNodeTool(driver, mock_embeddings)
        
        # Test missing labels
        result = await tool.execute({"properties": {"name": "test"}})
        assert result["success"] is False
        assert "Missing required parameter: labels" in result["error"]
        
        # Test invalid labels type
        result = await tool.execute({"labels": "Document"})
        assert result["success"] is False
        assert "Labels must be a list" in result["error"]
        
        # Test empty labels
        result = await tool.execute({"labels": []})
        assert result["success"] is False
        assert "At least one label is required" in result["error"]