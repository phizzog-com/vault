// Integration tests for Readwise plugin end-to-end validation
// Tests the complete plugin lifecycle from loading to API execution

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use serde_json::json;
use tempfile::TempDir;

// Mock structs for testing
struct MockAppHandle {
    windows: Vec<Window>,
    state: Arc<RwLock<MockState>>,
}

struct MockState {
    permissions_granted: Vec<String>,
    files_created: Vec<PathBuf>,
    api_calls: Vec<String>,
    resource_usage: ResourceUsage,
}

struct MockReadwiseAPI {
    highlights: Vec<serde_json::Value>,
    should_fail: bool,
}

impl MockReadwiseAPI {
    fn new() -> Self {
        Self {
            highlights: vec![
                json!({
                    "id": 1,
                    "text": "The most important thing is to keep the most important thing the most important thing.",
                    "title": "The 7 Habits of Highly Effective People",
                    "author": "Stephen R. Covey",
                    "category": "books",
                    "highlighted_at": "2025-01-01T10:00:00Z",
                    "notes": "Great quote about focus and priorities"
                }),
                json!({
                    "id": 2,
                    "text": "Code is read much more often than it is written.",
                    "title": "Clean Code",
                    "author": "Robert C. Martin",
                    "category": "books",
                    "highlighted_at": "2025-01-02T14:30:00Z",
                    "notes": "Remember this when writing code"
                }),
                json!({
                    "id": 3,
                    "text": "Premature optimization is the root of all evil.",
                    "title": "The Art of Computer Programming",
                    "author": "Donald Knuth",
                    "category": "articles",
                    "highlighted_at": "2025-01-03T09:15:00Z",
                    "notes": ""
                }),
            ],
            should_fail: false,
        }
    }

    fn set_failure(&mut self, should_fail: bool) {
        self.should_fail = should_fail;
    }

    async fn fetch_highlights(&self) -> Result<Vec<serde_json::Value>, String> {
        if self.should_fail {
            Err("API token invalid".to_string())
        } else {
            Ok(self.highlights.clone())
        }
    }
}

// Helper function to create test environment
async fn setup_test_environment() -> (TempDir, PathBuf, MockAppHandle, Arc<RwLock<PluginRuntime>>) {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let vault_path = temp_dir.path().to_path_buf();
    
    // Create mock app handle
    let app_handle = MockAppHandle {
        windows: vec![],
        state: Arc::new(RwLock::new(MockState {
            permissions_granted: vec![],
            files_created: vec![],
            api_calls: vec![],
            resource_usage: ResourceUsage::default(),
        })),
    };
    
    // Create plugin runtime
    let runtime = Arc::new(RwLock::new(
        PluginRuntime::new_with_handle(vault_path.clone(), app_handle.clone())
    ));
    
    (temp_dir, vault_path, app_handle, runtime)
}

// Test 6.1: Complete Readwise workflow
#[tokio::test]
async fn test_complete_readwise_workflow() {
    let (temp_dir, vault_path, app_handle, runtime) = setup_test_environment().await;
    
    // Load Readwise plugin
    let plugin_path = PathBuf::from("/Users/ksnyder/code/aura-dev/plugins/readwise");
    let mut rt = runtime.write().await;
    
    // Load and enable plugin
    let result = rt.load_plugin(&plugin_path).await;
    assert!(result.is_ok(), "Failed to load Readwise plugin");
    
    let plugin_id = "readwise";
    let enable_result = rt.enable_plugin(plugin_id).await;
    assert!(enable_result.is_ok(), "Failed to enable Readwise plugin");
    
    // Verify plugin is loaded and enabled
    let status = rt.get_plugin_status(plugin_id);
    assert_eq!(status, Some("enabled".to_string()));
    
    // Simulate sync command
    let sync_result = rt.execute_command(plugin_id, "sync", json!({})).await;
    assert!(sync_result.is_ok(), "Failed to execute sync command");
    
    // Check that files were created
    let readwise_folder = vault_path.join("Readwise");
    assert!(readwise_folder.exists(), "Readwise folder not created");
    
    // Disable plugin
    let disable_result = rt.disable_plugin(plugin_id).await;
    assert!(disable_result.is_ok(), "Failed to disable plugin");
    
    // Verify plugin is disabled
    let status = rt.get_plugin_status(plugin_id);
    assert_eq!(status, Some("disabled".to_string()));
}

