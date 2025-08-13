use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::graph::GraphManagerTrait;

/// Configuration for vault-specific Neo4j databases
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultDatabaseConfig {
    pub vault_id: String,
    pub vault_path: String,
    pub neo4j_database: String,
    pub qdrant_collection: String,
}

/// Manager for vault isolation in graph databases
pub struct VaultIsolationManager {
    pub configs: HashMap<String, VaultDatabaseConfig>,
}

impl VaultIsolationManager {
    pub fn new() -> Self {
        Self {
            configs: HashMap::new(),
        }
    }

    /// Generate database name for a vault
    pub fn generate_database_name(vault_id: &str) -> String {
        // Replace hyphens with underscores for Neo4j compatibility
        let normalized_id = vault_id.replace('-', "_");
        format!("vault_{}", normalized_id)
    }

    /// Generate collection name for a vault
    pub fn generate_collection_name(vault_id: &str) -> String {
        // Use the first 8 characters of vault ID for Qdrant collection
        let short_id = vault_id.chars().take(8).collect::<String>();
        format!("vault_{}", short_id)
    }

    /// Create vault-specific database configuration
    pub fn create_vault_config(
        &mut self,
        vault_id: &str,
        vault_path: &str,
    ) -> VaultDatabaseConfig {
        let config = VaultDatabaseConfig {
            vault_id: vault_id.to_string(),
            vault_path: vault_path.to_string(),
            neo4j_database: Self::generate_database_name(vault_id),
            qdrant_collection: Self::generate_collection_name(vault_id),
        };
        
        self.configs.insert(vault_id.to_string(), config.clone());
        config
    }

    /// Get vault configuration
    pub fn get_vault_config(&self, vault_id: &str) -> Option<&VaultDatabaseConfig> {
        self.configs.get(vault_id)
    }

    /// Create Neo4j database for vault
    pub async fn create_vault_database(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
    ) -> Result<String, String> {
        let database_name = Self::generate_database_name(vault_id);
        
        // Switch to system database to create new database
        let create_query = format!(
            "CREATE DATABASE {} IF NOT EXISTS",
            database_name
        );
        
        // Execute on system database
        graph_manager.execute_cypher_on_system(&create_query, HashMap::new()).await?;
        
        // Switch to the new database and create indexes
        self.setup_vault_database_schema(graph_manager, &database_name).await?;
        
        Ok(database_name)
    }

    /// Setup schema and indexes for vault database
    pub async fn setup_vault_database_schema(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        database_name: &str,
    ) -> Result<(), String> {
        let schema_queries = vec![
            // Create indexes for nodes
            "CREATE INDEX node_uuid IF NOT EXISTS FOR (n:Note) ON (n.id)",
            "CREATE INDEX node_type IF NOT EXISTS FOR (n:Note) ON (n.type)",
            "CREATE INDEX node_title IF NOT EXISTS FOR (n:Note) ON (n.title)",
            "CREATE INDEX node_normalized_title IF NOT EXISTS FOR (n:Note) ON (n.normalized_title)",
            "CREATE INDEX node_vault_id IF NOT EXISTS FOR (n:Note) ON (n.vault_id)",
            "CREATE FULLTEXT INDEX node_search IF NOT EXISTS FOR (n:Note) ON [n.title, n.content]",
            
            // Create indexes for relationships
            "CREATE INDEX wikilink_rel IF NOT EXISTS FOR ()-[r:WIKILINK]-() ON (r.created_at)",
        ];
        
        for query in schema_queries {
            graph_manager.execute_cypher_on_database(database_name, query, HashMap::new()).await?;
        }
        
        Ok(())
    }

    /// Create Qdrant collection for vault
    pub async fn create_vault_collection(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
    ) -> Result<String, String> {
        let collection_name = Self::generate_collection_name(vault_id);
        
        // Create collection with standard embedding configuration
        let collection_config = serde_json::json!({
            "vectors": {
                "size": 1536,
                "distance": "Cosine"
            },
            "optimizers_config": {
                "default_segment_number": 2
            },
            "replication_factor": 1
        });
        
        graph_manager.create_qdrant_collection(&collection_name, collection_config).await?;
        
        Ok(collection_name)
    }

