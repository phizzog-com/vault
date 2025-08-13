"""Qdrant tools for MCP Knowledge Server."""

from typing import Dict, Any, List, Optional
import uuid
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition,
    MatchValue, PointIdsList
)
import structlog

logger = structlog.get_logger()


class QdrantBaseTool:
    """Base class for Qdrant tools."""
    
    def __init__(self, client: AsyncQdrantClient):
        self.client = client
        self.logger = logger.bind(tool=self.__class__.__name__)
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the tool with given arguments."""
        raise NotImplementedError


class QdrantCreateCollectionTool(QdrantBaseTool):
    """Create a new collection in Qdrant."""
    
    @property
    def description(self) -> str:
        return "Create a new vector collection in Qdrant"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "collection_name": {
                    "type": "string",
                    "description": "Name of the collection to create"
                },
                "vector_size": {
                    "type": "integer",
                    "description": "Dimension of vectors"
                },
                "distance": {
                    "type": "string",
                    "description": "Distance metric",
                    "enum": ["Cosine", "Euclid", "Dot"],
                    "default": "Cosine"
                }
            },
            "required": ["collection_name", "vector_size"]
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Create a collection."""
        # Validate arguments
        if "collection_name" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: collection_name"
            }
        
        if "vector_size" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: vector_size"
            }
        
        collection_name = arguments["collection_name"]
        vector_size = arguments["vector_size"]
        distance = arguments.get("distance", "Cosine")
        
        # Map distance string to enum
        distance_map = {
            "Cosine": Distance.COSINE,
            "Euclid": Distance.EUCLID,
            "Dot": Distance.DOT
        }
        distance_enum = distance_map.get(distance, Distance.COSINE)
        
        try:
            await self.client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=vector_size,
                    distance=distance_enum
                )
            )
            
            return {
                "success": True,
                "collection_name": collection_name,
                "vector_size": vector_size,
                "distance": distance
            }
            
        except Exception as e:
            self.logger.error(f"Collection creation failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }


class QdrantUpsertPointsTool(QdrantBaseTool):
    """Insert or update points in a Qdrant collection."""
    
    def __init__(self, client: AsyncQdrantClient, embeddings_model):
        super().__init__(client)
        self.embeddings_model = embeddings_model
    
    @property
    def description(self) -> str:
        return "Insert or update points in a Qdrant collection"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "collection_name": {
                    "type": "string",
                    "description": "Name of the collection"
                },
                "points": {
                    "type": "array",
                    "description": "Array of points to upsert",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string",
                                "description": "Point ID (optional, will be generated if not provided)"
                            },
                            "vector": {
                                "type": "array",
                                "items": {"type": "number"},
                                "description": "Vector data (if not using text)"
                            },
                            "text": {
                                "type": "string",
                                "description": "Text to generate embedding from"
                            },
                            "payload": {
                                "type": "object",
                                "description": "Additional metadata"
                            }
                        }
                    }
                }
            },
            "required": ["collection_name", "points"]
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Upsert points to collection."""
        # Validate arguments
        if "collection_name" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: collection_name"
            }
        
        if "points" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: points"
            }
        
        collection_name = arguments["collection_name"]
        points_data = arguments["points"]
        
        try:
            points = []
            texts_to_embed = []
            text_indices = []
            
            # Process points
            for i, point_data in enumerate(points_data):
                point_id = point_data.get("id", str(uuid.uuid4()))
                payload = point_data.get("payload", {})
                
                if "text" in point_data and self.embeddings_model:
                    # Need to generate embedding
                    texts_to_embed.append(point_data["text"])
                    text_indices.append(i)
                    points.append(None)  # Placeholder
                elif "vector" in point_data:
                    # Use provided vector
                    points.append(PointStruct(
                        id=point_id,
                        vector=point_data["vector"],
                        payload=payload
                    ))
                else:
                    return {
                        "success": False,
                        "error": f"Point at index {i} must have either 'text' or 'vector'"
                    }
            
            # Generate embeddings for texts
            if texts_to_embed:
                embeddings = self.embeddings_model.embed_batch(texts_to_embed)
                
                # Fill in the placeholders with generated embeddings
                for idx, (text_idx, embedding) in enumerate(zip(text_indices, embeddings)):
                    point_data = points_data[text_idx]
                    point_id = point_data.get("id", str(uuid.uuid4()))
                    payload = point_data.get("payload", {})
                    
                    points[text_idx] = PointStruct(
                        id=point_id,
                        vector=embedding,
                        payload=payload
                    )
            
            # Upsert points
            await self.client.upsert(
                collection_name=collection_name,
                points=points
            )
            
            return {
                "success": True,
                "collection_name": collection_name,
                "count": len(points)
            }
            
        except Exception as e:
            self.logger.error(f"Point upsert failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }


class QdrantSearchTool(QdrantBaseTool):
    """Search for similar vectors in Qdrant."""
    
    def __init__(self, client: AsyncQdrantClient, embeddings_model):
        super().__init__(client)
        self.embeddings_model = embeddings_model
    
    @property
    def description(self) -> str:
        return "Search for similar vectors in a Qdrant collection"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "collection_name": {
                    "type": "string",
                    "description": "Name of the collection to search"
                },
                "query_text": {
                    "type": "string",
                    "description": "Text to search for"
                },
                "query_vector": {
                    "type": "array",
                    "items": {"type": "number"},
                    "description": "Pre-computed query vector (alternative to query_text)"
                },
                "filter": {
                    "type": "object",
                    "description": "Qdrant filter conditions"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results",
                    "default": 10
                },
                "score_threshold": {
                    "type": "number",
                    "description": "Minimum similarity score",
                    "default": None
                }
            },
            "required": ["collection_name"]
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Search for similar vectors."""
        # Validate arguments
        if "collection_name" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: collection_name"
            }
        
        collection_name = arguments["collection_name"]
        limit = arguments.get("limit", 10)
        score_threshold = arguments.get("score_threshold")
        
        # Get query vector
        if "query_text" in arguments and self.embeddings_model:
            query_vector = self.embeddings_model.embed(arguments["query_text"])
        elif "query_vector" in arguments:
            query_vector = arguments["query_vector"]
        else:
            return {
                "success": False,
                "error": "Either query_text or query_vector must be provided"
            }
        
        try:
            # Build filter if provided
            query_filter = None
            if "filter" in arguments:
                filter_data = arguments["filter"]
                if "must" in filter_data:
                    conditions = []
                    for condition in filter_data["must"]:
                        conditions.append(
                            FieldCondition(
                                key=condition["key"],
                                match=MatchValue(value=condition["match"]["value"])
                            )
                        )
                    query_filter = Filter(must=conditions)
            
            # Perform search
            results = await self.client.search(
                collection_name=collection_name,
                query_vector=query_vector,
                query_filter=query_filter,
                limit=limit,
                score_threshold=score_threshold
            )
            
            # Format results
            formatted_results = []
            for result in results:
                formatted_results.append({
                    "id": result.id,
                    "score": result.score,
                    "payload": result.payload
                })
            
            return {
                "success": True,
                "results": formatted_results
            }
            
        except Exception as e:
            self.logger.error(f"Search failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }


class QdrantGetCollectionInfoTool(QdrantBaseTool):
    """Get information about a Qdrant collection."""
    
    @property
    def description(self) -> str:
        return "Get information about a Qdrant collection"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "collection_name": {
                    "type": "string",
                    "description": "Name of the collection"
                }
            },
            "required": ["collection_name"]
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Get collection information."""
        # Validate arguments
        if "collection_name" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: collection_name"
            }
        
        collection_name = arguments["collection_name"]
        
        try:
            info = await self.client.get_collection(collection_name)
            
            return {
                "success": True,
                "status": info.status,
                "vectors_count": info.vectors_count,
                "points_count": info.points_count,
                "vector_size": info.config.params.vectors.size,
                "distance": str(info.config.params.vectors.distance)
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get collection info: {e}")
            return {
                "success": False,
                "error": str(e)
            }


class QdrantDeletePointsTool(QdrantBaseTool):
    """Delete points from a Qdrant collection."""
    
    @property
    def description(self) -> str:
        return "Delete points from a Qdrant collection"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "collection_name": {
                    "type": "string",
                    "description": "Name of the collection"
                },
                "point_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "IDs of points to delete"
                }
            },
            "required": ["collection_name", "point_ids"]
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Delete points from collection."""
        # Validate arguments
        if "collection_name" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: collection_name"
            }
        
        if "point_ids" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: point_ids"
            }
        
        collection_name = arguments["collection_name"]
        point_ids = arguments["point_ids"]
        
        try:
            await self.client.delete(
                collection_name=collection_name,
                points_selector=PointIdsList(
                    points=point_ids
                )
            )
            
            return {
                "success": True,
                "collection_name": collection_name,
                "deleted_count": len(point_ids)
            }
            
        except Exception as e:
            self.logger.error(f"Failed to delete points: {e}")
            return {
                "success": False,
                "error": str(e)
            }