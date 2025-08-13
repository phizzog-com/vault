"""Test suite for Qdrant tools."""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import numpy as np

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.mark.asyncio
class TestQdrantTools:
    """Test cases for Qdrant tools."""

    @pytest.fixture
    async def mock_qdrant_client(self):
        """Mock Qdrant client for testing."""
        client = AsyncMock()
        return client

    @pytest.fixture
    async def mock_embeddings(self):
        """Mock embeddings generator."""
        embeddings = MagicMock()
        embeddings.embed.return_value = [0.1] * 768  # 768-dim vector
        embeddings.embed_batch.return_value = [[0.1] * 768, [0.2] * 768]
        embeddings.model_name = "nomic-ai/nomic-embed-text-v1.5"
        embeddings.embedding_dimension = 768
        return embeddings

    async def test_embeddings_generate_tool(self, mock_embeddings):
        """Test embedding generation."""
        from tools.embeddings_tools import EmbeddingsGenerateTool
        
        tool = EmbeddingsGenerateTool(mock_embeddings)
        
        # Test single text
        result = await tool.execute({
            "text": "Test text for embedding"
        })
        
        assert result["success"] is True
        assert len(result["embedding"]) == 768
        assert result["model"] == "nomic-ai/nomic-embed-text-v1.5"
        assert result["dimension"] == 768
        mock_embeddings.embed.assert_called_once_with("Test text for embedding")

    async def test_embeddings_batch_generate(self, mock_embeddings):
        """Test batch embedding generation."""
        from tools.embeddings_tools import EmbeddingsGenerateTool
        
        tool = EmbeddingsGenerateTool(mock_embeddings)
        
        # Test batch texts
        result = await tool.execute({
            "texts": ["Text 1", "Text 2"]
        })
        
        assert result["success"] is True
        assert len(result["embeddings"]) == 2
        assert len(result["embeddings"][0]) == 768
        assert len(result["embeddings"][1]) == 768
        mock_embeddings.embed_batch.assert_called_once_with(["Text 1", "Text 2"])

    async def test_qdrant_create_collection_tool(self, mock_qdrant_client):
        """Test Qdrant collection creation."""
        from tools.qdrant_tools import QdrantCreateCollectionTool
        
        tool = QdrantCreateCollectionTool(mock_qdrant_client)
        
        # Mock successful creation
        mock_qdrant_client.create_collection.return_value = True
        
        # Create collection
        result = await tool.execute({
            "collection_name": "test_collection",
            "vector_size": 768,
            "distance": "Cosine"
        })
        
        assert result["success"] is True
        assert result["collection_name"] == "test_collection"
        assert result["vector_size"] == 768
        assert result["distance"] == "Cosine"
        
        # Verify client call
        mock_qdrant_client.create_collection.assert_called_once()
        call_args = mock_qdrant_client.create_collection.call_args[1]
        assert call_args["collection_name"] == "test_collection"

    async def test_qdrant_upsert_points_tool(self, mock_qdrant_client, mock_embeddings):
        """Test Qdrant point upsertion."""
        from tools.qdrant_tools import QdrantUpsertPointsTool
        
        tool = QdrantUpsertPointsTool(mock_qdrant_client, mock_embeddings)
        
        # Mock successful upsert
        mock_qdrant_client.upsert.return_value = MagicMock(status="completed")
        
        # Upsert points with text
        result = await tool.execute({
            "collection_name": "test_collection",
            "points": [
                {
                    "id": "1",
                    "text": "Document 1 content",
                    "payload": {"title": "Doc 1", "type": "document"}
                },
                {
                    "id": "2",
                    "text": "Document 2 content",
                    "payload": {"title": "Doc 2", "type": "document"}
                }
            ]
        })
        
        assert result["success"] is True
        assert result["count"] == 2
        assert result["collection_name"] == "test_collection"
        
        # Verify embeddings were generated
        assert mock_embeddings.embed_batch.call_count == 1
        mock_embeddings.embed_batch.assert_called_with(["Document 1 content", "Document 2 content"])

    async def test_qdrant_upsert_with_vectors(self, mock_qdrant_client):
        """Test Qdrant point upsertion with pre-computed vectors."""
        from tools.qdrant_tools import QdrantUpsertPointsTool
        
        tool = QdrantUpsertPointsTool(mock_qdrant_client, None)
        
        # Mock successful upsert
        mock_qdrant_client.upsert.return_value = MagicMock(status="completed")
        
        # Upsert points with vectors
        result = await tool.execute({
            "collection_name": "test_collection",
            "points": [
                {
                    "id": "1",
                    "vector": [0.1] * 768,
                    "payload": {"title": "Doc 1"}
                }
            ]
        })
        
        assert result["success"] is True
        assert result["count"] == 1

    async def test_qdrant_search_tool(self, mock_qdrant_client, mock_embeddings):
        """Test Qdrant similarity search."""
        from tools.qdrant_tools import QdrantSearchTool
        
        tool = QdrantSearchTool(mock_qdrant_client, mock_embeddings)
        
        # Mock search results
        mock_results = [
            MagicMock(id="1", score=0.95, payload={"title": "Doc 1"}),
            MagicMock(id="2", score=0.85, payload={"title": "Doc 2"})
        ]
        mock_qdrant_client.search.return_value = mock_results
        
        # Perform search
        result = await tool.execute({
            "collection_name": "test_collection",
            "query_text": "search query",
            "limit": 10,
            "score_threshold": 0.7
        })
        
        assert result["success"] is True
        assert len(result["results"]) == 2
        assert result["results"][0]["id"] == "1"
        assert result["results"][0]["score"] == 0.95
        assert result["results"][0]["payload"]["title"] == "Doc 1"
        
        # Verify embedding was generated
        mock_embeddings.embed.assert_called_once_with("search query")

    async def test_qdrant_search_with_filter(self, mock_qdrant_client, mock_embeddings):
        """Test Qdrant search with filters."""
        from tools.qdrant_tools import QdrantSearchTool
        
        tool = QdrantSearchTool(mock_qdrant_client, mock_embeddings)
        
        # Mock search results
        mock_qdrant_client.search.return_value = []
        
        # Perform search with filter
        result = await tool.execute({
            "collection_name": "test_collection",
            "query_text": "search query",
            "filter": {
                "must": [
                    {"key": "type", "match": {"value": "document"}}
                ]
            },
            "limit": 5
        })
        
        assert result["success"] is True
        
        # Verify filter was passed to client
        call_args = mock_qdrant_client.search.call_args[1]
        assert "query_filter" in call_args
        assert call_args["query_filter"]["must"][0]["key"] == "type"

    async def test_qdrant_get_collection_info_tool(self, mock_qdrant_client):
        """Test getting collection information."""
        from tools.qdrant_tools import QdrantGetCollectionInfoTool
        
        tool = QdrantGetCollectionInfoTool(mock_qdrant_client)
        
        # Mock collection info
        mock_info = MagicMock()
        mock_info.status = "green"
        mock_info.vectors_count = 1000
        mock_info.points_count = 1000
        mock_info.config.params.vectors.size = 768
        mock_info.config.params.vectors.distance = "Cosine"
        mock_qdrant_client.get_collection.return_value = mock_info
        
        # Get collection info
        result = await tool.execute({
            "collection_name": "test_collection"
        })
        
        assert result["success"] is True
        assert result["status"] == "green"
        assert result["vectors_count"] == 1000
        assert result["points_count"] == 1000
        assert result["vector_size"] == 768
        assert result["distance"] == "Cosine"

    async def test_qdrant_delete_points_tool(self, mock_qdrant_client):
        """Test deleting points from collection."""
        from tools.qdrant_tools import QdrantDeletePointsTool
        
        tool = QdrantDeletePointsTool(mock_qdrant_client)
        
        # Mock successful deletion
        mock_qdrant_client.delete.return_value = MagicMock(status="completed")
        
        # Delete points
        result = await tool.execute({
            "collection_name": "test_collection",
            "point_ids": ["1", "2", "3"]
        })
        
        assert result["success"] is True
        assert result["deleted_count"] == 3
        
        # Verify client call
        mock_qdrant_client.delete.assert_called_once()
        call_args = mock_qdrant_client.delete.call_args[1]
        assert call_args["points_selector"]["points"]["ids"] == ["1", "2", "3"]

    async def test_embeddings_model_info_tool(self, mock_embeddings):
        """Test getting embeddings model information."""
        from tools.embeddings_tools import EmbeddingsModelInfoTool
        
        tool = EmbeddingsModelInfoTool(mock_embeddings)
        
        # Get model info
        result = await tool.execute({})
        
        assert result["success"] is True
        assert result["model_name"] == "nomic-ai/nomic-embed-text-v1.5"
        assert result["embedding_dimension"] == 768

    async def test_qdrant_error_handling(self, mock_qdrant_client):
        """Test error handling in Qdrant tools."""
        from tools.qdrant_tools import QdrantSearchTool
        
        tool = QdrantSearchTool(mock_qdrant_client, None)
        
        # Mock search error
        mock_qdrant_client.search.side_effect = Exception("Connection failed")
        
        # Perform search with vector
        result = await tool.execute({
            "collection_name": "test_collection",
            "query_vector": [0.1] * 768,
            "limit": 10
        })
        
        assert result["success"] is False
        assert "error" in result
        assert "Connection failed" in result["error"]

    async def test_qdrant_validation(self, mock_qdrant_client):
        """Test parameter validation in Qdrant tools."""
        from tools.qdrant_tools import QdrantSearchTool
        
        tool = QdrantSearchTool(mock_qdrant_client, None)
        
        # Test missing collection name
        result = await tool.execute({
            "query_vector": [0.1] * 768
        })
        assert result["success"] is False
        assert "Missing required parameter: collection_name" in result["error"]
        
        # Test missing query
        result = await tool.execute({
            "collection_name": "test"
        })
        assert result["success"] is False
        assert "Either query_text or query_vector must be provided" in result["error"]