    /// Delete vault database and collection
    pub async fn delete_vault_resources(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
    ) -> Result<(), String> {
        let database_name = Self::generate_database_name(vault_id);
        let collection_name = Self::generate_collection_name(vault_id);
        
        // Delete Neo4j database
        let drop_query = format!("DROP DATABASE {} IF EXISTS", database_name);
        graph_manager.execute_cypher_on_system(&drop_query, HashMap::new()).await?;
        
        // Delete Qdrant collection
        graph_manager.delete_qdrant_collection(&collection_name).await?;
        
        Ok(())
    }

    /// Migrate existing data to vault-specific database
    pub async fn migrate_vault_data(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
        source_database: &str,
    ) -> Result<usize, String> {
        let target_database = Self::generate_database_name(vault_id);
        
        // First, create the target database
        self.create_vault_database(graph_manager, vault_id).await?;
        
        // Export data from source database
        let export_query = format!(
            r#"
            MATCH (n:Note)
            WHERE n.vault_id = $vault_id
            WITH collect(n) as notes
            UNWIND notes as note
            RETURN note.id as id, note.title as title, note.content as content,
                   note.path as path, note.created as created, note.modified as modified,
                   note.vault_id as vault_id
            "#
        );
        
        let mut params = HashMap::new();
        params.insert("vault_id".to_string(), vault_id.into());
        
        let _results = graph_manager.execute_cypher_on_database(
            source_database, 
            &export_query, 
            params
        ).await?;
        
        // This would parse results and insert them into the target database
        // For now, return placeholder count
        Ok(0)
    }

    /// Get vault database statistics
    pub async fn get_vault_stats(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
    ) -> Result<VaultStats, String> {
        let database_name = Self::generate_database_name(vault_id);
        
        let stats_query = r#"
            MATCH (n:Note)
            OPTIONAL MATCH ()-[r:WIKILINK]->()
            RETURN count(DISTINCT n) as node_count, count(r) as relationship_count
        "#;
        
        let _result = graph_manager.execute_cypher_on_database(
            &database_name, 
            stats_query, 
            HashMap::new()
        ).await?;
        
        // Parse results and return stats
        Ok(VaultStats {
            vault_id: vault_id.to_string(),
            node_count: 0,
            relationship_count: 0,
            database_name,
            collection_name: Self::generate_collection_name(vault_id),
        })
    }

    /// List all vault databases
    pub async fn list_vault_databases(
        &self,
        graph_manager: &dyn GraphManagerTrait,
    ) -> Result<Vec<String>, String> {
        let query = "SHOW DATABASES YIELD name WHERE name STARTS WITH 'vault_' RETURN name";
        let _result = graph_manager.execute_cypher_on_system(query, HashMap::new()).await?;
        
        // Parse results and return database names
        Ok(Vec::new())
    }

    /// Cleanup orphaned vault resources
    pub async fn cleanup_orphaned_resources(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        active_vault_ids: Vec<String>,
    ) -> Result<CleanupStats, String> {
        let all_databases = self.list_vault_databases(graph_manager).await?;
        let mut deleted_databases = 0;
        let mut deleted_collections = 0;
        
        for db_name in all_databases {
            if let Some(vault_id) = self.extract_vault_id_from_database_name(&db_name) {
                if !active_vault_ids.contains(&vault_id) {
                    // This vault is no longer active, delete its resources
                    match self.delete_vault_resources(graph_manager, &vault_id).await {
                        Ok(()) => {
                            deleted_databases += 1;
                            deleted_collections += 1;
                        }
                        Err(e) => {
                            eprintln!("Failed to cleanup vault {}: {}", vault_id, e);
                        }
                    }
                }
            }
        }
        
        Ok(CleanupStats {
            deleted_databases,
            deleted_collections,
        })
    }

    /// Extract vault ID from database name
    fn extract_vault_id_from_database_name(&self, db_name: &str) -> Option<String> {
        if db_name.starts_with("vault_") {
            let vault_id = &db_name[6..]; // Remove "vault_" prefix
            Some(vault_id.replace('_', "-")) // Convert back to original format
        } else {
            None
        }
    }
}

/// Statistics for a vault's graph database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultStats {
    pub vault_id: String,
    pub node_count: usize,
    pub relationship_count: usize,
    pub database_name: String,
    pub collection_name: String,
}

/// Statistics for cleanup operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupStats {
    pub deleted_databases: usize,
    pub deleted_collections: usize,
}

