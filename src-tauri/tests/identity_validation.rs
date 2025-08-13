/// Validation tests for UUID Identity System
/// 
/// These tests validate specific requirements from the spec:
/// - UUID format and uniqueness
/// - Front matter preservation
/// - Sidecar functionality
/// - Rename detection algorithms
/// - Migration safety

use std::fs;
use std::path::PathBuf;
use std::collections::HashMap;
use tempfile::TempDir;
use serde_yaml::Value;

/// Test that UUIDv7 generates valid, time-ordered identifiers
#[test]
fn test_uuidv7_format_and_ordering() {
    use vault::identity::uuid::generate_uuid_v7;
    use std::thread;
    use std::time::Duration;
    
    let uuid1 = generate_uuid_v7();
    thread::sleep(Duration::from_millis(10));
    let uuid2 = generate_uuid_v7();
    
    // Validate format (8-4-4-4-12)
    let parts1: Vec<&str> = uuid1.split('-').collect();
    assert_eq!(parts1.len(), 5);
    assert_eq!(parts1[0].len(), 8);
    assert_eq!(parts1[1].len(), 4);
    assert_eq!(parts1[2].len(), 4);
    assert_eq!(parts1[3].len(), 4);
    assert_eq!(parts1[4].len(), 12);
    
    // All characters should be hexadecimal
    for part in parts1 {
        assert!(part.chars().all(|c| c.is_ascii_hexdigit()));
    }
    
    // UUIDs should be unique
    assert_ne!(uuid1, uuid2);
    
    // UUIDv7 should be time-ordered (lexicographically sortable)
    assert!(uuid1 < uuid2, "Later UUID should be lexicographically greater");
}

/// Test front matter parser preserves unknown fields
#[test]
fn test_frontmatter_field_preservation() {
    use vault::identity::frontmatter::FrontMatterParser;
    
    let content = r#"---
title: Test Note
author: John Doe
custom_field: Custom Value
tags:
  - rust
  - testing
metadata:
  created: 2024-01-01
  version: 1.0
---

# Content

This is the body."#;
    
    let (fm, body) = FrontMatterParser::parse(content).unwrap();
    
    // Verify all fields are preserved
    assert_eq!(fm.get("title").unwrap().as_str().unwrap(), "Test Note");
    assert_eq!(fm.get("author").unwrap().as_str().unwrap(), "John Doe");
    assert_eq!(fm.get("custom_field").unwrap().as_str().unwrap(), "Custom Value");
    
    // Verify complex structures are preserved
    let tags = fm.get("tags").unwrap().as_sequence().unwrap();
    assert_eq!(tags.len(), 2);
    
    let metadata = fm.get("metadata").unwrap().as_mapping().unwrap();
    assert_eq!(metadata.get(&Value::String("version".to_string())).unwrap().as_f64().unwrap(), 1.0);
    
    // Verify body is preserved
    assert!(body.contains("# Content"));
    assert!(body.contains("This is the body."));
}

/// Test sidecar creation and management for non-markdown files
#[test]
fn test_sidecar_operations() {
    use vault::identity::sidecar::{SidecarManager, SidecarData};
    
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("document.pdf");
    fs::write(&file_path, b"PDF content").unwrap();
    
    let manager = SidecarManager::new();
    
    // Create sidecar
    let data = SidecarData {
        uuid: "test-uuid-1234".to_string(),
        created: chrono::Utc::now(),
        modified: chrono::Utc::now(),
        legacy_ids: vec!["legacy-hash-1".to_string()],
    };
    
    manager.write_sidecar(&file_path, &data).unwrap();
    
    // Verify sidecar exists
    let sidecar_path = manager.get_sidecar_path(&file_path);
    assert!(sidecar_path.exists(), "Sidecar should be created");
    
    // Read sidecar back
    let read_data = manager.read_sidecar(&file_path).unwrap().unwrap();
    assert_eq!(read_data.uuid, "test-uuid-1234");
    assert_eq!(read_data.legacy_ids.len(), 1);
    
    // Delete sidecar
    manager.delete_sidecar(&file_path).unwrap();
    assert!(!sidecar_path.exists(), "Sidecar should be deleted");
}

