use std::path::Path;
use std::sync::Arc;
use super::{GraphManagerTrait, Note};
use walkdir::WalkDir;
use chrono::Utc;
use parking_lot::RwLock;
use crate::identity::IdentityManager;

/// Updated sync function that uses UUIDs instead of path-based IDs
pub async fn sync_vault_with_uuids(
    vault_path: &Path,
    graph_manager: &Arc<dyn GraphManagerTrait>,
    vault_id: &str,
    identity_manager: &Arc<RwLock<IdentityManager>>,
    skip_relationships: bool,
) -> Result<(usize, usize), String> {
    println!("Starting UUID-based sync...");
    
    let mut notes = Vec::new();
    let mut file_count = 0;
    
    // Walk the directory with simple settings
    for entry in WalkDir::new(vault_path)
        .follow_links(false)
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        
        // Only process .md files
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        
        file_count += 1;
        println!("Processing file {}: {}", file_count, path.display());
        
        // Read file content
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => {
                println!("Failed to read {}: {}", path.display(), e);
                continue;
            }
        };
        
        // Create note with UUID
        let note = create_note_with_uuid(
            path, 
            &content, 
            vault_path, 
            vault_id,
            identity_manager
        ).await?;
        
        // Create note in graph
        graph_manager.create_note(&note).await
            .map_err(|e| format!("Failed to create note: {}", e))?;
            
        notes.push(note);
        
        // Print progress every 10 files
        if file_count % 10 == 0 {
            println!("Progress: {} files processed", file_count);
        }
    }
    
    println!("Created {} notes with UUIDs", notes.len());
    
    let relationship_count = if skip_relationships {
        println!("Skipping relationship building as requested");
        0
    } else {
        println!("Building relationships...");
        
        // Build relationships
        use super::semantic_relationships::SemanticRelationshipBuilder;
        SemanticRelationshipBuilder::analyze_and_relate_notes(
            notes,
            graph_manager
        ).await?
    };
    
    Ok((file_count, relationship_count))
}

async fn create_note_with_uuid(
    path: &Path,
    content: &str,
    vault_path: &Path,
    vault_id: &str,
    identity_manager: &Arc<RwLock<IdentityManager>>,
) -> Result<Note, String> {
    let relative_path = path.strip_prefix(vault_path)
        .map_err(|_| "Failed to get relative path")?;
    
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("Failed to get metadata: {}", e))?;
    
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
        .flatten()
        .unwrap_or_else(|| Utc::now());
    
    let created = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
        .flatten()
        .unwrap_or_else(|| Utc::now());
    
    // Generate UUID instead of path-based hash
    let mut manager = identity_manager.write();
    let id = manager.ensure_note_id(path).await
        .map_err(|e| format!("Failed to generate UUID: {}", e))?;
    
    println!("  Generated UUID {} for {}", id, path.display());
    
    Ok(Note {
        id,
        path: relative_path.to_string_lossy().to_string(),
        title,
        content: content.to_string(),
        created: created.with_timezone(&Utc),
        modified: modified.with_timezone(&Utc),
        vault_id: vault_id.to_string(),
    })
}

/// Backward-compatible sync that can handle both UUID and legacy IDs
pub async fn sync_vault_compatible(
    vault_path: &Path,
    graph_manager: &Arc<dyn GraphManagerTrait>,
    vault_id: &str,
    identity_manager: &Arc<RwLock<IdentityManager>>,
    skip_relationships: bool,
    use_legacy_ids: bool,
) -> Result<(usize, usize), String> {
    if use_legacy_ids {
        println!("⚠️  WARNING: Using legacy path-based IDs. This is deprecated.");
        println!("    Please migrate to UUIDs using the migration command.");
        
        // Call the original sync function
        super::simple_sync::sync_vault_simple(
            vault_path,
            graph_manager,
            vault_id,
            skip_relationships
        ).await
    } else {
        // Use the new UUID-based sync
        sync_vault_with_uuids(
            vault_path,
            graph_manager,
            vault_id,
            identity_manager,
            skip_relationships
        ).await
    }
}