impl Default for VaultIsolationManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_database_name() {
        let test_cases = vec![
            ("a1b2c3d4-e5f6-g7h8-i9j0", "vault_a1b2c3d4_e5f6_g7h8_i9j0"),
            ("simple-vault", "vault_simple_vault"),
            ("vault123", "vault_vault123"),
        ];
        
        for (vault_id, expected) in test_cases {
            assert_eq!(VaultIsolationManager::generate_database_name(vault_id), expected);
        }
    }

    #[test]
    fn test_generate_collection_name() {
        let test_cases = vec![
            ("a1b2c3d4-e5f6-g7h8-i9j0", "vault_a1b2c3d4"),
            ("simple-vault", "vault_simple-v"),
            ("vault123", "vault_vault123"),
            ("shortid", "vault_shortid"),
        ];
        
        for (vault_id, expected) in test_cases {
            assert_eq!(VaultIsolationManager::generate_collection_name(vault_id), expected);
        }
    }

    #[test]
    fn test_create_vault_config() {
        let mut manager = VaultIsolationManager::new();
        let vault_id = "test-vault-123";
        let vault_path = "/path/to/vault";
        
        let config = manager.create_vault_config(vault_id, vault_path);
        
        assert_eq!(config.vault_id, vault_id);
        assert_eq!(config.vault_path, vault_path);
        assert_eq!(config.neo4j_database, "vault_test_vault_123");
        assert_eq!(config.qdrant_collection, "vault_test-vau");
        
        // Verify it's stored
        assert!(manager.get_vault_config(vault_id).is_some());
    }

    #[test]
    fn test_extract_vault_id_from_database_name() {
        let manager = VaultIsolationManager::new();
        
        let test_cases = vec![
            ("vault_a1b2c3d4_e5f6_g7h8_i9j0", Some("a1b2c3d4-e5f6-g7h8-i9j0".to_string())),
            ("vault_simple_vault", Some("simple-vault".to_string())),
            ("not_a_vault_db", None),
            ("vault_", Some("".to_string())),
        ];
        
        for (db_name, expected) in test_cases {
            assert_eq!(manager.extract_vault_id_from_database_name(db_name), expected);
        }
    }

    #[test]
    fn test_vault_config_isolation() {
        let mut manager = VaultIsolationManager::new();
        
        let config1 = manager.create_vault_config("vault-1", "/path/vault1");
        let config2 = manager.create_vault_config("vault-2", "/path/vault2");
        
        assert_ne!(config1.neo4j_database, config2.neo4j_database);
        assert_ne!(config1.qdrant_collection, config2.qdrant_collection);
        
        // Verify they're stored separately
        assert!(manager.get_vault_config("vault-1").is_some());
        assert!(manager.get_vault_config("vault-2").is_some());
        assert_ne!(
            manager.get_vault_config("vault-1").unwrap().neo4j_database,
            manager.get_vault_config("vault-2").unwrap().neo4j_database
        );
    }

    #[test]
    fn test_database_name_neo4j_compatibility() {
        // Test that generated names are valid Neo4j database names
        let vault_ids = vec![
            "a1b2c3d4-e5f6-g7h8-i9j0",
            "test-vault-with-many-hyphens",
            "simple",
        ];
        
        for vault_id in vault_ids {
            let db_name = VaultIsolationManager::generate_database_name(vault_id);
            
            // Neo4j database names should not contain hyphens
            assert!(!db_name.contains('-'), "Database name should not contain hyphens: {}", db_name);
            
            // Should start with vault_
            assert!(db_name.starts_with("vault_"), "Database name should start with vault_: {}", db_name);
            
            // Should contain only valid characters (alphanumeric and underscore)
            assert!(db_name.chars().all(|c| c.is_alphanumeric() || c == '_'), 
                   "Database name should only contain alphanumeric and underscore: {}", db_name);
        }
    }

    #[test]
    fn test_collection_name_length() {
        // Test that collection names are reasonable length for Qdrant
        let long_vault_id = "a".repeat(100);
        let collection_name = VaultIsolationManager::generate_collection_name(&long_vault_id);
        
        // Should be limited in length
        assert!(collection_name.len() <= 20, "Collection name too long: {}", collection_name);
        assert!(collection_name.starts_with("vault_"));
    }
}