// Test 6.2: Readwise plugin loads with proper WebView
#[tokio::test]
async fn test_readwise_loads_with_webview() {
    let (temp_dir, vault_path, app_handle, runtime) = setup_test_environment().await;
    
    let plugin_path = PathBuf::from("/Users/ksnyder/code/aura-dev/plugins/readwise");
    let mut rt = runtime.write().await;
    
    // Load plugin - this should create a WebView
    let result = rt.load_plugin(&plugin_path).await;
    assert!(result.is_ok(), "Failed to load Readwise plugin");
    
    // Verify WebView was created
    let sandbox_manager = rt.get_sandbox_manager();
    let plugin_id = "readwise";
    let sandbox = sandbox_manager.get_sandbox(plugin_id);
    assert!(sandbox.is_some(), "No sandbox created for plugin");
    
    let sandbox = sandbox.unwrap();
    assert!(sandbox.has_webview(), "WebView not created for plugin");
    
    // Verify WebView has correct permissions
    let csp = sandbox.get_content_security_policy();
    assert!(csp.contains("script-src 'self'"), "CSP missing script-src");
    assert!(csp.contains("connect-src"), "CSP missing connect-src for network");
    
    // Verify WebView is properly sandboxed
    assert!(sandbox.is_sandboxed(), "WebView not properly sandboxed");
    assert!(!sandbox.can_access_filesystem(), "WebView has direct filesystem access");
}

// Test 6.3: Readwise can call Vault APIs successfully
#[tokio::test]
async fn test_readwise_vault_api_calls() {
    let (temp_dir, vault_path, app_handle, runtime) = setup_test_environment().await;
    
    let plugin_path = PathBuf::from("/Users/ksnyder/code/aura-dev/plugins/readwise");
    let mut rt = runtime.write().await;
    
    // Load and enable plugin
    rt.load_plugin(&plugin_path).await.expect("Failed to load plugin");
    rt.enable_plugin("readwise").await.expect("Failed to enable plugin");
    
    // Grant permissions for API calls
    let permissions = vec![
        "vault:read",
        "vault:write",
        "vault:list",
        "vault:metadata",
        "workspace:commands",
        "settings:store",
        "network:fetch",
    ];
    
    for perm in permissions {
        rt.grant_permission("readwise", perm).await;
    }
    
    // Test vault.read API
    let read_result = rt.call_plugin_api("readwise", "vault.read", json!({
        "path": "test.md"
    })).await;
    assert!(read_result.is_ok() || read_result.unwrap_err().contains("not found"));
    
    // Test vault.write API
    let write_result = rt.call_plugin_api("readwise", "vault.write", json!({
        "path": "Readwise/test-highlight.md",
        "content": "# Test Highlight\n\nThis is a test."
    })).await;
    assert!(write_result.is_ok(), "Failed to write file via API");
    
    // Test vault.list API
    let list_result = rt.call_plugin_api("readwise", "vault.list", json!({
        "path": "Readwise"
    })).await;
    assert!(list_result.is_ok(), "Failed to list files via API");
    
    // Test vault.metadata API
    let metadata_result = rt.call_plugin_api("readwise", "vault.metadata", json!({
        "path": "Readwise/test-highlight.md"
    })).await;
    assert!(metadata_result.is_ok(), "Failed to get metadata via API");
    
    // Verify file was actually created
    let test_file = vault_path.join("Readwise").join("test-highlight.md");
    assert!(test_file.exists(), "File not created through API");
}

