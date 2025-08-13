#!/usr/bin/env python3
"""MCP Knowledge Server - Unified Neo4j and Qdrant operations with shared embeddings."""

import os
import sys
import asyncio
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from aiohttp import web
from aiohttp_sse import sse_response
import structlog
from dotenv import load_dotenv
from neo4j import AsyncGraphDatabase
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from sentence_transformers import SentenceTransformer
import numpy as np

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = structlog.get_logger()

# Global instances
embeddings_model = None
neo4j_driver = None
qdrant_client = None

class MCPServer:
    """HTTP/SSE MCP Server implementation."""
    
    def __init__(self):
        self.app = web.Application()
        self.setup_routes()
        
    def setup_routes(self):
        self.app.router.add_get('/health', self.health)
        self.app.router.add_post('/rpc', self.handle_rpc)
        self.app.router.add_get('/sse', self.handle_sse)
        
    async def health(self, request):
        """Health check endpoint."""
        return web.json_response({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})
        
    async def handle_rpc(self, request):
        """Handle JSON-RPC requests."""
        try:
            data = await request.json()
            method = data.get('method')
            params = data.get('params', {})
            id = data.get('id')
            
            result = await self.process_method(method, params)
            
            return web.json_response({
                'jsonrpc': '2.0',
                'result': result,
                'id': id
            })
        except Exception as e:
            logger.error(f"RPC error: {e}")
            return web.json_response({
                'jsonrpc': '2.0',
                'error': {
                    'code': -32603,
                    'message': str(e)
                },
                'id': data.get('id') if 'data' in locals() else None
            })
            
    async def handle_sse(self, request):
        """Handle Server-Sent Events for MCP communication."""
        async with sse_response(request) as resp:
            await resp.prepare(request)
            
            # Send initial capabilities
            await resp.send(json.dumps({
                'jsonrpc': '2.0',
                'method': 'initialized',
                'params': {
                    'protocolVersion': '1.0.0',
                    'capabilities': {
                        'tools': True
                    }
                }
            }))
            
            # Keep connection alive
            try:
                while not resp.task.done():
                    await asyncio.sleep(30)
                    await resp.send(json.dumps({'ping': True}))
            except asyncio.CancelledError:
                pass
                
        return resp
        
    async def process_method(self, method: str, params: Dict[str, Any]) -> Any:
        """Process JSON-RPC methods."""
        if method == 'initialize':
            return {
                'protocolVersion': '1.0.0',
                'capabilities': {
                    'tools': {
                        'listTools': True
                    }
                }
            }
        elif method == 'tools/list':
            return await self.list_tools()
        elif method == 'tools/call':
            return await self.call_tool(params.get('name'), params.get('arguments', {}))
        else:
            raise ValueError(f"Unknown method: {method}")
            
    async def list_tools(self) -> Dict[str, Any]:
        """List available tools."""
        tools = [
            # Neo4j tools
            {
                'name': 'neo4j_query',
                'description': 'Execute a Cypher query against Neo4j',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {'type': 'string', 'description': 'Cypher query to execute'},
                        'parameters': {'type': 'object', 'description': 'Query parameters'}
                    },
                    'required': ['query']
                }
            },
            {
                'name': 'neo4j_create_node',
                'description': 'Create a node in Neo4j with optional embeddings',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'labels': {'type': 'array', 'items': {'type': 'string'}},
                        'properties': {'type': 'object'},
                        'generate_embedding_for': {'type': 'string', 'description': 'Property name to generate embedding for'}
                    },
                    'required': ['labels', 'properties']
                }
            },
            {
                'name': 'neo4j_create_relationship',
                'description': 'Create a relationship between two nodes',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'from_node_id': {'type': 'string'},
                        'to_node_id': {'type': 'string'},
                        'relationship_type': {'type': 'string'},
                        'properties': {'type': 'object'}
                    },
                    'required': ['from_node_id', 'to_node_id', 'relationship_type']
                }
            },
            {
                'name': 'neo4j_vector_search',
                'description': 'Search for similar nodes using vector similarity',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'text': {'type': 'string'},
                        'label': {'type': 'string'},
                        'property_name': {'type': 'string'},
                        'limit': {'type': 'integer', 'default': 10}
                    },
                    'required': ['text']
                }
            },
            # Qdrant tools
            {
                'name': 'embeddings_generate',
                'description': 'Generate embeddings for text',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'text': {'type': 'string'},
                        'texts': {'type': 'array', 'items': {'type': 'string'}}
                    }
                }
            },
            {
                'name': 'qdrant_create_collection',
                'description': 'Create a new Qdrant collection',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'collection_name': {'type': 'string'},
                        'size': {'type': 'integer', 'default': 768}
                    },
                    'required': ['collection_name']
                }
            },
            {
                'name': 'qdrant_upsert_points',
                'description': 'Insert or update points in Qdrant',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'collection_name': {'type': 'string'},
                        'points': {'type': 'array'},
                        'wait': {'type': 'boolean', 'default': True}
                    },
                    'required': ['collection_name', 'points']
                }
            },
            {
                'name': 'qdrant_search',
                'description': 'Search for similar vectors',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'collection_name': {'type': 'string'},
                        'text': {'type': 'string'},
                        'vector': {'type': 'array', 'items': {'type': 'number'}},
                        'limit': {'type': 'integer', 'default': 10},
                        'score_threshold': {'type': 'number'}
                    },
                    'required': ['collection_name']
                }
            },
            {
                'name': 'qdrant_get_collection_info',
                'description': 'Get information about a collection',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'collection_name': {'type': 'string'}
                    },
                    'required': ['collection_name']
                }
            },
            {
                'name': 'qdrant_delete_points',
                'description': 'Delete points from a collection',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'collection_name': {'type': 'string'},
                        'point_ids': {'type': 'array', 'items': {'type': 'string'}}
                    },
                    'required': ['collection_name', 'point_ids']
                }
            },
            {
                'name': 'embeddings_model_info',
                'description': 'Get information about the embedding model',
                'inputSchema': {
                    'type': 'object',
                    'properties': {}
                }
            }
        ]
        
        return {'tools': tools}
        
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Execute a tool and return results."""
        logger.info(f"Calling tool: {tool_name} with arguments: {arguments}")
        
        # Neo4j tools
        if tool_name == 'neo4j_query':
            return await self.neo4j_query(arguments)
        elif tool_name == 'neo4j_create_node':
            return await self.neo4j_create_node(arguments)
        elif tool_name == 'neo4j_create_relationship':
            return await self.neo4j_create_relationship(arguments)
        elif tool_name == 'neo4j_vector_search':
            return await self.neo4j_vector_search(arguments)
        # Qdrant tools
        elif tool_name == 'embeddings_generate':
            return await self.embeddings_generate(arguments)
        elif tool_name == 'qdrant_create_collection':
            return await self.qdrant_create_collection(arguments)
        elif tool_name == 'qdrant_upsert_points':
            return await self.qdrant_upsert_points(arguments)
        elif tool_name == 'qdrant_search':
            return await self.qdrant_search(arguments)
        elif tool_name == 'qdrant_get_collection_info':
            return await self.qdrant_get_collection_info(arguments)
        elif tool_name == 'qdrant_delete_points':
            return await self.qdrant_delete_points(arguments)
        elif tool_name == 'embeddings_model_info':
            return await self.embeddings_model_info(arguments)
        else:
            raise ValueError(f"Unknown tool: {tool_name}")
            
    # Tool implementations
    async def neo4j_query(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a Cypher query."""
        query = args['query']
        parameters = args.get('parameters', {})
        
        async with neo4j_driver.session() as session:
            result = await session.run(query, parameters)
            records = []
            async for record in result:
                records.append(dict(record))
            
        return {'records': records, 'count': len(records)}
        
    async def neo4j_create_node(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a node with optional embeddings."""
        labels = args['labels']
        properties = args['properties']
        generate_embedding_for = args.get('generate_embedding_for')
        
        # Generate embedding if requested
        if generate_embedding_for and generate_embedding_for in properties:
            text = properties[generate_embedding_for]
            embedding = embeddings_model.encode(text).tolist()
            properties[f'{generate_embedding_for}_embedding'] = embedding
            
        # Create node
        labels_str = ':'.join(labels)
        query = f"CREATE (n:{labels_str} $props) RETURN n"
        
        async with neo4j_driver.session() as session:
            result = await session.run(query, props=properties)
            record = await result.single()
            
        return {'node': dict(record['n']) if record else None}
        
    async def neo4j_create_relationship(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a relationship between nodes."""
        from_id = args['from_node_id']
        to_id = args['to_node_id']
        rel_type = args['relationship_type']
        properties = args.get('properties', {})
        
        query = """
        MATCH (a) WHERE id(a) = $from_id
        MATCH (b) WHERE id(b) = $to_id
        CREATE (a)-[r:""" + rel_type + """ $props]->(b)
        RETURN r
        """
        
        async with neo4j_driver.session() as session:
            result = await session.run(query, from_id=int(from_id), to_id=int(to_id), props=properties)
            record = await result.single()
            
        return {'relationship': dict(record['r']) if record else None}
        
    async def neo4j_vector_search(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Vector similarity search in Neo4j."""
        text = args['text']
        label = args.get('label')
        property_name = args.get('property_name', 'text')
        limit = args.get('limit', 10)
        
        # Generate embedding for search text
        embedding = embeddings_model.encode(text).tolist()
        
        # Build query
        match_clause = f"MATCH (n:{label})" if label else "MATCH (n)"
        query = f"""
        {match_clause}
        WHERE n.{property_name}_embedding IS NOT NULL
        WITH n, gds.similarity.cosine(n.{property_name}_embedding, $embedding) AS similarity
        RETURN n, similarity
        ORDER BY similarity DESC
        LIMIT $limit
        """
        
        async with neo4j_driver.session() as session:
            result = await session.run(query, embedding=embedding, limit=limit)
            records = []
            async for record in result:
                records.append({
                    'node': dict(record['n']),
                    'similarity': float(record['similarity'])
                })
                
        return {'results': records}
        
    async def embeddings_generate(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Generate embeddings."""
        if 'text' in args:
            embedding = embeddings_model.encode(args['text']).tolist()
            return {'embedding': embedding, 'dimensions': len(embedding)}
        elif 'texts' in args:
            embeddings = embeddings_model.encode(args['texts']).tolist()
            return {'embeddings': embeddings, 'dimensions': len(embeddings[0]) if embeddings else 0}
        else:
            raise ValueError("Either 'text' or 'texts' must be provided")
            
    async def qdrant_create_collection(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create Qdrant collection."""
        collection_name = args['collection_name']
        size = args.get('size', 768)
        
        await qdrant_client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=size, distance=Distance.COSINE),
        )
        
        return {'collection_name': collection_name, 'created': True}
        
    async def qdrant_upsert_points(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Upsert points to Qdrant."""
        collection_name = args['collection_name']
        points = args['points']
        wait = args.get('wait', True)
        
        # Convert points to PointStruct
        point_structs = []
        for point in points:
            # Generate embedding if text is provided
            if 'text' in point and 'vector' not in point:
                point['vector'] = embeddings_model.encode(point['text']).tolist()
                
            point_structs.append(PointStruct(
                id=point['id'],
                vector=point['vector'],
                payload=point.get('payload', {})
            ))
            
        await qdrant_client.upsert(
            collection_name=collection_name,
            points=point_structs,
            wait=wait
        )
        
        return {'upserted': len(point_structs)}
        
    async def qdrant_search(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Search in Qdrant."""
        collection_name = args['collection_name']
        limit = args.get('limit', 10)
        score_threshold = args.get('score_threshold')
        
        # Generate embedding if text is provided
        if 'text' in args:
            vector = embeddings_model.encode(args['text']).tolist()
        elif 'vector' in args:
            vector = args['vector']
        else:
            raise ValueError("Either 'text' or 'vector' must be provided")
            
        results = await qdrant_client.search(
            collection_name=collection_name,
            query_vector=vector,
            limit=limit,
            score_threshold=score_threshold
        )
        
        return {
            'results': [
                {
                    'id': hit.id,
                    'score': hit.score,
                    'payload': hit.payload
                }
                for hit in results
            ]
        }
        
    async def qdrant_get_collection_info(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get collection info."""
        collection_name = args['collection_name']
        
        info = await qdrant_client.get_collection(collection_name)
        
        return {
            'collection_name': collection_name,
            'vectors_count': info.vectors_count,
            'points_count': info.points_count,
            'config': {
                'size': info.config.params.vectors.size,
                'distance': info.config.params.vectors.distance
            }
        }
        
    async def qdrant_delete_points(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Delete points from Qdrant."""
        collection_name = args['collection_name']
        point_ids = args['point_ids']
        
        await qdrant_client.delete(
            collection_name=collection_name,
            points_selector=point_ids
        )
        
        return {'deleted': len(point_ids)}
        
    async def embeddings_model_info(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get embedding model info."""
        return {
            'model_name': os.getenv('EMBEDDING_MODEL', 'nomic-ai/nomic-embed-text-v1.5'),
            'dimensions': 768,
            'max_seq_length': embeddings_model.max_seq_length
        }
        
    def run(self, host='0.0.0.0', port=8100):
        """Run the server."""
        web.run_app(self.app, host=host, port=port)


async def init_services():
    """Initialize all services."""
    global embeddings_model, neo4j_driver, qdrant_client
    
    # Initialize embedding model
    logger.info("Loading embedding model...")
    model_name = os.getenv('EMBEDDING_MODEL', 'nomic-ai/nomic-embed-text-v1.5')
    embeddings_model = SentenceTransformer(model_name, cache_folder='/app/models', trust_remote_code=True)
    logger.info(f"Loaded model: {model_name}")
    
    # Initialize Neo4j
    neo4j_uri = os.getenv('NEO4J_URI', 'bolt://neo4j:7687')
    neo4j_user = os.getenv('NEO4J_USER', 'neo4j')
    neo4j_password = os.getenv('NEO4J_PASSWORD')
    
    neo4j_driver = AsyncGraphDatabase.driver(
        neo4j_uri,
        auth=(neo4j_user, neo4j_password)
    )
    logger.info(f"Connected to Neo4j at {neo4j_uri}")
    
    # Initialize Qdrant
    qdrant_host = os.getenv('QDRANT_HOST', 'qdrant')
    qdrant_port = int(os.getenv('QDRANT_PORT', '6333'))
    
    qdrant_client = AsyncQdrantClient(
        host=qdrant_host,
        port=qdrant_port
    )
    logger.info(f"Connected to Qdrant at {qdrant_host}:{qdrant_port}")


async def cleanup():
    """Cleanup resources."""
    global neo4j_driver, qdrant_client
    
    if neo4j_driver:
        await neo4j_driver.close()
    if qdrant_client:
        await qdrant_client.close()


def main():
    """Main entry point."""
    # Initialize services
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(init_services())
    
    # Create and run server
    server = MCPServer()
    logger.info("Starting MCP Knowledge Server on port 8100...")
    
    try:
        server.run()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        loop.run_until_complete(cleanup())
        loop.close()


if __name__ == '__main__':
    main()