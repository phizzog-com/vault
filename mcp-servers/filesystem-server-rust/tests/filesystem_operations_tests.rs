/// Filesystem Operations Tests
/// 
/// These tests verify that all filesystem operations work correctly,
/// including edge cases, error handling, and security constraints.

use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

mod common;
use common::{TestServer, setup_test_vault};

#[tokio::test]
async fn test_list_files_basic() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    // Create some test files
    fs::write(vault_path.join("file1.txt"), "content1").unwrap();
    fs::write(vault_path.join("file2.md"), "content2").unwrap();
    fs::create_dir(vault_path.join("subdir")).unwrap();
    
    let response = server.call_tool("list_files", json!({
        "path": "."
    })).await;
    
    let files: Vec<serde_json::Value> = serde_json::from_str(
        response["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    
    assert_eq!(files.len(), 3);
    assert!(files.iter().any(|f| f["name"] == "file1.txt" && f["type"] == "file"));
    assert!(files.iter().any(|f| f["name"] == "file2.md" && f["type"] == "file"));
    assert!(files.iter().any(|f| f["name"] == "subdir" && f["type"] == "directory"));
}

#[tokio::test]
async fn test_list_files_hidden() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    // Create hidden and regular files
    fs::write(vault_path.join(".hidden"), "secret").unwrap();
    fs::write(vault_path.join("visible.txt"), "public").unwrap();
    
    // Test without include_hidden
    let response = server.call_tool("list_files", json!({
        "path": ".",
        "include_hidden": false
    })).await;
    
    let files: Vec<serde_json::Value> = serde_json::from_str(
        response["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["name"], "visible.txt");
    
    // Test with include_hidden
    let response = server.call_tool("list_files", json!({
        "path": ".",
        "include_hidden": true
    })).await;
    
    let files: Vec<serde_json::Value> = serde_json::from_str(
        response["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    
    assert_eq!(files.len(), 2);
    assert!(files.iter().any(|f| f["name"] == ".hidden"));
}

#[tokio::test]
async fn test_read_file_success() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    let content = "Hello, MCP World!\nLine 2\nLine 3";
    fs::write(vault_path.join("test.txt"), content).unwrap();
    
    let response = server.call_tool("read_file", json!({
        "path": "test.txt"
    })).await;
    
    assert_eq!(response["result"]["content"][0]["text"], content);
}

#[tokio::test]
async fn test_read_file_not_found() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    let response = server.call_tool("read_file", json!({
        "path": "nonexistent.txt"
    })).await;
    
    assert!(response["result"]["isError"].as_bool().unwrap_or(false));
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Error"));
}

#[tokio::test]
async fn test_write_file_new() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    let content = "New file content";
    let response = server.call_tool("write_file", json!({
        "path": "new_file.txt",
        "content": content
    })).await;
    
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("written successfully"));
    
    // Verify file was created
    let actual_content = fs::read_to_string(vault_path.join("new_file.txt")).unwrap();
    assert_eq!(actual_content, content);
}

#[tokio::test]
async fn test_write_file_with_subdirectory() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    let response = server.call_tool("write_file", json!({
        "path": "subdir/nested/file.txt",
        "content": "nested content"
    })).await;
    
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("written successfully"));
    
    // Verify directory structure was created
    assert!(vault_path.join("subdir/nested/file.txt").exists());
}

#[tokio::test]
async fn test_create_directory() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    let response = server.call_tool("create_directory", json!({
        "path": "new_dir/sub_dir"
    })).await;
    
    println!("Create directory response: {:?}", response);
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Directory created"));
    
    assert!(vault_path.join("new_dir/sub_dir").is_dir());
}

#[tokio::test]
async fn test_delete_file() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    // Create a file to delete
    fs::write(vault_path.join("to_delete.txt"), "delete me").unwrap();
    
    let response = server.call_tool("delete_file", json!({
        "path": "to_delete.txt"
    })).await;
    
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Deleted"));
    
    assert!(!vault_path.join("to_delete.txt").exists());
}

#[tokio::test]
async fn test_delete_empty_directory() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    fs::create_dir(vault_path.join("empty_dir")).unwrap();
    
    let response = server.call_tool("delete_file", json!({
        "path": "empty_dir"
    })).await;
    
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Deleted"));
    
    assert!(!vault_path.join("empty_dir").exists());
}

#[tokio::test]
async fn test_move_file() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    fs::write(vault_path.join("source.txt"), "content").unwrap();
    
    let response = server.call_tool("move_file", json!({
        "source": "source.txt",
        "destination": "moved.txt"
    })).await;
    
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Moved"));
    
    assert!(!vault_path.join("source.txt").exists());
    assert!(vault_path.join("moved.txt").exists());
}

#[tokio::test]
async fn test_move_file_to_subdirectory() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    fs::write(vault_path.join("file.txt"), "content").unwrap();
    
    let response = server.call_tool("move_file", json!({
        "source": "file.txt",
        "destination": "subdir/file.txt"
    })).await;
    
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Moved"));
    
    assert!(vault_path.join("subdir/file.txt").exists());
}

#[tokio::test]
async fn test_search_files() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    // Create test files
    fs::write(vault_path.join("test1.txt"), "").unwrap();
    fs::write(vault_path.join("test2.txt"), "").unwrap();
    fs::write(vault_path.join("other.md"), "").unwrap();
    fs::create_dir(vault_path.join("test_dir")).unwrap();
    
    let response = server.call_tool("search_files", json!({
        "pattern": "test*"
    })).await;
    
    let results: Vec<serde_json::Value> = serde_json::from_str(
        response["result"]["content"][0]["text"].as_str().unwrap()
    ).unwrap();
    
    assert_eq!(results.len(), 3);
    assert!(results.iter().any(|r| r["name"] == "test1.txt"));
    assert!(results.iter().any(|r| r["name"] == "test2.txt"));
    assert!(results.iter().any(|r| r["name"] == "test_dir" && r["type"] == "directory"));
}

#[tokio::test]
async fn test_path_traversal_protection() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    // Try to read file outside vault
    let response = server.call_tool("read_file", json!({
        "path": "../../../etc/passwd"
    })).await;
    
    assert!(response["result"]["isError"].as_bool().unwrap_or(false));
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("outside vault"));
    
    // Try to write file outside vault
    let response = server.call_tool("write_file", json!({
        "path": "../outside.txt",
        "content": "malicious"
    })).await;
    
    assert!(response["result"]["isError"].as_bool().unwrap_or(false));
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("outside vault"));
}

#[tokio::test]
async fn test_symlink_handling() {
    let (_temp_dir, vault_path) = setup_test_vault().await;
    let mut server = TestServer::new(&vault_path).await;
    
    // Create a file and a symlink to it
    fs::write(vault_path.join("real.txt"), "real content").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(
        vault_path.join("real.txt"),
        vault_path.join("link.txt")
    ).unwrap();
    
    // Should be able to read through symlink if it points inside vault
    #[cfg(unix)]
    {
        let response = server.call_tool("read_file", json!({
            "path": "link.txt"
        })).await;
        
        assert_eq!(response["result"]["content"][0]["text"], "real content");
    }
}