// Test 6.4: Readwise sync command with mock API responses
#[tokio::test]
async fn test_readwise_sync_with_mock_api() {
    let (temp_dir, vault_path, app_handle, runtime) = setup_test_environment().await;
    let mock_api = MockReadwiseAPI::new();
    
    let plugin_path = PathBuf::from("/Users/ksnyder/code/aura-dev/plugins/readwise");
    let mut rt = runtime.write().await;
    
    // Load and enable plugin
    rt.load_plugin(&plugin_path).await.expect("Failed to load plugin");
    rt.enable_plugin("readwise").await.expect("Failed to enable plugin");
    
    // Grant all required permissions
    let permissions = vec![
        "vault:read", "vault:write", "vault:append", "vault:delete",
        "vault:list", "vault:metadata", "workspace:commands",
        "workspace:statusbar", "workspace:settings", "workspace:notices",
        "workspace:progress", "settings:store", "network:fetch"
    ];
    
    for perm in permissions {
        rt.grant_permission("readwise", perm).await;
    }
    
    // Set up mock API token in settings
    rt.call_plugin_api("readwise", "settings.set", json!({
        "apiToken": "test-token-12345",
        "highlightsFolder": "Readwise",
        "autoSync": false,
        "syncOnStartup": false
    })).await.expect("Failed to set settings");
    
    // Inject mock API responses
    rt.set_mock_network_response("https://readwise.io/api/v2/highlights", 
        json!({
            "results": mock_api.highlights.clone(),
            "count": mock_api.highlights.len(),
            "next": null
        })
    );
    
    // Execute sync command
    let sync_result = rt.execute_command("readwise", "sync", json!({})).await;
    assert!(sync_result.is_ok(), "Sync command failed: {:?}", sync_result);
    
    // Verify highlights were synced
    let highlights_folder = vault_path.join("Readwise");
    assert!(highlights_folder.exists(), "Highlights folder not created");
    
    // Check for book files
    let covey_file = highlights_folder.join("The 7 Habits of Highly Effective People.md");
    assert!(covey_file.exists(), "Covey book file not created");
    
    let clean_code_file = highlights_folder.join("Clean Code.md");
    assert!(clean_code_file.exists(), "Clean Code file not created");
    
    // Verify content includes highlights
    let covey_content = std::fs::read_to_string(&covey_file).expect("Failed to read Covey file");
    assert!(covey_content.contains("keep the most important thing"), "Highlight not in file");
    assert!(covey_content.contains("Stephen R. Covey"), "Author not in file");
    
    // Test sync with API failure
    mock_api.set_failure(true);
    let failed_sync = rt.execute_command("readwise", "sync", json!({})).await;
    assert!(failed_sync.is_err() || failed_sync.unwrap().get("error").is_some());
}

// Test 6.5: Validate files are created in vault
#[tokio::test]
async fn test_readwise_creates_vault_files() {
    let (temp_dir, vault_path, app_handle, runtime) = setup_test_environment().await;
    
    let plugin_path = PathBuf::from("/Users/ksnyder/code/aura-dev/plugins/readwise");
    let mut rt = runtime.write().await;
    
    // Load, enable and configure plugin
    rt.load_plugin(&plugin_path).await.expect("Failed to load plugin");
    rt.enable_plugin("readwise").await.expect("Failed to enable plugin");
    
    // Grant permissions
    let permissions = vec!["vault:write", "vault:list", "settings:store"];
    for perm in permissions {
        rt.grant_permission("readwise", perm).await;
    }
    
    // Configure custom folder structure
    rt.call_plugin_api("readwise", "settings.set", json!({
        "highlightsFolder": "Reading/Highlights",
        "groupBy": "category",
        "appendToExisting": true,
        "dateFormat": "YYYY-MM-DD"
    })).await.expect("Failed to set settings");
    
    // Create test highlights
    let test_highlights = vec![
        json!({
            "path": "Reading/Highlights/Books/Test Book.md",
            "content": "# Test Book\n\n## Highlights\n\n- \"This is a test highlight\"\n  - Note: Testing file creation\n  - Date: 2025-01-09"
        }),
        json!({
            "path": "Reading/Highlights/Articles/Test Article.md",
            "content": "# Test Article\n\n## Key Points\n\n- Important insight from the article\n- Another key takeaway"
        }),
        json!({
            "path": "Reading/Highlights/index.md",
            "content": "# Reading Highlights Index\n\n- [[Test Book]]\n- [[Test Article]]"
        })
    ];
    
    // Write files through plugin API
    for highlight in test_highlights {
        let result = rt.call_plugin_api("readwise", "vault.write", highlight).await;
        assert!(result.is_ok(), "Failed to write highlight file");
    }
    
    // Verify folder structure
    let reading_folder = vault_path.join("Reading");
    assert!(reading_folder.exists(), "Reading folder not created");
    
    let highlights_folder = reading_folder.join("Highlights");
    assert!(highlights_folder.exists(), "Highlights folder not created");
    
    let books_folder = highlights_folder.join("Books");
    assert!(books_folder.exists(), "Books folder not created");
    
    let articles_folder = highlights_folder.join("Articles");
    assert!(articles_folder.exists(), "Articles folder not created");
    
    // Verify individual files
    let book_file = books_folder.join("Test Book.md");
    assert!(book_file.exists(), "Book file not created");
    
    let article_file = articles_folder.join("Test Article.md");
    assert!(article_file.exists(), "Article file not created");
    
    let index_file = highlights_folder.join("index.md");
    assert!(index_file.exists(), "Index file not created");
    
    // Verify content
    let book_content = std::fs::read_to_string(&book_file).expect("Failed to read book file");
    assert!(book_content.contains("This is a test highlight"), "Book content incorrect");
    
    let index_content = std::fs::read_to_string(&index_file).expect("Failed to read index");
    assert!(index_content.contains("[[Test Book]]"), "Index missing book link");
    assert!(index_content.contains("[[Test Article]]"), "Index missing article link");
}