/// Test rename detection algorithms
#[test]
fn test_rename_detection_heuristics() {
    use vault::identity::watcher::rename_detector::{
        RenameDetector,
        is_likely_rename_levenshtein,
        is_version_pattern,
        is_backup_pattern,
        is_temp_file_pattern,
    };
    
    // Test Levenshtein distance
    assert!(is_likely_rename_levenshtein("note.md", "notes.md", 0.8));
    assert!(is_likely_rename_levenshtein("my-document.txt", "my-doc.txt", 0.6));
    assert!(!is_likely_rename_levenshtein("note.md", "completely-different.md", 0.8));
    
    // Test version patterns
    assert!(is_version_pattern("document.md", "document_v2.md"));
    assert!(is_version_pattern("file.txt", "file (1).txt"));
    assert!(is_version_pattern("note.md", "note_version_2.md"));
    assert!(!is_version_pattern("note.md", "other.md"));
    
    // Test backup patterns
    assert!(is_backup_pattern("file.txt", "file.txt.bak"));
    assert!(is_backup_pattern("note.md", "note_backup.md"));
    assert!(is_backup_pattern("doc.pdf", "doc.pdf.old"));
    assert!(!is_backup_pattern("file.txt", "other.txt"));
    
    // Test temporary file patterns
    assert!(is_temp_file_pattern("note.md", ".note.md.tmp"));
    assert!(is_temp_file_pattern("file.txt", ".file.txt.swp"));
    assert!(is_temp_file_pattern("doc.md", "doc.md~"));
    assert!(!is_temp_file_pattern("file.txt", "other.txt"));
    
    // Test combined detector
    let detector = RenameDetector::new();
    
    let candidates = vec![
        "notes.md".to_string(),
        "document_v2.md".to_string(),
        "file.txt.bak".to_string(),
        "completely-unrelated.md".to_string(),
    ];
    
    assert_eq!(
        detector.find_best_match("note.md", &candidates),
        Some("notes.md".to_string()),
        "Should find best match using Levenshtein distance"
    );
}

/// Test legacy ID calculation and mapping
#[test]
fn test_legacy_id_mapping() {
    use vault::identity::migration::mapper::LegacyIdMapper;
    use sha2::{Sha256, Digest};
    
    let vault_id = "test-vault-123";
    let path = PathBuf::from("/Users/test/vault/notes/example.md");
    
    // Calculate legacy ID (absolute path)
    let legacy_id_abs = LegacyIdMapper::calculate_legacy_id(vault_id, &path, false);
    
    // Verify it's a 64-character hex string (SHA256)
    assert_eq!(legacy_id_abs.len(), 64);
    assert!(legacy_id_abs.chars().all(|c| c.is_ascii_hexdigit()));
    
    // Calculate legacy ID (relative path)
    let vault_root = PathBuf::from("/Users/test/vault");
    let legacy_id_rel = LegacyIdMapper::calculate_legacy_id(vault_id, &path, true);
    
    // Should be different from absolute
    assert_ne!(legacy_id_abs, legacy_id_rel);
    
    // Verify is_legacy_id detection
    assert!(LegacyIdMapper::is_legacy_id(&legacy_id_abs));
    assert!(LegacyIdMapper::is_legacy_id(&legacy_id_rel));
    assert!(!LegacyIdMapper::is_legacy_id("not-a-hash"));
    assert!(!LegacyIdMapper::is_legacy_id("12345678-90ab-cdef-1234-567890abcdef")); // UUID
}

/// Test atomic file operations
#[tokio::test]
async fn test_atomic_file_operations() {
    use vault::identity::frontmatter::FrontMatterWriter;
    use std::sync::Arc;
    use tokio::task;
    
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("test.md");
    
    // Initial content
    let initial_content = "---\ntitle: Test\n---\n\nInitial content";
    fs::write(&file_path, initial_content).unwrap();
    
    // Simulate concurrent writes
    let path1 = file_path.clone();
    let path2 = file_path.clone();
    
    let handle1 = task::spawn(async move {
        let mut fm = HashMap::new();
        fm.insert("title".to_string(), Value::String("Updated 1".to_string()));
        fm.insert("uuid".to_string(), Value::String("uuid-1".to_string()));
        
        FrontMatterWriter::write_to_file(&path1, fm, "Content 1").await
    });
    
    let handle2 = task::spawn(async move {
        let mut fm = HashMap::new();
        fm.insert("title".to_string(), Value::String("Updated 2".to_string()));
        fm.insert("uuid".to_string(), Value::String("uuid-2".to_string()));
        
        FrontMatterWriter::write_to_file(&path2, fm, "Content 2").await
    });
    
    // Both should complete without corruption
    let result1 = handle1.await.unwrap();
    let result2 = handle2.await.unwrap();
    
    // One should succeed, one might fail due to concurrent access
    // But the file should never be corrupted
    assert!(result1.is_ok() || result2.is_ok(), "At least one write should succeed");
    
    // Verify file is not corrupted
    let final_content = fs::read_to_string(&file_path).unwrap();
    assert!(final_content.starts_with("---"), "File should have valid front matter");
    assert!(final_content.contains("uuid"), "UUID should be present");
}

/// Test migration dry-run safety
#[tokio::test]
async fn test_migration_dry_run_safety() {
    use vault::identity::migration::MigrationManager;
    use std::collections::HashSet;
    
    let temp_dir = TempDir::new().unwrap();
    let vault_path = temp_dir.path();
    
    // Create test files
    for i in 0..5 {
        let content = format!("# Note {}\n\nContent", i);
        fs::write(vault_path.join(format!("note_{}.md", i)), content).unwrap();
    }
    
    // Get initial file hashes
    let mut initial_hashes = HashSet::new();
    for entry in fs::read_dir(vault_path).unwrap() {
        let entry = entry.unwrap();
        let content = fs::read(&entry.path()).unwrap();
        let hash = format!("{:x}", md5::compute(&content));
        initial_hashes.insert(hash);
    }
    
    // Run dry-run migration
    let migration = MigrationManager::new(vault_path.to_path_buf());
    let report = migration.migrate(true).await.unwrap();
    
    assert_eq!(report.files_updated, 0, "Dry run should not update any files");
    
    // Verify no files were modified
    let mut final_hashes = HashSet::new();
    for entry in fs::read_dir(vault_path).unwrap() {
        let entry = entry.unwrap();
        let content = fs::read(&entry.path()).unwrap();
        let hash = format!("{:x}", md5::compute(&content));
        final_hashes.insert(hash);
    }
    
    assert_eq!(initial_hashes, final_hashes, "File contents should be unchanged after dry run");
}

