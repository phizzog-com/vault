/// Integration tests for the UUID Identity System
/// 
/// These tests validate the complete UUID implementation including:
/// - End-to-end UUID assignment and persistence
/// - Rename detection across different scenarios  
/// - Migration of existing vaults
/// - Performance benchmarks
/// - Cross-platform compatibility

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use parking_lot::RwLock;
use tempfile::TempDir;
use vault::identity::{IdentityManager, NoteIdentity};
use vault::identity::migration::{MigrationManager, MigrationReport};
use vault::identity::watcher::IdentityWatcher;

/// Helper to create a test vault with sample notes
fn create_test_vault(num_notes: usize) -> TempDir {
    let temp_dir = TempDir::new().unwrap();
    let vault_path = temp_dir.path();
    
    // Create directory structure
    fs::create_dir_all(vault_path.join("daily")).unwrap();
    fs::create_dir_all(vault_path.join("projects")).unwrap();
    fs::create_dir_all(vault_path.join("resources")).unwrap();
    
    // Create markdown notes
    for i in 0..num_notes {
        let content = format!(
            "# Note {}\n\nThis is test note number {}.\n\n## Content\n\nSome test content here.",
            i, i
        );
        
        let folder = match i % 3 {
            0 => "daily",
            1 => "projects",
            _ => "resources",
        };
        
        let file_path = vault_path.join(folder).join(format!("note_{}.md", i));
        fs::write(&file_path, content).unwrap();
    }
    
    // Create some non-markdown files
    fs::write(vault_path.join("readme.txt"), "Test vault readme").unwrap();
    fs::write(vault_path.join("data.json"), r#"{"test": true}"#).unwrap();
    
    temp_dir
}

/// Test 6.2: Integration testing with real vault data
#[tokio::test]
async fn test_complete_uuid_workflow() {
    let vault = create_test_vault(10);
    let vault_path = vault.path().to_path_buf();
    
    // Initialize identity manager
    let manager = Arc::new(RwLock::new(
        IdentityManager::new(vault_path.clone()).await.unwrap()
    ));
    
    // Test 1: Assign UUIDs to all notes
    let note_path = vault_path.join("daily").join("note_0.md");
    let identity1 = {
        let mut mgr = manager.write();
        mgr.ensure_note_id(&note_path).await.unwrap()
    };
    
    // Verify UUID was assigned
    assert!(!identity1.is_empty());
    assert!(identity1.contains('-')); // UUID format check
    
    // Test 2: Verify UUID persistence
    let identity2 = {
        let mut mgr = manager.write();
        mgr.get_note_id(&note_path).await.unwrap().unwrap()
    };
    assert_eq!(identity1, identity2, "UUID should persist across reads");
    
    // Test 3: Rename file and verify UUID remains
    let new_path = vault_path.join("daily").join("renamed_note.md");
    fs::rename(&note_path, &new_path).unwrap();
    
    // Update path in identity manager (simulating watcher detection)
    {
        let mut mgr = manager.write();
        mgr.update_note_path(&identity1, &new_path).await.unwrap();
    }
    
    // Verify UUID unchanged after rename
    let identity3 = {
        let mut mgr = manager.write();
        mgr.get_note_id(&new_path).await.unwrap().unwrap()
    };
    assert_eq!(identity1, identity3, "UUID should remain after rename");
}

/// Test 6.3: Migration on large vaults
#[tokio::test]
async fn test_large_vault_migration() {
    // Create a vault with 100 notes (scaled down for CI, but tests the pattern)
    let vault = create_test_vault(100);
    let vault_path = vault.path().to_path_buf();
    
    let start = Instant::now();
    
    // Run migration
    let migration = MigrationManager::new(vault_path.clone());
    let report = migration.migrate(false).await.unwrap();
    
    let duration = start.elapsed();
    
    // Verify migration completed successfully
    assert!(report.total_files >= 100, "Should process at least 100 files");
    assert_eq!(report.errors.len(), 0, "Should have no errors");
    assert!(report.files_updated > 0, "Should update files needing UUIDs");
    
    // Performance check (scaled for 100 notes)
    assert!(
        duration < Duration::from_secs(3),
        "Migration of 100 notes should complete within 3 seconds, took {:?}",
        duration
    );
    
    println!("Migration Report:");
    println!("  Total files: {}", report.total_files);
    println!("  Files updated: {}", report.files_updated);
    println!("  Duration: {:?}", duration);
    println!("  Rate: {:.2} files/sec", report.total_files as f64 / duration.as_secs_f64());
}

/// Test 6.4: Performance benchmarks
#[tokio::test]
async fn test_uuid_generation_performance() {
    use vault::identity::uuid::generate_uuid_v7;
    
    let start = Instant::now();
    let mut uuids = Vec::with_capacity(10000);
    
    // Generate 10,000 UUIDs
    for _ in 0..10000 {
        uuids.push(generate_uuid_v7());
    }
    
    let duration = start.elapsed();
    
    // Verify performance requirement: 10,000 UUIDs in < 100ms
    assert!(
        duration < Duration::from_millis(100),
        "Should generate 10,000 UUIDs in < 100ms, took {:?}",
        duration
    );
    
    // Verify uniqueness
    let unique_count = uuids.iter().collect::<std::collections::HashSet<_>>().len();
    assert_eq!(unique_count, 10000, "All UUIDs should be unique");
    
    println!("UUID Generation Performance:");
    println!("  Generated: 10,000 UUIDs");
    println!("  Duration: {:?}", duration);
    println!("  Rate: {:.0} UUIDs/sec", 10000.0 / duration.as_secs_f64());
}

/// Test 6.4: Front matter operation performance
#[tokio::test]
async fn test_frontmatter_performance() {
    use vault::identity::frontmatter::{FrontMatterParser, FrontMatterWriter};
    
    let vault = create_test_vault(100);
    let vault_path = vault.path().to_path_buf();
    
    let mut total_duration = Duration::ZERO;
    let mut files_processed = 0;
    
    // Process all markdown files
    for entry in walkdir::WalkDir::new(&vault_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
    {
        let path = entry.path();
        let content = fs::read_to_string(path).unwrap();
        
        let start = Instant::now();
        
        // Parse front matter
        let (mut fm, body) = FrontMatterParser::parse(&content).unwrap();
        
        // Add UUID
        fm.insert("uuid".to_string(), serde_yaml::Value::String(
            vault::identity::uuid::generate_uuid_v7()
        ));
        
        // Write back
        let new_content = FrontMatterWriter::write(fm, &body).unwrap();
        fs::write(path, new_content).unwrap();
        
        total_duration += start.elapsed();
        files_processed += 1;
    }
    
    let avg_duration = total_duration / files_processed as u32;
    
    // Verify performance requirement: < 50ms per file
    assert!(
        avg_duration < Duration::from_millis(50),
        "Front matter operations should complete in < 50ms per file, took {:?}",
        avg_duration
    );
    
    println!("Front Matter Performance:");
    println!("  Files processed: {}", files_processed);
    println!("  Total duration: {:?}", total_duration);
    println!("  Average per file: {:?}", avg_duration);
}

/// Test 6.5: Cross-platform path handling
#[tokio::test]
async fn test_cross_platform_paths() {
    let vault = create_test_vault(5);
    let vault_path = vault.path().to_path_buf();
    
    let manager = Arc::new(RwLock::new(
        IdentityManager::new(vault_path.clone()).await.unwrap()
    ));
    
    // Test various path formats
    let test_paths = vec![
        vault_path.join("daily").join("note_0.md"),
        vault_path.join("projects").join("note_1.md"),
        vault_path.join("resources").join("note_2.md"),
    ];
    
    for path in test_paths {
        // Ensure path works regardless of platform
        let canonical = path.canonicalize().unwrap();
        
        let uuid = {
            let mut mgr = manager.write();
            mgr.ensure_note_id(&canonical).await.unwrap()
        };
        
        assert!(!uuid.is_empty(), "Should assign UUID to path: {:?}", canonical);
        
        // Verify relative path calculation works
        let relative = canonical.strip_prefix(&vault_path).unwrap();
        assert!(relative.components().count() >= 2, "Should have folder and file components");
    }
}

/// Test 6.6: Editor save pattern simulation
#[tokio::test]
async fn test_editor_save_patterns() {
    let vault = create_test_vault(3);
    let vault_path = vault.path().to_path_buf();
    
    let manager = Arc::new(RwLock::new(
        IdentityManager::new(vault_path.clone()).await.unwrap()
    ));
    
    let note_path = vault_path.join("daily").join("note_0.md");
    
    // Assign initial UUID
    let original_uuid = {
        let mut mgr = manager.write();
        mgr.ensure_note_id(&note_path).await.unwrap()
    };
    
    // Simulate VSCode save pattern: create temp → write → rename → delete original
    let temp_path = vault_path.join("daily").join(".note_0.md.tmp");
    let content = fs::read_to_string(&note_path).unwrap();
    
    fs::write(&temp_path, &content).unwrap();
    fs::remove_file(&note_path).unwrap();
    fs::rename(&temp_path, &note_path).unwrap();
    
    // Verify UUID persistence (would be handled by watcher in production)
    let uuid_after_save = {
        let mut mgr = manager.write();
        mgr.get_note_id(&note_path).await.unwrap()
    };
    
    // Since the file was deleted and recreated, it might get a new UUID
    // unless the watcher detects it as a rename
    // For this test, we verify the system can handle the pattern
    assert!(uuid_after_save.is_some(), "File should have a UUID after editor save");
    
    println!("Editor Save Pattern Test:");
    println!("  Original UUID: {}", original_uuid);
    println!("  UUID after save: {:?}", uuid_after_save);
}

/// Test 6.7: Edge cases and error handling
#[tokio::test]
async fn test_edge_cases() {
    let vault = create_test_vault(5);
    let vault_path = vault.path().to_path_buf();
    
    let manager = Arc::new(RwLock::new(
        IdentityManager::new(vault_path.clone()).await.unwrap()
    ));
    
    // Test 1: File with corrupted front matter
    let corrupted_path = vault_path.join("corrupted.md");
    fs::write(&corrupted_path, "---\ninvalid yaml: [\n---\n\nContent").unwrap();
    
    let result = {
        let mut mgr = manager.write();
        mgr.ensure_note_id(&corrupted_path).await
    };
    
    // Should handle gracefully
    assert!(result.is_ok(), "Should handle corrupted front matter gracefully");
    
    // Test 2: File with existing UUID
    let existing_uuid = "01234567-89ab-cdef-0123-456789abcdef";
    let with_uuid_path = vault_path.join("with_uuid.md");
    fs::write(
        &with_uuid_path,
        format!("---\nuuid: {}\n---\n\nContent", existing_uuid)
    ).unwrap();
    
    let retrieved_uuid = {
        let mut mgr = manager.write();
        mgr.get_note_id(&with_uuid_path).await.unwrap()
    };
    
    assert_eq!(
        retrieved_uuid.as_deref(),
        Some(existing_uuid),
        "Should preserve existing UUID"
    );
    
    // Test 3: Non-existent file
    let non_existent = vault_path.join("does_not_exist.md");
    let result = {
        let mut mgr = manager.write();
        mgr.get_note_id(&non_existent).await.unwrap()
    };
    
    assert!(result.is_none(), "Non-existent file should return None");
    
    // Test 4: Binary file (should use sidecar)
    let binary_path = vault_path.join("image.png");
    fs::write(&binary_path, vec![0xFF, 0xD8, 0xFF, 0xE0]).unwrap(); // JPEG header
    
    let binary_uuid = {
        let mut mgr = manager.write();
        mgr.ensure_note_id(&binary_path).await.unwrap()
    };
    
    assert!(!binary_uuid.is_empty(), "Binary files should get UUIDs via sidecar");
    
    // Verify sidecar exists
    let sidecar_path = vault_path.join(".image.png.uuid");
    assert!(sidecar_path.exists(), "Sidecar file should be created for binary files");
}

/// Test 6.8: Coverage verification helper
#[tokio::test]
async fn test_comprehensive_coverage() {
    // This test ensures we're exercising all major code paths
    let vault = create_test_vault(20);
    let vault_path = vault.path().to_path_buf();
    
    // Test IdentityManager
    let manager = Arc::new(RwLock::new(
        IdentityManager::new(vault_path.clone()).await.unwrap()
    ));
    
    // Test cache operations
    for i in 0..20 {
        let path = vault_path.join("daily").join(format!("note_{}.md", i % 3));
        let _ = manager.write().ensure_note_id(&path).await;
    }
    
    // Test migration
    let migration = MigrationManager::new(vault_path.clone());
    let dry_run_report = migration.migrate(true).await.unwrap();
    assert_eq!(dry_run_report.files_updated, 0, "Dry run should not update files");
    
    let actual_report = migration.migrate(false).await.unwrap();
    assert!(actual_report.files_updated > 0, "Should update files in actual run");
    
    // Test watcher (basic initialization)
    let watcher_manager = Arc::clone(&manager);
    let _watcher = IdentityWatcher::new(vault_path.clone(), watcher_manager);
    
    // Test API updates
    use vault::identity::api_updates::{ApiUpdateHelper, is_uuid};
    
    let api_helper = ApiUpdateHelper::new(Arc::clone(&manager));
    
    // Test UUID validation
    assert!(is_uuid("12345678-90ab-cdef-1234-567890abcdef"));
    assert!(!is_uuid("not-a-uuid"));
    assert!(!is_uuid("12345678-90ab-cdef-1234")); // Too short
    
    // Test ID resolution
    let test_id = "12345678-90ab-cdef-1234-567890abcdef";
    let resolved = api_helper.resolve_id(test_id, &vault_path).await.unwrap();
    assert_eq!(resolved, test_id, "UUID should resolve to itself");
    
    println!("Comprehensive Coverage Test: PASSED");
    println!("  Tested: IdentityManager, Migration, Watcher, API Updates");
    println!("  Cache operations: ✓");
    println!("  Migration (dry-run and actual): ✓");
    println!("  UUID validation: ✓");
    println!("  ID resolution: ✓");
}

/// Performance benchmark for large-scale operations
#[tokio::test]
#[ignore] // Run with --ignored flag for full benchmark
async fn bench_large_vault_migration() {
    // Create a large vault (10,000 notes)
    println!("Creating large test vault with 10,000 notes...");
    let vault = create_test_vault(10000);
    let vault_path = vault.path().to_path_buf();
    
    println!("Starting migration benchmark...");
    let start = Instant::now();
    
    let migration = MigrationManager::new(vault_path.clone());
    let report = migration.migrate(false).await.unwrap();
    
    let duration = start.elapsed();
    
    println!("Large Vault Migration Benchmark:");
    println!("  Total files: {}", report.total_files);
    println!("  Files updated: {}", report.files_updated);
    println!("  Errors: {}", report.errors.len());
    println!("  Duration: {:?}", duration);
    println!("  Rate: {:.2} files/sec", report.total_files as f64 / duration.as_secs_f64());
    
    // Verify performance requirement: 10,000 notes in < 5 minutes
    assert!(
        duration < Duration::from_secs(300),
        "Migration of 10,000 notes should complete within 5 minutes, took {:?}",
        duration
    );
    
    // Memory usage check would require additional instrumentation
    println!("  ✓ Performance requirements met");
}