// Test 6.6: Plugin disable/enable cycle
#[tokio::test]
async fn test_plugin_disable_enable_cycle() {
    let (temp_dir, vault_path, app_handle, runtime) = setup_test_environment().await;
    
    let plugin_path = PathBuf::from("/Users/ksnyder/code/aura-dev/plugins/readwise");
    let mut rt = runtime.write().await;
    let plugin_id = "readwise";
    
    // Initial load
    rt.load_plugin(&plugin_path).await.expect("Failed to load plugin");
    assert_eq!(rt.get_plugin_status(plugin_id), Some("loaded".to_string()));
    
    // Enable plugin
    rt.enable_plugin(plugin_id).await.expect("Failed to enable plugin");
    assert_eq!(rt.get_plugin_status(plugin_id), Some("enabled".to_string()));
    
    // Verify plugin is functional
    let permissions = vec!["settings:store"];
    for perm in permissions {
        rt.grant_permission(plugin_id, perm).await;
    }
    
    let settings_result = rt.call_plugin_api(plugin_id, "settings.get", json!({})).await;
    assert!(settings_result.is_ok(), "Plugin not functional when enabled");
    
    // Disable plugin
    rt.disable_plugin(plugin_id).await.expect("Failed to disable plugin");
    assert_eq!(rt.get_plugin_status(plugin_id), Some("disabled".to_string()));
    
    // Verify plugin is not functional when disabled
    let disabled_call = rt.call_plugin_api(plugin_id, "settings.get", json!({})).await;
    assert!(disabled_call.is_err(), "Plugin still functional when disabled");
    
    // Re-enable plugin
    rt.enable_plugin(plugin_id).await.expect("Failed to re-enable plugin");
    assert_eq!(rt.get_plugin_status(plugin_id), Some("enabled".to_string()));
    
    // Verify plugin is functional again
    let reenabled_call = rt.call_plugin_api(plugin_id, "settings.get", json!({})).await;
    assert!(reenabled_call.is_ok(), "Plugin not functional after re-enable");
    
    // Test multiple cycles
    for i in 0..3 {
        // Disable
        rt.disable_plugin(plugin_id).await.expect(&format!("Failed to disable cycle {}", i));
        assert_eq!(rt.get_plugin_status(plugin_id), Some("disabled".to_string()));
        
        // Enable
        rt.enable_plugin(plugin_id).await.expect(&format!("Failed to enable cycle {}", i));
        assert_eq!(rt.get_plugin_status(plugin_id), Some("enabled".to_string()));
    }
    
    // Verify WebView is properly cleaned up and recreated
    let sandbox_manager = rt.get_sandbox_manager();
    let sandbox = sandbox_manager.get_sandbox(plugin_id);
    assert!(sandbox.is_some(), "Sandbox not recreated after cycles");
    assert!(sandbox.unwrap().has_webview(), "WebView not recreated after cycles");
    
    // Unload plugin completely
    rt.unload_plugin(plugin_id).await.expect("Failed to unload plugin");
    assert_eq!(rt.get_plugin_status(plugin_id), None);
    
    // Verify resources are cleaned up
    let sandbox = sandbox_manager.get_sandbox(plugin_id);
    assert!(sandbox.is_none(), "Sandbox not cleaned up after unload");
}

