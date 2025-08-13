use std::collections::HashMap;
use std::sync::Arc;
use serde::{Serialize, Deserialize};
use tokio::sync::Mutex;
use crate::graph::{GraphManagerTrait, Note};
use crate::graph::wikilink_integration::WikiLinkGraphManager;
use crate::graph::vault_isolation::{VaultIsolationManager, VaultDatabaseConfig};

/// Configuration for vault-specific graph synchronization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultGraphSyncConfig {
    pub vault_id: String,
    pub vault_path: String,
    pub database_config: VaultDatabaseConfig,
}

/// Manager for vault-specific graph synchronization
pub struct VaultGraphSyncManager {
    vault_isolation: Arc<Mutex<VaultIsolationManager>>,
    wikilink_manager: Arc<WikiLinkGraphManager>,
    sync_configs: Arc<Mutex<HashMap<String, VaultGraphSyncConfig>>>,
}

impl VaultGraphSyncManager {
    pub fn new() -> Result<Self, String> {
        let wikilink_manager = WikiLinkGraphManager::new()?;
        
        Ok(Self {
            vault_isolation: Arc::new(Mutex::new(VaultIsolationManager::new())),
            wikilink_manager: Arc::new(wikilink_manager),
            sync_configs: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// Initialize vault-specific graph databases and collections
    pub async fn initialize_vault_sync(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
        vault_path: &str,
    ) -> Result<VaultGraphSyncConfig, String> {
        let mut isolation_manager = self.vault_isolation.lock().await;
        
        // Create vault configuration
        let vault_config = isolation_manager.create_vault_config(vault_id, vault_path);
        
        // Create Neo4j database for this vault
        let database_name = isolation_manager.create_vault_database(graph_manager, vault_id).await?;
        
        // Create Qdrant collection for this vault
        let collection_name = isolation_manager.create_vault_collection(graph_manager, vault_id).await?;
        
        // Store sync configuration
        let sync_config = VaultGraphSyncConfig {
            vault_id: vault_id.to_string(),
            vault_path: vault_path.to_string(),
            database_config: vault_config,
        };
        
        let mut configs = self.sync_configs.lock().await;
        configs.insert(vault_id.to_string(), sync_config.clone());
        
        Ok(sync_config)
    }

    /// Sync a note to the vault-specific graph database
    pub async fn sync_note_to_vault_graph(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
        note: &Note,
        old_content: Option<&str>,
    ) -> Result<(), String> {
        let configs = self.sync_configs.lock().await;
        let sync_config = configs.get(vault_id)
            .ok_or_else(|| format!("No sync configuration found for vault: {}", vault_id))?;
        
        // Extract WikiLink operations from content changes
        let operations = self.wikilink_manager.generate_operations(
            &note.id,
            &note.path,
            vault_id,
            old_content,
            &note.content,
        );
        
        if !operations.is_empty() {
            // Create WikiLink relationships in vault-specific database
            let created_count = self.wikilink_manager
                .create_wikilink_relations(graph_manager, operations)
                .await?;
            
            println!("Created {} WikiLink relationships for note {} in vault {}", 
                     created_count, note.id, vault_id);
        }
        
        // Sync note data to vault database
        self.sync_note_data_to_vault(graph_manager, sync_config, note).await?;
        
        Ok(())
    }

    /// Sync note data to vault-specific database
    async fn sync_note_data_to_vault(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        sync_config: &VaultGraphSyncConfig,
        note: &Note,
    ) -> Result<(), String> {
        let query = r#"
            MERGE (n:Note {id: $note_id})
            SET n.title = $title,
                n.content = $content,
                n.path = $path,
                n.created = $created,
                n.modified = $modified,
                n.vault_id = $vault_id,
                n.normalized_title = $normalized_title
            RETURN n
        "#;
        
        let mut params = HashMap::new();
        params.insert("note_id".to_string(), neo4rs::BoltType::from(note.id.clone()));
        params.insert("title".to_string(), neo4rs::BoltType::from(note.title.clone()));
        params.insert("content".to_string(), neo4rs::BoltType::from(note.content.clone()));
        params.insert("path".to_string(), neo4rs::BoltType::from(note.path.clone()));
        params.insert("created".to_string(), neo4rs::BoltType::from(note.created.to_rfc3339()));
        params.insert("modified".to_string(), neo4rs::BoltType::from(note.modified.to_rfc3339()));
        params.insert("vault_id".to_string(), neo4rs::BoltType::from(sync_config.vault_id.clone()));
        params.insert("normalized_title".to_string(), neo4rs::BoltType::from(
            self.wikilink_manager.normalize_wikilink_name(&note.title)
        ));
        
        graph_manager.execute_cypher_on_database(
            &sync_config.database_config.neo4j_database,
            query,
            params,
        ).await?;
        
        Ok(())
    }

    /// Remove a note from the vault-specific graph database
    pub async fn remove_note_from_vault_graph(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
        note_id: &str,
    ) -> Result<(), String> {
        let configs = self.sync_configs.lock().await;
        let sync_config = configs.get(vault_id)
            .ok_or_else(|| format!("No sync configuration found for vault: {}", vault_id))?;
        
        // Remove all WikiLink relationships for this note
        let query = r#"
            MATCH (n:Note {id: $note_id})
            DETACH DELETE n
        "#;
        
        let mut params = HashMap::new();
        params.insert("note_id".to_string(), neo4rs::BoltType::from(note_id.to_string()));
        
        graph_manager.execute_cypher_on_database(
            &sync_config.database_config.neo4j_database,
            query,
            params,
        ).await?;
        
        Ok(())
    }

    /// Get vault-specific WikiLink relationships
    pub async fn get_vault_wikilinks(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
        note_id: &str,
    ) -> Result<Vec<WikiLinkRelation>, String> {
        let configs = self.sync_configs.lock().await;
        let sync_config = configs.get(vault_id)
            .ok_or_else(|| format!("No sync configuration found for vault: {}", vault_id))?;
        
        let query = r#"
            MATCH (source:Note {id: $note_id})-[rel:WIKILINK]->(target:Note)
            WHERE source.vault_id = $vault_id AND target.vault_id = $vault_id
            RETURN source.id as source_id, source.path as source_path,
                   target.title as target_name, target.normalized_title as normalized_target_name,
                   rel.context as context
        "#;
        
        let mut params = HashMap::new();
        params.insert("note_id".to_string(), neo4rs::BoltType::from(note_id.to_string()));
        params.insert("vault_id".to_string(), neo4rs::BoltType::from(vault_id.to_string()));
        
        let _result = graph_manager.execute_cypher_on_database(
            &sync_config.database_config.neo4j_database,
            query,
            params,
        ).await?;
        
        // This would parse the results and return WikiLinkRelation objects
        // For now, return empty vec as placeholder
        Ok(Vec::new())
    }

    /// Cleanup vault-specific graph data
    pub async fn cleanup_vault_graph(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
    ) -> Result<(), String> {
        let isolation_manager = self.vault_isolation.lock().await;
        
        // Delete vault-specific databases and collections
        isolation_manager.delete_vault_resources(graph_manager, vault_id).await?;
        
        // Remove sync configuration
        let mut configs = self.sync_configs.lock().await;
        configs.remove(vault_id);
        
        Ok(())
    }

    /// Get vault synchronization stats
    pub async fn get_vault_sync_stats(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
    ) -> Result<VaultSyncStats, String> {
        let isolation_manager = self.vault_isolation.lock().await;
        let vault_stats = isolation_manager.get_vault_stats(graph_manager, vault_id).await?;
        
        Ok(VaultSyncStats {
            vault_id: vault_id.to_string(),
            database_name: vault_stats.database_name,
            collection_name: vault_stats.collection_name,
            node_count: vault_stats.node_count,
            relationship_count: vault_stats.relationship_count,
            last_sync: std::time::SystemTime::now(),
        })
    }

    /// Batch sync multiple notes to vault graph
    pub async fn batch_sync_notes_to_vault(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
        notes: Vec<&Note>,
    ) -> Result<usize, String> {
        let mut synced_count = 0;
        
        for note in notes {
            match self.sync_note_to_vault_graph(graph_manager, vault_id, note, None).await {
                Ok(()) => synced_count += 1,
                Err(e) => {
                    eprintln!("Failed to sync note {} to vault {}: {}", note.id, vault_id, e);
                }
            }
        }
        
        Ok(synced_count)
    }

    /// Check if a vault is initialized for graph sync
    pub async fn is_vault_initialized(&self, vault_id: &str) -> bool {
        let configs = self.sync_configs.lock().await;
        configs.contains_key(vault_id)
    }

    /// Get all initialized vault IDs
    pub async fn get_initialized_vaults(&self) -> Vec<String> {
        let configs = self.sync_configs.lock().await;
        configs.keys().cloned().collect()
    }
}

/// Represents a WikiLink relationship in the graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikiLinkRelation {
    pub source_id: String,
    pub source_path: String,
    pub target_name: String,
    pub normalized_target_name: String,
    pub context: serde_json::Value,
}

/// Statistics for vault graph synchronization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultSyncStats {
    pub vault_id: String,
    pub database_name: String,
    pub collection_name: String,
    pub node_count: usize,
    pub relationship_count: usize,
    pub last_sync: std::time::SystemTime,
}

impl Default for VaultGraphSyncManager {
    fn default() -> Self {
        Self::new().expect("Failed to create default VaultGraphSyncManager")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_vault_sync_manager_creation() {
        let manager = VaultGraphSyncManager::new().unwrap();
        assert_eq!(manager.get_initialized_vaults().await.len(), 0);
    }
    
    #[test]
    fn test_wikilink_relation_serialization() {
        let relation = WikiLinkRelation {
            source_id: "note-123".to_string(),
            source_path: "/vault/note.md".to_string(),
            target_name: "Target Note".to_string(),
            normalized_target_name: "target note".to_string(),
            context: serde_json::json!({"position": 10, "full_match": "[[Target Note]]"}),
        };
        
        let serialized = serde_json::to_string(&relation).unwrap();
        let deserialized: WikiLinkRelation = serde_json::from_str(&serialized).unwrap();
        
        assert_eq!(relation.source_id, deserialized.source_id);
        assert_eq!(relation.target_name, deserialized.target_name);
    }
    
    #[tokio::test]
    async fn test_vault_initialization_check() {
        let manager = VaultGraphSyncManager::new().unwrap();
        
        let vault_id = "test-vault";
        assert!(!manager.is_vault_initialized(vault_id).await);
        
        // After initialization (mock)
        let mut configs = manager.sync_configs.lock().await;
        configs.insert(vault_id.to_string(), VaultGraphSyncConfig {
            vault_id: vault_id.to_string(),
            vault_path: "/test/vault".to_string(),
            database_config: crate::graph::vault_isolation::VaultDatabaseConfig {
                vault_id: vault_id.to_string(),
                vault_path: "/test/vault".to_string(),
                neo4j_database: "vault_test_vault".to_string(),
                qdrant_collection: "vault_test_vau".to_string(),
            },
        });
        drop(configs);
        
        assert!(manager.is_vault_initialized(vault_id).await);
        assert_eq!(manager.get_initialized_vaults().await, vec![vault_id]);
    }
    
    #[test]
    fn test_vault_sync_stats_creation() {
        let stats = VaultSyncStats {
            vault_id: "vault-123".to_string(),
            database_name: "vault_vault_123".to_string(),
            collection_name: "vault_vault".to_string(),
            node_count: 100,
            relationship_count: 50,
            last_sync: std::time::SystemTime::now(),
        };
        
        assert_eq!(stats.vault_id, "vault-123");
        assert_eq!(stats.node_count, 100);
        assert_eq!(stats.relationship_count, 50);
    }
}