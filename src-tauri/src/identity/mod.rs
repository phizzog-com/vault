pub mod cache;
pub mod uuid;
pub mod frontmatter;
pub mod sidecar;
pub mod watcher;
pub mod migration;
pub mod api_updates;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use anyhow::Result;

use crate::identity::cache::IdentityCache;
use crate::identity::uuid::UuidGenerator;
use crate::identity::frontmatter::{FrontMatter, FrontMatterParser, FrontMatterWriter};
use crate::identity::sidecar::{SidecarData, SidecarManager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NoteIdentity {
    pub id: String,
    pub path: PathBuf,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct IdentityManager {
    generator: UuidGenerator,
    cache: Arc<RwLock<IdentityCache>>,
    vault_root: PathBuf,
}

impl IdentityManager {
    pub fn new(vault_root: PathBuf) -> Self {
        Self {
            generator: UuidGenerator::new(),
            cache: Arc::new(RwLock::new(IdentityCache::new(10000))),
            vault_root,
        }
    }

    pub fn ensure_note_id(&mut self, path: &Path) -> Result<String> {
        let canonical_path = self.canonicalize_path(path)?;
        
        // Check cache first
        {
            let mut cache = self.cache.write();
            if let Some(identity) = cache.get(&canonical_path) {
                return Ok(identity.id);
            }
        }
        
        // Try to read from persistent storage
        let existing_id = if SidecarManager::should_use_sidecar(path) {
            // Read from sidecar for non-markdown files
            SidecarManager::read(path)?
                .map(|data| data.id)
        } else if path.exists() {
            // Read from front matter for markdown files
            let content = std::fs::read_to_string(path)?;
            let (fm, _) = FrontMatterParser::parse(&content)?;
            fm.and_then(|f| f.id)
        } else {
            None
        };
        
        // Use existing ID or generate new one
        let id = existing_id.unwrap_or_else(|| self.generator.generate().unwrap());
        let now = Utc::now();
        
        // Write to persistent storage
        if path.exists() {
            if SidecarManager::should_use_sidecar(path) {
                // Write to sidecar
                let data = SidecarData::new(id.clone(), path.to_string_lossy().to_string());
                SidecarManager::write(path, &data)?;
            } else {
                // Write to front matter
                let fm = FrontMatter::with_id(id.clone());
                FrontMatterWriter::write_atomic(path, &fm, "")?;
            }
        }
        
        // Update cache
        let identity = NoteIdentity {
            id: id.clone(),
            path: canonical_path.clone(),
            created_at: now,
            updated_at: now,
        };
        
        self.cache.write().insert(canonical_path, identity);
        
        Ok(id)
    }
    
    pub fn get_note_id(&mut self, path: &Path) -> Result<Option<String>> {
        let canonical_path = self.canonicalize_path(path)?;
        
        // Check cache first
        {
            let mut cache = self.cache.write();
            if let Some(identity) = cache.get(&canonical_path) {
                return Ok(Some(identity.id));
            }
        }
        
        // Try to read from persistent storage
        let id = if SidecarManager::should_use_sidecar(path) {
            SidecarManager::read(path)?
                .map(|data| data.id)
        } else if path.exists() {
            let content = std::fs::read_to_string(path)?;
            let (fm, _) = FrontMatterParser::parse(&content)?;
            fm.and_then(|f| f.id)
        } else {
            None
        };
        
        // Update cache if found
        if let Some(ref id_str) = id {
            let identity = NoteIdentity {
                id: id_str.clone(),
                path: canonical_path.clone(),
                created_at: Utc::now(),
                updated_at: Utc::now(),
            };
            self.cache.write().insert(canonical_path, identity);
        }
        
        Ok(id)
    }
    
    pub async fn update_note_path(&mut self, old_path: &Path, new_path: &Path) -> Result<()> {
        let old_canonical = self.canonicalize_path(old_path)?;
        let new_canonical = self.canonicalize_path(new_path)?;
        
        // Update persistent storage
        if SidecarManager::should_use_sidecar(old_path) {
            // Rename sidecar file
            SidecarManager::rename(old_path, new_path)?;
        }
        // Note: Front matter travels with the file automatically
        
        // Update cache
        let mut cache = self.cache.write();
        if let Some(mut identity) = cache.remove(&old_canonical) {
            identity.path = new_canonical.clone();
            identity.updated_at = Utc::now();
            cache.insert(new_canonical, identity);
        }
        
        Ok(())
    }
    
    fn canonicalize_path(&self, path: &Path) -> Result<PathBuf> {
        // Handle absolute vs relative paths
        let full_path = if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.vault_root.join(path)
        };
        
        // Normalize path by removing . and .. components
        let mut components = vec![];
        for component in full_path.components() {
            match component {
                std::path::Component::ParentDir => {
                    components.pop();
                }
                std::path::Component::CurDir => {}
                c => components.push(c),
            }
        }
        let normalized: PathBuf = components.iter().collect();
        
        // Get relative path from vault root
        if let Ok(relative) = normalized.strip_prefix(&self.vault_root) {
            Ok(relative.to_path_buf())
        } else {
            // Return as-is if not under vault root
            Ok(normalized)
        }
    }
}

#[cfg(test)]
mod tests;