// Test 6.7: Resource monitoring during sync
#[tokio::test]
async fn test_resource_monitoring_during_sync() {
    let (temp_dir, vault_path, app_handle, runtime) = setup_test_environment().await;
    
    let plugin_path = PathBuf::from("/Users/ksnyder/code/aura-dev/plugins/readwise");
    let mut rt = runtime.write().await;
    
    // Load and enable plugin
    rt.load_plugin(&plugin_path).await.expect("Failed to load plugin");
    rt.enable_plugin("readwise").await.expect("Failed to enable plugin");
    
    // Grant permissions
    let permissions = vec![
        "vault:write", "vault:list", "network:fetch", "settings:store"
    ];
    for perm in permissions {
        rt.grant_permission("readwise", perm).await;
    }
    
    // Get resource monitor
    let resource_monitor = rt.get_resource_monitor();
    let plugin_id = "readwise";
    
    // Start monitoring
    resource_monitor.start_monitoring(plugin_id).await;
    
    // Get baseline resource usage
    let baseline = resource_monitor.get_usage(plugin_id).await;
    assert!(baseline.memory_mb < 10.0, "High memory usage at baseline");
    assert!(baseline.cpu_percent < 5.0, "High CPU usage at baseline");
    
    // Create large dataset for sync (simulate heavy operation)
    let mut large_highlights = vec![];
    for i in 0..100 {
        large_highlights.push(json!({
            "id": i,
            "text": format!("Highlight {} - Lorem ipsum dolor sit amet, consectetur adipiscing elit. {}", i, "x".repeat(500)),
            "title": format!("Book {}", i / 10),
            "author": format!("Author {}", i / 20),
            "category": "books",
            "highlighted_at": format!("2025-01-{:02}T10:00:00Z", (i % 30) + 1),
            "notes": format!("Note for highlight {}", i)
        }));
    }
    
    // Inject large dataset
    rt.set_mock_network_response("https://readwise.io/api/v2/highlights", 
        json!({
            "results": large_highlights,
            "count": large_highlights.len(),
            "next": null
        })
    );
    
    // Execute sync with resource monitoring
    let sync_handle = tokio::spawn(async move {
        rt.execute_command("readwise", "sync", json!({})).await
    });
    
    // Monitor resources during sync
    let mut max_memory = 0.0;
    let mut max_cpu = 0.0;
    let mut measurements = vec![];
    
    for _ in 0..10 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        let usage = resource_monitor.get_usage(plugin_id).await;
        
        max_memory = max_memory.max(usage.memory_mb);
        max_cpu = max_cpu.max(usage.cpu_percent);
        measurements.push(usage.clone());
        
        // Check resource limits from manifest
        assert!(usage.memory_mb < 128.0, "Memory limit exceeded: {} MB", usage.memory_mb);
        assert!(usage.network_bandwidth_kbps < 1000.0, "Network bandwidth too high");
    }
    
    // Wait for sync to complete
    let sync_result = sync_handle.await.expect("Sync task panicked");
    assert!(sync_result.is_ok(), "Sync failed during resource monitoring");
    
    // Verify resource usage was tracked
    assert!(max_memory > baseline.memory_mb, "No memory increase detected during sync");
    assert!(measurements.len() > 0, "No measurements collected");
    
    // Check for resource warnings (manifest specifies warning at 100MB)
    if max_memory > 100.0 {
        let warnings = resource_monitor.get_warnings(plugin_id).await;
        assert!(!warnings.is_empty(), "No warning issued for high memory usage");
    }
    
    // Verify telemetry was collected
    let telemetry = resource_monitor.get_telemetry(plugin_id).await;
    assert!(telemetry.events.len() > 0, "No telemetry events collected");
    assert!(telemetry.events.iter().any(|e| e.event_type == "sync_started"));
    assert!(telemetry.events.iter().any(|e| e.event_type == "sync_completed"));
    
    // Stop monitoring
    resource_monitor.stop_monitoring(plugin_id).await;
    
    // Verify resources return to baseline after sync
    tokio::time::sleep(Duration::from_secs(1)).await;
    let final_usage = resource_monitor.get_usage(plugin_id).await;
    assert!(final_usage.memory_mb < max_memory * 0.8, "Memory not released after sync");
}