/// Test UUID collision handling
#[tokio::test]
async fn test_uuid_collision_handling() {
    use vault::identity::IdentityManager;
    use std::sync::Arc;
    use parking_lot::RwLock;
    
    let temp_dir = TempDir::new().unwrap();
    let vault_path = temp_dir.path();
    
    // Create two files with the same UUID (simulating corruption)
    let uuid = "12345678-90ab-cdef-1234-567890abcdef";
    
    let file1 = vault_path.join("file1.md");
    let file2 = vault_path.join("file2.md");
    
    fs::write(&file1, format!("---\nuuid: {}\n---\n\nFile 1", uuid)).unwrap();
    fs::write(&file2, format!("---\nuuid: {}\n---\n\nFile 2", uuid)).unwrap();
    
    let manager = Arc::new(RwLock::new(
        IdentityManager::new(vault_path.to_path_buf()).await.unwrap()
    ));
    
    // When we ensure IDs, collision should be detected and resolved
    let uuid1 = manager.write().ensure_note_id(&file1).await.unwrap();
    let uuid2 = manager.write().ensure_note_id(&file2).await.unwrap();
    
    // One should keep the original, the other should get a new UUID
    assert_ne!(uuid1, uuid2, "Duplicate UUIDs should be resolved");
    
    // At least one should be the original
    assert!(
        uuid1 == uuid || uuid2 == uuid,
        "One file should keep the original UUID"
    );
}

/// Test cache eviction with LRU
#[tokio::test]
async fn test_cache_lru_eviction() {
    use vault::identity::cache::IdentityCache;
    
    let mut cache = IdentityCache::with_capacity(3);
    
    // Fill cache
    cache.insert("path1".into(), "uuid1".to_string());
    cache.insert("path2".into(), "uuid2".to_string());
    cache.insert("path3".into(), "uuid3".to_string());
    
    // Access path1 to make it recently used
    assert_eq!(cache.get(&"path1".into()), Some(&"uuid1".to_string()));
    
    // Add new item, should evict path2 (least recently used)
    cache.insert("path4".into(), "uuid4".to_string());
    
    assert!(cache.get(&"path1".into()).is_some(), "Recently used should be kept");
    assert!(cache.get(&"path2".into()).is_none(), "LRU should be evicted");
    assert!(cache.get(&"path3".into()).is_some(), "Others should be kept");
    assert!(cache.get(&"path4".into()).is_some(), "New item should be added");
}

/// Test error recovery for corrupted data
#[tokio::test]
async fn test_error_recovery() {
    use vault::identity::IdentityManager;
    use std::sync::Arc;
    use parking_lot::RwLock;
    
    let temp_dir = TempDir::new().unwrap();
    let vault_path = temp_dir.path();
    
    // Create file with corrupted front matter
    let corrupted = vault_path.join("corrupted.md");
    fs::write(&corrupted, "---\nunclosed: [\n---\nContent").unwrap();
    
    // Create file with invalid UUID
    let invalid_uuid = vault_path.join("invalid.md");
    fs::write(&invalid_uuid, "---\nuuid: not-a-valid-uuid\n---\nContent").unwrap();
    
    // Create file with malformed YAML
    let malformed = vault_path.join("malformed.md");
    fs::write(&malformed, "---\n: invalid\n  - yaml\n---\nContent").unwrap();
    
    let manager = Arc::new(RwLock::new(
        IdentityManager::new(vault_path.to_path_buf()).await.unwrap()
    ));
    
    // All should handle gracefully and assign new UUIDs
    let uuid1 = manager.write().ensure_note_id(&corrupted).await;
    let uuid2 = manager.write().ensure_note_id(&invalid_uuid).await;
    let uuid3 = manager.write().ensure_note_id(&malformed).await;
    
    assert!(uuid1.is_ok(), "Should handle corrupted front matter");
    assert!(uuid2.is_ok(), "Should handle invalid UUID");
    assert!(uuid3.is_ok(), "Should handle malformed YAML");
    
    // Verify valid UUIDs were assigned
    let valid_uuid_regex = regex::Regex::new(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    ).unwrap();
    
    assert!(valid_uuid_regex.is_match(&uuid1.unwrap()));
    assert!(valid_uuid_regex.is_match(&uuid2.unwrap()));
    assert!(valid_uuid_regex.is_match(&uuid3.unwrap()));
}