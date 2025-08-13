use std::sync::Arc;
use parking_lot::RwLock;
use anyhow::Result;
use serde::{Serialize, Deserialize};

use crate::identity::IdentityManager;
use crate::identity::api_updates::ApiUpdateHelper;

/// Updated embedding storage that uses UUIDs as keys
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UuidEmbedding {
    /// UUID of the note
    pub note_id: String,
    /// The embedding vector
    pub vector: Vec<f32>,
    /// Metadata about the embedding
    pub metadata: EmbeddingMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingMetadata {
    /// Original path (for reference)
    pub path: String,
    /// When the embedding was generated
    pub generated_at: chrono::DateTime<chrono::Utc>,
    /// Model used to generate the embedding
    pub model: String,
    /// Legacy ID if this was migrated
    pub legacy_id: Option<String>,
}

/// Service for managing embeddings with UUIDs
pub struct UuidEmbeddingService {
    identity_manager: Arc<RwLock<IdentityManager>>,
    qdrant_client: Arc<dyn QdrantClient>,
}

/// Trait for Qdrant operations
pub trait QdrantClient: Send + Sync {
    async fn upsert_embedding(&self, collection: &str, id: &str, vector: Vec<f32>, payload: serde_json::Value) -> Result<()>;
    async fn get_embedding(&self, collection: &str, id: &str) -> Result<Option<(Vec<f32>, serde_json::Value)>>;
    async fn delete_embedding(&self, collection: &str, id: &str) -> Result<()>;
    async fn search_similar(&self, collection: &str, vector: Vec<f32>, limit: usize) -> Result<Vec<(String, f32)>>;
}

impl UuidEmbeddingService {
    pub fn new(
        identity_manager: Arc<RwLock<IdentityManager>>,
        qdrant_client: Arc<dyn QdrantClient>,
    ) -> Self {
        Self {
            identity_manager,
            qdrant_client,
        }
    }

    /// Store an embedding using UUID as key
    pub async fn store_embedding(
        &self,
        note_path: &std::path::Path,
        vector: Vec<f32>,
        model: String,
    ) -> Result<String> {
        // Get or create UUID for the note
        let helper = ApiUpdateHelper::new(self.identity_manager.clone());
        let uuid = helper.ensure_note_id(note_path).await?;
        
        // Create metadata
        let metadata = EmbeddingMetadata {
            path: note_path.to_string_lossy().to_string(),
            generated_at: chrono::Utc::now(),
            model,
            legacy_id: None,
        };
        
        // Store in Qdrant with UUID as key
        let payload = serde_json::to_value(&metadata)?;
        self.qdrant_client.upsert_embedding(
            "embeddings",
            &uuid,
            vector,
            payload
        ).await?;
        
        println!("Stored embedding with UUID: {}", uuid);
        
        Ok(uuid)
    }

    /// Retrieve an embedding by UUID (with legacy ID fallback)
    pub async fn get_embedding(&self, id: &str, vault_root: &std::path::Path) -> Result<Option<UuidEmbedding>> {
        let helper = ApiUpdateHelper::new(self.identity_manager.clone());
        
        // Resolve the ID (handles both UUID and legacy)
        let resolved_id = helper.resolve_id(id, vault_root).await?;
        
        // Get from Qdrant
        match self.qdrant_client.get_embedding("embeddings", &resolved_id).await? {
            Some((vector, payload)) => {
                let metadata: EmbeddingMetadata = serde_json::from_value(payload)?;
                
                Ok(Some(UuidEmbedding {
                    note_id: resolved_id,
                    vector,
                    metadata,
                }))
            }
            None => Ok(None),
        }
    }

    /// Delete an embedding by UUID
    pub async fn delete_embedding(&self, id: &str, vault_root: &std::path::Path) -> Result<()> {
        let helper = ApiUpdateHelper::new(self.identity_manager.clone());
        
        // Resolve the ID
        let resolved_id = helper.resolve_id(id, vault_root).await?;
        
        // Delete from Qdrant
        self.qdrant_client.delete_embedding("embeddings", &resolved_id).await?;
        
        println!("Deleted embedding with UUID: {}", resolved_id);
        
        Ok(())
    }

    /// Search for similar embeddings, returning UUIDs
    pub async fn search_similar(
        &self,
        query_vector: Vec<f32>,
        limit: usize,
    ) -> Result<Vec<(String, f32)>> {
        // Search returns UUIDs with scores
        self.qdrant_client.search_similar("embeddings", query_vector, limit).await
    }

    /// Migrate embeddings from legacy IDs to UUIDs
    pub async fn migrate_embeddings(
        &self,
        vault_root: &std::path::Path,
        dry_run: bool,
    ) -> Result<MigrationReport> {
        let mut report = MigrationReport::default();
        
        // This would iterate through all embeddings and update their IDs
        // For now, return a placeholder report
        
        if dry_run {
            println!("DRY RUN: Would migrate embeddings to use UUIDs");
        } else {
            println!("Migrating embeddings to use UUIDs...");
            // Actual migration logic would go here
        }
        
        Ok(report)
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct MigrationReport {
    pub total_embeddings: usize,
    pub migrated: usize,
    pub already_uuid: usize,
    pub errors: Vec<String>,
}

/// Backward-compatible embedding operations
pub struct CompatibleEmbeddingService {
    uuid_service: UuidEmbeddingService,
    use_legacy: bool,
}

impl CompatibleEmbeddingService {
    pub fn new(
        identity_manager: Arc<RwLock<IdentityManager>>,
        qdrant_client: Arc<dyn QdrantClient>,
        use_legacy: bool,
    ) -> Self {
        Self {
            uuid_service: UuidEmbeddingService::new(identity_manager, qdrant_client),
            use_legacy,
        }
    }

    /// Store embedding with appropriate ID type
    pub async fn store_embedding(
        &self,
        note_path: &std::path::Path,
        vault_id: &str,
        vector: Vec<f32>,
        model: String,
    ) -> Result<String> {
        if self.use_legacy {
            // Use legacy path-based ID
            let legacy_id = ApiUpdateHelper::calculate_legacy_id(vault_id, note_path);
            
            eprintln!("⚠️  Using legacy ID: {}. Please migrate to UUIDs.", legacy_id);
            
            // Store with legacy ID
            let metadata = serde_json::json!({
                "path": note_path.to_string_lossy(),
                "generated_at": chrono::Utc::now(),
                "model": model,
                "is_legacy": true,
            });
            
            // This would use the old Qdrant client method
            // For now, return the legacy ID
            Ok(legacy_id)
        } else {
            // Use UUID
            self.uuid_service.store_embedding(note_path, vector, model).await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::path::PathBuf;

    // Mock Qdrant client for testing
    struct MockQdrantClient;

    #[async_trait::async_trait]
    impl QdrantClient for MockQdrantClient {
        async fn upsert_embedding(&self, _collection: &str, _id: &str, _vector: Vec<f32>, _payload: serde_json::Value) -> Result<()> {
            Ok(())
        }

        async fn get_embedding(&self, _collection: &str, _id: &str) -> Result<Option<(Vec<f32>, serde_json::Value)>> {
            Ok(None)
        }

        async fn delete_embedding(&self, _collection: &str, _id: &str) -> Result<()> {
            Ok(())
        }

        async fn search_similar(&self, _collection: &str, _vector: Vec<f32>, _limit: usize) -> Result<Vec<(String, f32)>> {
            Ok(vec![])
        }
    }

    #[tokio::test]
    async fn test_store_embedding_with_uuid() {
        let temp_dir = TempDir::new().unwrap();
        let vault_root = temp_dir.path().to_path_buf();
        
        let identity_manager = Arc::new(RwLock::new(
            IdentityManager::new(vault_root.clone())
        ));
        
        let qdrant_client = Arc::new(MockQdrantClient);
        let service = UuidEmbeddingService::new(identity_manager, qdrant_client);
        
        let note_path = vault_root.join("test.md");
        std::fs::write(&note_path, "test content").unwrap();
        
        let vector = vec![0.1, 0.2, 0.3];
        let uuid = service.store_embedding(&note_path, vector, "test-model".to_string()).await.unwrap();
        
        // Should be a valid UUID
        assert!(crate::identity::api_updates::is_uuid(&uuid));
    }
}