// Test permission denial handling
#[tokio::test]
async fn test_permission_denial_handling() {
    let (temp_dir, vault_path, app_handle, runtime) = setup_test_environment().await;
    
    let plugin_path = PathBuf::from("/Users/ksnyder/code/aura-dev/plugins/readwise");
    let mut rt = runtime.write().await;
    
    // Load and enable plugin
    rt.load_plugin(&plugin_path).await.expect("Failed to load plugin");
    rt.enable_plugin("readwise").await.expect("Failed to enable plugin");
    
    // Do NOT grant any permissions
    
    // Try to call APIs without permissions
    let write_result = rt.call_plugin_api("readwise", "vault.write", json!({
        "path": "test.md",
        "content": "Should fail"
    })).await;
    assert!(write_result.is_err(), "Write succeeded without permission");
    assert!(write_result.unwrap_err().contains("permission") || 
            write_result.unwrap_err().contains("denied"));
    
    let network_result = rt.call_plugin_api("readwise", "network.fetch", json!({
        "url": "https://readwise.io/api/v2/highlights"
    })).await;
    assert!(network_result.is_err(), "Network fetch succeeded without permission");
    
    // Grant partial permissions
    rt.grant_permission("readwise", "vault:read").await;
    
    // Read should work now
    let read_result = rt.call_plugin_api("readwise", "vault.read", json!({
        "path": "test.md"
    })).await;
    // Read might fail if file doesn't exist, but shouldn't be permission error
    if read_result.is_err() {
        let err = read_result.unwrap_err();
        assert!(!err.contains("permission") && !err.contains("denied"),
                "Read failed with permission error despite having permission");
    }
    
    // Write should still fail
    let write_result2 = rt.call_plugin_api("readwise", "vault.write", json!({
        "path": "test.md",
        "content": "Still should fail"
    })).await;
    assert!(write_result2.is_err(), "Write succeeded with only read permission");
}

