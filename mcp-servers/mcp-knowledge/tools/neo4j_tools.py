"""Neo4j tools for MCP Knowledge Server."""

from typing import Dict, Any, List, Optional
import json
from neo4j import AsyncDriver
import structlog

logger = structlog.get_logger()


class Neo4jBaseTool:
    """Base class for Neo4j tools."""
    
    def __init__(self, driver: AsyncDriver):
        self.driver = driver
        self.logger = logger.bind(tool=self.__class__.__name__)
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the tool with given arguments."""
        raise NotImplementedError


class Neo4jQueryTool(Neo4jBaseTool):
    """Execute Cypher queries on Neo4j."""
    
    @property
    def description(self) -> str:
        return "Execute Cypher queries on Neo4j database"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The Cypher query to execute"
                },
                "parameters": {
                    "type": "object",
                    "description": "Query parameters",
                    "default": {}
                }
            },
            "required": ["query"]
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a Cypher query."""
        # Validate arguments
        if "query" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: query"
            }
        
        query = arguments.get("query")
        if not isinstance(query, str):
            return {
                "success": False,
                "error": "Query must be a string"
            }
        
        parameters = arguments.get("parameters", {})
        
        try:
            async with self.driver.session() as session:
                result = await session.run(query, parameters)
                data = await result.data()
                
                return {
                    "success": True,
                    "data": data
                }
        except Exception as e:
            self.logger.error(f"Query execution failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }


class Neo4jCreateNodeTool(Neo4jBaseTool):
    """Create nodes in Neo4j with optional embeddings."""
    
    def __init__(self, driver: AsyncDriver, embeddings_model):
        super().__init__(driver)
        self.embeddings_model = embeddings_model
    
    @property
    def description(self) -> str:
        return "Create a node in Neo4j with optional embedding generation"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "labels": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Node labels"
                },
                "properties": {
                    "type": "object",
                    "description": "Node properties"
                },
                "create_embedding": {
                    "type": "boolean",
                    "description": "Whether to create an embedding from content",
                    "default": False
                },
                "embedding_property": {
                    "type": "string",
                    "description": "Property name for storing the embedding",
                    "default": "embedding"
                }
            },
            "required": ["labels"]
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Create a node with optional embedding."""
        # Validate arguments
        if "labels" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: labels"
            }
        
        labels = arguments.get("labels")
        if not isinstance(labels, list):
            return {
                "success": False,
                "error": "Labels must be a list"
            }
        
        if not labels:
            return {
                "success": False,
                "error": "At least one label is required"
            }
        
        properties = arguments.get("properties", {})
        create_embedding = arguments.get("create_embedding", False)
        embedding_property = arguments.get("embedding_property", "embedding")
        
        try:
            # Generate embedding if requested
            if create_embedding and self.embeddings_model:
                # Combine text fields for embedding
                text_parts = []
                for key, value in properties.items():
                    if isinstance(value, str) and key not in [embedding_property]:
                        text_parts.append(f"{key}: {value}")
                
                if text_parts:
                    combined_text = " ".join(text_parts)
                    embedding = self.embeddings_model.embed(combined_text)
                    properties[embedding_property] = embedding
            
            # Create node
            labels_str = ":".join(labels)
            query = f"""
            CREATE (n:{labels_str})
            SET n = $properties
            RETURN n, id(n) as id, labels(n) as labels
            """
            
            async with self.driver.session() as session:
                result = await session.run(query, {"properties": properties})
                record = await result.single()
                
                if record:
                    node_data = record.data()
                    return {
                        "success": True,
                        "node": {
                            "id": node_data["id"],
                            "labels": node_data["labels"],
                            "properties": dict(node_data["n"])
                        }
                    }
                else:
                    return {
                        "success": False,
                        "error": "Failed to create node"
                    }
                    
        except Exception as e:
            self.logger.error(f"Node creation failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }


class Neo4jCreateRelationshipTool(Neo4jBaseTool):
    """Create relationships between nodes in Neo4j."""
    
    @property
    def description(self) -> str:
        return "Create a relationship between two nodes in Neo4j"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "start_node_id": {
                    "type": "integer",
                    "description": "ID of the start node"
                },
                "end_node_id": {
                    "type": "integer",
                    "description": "ID of the end node"
                },
                "relationship_type": {
                    "type": "string",
                    "description": "Type of the relationship"
                },
                "properties": {
                    "type": "object",
                    "description": "Relationship properties",
                    "default": {}
                }
            },
            "required": ["start_node_id", "end_node_id", "relationship_type"]
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Create a relationship between nodes."""
        # Validate arguments
        required = ["start_node_id", "end_node_id", "relationship_type"]
        for param in required:
            if param not in arguments:
                return {
                    "success": False,
                    "error": f"Missing required parameter: {param}"
                }
        
        start_id = arguments["start_node_id"]
        end_id = arguments["end_node_id"]
        rel_type = arguments["relationship_type"]
        properties = arguments.get("properties", {})
        
        try:
            query = f"""
            MATCH (a), (b)
            WHERE id(a) = $start_id AND id(b) = $end_id
            CREATE (a)-[r:{rel_type}]->(b)
            SET r = $properties
            RETURN r, a, b, type(r) as type
            """
            
            async with self.driver.session() as session:
                result = await session.run(query, {
                    "start_id": start_id,
                    "end_id": end_id,
                    "properties": properties
                })
                record = await result.single()
                
                if record:
                    data = record.data()
                    return {
                        "success": True,
                        "relationship": {
                            "type": data["type"],
                            "properties": dict(data["r"])
                        },
                        "start_node": {
                            "id": start_id,
                            "labels": list(data["a"].labels)
                        },
                        "end_node": {
                            "id": end_id,
                            "labels": list(data["b"].labels)
                        }
                    }
                else:
                    return {
                        "success": False,
                        "error": "Failed to create relationship - nodes not found"
                    }
                    
        except Exception as e:
            self.logger.error(f"Relationship creation failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }


class Neo4jVectorSearchTool(Neo4jBaseTool):
    """Search for similar nodes using vector similarity in Neo4j."""
    
    def __init__(self, driver: AsyncDriver, embeddings_model):
        super().__init__(driver)
        self.embeddings_model = embeddings_model
    
    @property
    def description(self) -> str:
        return "Search for similar nodes using vector similarity"
    
    @property
    def input_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query_text": {
                    "type": "string",
                    "description": "Text to search for"
                },
                "query_vector": {
                    "type": "array",
                    "items": {"type": "number"},
                    "description": "Pre-computed query vector (alternative to query_text)"
                },
                "label": {
                    "type": "string",
                    "description": "Node label to search within"
                },
                "embedding_property": {
                    "type": "string",
                    "description": "Property containing the embedding",
                    "default": "embedding"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results",
                    "default": 10
                },
                "min_similarity": {
                    "type": "number",
                    "description": "Minimum similarity score (0-1)",
                    "default": 0.0
                }
            },
            "required": ["label"]
        }
    
    async def execute(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Search for similar nodes."""
        # Validate arguments
        if "label" not in arguments:
            return {
                "success": False,
                "error": "Missing required parameter: label"
            }
        
        label = arguments["label"]
        embedding_property = arguments.get("embedding_property", "embedding")
        limit = arguments.get("limit", 10)
        min_similarity = arguments.get("min_similarity", 0.0)
        
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
            # Cypher query for cosine similarity
            query = f"""
            MATCH (n:{label})
            WHERE n.{embedding_property} IS NOT NULL
            WITH n, 
                 reduce(dot = 0.0, i IN range(0, size(n.{embedding_property})-1) | 
                        dot + n.{embedding_property}[i] * $query_vector[i]) /
                 (sqrt(reduce(sum1 = 0.0, i IN range(0, size(n.{embedding_property})-1) | 
                        sum1 + n.{embedding_property}[i] * n.{embedding_property}[i])) *
                  sqrt(reduce(sum2 = 0.0, i IN range(0, size($query_vector)-1) | 
                        sum2 + $query_vector[i] * $query_vector[i]))) AS similarity
            WHERE similarity >= $min_similarity
            RETURN n, similarity
            ORDER BY similarity DESC
            LIMIT $limit
            """
            
            async with self.driver.session() as session:
                result = await session.run(query, {
                    "query_vector": query_vector,
                    "min_similarity": min_similarity,
                    "limit": limit
                })
                records = await result.data()
                
                results = []
                for record in records:
                    results.append({
                        "node": dict(record["n"]),
                        "similarity": record["similarity"]
                    })
                
                return {
                    "success": True,
                    "results": results
                }
                
        except Exception as e:
            self.logger.error(f"Vector search failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }