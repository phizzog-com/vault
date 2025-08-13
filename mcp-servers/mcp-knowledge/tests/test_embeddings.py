"""Test suite for embeddings functionality."""

import pytest
from unittest.mock import MagicMock, patch
import numpy as np
import torch

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.mark.asyncio
class TestEmbeddings:
    """Test cases for embeddings generation."""

    @patch('sentence_transformers.SentenceTransformer')
    async def test_embeddings_initialization(self, mock_st):
        """Test embeddings model initialization."""
        from tools.embeddings_tools import EmbeddingsModel
        
        # Mock model
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 768
        mock_st.return_value = mock_model
        
        # Initialize embeddings
        embeddings = EmbeddingsModel("nomic-ai/nomic-embed-text-v1.5")
        
        assert embeddings.model_name == "nomic-ai/nomic-embed-text-v1.5"
        assert embeddings.embedding_dimension == 768
        mock_st.assert_called_once_with("nomic-ai/nomic-embed-text-v1.5")

    @patch('sentence_transformers.SentenceTransformer')
    async def test_embeddings_single_text(self, mock_st):
        """Test embedding generation for single text."""
        from tools.embeddings_tools import EmbeddingsModel
        
        # Mock model
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 768
        mock_model.encode.return_value = np.random.randn(768)
        mock_st.return_value = mock_model
        
        # Generate embedding
        embeddings = EmbeddingsModel("test-model")
        result = embeddings.embed("Test text")
        
        assert isinstance(result, list)
        assert len(result) == 768
        mock_model.encode.assert_called_once_with("Test text", convert_to_numpy=True)

    @patch('sentence_transformers.SentenceTransformer')
    async def test_embeddings_batch(self, mock_st):
        """Test batch embedding generation."""
        from tools.embeddings_tools import EmbeddingsModel
        
        # Mock model
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 768
        mock_model.encode.return_value = np.random.randn(3, 768)
        mock_st.return_value = mock_model
        
        # Generate batch embeddings
        embeddings = EmbeddingsModel("test-model")
        texts = ["Text 1", "Text 2", "Text 3"]
        result = embeddings.embed_batch(texts)
        
        assert isinstance(result, list)
        assert len(result) == 3
        assert all(len(emb) == 768 for emb in result)
        mock_model.encode.assert_called_once_with(texts, convert_to_numpy=True, batch_size=32)

    @patch('sentence_transformers.SentenceTransformer')
    async def test_embeddings_empty_text(self, mock_st):
        """Test handling of empty text."""
        from tools.embeddings_tools import EmbeddingsModel
        
        # Mock model
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 768
        mock_model.encode.return_value = np.zeros(768)
        mock_st.return_value = mock_model
        
        # Generate embedding for empty text
        embeddings = EmbeddingsModel("test-model")
        result = embeddings.embed("")
        
        assert isinstance(result, list)
        assert len(result) == 768
        # Empty text should still generate an embedding (typically zeros or near-zeros)

    @patch('sentence_transformers.SentenceTransformer')
    async def test_embeddings_long_text(self, mock_st):
        """Test handling of long text (should be truncated by model)."""
        from tools.embeddings_tools import EmbeddingsModel
        
        # Mock model
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 768
        mock_model.encode.return_value = np.random.randn(768)
        mock_st.return_value = mock_model
        
        # Generate embedding for very long text
        embeddings = EmbeddingsModel("test-model")
        long_text = "This is a very long text. " * 1000  # Very long text
        result = embeddings.embed(long_text)
        
        assert isinstance(result, list)
        assert len(result) == 768
        # Model should handle truncation internally

    @patch('sentence_transformers.SentenceTransformer')
    async def test_embeddings_special_characters(self, mock_st):
        """Test handling of special characters and unicode."""
        from tools.embeddings_tools import EmbeddingsModel
        
        # Mock model
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 768
        mock_model.encode.return_value = np.random.randn(768)
        mock_st.return_value = mock_model
        
        # Generate embedding for text with special characters
        embeddings = EmbeddingsModel("test-model")
        special_text = "Hello 世界! 🌍 Special chars: @#$%^&*()"
        result = embeddings.embed(special_text)
        
        assert isinstance(result, list)
        assert len(result) == 768

    @patch('sentence_transformers.SentenceTransformer')
    async def test_embeddings_caching(self, mock_st):
        """Test model caching functionality."""
        from tools.embeddings_tools import EmbeddingsModel
        
        # Mock model
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 768
        mock_st.return_value = mock_model
        
        # Create multiple instances with same model
        embeddings1 = EmbeddingsModel("test-model", cache_dir="/app/models")
        embeddings2 = EmbeddingsModel("test-model", cache_dir="/app/models")
        
        # Should use cache_dir
        assert mock_st.call_count == 2
        for call in mock_st.call_args_list:
            assert call[1].get("cache_folder") == "/app/models"

    @patch('sentence_transformers.SentenceTransformer')
    async def test_embeddings_error_handling(self, mock_st):
        """Test error handling in embeddings generation."""
        from tools.embeddings_tools import EmbeddingsModel
        
        # Mock model that raises error
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 768
        mock_model.encode.side_effect = Exception("Model error")
        mock_st.return_value = mock_model
        
        # Try to generate embedding
        embeddings = EmbeddingsModel("test-model")
        
        with pytest.raises(Exception) as exc_info:
            embeddings.embed("Test text")
        
        assert "Model error" in str(exc_info.value)

    @patch('sentence_transformers.SentenceTransformer')
    async def test_embeddings_normalization(self, mock_st):
        """Test that embeddings are normalized."""
        from tools.embeddings_tools import EmbeddingsModel
        
        # Mock model
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 768
        # Return unnormalized vector
        mock_model.encode.return_value = np.array([3.0, 4.0] + [0.0] * 766)
        mock_st.return_value = mock_model
        
        # Generate embedding
        embeddings = EmbeddingsModel("test-model", normalize=True)
        result = embeddings.embed("Test text")
        
        # Check if normalized (magnitude should be close to 1)
        magnitude = np.linalg.norm(result)
        assert abs(magnitude - 1.0) < 0.001

    @patch('sentence_transformers.SentenceTransformer')
    async def test_embeddings_dtype_conversion(self, mock_st):
        """Test data type conversion for embeddings."""
        from tools.embeddings_tools import EmbeddingsModel
        
        # Mock model returning different dtypes
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 768
        mock_model.encode.return_value = torch.randn(768).numpy()  # Returns float32
        mock_st.return_value = mock_model
        
        # Generate embedding
        embeddings = EmbeddingsModel("test-model")
        result = embeddings.embed("Test text")
        
        # Should be converted to Python list of floats
        assert isinstance(result, list)
        assert all(isinstance(x, float) for x in result)