// Test WebView sandbox isolation
#[tokio::test]
async fn test_webview_sandbox_isolation() {
    let (temp_dir, vault_path, app_handle, runtime) = setup_test_environment().await;
    
    let plugin_path = PathBuf::from("/Users/ksnyder/code/aura-dev/plugins/readwise");
    let mut rt = runtime.write().await;
    
    // Load plugin
    rt.load_plugin(&plugin_path).await.expect("Failed to load plugin");
    rt.enable_plugin("readwise").await.expect("Failed to enable plugin");
    
    let sandbox_manager = rt.get_sandbox_manager();
    let sandbox = sandbox_manager.get_sandbox("readwise").unwrap();
    
    // Verify sandbox isolation properties
    assert!(!sandbox.can_access_filesystem(), "Sandbox has filesystem access");
    assert!(!sandbox.can_execute_native_code(), "Sandbox can execute native code");
    assert!(!sandbox.can_access_other_plugins(), "Sandbox can access other plugins");
    
    // Verify CSP is restrictive
    let csp = sandbox.get_content_security_policy();
    assert!(csp.contains("default-src 'none'") || csp.contains("default-src 'self'"));
    assert!(!csp.contains("unsafe-inline"), "CSP allows unsafe inline scripts");
    assert!(!csp.contains("unsafe-eval"), "CSP allows eval");
    
    // Try to break out of sandbox (should fail)
    let escape_attempt = sandbox.execute_script("
        try {
            const fs = require('fs');
            fs.readFileSync('/etc/passwd');
        } catch(e) {
            'blocked';
        }
    ").await;
    
    assert!(escape_attempt.is_err() || escape_attempt.unwrap() == "blocked",
            "Sandbox escape attempt not blocked");
}

// Main test runner
#[tokio::test]
async fn test_all_readwise_integration() {
    println!("Starting Readwise Plugin Integration Tests");
    println!("==========================================");
    
    // Run all tests and collect results
    let mut results = vec![];
    
    // Test 6.1
    print!("6.1 Complete workflow test... ");
    match std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new().unwrap().block_on(test_complete_readwise_workflow())
    }) {
        Ok(_) => {
            println!("✓ PASSED");
            results.push(("6.1 Complete workflow", true));
        }
        Err(_) => {
            println!("✗ FAILED");
            results.push(("6.1 Complete workflow", false));
        }
    }
    
    // Test 6.2
    print!("6.2 WebView loading test... ");
    match std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new().unwrap().block_on(test_readwise_loads_with_webview())
    }) {
        Ok(_) => {
            println!("✓ PASSED");
            results.push(("6.2 WebView loading", true));
        }
        Err(_) => {
            println!("✗ FAILED");
            results.push(("6.2 WebView loading", false));
        }
    }
    
    // Test 6.3
    print!("6.3 Vault API calls test... ");
    match std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new().unwrap().block_on(test_readwise_vault_api_calls())
    }) {
        Ok(_) => {
            println!("✓ PASSED");
            results.push(("6.3 Vault API calls", true));
        }
        Err(_) => {
            println!("✗ FAILED");
            results.push(("6.3 Vault API calls", false));
        }
    }
    
    // Test 6.4
    print!("6.4 Sync with mock API test... ");
    match std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new().unwrap().block_on(test_readwise_sync_with_mock_api())
    }) {
        Ok(_) => {
            println!("✓ PASSED");
            results.push(("6.4 Sync with mock API", true));
        }
        Err(_) => {
            println!("✗ FAILED");
            results.push(("6.4 Sync with mock API", false));
        }
    }
    
    // Test 6.5
    print!("6.5 File creation test... ");
    match std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new().unwrap().block_on(test_readwise_creates_vault_files())
    }) {
        Ok(_) => {
            println!("✓ PASSED");
            results.push(("6.5 File creation", true));
        }
        Err(_) => {
            println!("✗ FAILED");
            results.push(("6.5 File creation", false));
        }
    }
    
    // Test 6.6
    print!("6.6 Disable/enable cycle test... ");
    match std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new().unwrap().block_on(test_plugin_disable_enable_cycle())
    }) {
        Ok(_) => {
            println!("✓ PASSED");
            results.push(("6.6 Disable/enable cycle", true));
        }
        Err(_) => {
            println!("✗ FAILED");
            results.push(("6.6 Disable/enable cycle", false));
        }
    }
    
    // Additional tests
    print!("Resource monitoring test... ");
    match std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new().unwrap().block_on(test_resource_monitoring_during_sync())
    }) {
        Ok(_) => {
            println!("✓ PASSED");
            results.push(("Resource monitoring", true));
        }
        Err(_) => {
            println!("✗ FAILED");
            results.push(("Resource monitoring", false));
        }
    }
    
    print!("Permission denial test... ");
    match std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new().unwrap().block_on(test_permission_denial_handling())
    }) {
        Ok(_) => {
            println!("✓ PASSED");
            results.push(("Permission denial", true));
        }
        Err(_) => {
            println!("✗ FAILED");
            results.push(("Permission denial", false));
        }
    }
    
    print!("Sandbox isolation test... ");
    match std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new().unwrap().block_on(test_webview_sandbox_isolation())
    }) {
        Ok(_) => {
            println!("✓ PASSED");
            results.push(("Sandbox isolation", true));
        }
        Err(_) => {
            println!("✗ FAILED");
            results.push(("Sandbox isolation", false));
        }
    }
    
    // Summary
    println!("\n==========================================");
    println!("Test Results Summary:");
    println!("==========================================");
    
    let total = results.len();
    let passed = results.iter().filter(|r| r.1).count();
    let failed = total - passed;
    
    for (name, status) in &results {
        println!("{}: {}", name, if *status { "✓ PASSED" } else { "✗ FAILED" });
    }
    
    println!("\n==========================================");
    println!("Total: {} | Passed: {} | Failed: {}", total, passed, failed);
    println!("==========================================");
    
    // Assert all tests passed
    assert_eq!(failed, 0, "Some integration tests failed");
    println!("\n✅ All Readwise integration tests passed!");
}