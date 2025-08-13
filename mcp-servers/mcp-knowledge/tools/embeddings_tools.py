"""Embeddings tools for MCP Knowledge Server."""

from typing import Dict, Any, List, Optional
import numpy as np
from sentence_transformers import SentenceTransformer
import structlog

logger = structlog.get_logger()


class EmbeddingsModel:
    """Embeddings model wrapper."""
    
    def __init__(self, model_name: str, cache_dir: Optional[str] = None, normalize: bool = False):
        """Initialize the embeddings model.
        
        Args:
            model_name: Name of the model to use
            cache_dir: Directory to cache the model
            normalize: Whether to normalize embeddings to unit length
        """
        self.model_name = model_name
        self.normalize = normalize
        self.logger = logger.bind(model=model_name)
        
        try:
            self.logger.info(f"Loading embeddings model: {model_name}")
            if cache_dir:
                self.model = SentenceTransformer(model_name, cache_folder=cache_dir)
            else:
                self.model = SentenceTransformer(model_name)
            
            self.embedding_dimension = self.model.get_sentence_embedding_dimension()
            self.logger.info(f"Model loaded successfully. Embedding dimension: {self.embedding_dimension}")
        except Exception as e:
            self.logger.error(f"Failed to load model: {e}")
            raise
    
    def embed(self, text: str) -> List[float]:
        """Generate embedding for a single text.
        
        Args:
            text: Text to generate embedding for
            
        Returns:
            List of floats representing the embedding
        """
        try:
            embedding = self.model.encode(text, convert_to_numpy=True)
            
            if self.normalize:
                # Normalize to unit length
                norm = np.linalg.norm(embedding)
                if norm > 0:
                    embedding = embedding / norm
            
            return embedding.tolist()
        except Exception as e:
            self.logger.error(f"Failed to generate embedding: {e}")
            raise
    
    def embed_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """Generate embeddings for multiple texts.
        
        Args:
            texts: List of texts to generate embeddings for
            batch_size: Batch size for processing
            
        Returns:
            List of embeddings
        """
        try:
            embeddings = self.model.encode(texts, convert_to_numpy=True, batch_size=batch_size)
            
            if self.normalize:
                # Normalize each embedding
                norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
                embeddings = embeddings / np.maximum(norms, 1e-10)
            
            return embeddings.tolist()
        except Exception as e:
            self.logger.error(f"Failed to generate batch embeddings: {e}")
            raise


class EmbeddingsBaseTool:
    """Base class for embeddings tools."""
    
    def __init__(self, embeddings_model: EmbeddingsModel):
        self.embeddings_model = embeddings_model
        self.logger = logger.bind(tool=self.__class__.__name__)
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the tool with given arguments."""
        raise NotImplementedError


class EmbeddingsGenerateTool(EmbeddingsBaseTool):
    """Generate embeddings for text."""
    
    @property
    def description(self) -> str:
        return "Generate embeddings for text using the unified model"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Single text to generate embedding for"
                },
                "texts": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Multiple texts to generate embeddings for"
                }
            }
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Generate embeddings."""
        try:
            if "text" in arguments:
                # Single text
                text = arguments["text"]
                embedding = self.embeddings_model.embed(text)
                
                return {
                    "success": True,
                    "embedding": embedding,
                    "model": self.embeddings_model.model_name,
                    "dimension": self.embeddings_model.embedding_dimension
                }
            
            elif "texts" in arguments:
                # Multiple texts
                texts = arguments["texts"]
                embeddings = self.embeddings_model.embed_batch(texts)
                
                return {
                    "success": True,
                    "embeddings": embeddings,
                    "model": self.embeddings_model.model_name,
                    "dimension": self.embeddings_model.embedding_dimension
                }
            
            else:
                return {
                    "success": False,
                    "error": "Either 'text' or 'texts' must be provided"
                }
                
        except Exception as e:
            self.logger.error(f"Failed to generate embeddings: {e}")
            return {
                "success": False,
                "error": str(e)
            }


class EmbeddingsModelInfoTool(EmbeddingsBaseTool):
    """Get information about the embeddings model."""
    
    @property
    def description(self) -> str:
        return "Get information about the embeddings model"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {}
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Get model information."""
        try:
            return {
                "success": True,
                "model_name": self.embeddings_model.model_name,
                "embedding_dimension": self.embeddings_model.embedding_dimension,
                "normalized": self.embeddings_model.normalize
            }
        except Exception as e:
            self.logger.error(f"Failed to get model info: {e}")
            return {
                "success": False,
                "error": str(e)
            }