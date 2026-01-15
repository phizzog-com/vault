#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use chrono;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

mod ai_settings;
mod ai_settings_multi;
mod ai_stream;
mod auth;
mod commands;
mod csv;
mod editor;
mod identity;
mod license;
mod mcp;
mod mcp_settings;
mod pdf_export;
mod pdf_intelligence;
mod plugin_runtime;
mod plugins;
mod refactored_app_state;
mod tasks;
mod vault;
mod vault_agent_commands;
mod vault_id;
mod vault_settings;
mod widget_settings;
mod window_commands_basic;
mod window_factory;
mod window_lifecycle;
mod window_state;

use ai_settings::test_ai_connection;
use ai_settings_multi::{
    get_active_ai_provider, get_ai_settings, get_ai_settings_for_provider, migrate_ai_settings,
    save_ai_settings, save_ai_settings_for_provider, set_active_ai_provider,
};
use ai_stream::{
    check_ollama_status, debug_send_ai_chat, search_notes_by_name, send_ai_chat,
    send_ai_chat_stream, send_ai_chat_with_functions, send_ai_chat_with_functions_stream,
    test_messages,
};
use commands::ghostty::{
    ghostty_installation_status, ghostty_spawn, ghostty_status, ghostty_stop, ghostty_write,
    register_ghostty_commands, GhosttyManager,
};
use commands::mcp_config::{generate_mcp_config, validate_mcp_server, write_mcp_config};
use commands::pty::{pty_close, pty_resize, pty_spawn, pty_write, PtyManager};
use commands::util::{check_command_exists, get_bundle_path};
use editor::EditorManager;
use identity::IdentityManager;
use mcp::setup::{check_mcp_servers_status, setup_mcp_servers};
use mcp::MCPManager;
use mcp_settings::{
    delete_mcp_server_config, get_mcp_server_config, get_mcp_settings, list_mcp_server_configs,
    save_mcp_server_config, save_mcp_settings,
};
use pdf_export::{ExportOptions, PdfExporter};
use pdf_intelligence::commands::{
    export_intelligence_markdown, extract_pdf_intelligence, extract_pdf_intelligence_v2,
    load_intelligence_result, save_intelligence_result, save_intelligence_result_v2,
};
use refactored_app_state::{extract_window_id, RefactoredAppState};
use vault::Vault;
use vault_settings::{
    get_vault_settings, list_all_vault_settings, reset_vault_settings, save_vault_settings,
    validate_image_location,
};
use widget_settings::{get_widget_settings, save_widget_settings};
use window_commands_basic::{
    get_recent_vaults_basic, manage_vaults_basic, open_vault_in_new_window_basic,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct NoteSearchResult {
    pub name: String,
    pub path: String,
}

#[allow(dead_code)]
pub struct AppState {
    vault: Arc<Mutex<Option<Vault>>>,
    identity_manager: Arc<RwLock<IdentityManager>>,
    editor: EditorManager,
    watcher: Arc<Mutex<Option<notify::RecommendedWatcher>>>,
    mcp_manager: Arc<MCPManager>,
    plugin_runtime: Arc<Mutex<plugin_runtime::PluginRuntime>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VaultInfo {
    path: String,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct FileInfo {
    path: String,
    name: String,
    is_dir: bool,
    extension: Option<String>,
    depth: usize,
    parent_path: Option<String>,
    created: Option<i64>,  // Unix timestamp
    modified: Option<i64>, // Unix timestamp
}

#[derive(Debug, Serialize, Deserialize)]
struct FileTree {
    files: Vec<FileInfo>,
}

#[tauri::command]
async fn get_window_state(
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<Option<VaultInfo>, String> {
    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let path = vault.path();
                    Ok(Some(VaultInfo {
                        path: path.to_string_lossy().to_string(),
                        name: path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Untitled")
                            .to_string(),
                    }))
                }
                None => Ok(None),
            }
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn window_closing(
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    let window_id = extract_window_id(&window);
    println!("Window {} is closing", window_id);

    // Perform any cleanup needed
    if let Err(e) = refactored_state.unregister_window_vault(&window_id).await {
        eprintln!(
            "Warning: Failed to unregister window vault during close: {}",
            e
        );
    }

    Ok(())
}

#[tauri::command]
async fn open_vault(
    path: String,
    window: tauri::Window,
    app: tauri::AppHandle,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<VaultInfo, String> {
    println!("🔓 open_vault called with path: {}", path);
    let vault_path = PathBuf::from(&path);

    if !vault_path.exists() {
        println!("❌ Vault directory does not exist: {}", path);
        return Err("Vault directory does not exist".to_string());
    }

    if !vault_path.is_dir() {
        println!("❌ Path is not a directory: {}", path);
        return Err("Path is not a directory".to_string());
    }

    let vault_info = VaultInfo {
        path: path.clone(),
        name: vault_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Untitled")
            .to_string(),
    };

    println!("📁 Vault info: {:?}", vault_info);

    // Get window ID and register with vault
    let window_id = extract_window_id(&window);
    println!("🪟 Window ID: {}", window_id);

    // Register window if not already registered
    if refactored_state
        .get_window_state(&window_id)
        .await
        .is_none()
    {
        println!("📝 Registering window with ID: {}", window_id);
        refactored_state
            .register_window_with_id(window_id.clone(), app.clone())
            .await?;
    }

    // Register the window with the vault
    println!("🔗 Registering window with vault...");
    refactored_state
        .register_window_vault(&window_id, vault_path.clone())
        .await?;
    println!("✅ Window registered with vault");

    // Reinitialize IdentityManager to use this vault path so task index and UUID ops target the right vault
    // Update both RwLock- and Mutex-backed managers that are managed in state
    println!("🔄 Starting IdentityManager reinitialization...");
    {
        // RwLock-based IdentityManager (used by various UUID commands)
        if let Some(state) = app.try_state::<Arc<RwLock<IdentityManager>>>() {
            println!("  📝 Found RwLock IdentityManager state");
            let mut mgr = state.write();
            *mgr = IdentityManager::new(vault_path.clone());
            println!(
                "  ✅ IdentityManager (RwLock) reinitialized for vault: {}",
                vault_path.display()
            );
        } else {
            println!("  ⚠️ RwLock IdentityManager state not found");
        }
    }
    {
        // Mutex-based IdentityManager (used by task commands)
        if let Some(state) = app.try_state::<Arc<tokio::sync::Mutex<IdentityManager>>>() {
            println!("  📝 Found Mutex IdentityManager state");
            let mut mgr = state.lock().await;
            *mgr = IdentityManager::new(vault_path.clone());
            println!(
                "  ✅ IdentityManager (Mutex) reinitialized for vault: {}",
                vault_path.display()
            );
        } else {
            println!("  ⚠️ Mutex IdentityManager state not found");
        }
    }
    println!("✅ IdentityManager reinitialization complete");

    // Manually trigger task scanning after vault is open (avoiding deadlock)
    {
        println!("📚 Triggering manual task index population...");
        let vault_path_for_scan = vault_path.clone();
        // Get the state before app is moved
        if let Some(identity_mgr) = app.try_state::<Arc<tokio::sync::Mutex<IdentityManager>>>() {
            let identity_mgr = identity_mgr.inner().clone();

            // Spawn scanning task to avoid blocking
            tokio::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await; // Small delay to ensure vault is fully ready
                println!(
                    "🔍 Starting background task scan for vault: {:?}",
                    vault_path_for_scan
                );
                let manager = identity_mgr.lock().await;
                if let Err(e) = manager.scan_vault_for_tasks_async().await {
                    eprintln!("⚠️ Failed to scan vault for tasks: {}", e);
                } else {
                    println!("✅ Background task scan completed");
                }
            });
        } else {
            println!("⚠️ Could not get IdentityManager state for task scanning");
        }
    }

    // Update recent vaults
    println!("📝 Updating recent vaults...");
    let mut persistence = crate::window_lifecycle::AppPersistenceState::load().unwrap_or_default();
    persistence.add_recent_vault(path.clone());
    let _ = persistence.save();

    println!("🎉 open_vault completed successfully, returning vault_info");
    Ok(vault_info)
}

#[tauri::command]
async fn read_file_base64(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    let file_path = PathBuf::from(&path);

    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    // Read the file
    let file_data = std::fs::read(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    // Encode to base64
    let base64_data = general_purpose::STANDARD.encode(file_data);

    Ok(base64_data)
}

#[tauri::command]
async fn start_file_watcher(
    vault_path: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    let window_id = extract_window_id(&window);
    let path = PathBuf::from(&vault_path);

    // Register the window with the vault (which sets up file watching)
    refactored_state
        .register_window_vault(&window_id, path)
        .await?;
    println!("✅ File watcher started for: {}", vault_path);

    Ok(())
}

#[tauri::command]
async fn create_vault(
    path: String,
    window: tauri::Window,
    app: tauri::AppHandle,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<VaultInfo, String> {
    let vault_path = PathBuf::from(&path);

    if vault_path.exists() {
        return Err("Path already exists".to_string());
    }

    std::fs::create_dir_all(&vault_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    open_vault(path, window, app, refactored_state).await
}

#[tauri::command]
async fn get_vault_info(
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<Option<VaultInfo>, String> {
    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let path = vault.path();
                    Ok(Some(VaultInfo {
                        path: path.to_string_lossy().to_string(),
                        name: path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Untitled")
                            .to_string(),
                    }))
                }
                None => Ok(None),
            }
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn select_folder_for_vault(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use std::sync::mpsc;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    use tauri_plugin_dialog::DialogExt;

    println!("🔍 Starting folder selection for vault...");

    let (tx, rx) = mpsc::channel();
    let tx = Arc::new(Mutex::new(Some(tx)));

    app.dialog()
        .file()
        .set_title("Select Vault Folder")
        .pick_folder(move |result| {
            println!("📁 Dialog callback received: {:?}", result);
            if let Some(sender) = tx.lock().unwrap().take() {
                let send_result = sender.send(result);
                println!("📤 Send result: {:?}", send_result);
            }
        });

    println!("⏳ Waiting for dialog response...");
    match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(Some(path)) => {
            let path_str = path.to_string();
            println!("✅ Received path: {}", path_str);
            Ok(Some(path_str))
        }
        Ok(None) => {
            println!("❌ User cancelled dialog");
            Ok(None)
        }
        Err(e) => {
            println!("❌ Dialog timeout or error: {:?}", e);
            Err("Dialog timed out or failed".to_string())
        }
    }
}

#[tauri::command]
async fn select_folder_for_create(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use std::sync::mpsc;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    use tauri_plugin_dialog::DialogExt;

    println!("🔍 Starting folder selection for create...");

    let (tx, rx) = mpsc::channel();
    let tx = Arc::new(Mutex::new(Some(tx)));

    app.dialog()
        .file()
        .set_title("Select Location for New Vault")
        .pick_folder(move |result| {
            println!("📁 Create dialog callback received: {:?}", result);
            if let Some(sender) = tx.lock().unwrap().take() {
                let send_result = sender.send(result);
                println!("📤 Create send result: {:?}", send_result);
            }
        });

    println!("⏳ Waiting for create dialog response...");
    match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(Some(path)) => {
            let path_str = path.to_string();
            println!("✅ Create received path: {}", path_str);
            Ok(Some(path_str))
        }
        Ok(None) => {
            println!("❌ Create user cancelled dialog");
            Ok(None)
        }
        Err(e) => {
            println!("❌ Create dialog timeout or error: {:?}", e);
            Err("Dialog timed out or failed".to_string())
        }
    }
}

#[tauri::command]
async fn create_new_vault(
    parent_path: String,
    vault_name: String,
    window: tauri::Window,
    app: tauri::AppHandle,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<VaultInfo, String> {
    if vault_name.trim().is_empty() {
        return Err("Vault name cannot be empty".to_string());
    }

    let vault_path = PathBuf::from(parent_path).join(vault_name.trim());

    if vault_path.exists() {
        return Err(format!("Folder '{}' already exists", vault_name.trim()));
    }

    // Create the vault directory
    std::fs::create_dir_all(&vault_path)
        .map_err(|e| format!("Failed to create vault directory: {}", e))?;

    // Create a welcome note
    let welcome_content = format!(
        "# Welcome to {}\n\nThis is your new gaimplan vault! Start taking notes by creating new markdown files.\n\n## Getting Started\n\n- Create new notes by clicking the + button\n- Organize your thoughts in folders\n- All your notes are stored as plain markdown files\n\nHappy note-taking! ✨\n",
        vault_name.trim()
    );

    let welcome_path = vault_path.join("Welcome.md");
    std::fs::write(&welcome_path, welcome_content)
        .map_err(|e| format!("Failed to create welcome note: {}", e))?;

    // Now open the vault
    let vault_path_str = vault_path.to_string_lossy().to_string();
    open_vault(vault_path_str, window, app, refactored_state).await
}

#[tauri::command]
async fn get_file_tree(
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<FileTree, String> {
    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let files = vault
                        .list_markdown_files()
                        .map_err(|e| format!("Failed to list files: {}", e))?;

                    let mut file_infos = Vec::new();

                    // Add all directories and files with hierarchy info
                    for file_path in files {
                        // Debug log
                        // Processing file

                        // Get relative path from vault root
                        let relative_path = match file_path.strip_prefix(vault.path()) {
                            Ok(rel_path) => rel_path,
                            Err(_) => {
                                println!("⚠️ Could not strip prefix from path: {:?}", file_path);
                                continue;
                            }
                        };

                        // Relative path

                        // Calculate depth and parent
                        let path_str = relative_path.to_string_lossy().to_string();
                        let components: Vec<_> = relative_path.components().collect();
                        let _depth = components.len() - 1; // Depth is number of path segments minus 1
                        let parent_path = if components.len() > 1 {
                            Some(
                                relative_path
                                    .parent()
                                    .unwrap()
                                    .to_string_lossy()
                                    .to_string(),
                            )
                        } else {
                            None
                        };

                        // File components

                        // Get file metadata
                        let (created, modified) = match std::fs::metadata(&file_path) {
                            Ok(metadata) => {
                                let modified = metadata
                                    .modified()
                                    .ok()
                                    .and_then(|time| {
                                        time.duration_since(std::time::UNIX_EPOCH).ok()
                                    })
                                    .map(|duration| duration.as_secs() as i64);

                                // Note: created() is not available on all platforms
                                let created = metadata
                                    .created()
                                    .ok()
                                    .and_then(|time| {
                                        time.duration_since(std::time::UNIX_EPOCH).ok()
                                    })
                                    .map(|duration| duration.as_secs() as i64);

                                (created, modified)
                            }
                            Err(e) => {
                                println!("⚠️ Failed to get metadata for {:?}: {}", file_path, e);
                                (None, None)
                            }
                        };

                        let file_info = FileInfo {
                            path: path_str,
                            name: relative_path
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("")
                                .to_string(),
                            is_dir: file_path.is_dir(),
                            extension: file_path
                                .extension()
                                .and_then(|s| s.to_str())
                                .map(|s| s.to_string()),
                            depth: components.len(),
                            parent_path,
                            created,
                            modified,
                        };

                        // Created FileInfo
                        file_infos.push(file_info);
                    }

                    // Sort files for consistent tree view
                    file_infos.sort_by(|a, b| a.path.cmp(&b.path));

                    Ok(FileTree { files: file_infos })
                }
                None => Err("Vault not open".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn read_file_content(
    file_path: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<String, String> {
    println!("📖 read_file_content called with path: {}", file_path);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let path = std::path::Path::new(&file_path);
                    println!("📁 Vault path: {:?}", vault.path());
                    println!("📄 Reading relative path: {:?}", path);

                    vault.read_file(path).map_err(|e| {
                        println!("❌ Failed to read file: {}", e);
                        format!("Failed to read file: {}", e)
                    })
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn write_file_content(
    file_path: String,
    content: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
    identity_manager: State<'_, Arc<RwLock<IdentityManager>>>,
) -> Result<Option<String>, String> {
    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let path = std::path::Path::new(&file_path);

                    // Update the updated_at timestamp if the file has frontmatter
                    let (updated_content, new_timestamp) =
                        if path.extension().and_then(|e| e.to_str()) == Some("md") {
                            use identity::frontmatter::{FrontMatterParser, FrontMatterWriter};

                            // Parse existing frontmatter
                            let (existing_fm, raw_body) = FrontMatterParser::parse(&content)
                                .unwrap_or((None, content.clone()));

                            // Sanitize body: if it accidentally contains a leading frontmatter block,
                            // strip it to avoid duplicate YAML headers on save.
                            fn strip_leading_frontmatter(s: String) -> String {
                                let starts_with_yaml =
                                    s.starts_with("---\n") || s.starts_with("---\r\n");
                                if !starts_with_yaml {
                                    return s;
                                }
                                // Determine the line ending style within this body segment
                                let has_crlf = s.contains("\r\n");
                                let search_start = if s.starts_with("---\r\n") { 5 } else { 4 };
                                let pattern_start = if has_crlf { "\r\n---" } else { "\n---" };
                                let closing_pattern =
                                    if has_crlf { "\r\n---\r\n" } else { "\n---\n" };
                                if let Some(end_pos) = s[search_start..].find(pattern_start) {
                                    let end_index = search_start + end_pos + closing_pattern.len();
                                    if end_index <= s.len() {
                                        return s[end_index..].to_string();
                                    }
                                }
                                s
                            }

                            let body = strip_leading_frontmatter(raw_body);

                            // If there's frontmatter with an ID, update the timestamp
                            if let Some(mut fm) = existing_fm {
                                if fm.id.is_some() {
                                    let new_time = chrono::Utc::now();
                                    fm.updated_at = Some(new_time);
                                    // Write back with updated timestamp
                                    let updated = FrontMatterWriter::write(&fm, &body)
                                        .unwrap_or(content.clone());
                                    (updated, Some(new_time.to_rfc3339()))
                                } else {
                                    (content.clone(), None)
                                }
                            } else {
                                (content.clone(), None)
                            }
                        } else {
                            (content.clone(), None)
                        };

                    // Write the file to disk
                    vault
                        .write_file(path, &updated_content)
                        .map_err(|e| format!("Failed to write file: {}", e))?;

                    // Update the identity manager cache if needed
                    let full_path = vault.path().join(path);
                    if path.extension().and_then(|e| e.to_str()) == Some("md") {
                        let mut manager = identity_manager.inner().write();
                        // This will update the cache with the latest file state
                        let _ = manager.get_note_id(&full_path);
                    }

                    // Return the new timestamp if it was updated
                    Ok(new_timestamp)
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn fetch_image_as_base64(url: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch image: {}", e))?;

    // Get content type before consuming response
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read image bytes: {}", e))?;

    // Use the newer base64 API
    use base64::{engine::general_purpose, Engine as _};
    let base64_string = general_purpose::STANDARD.encode(&bytes);

    Ok(format!("data:{};base64,{}", content_type, base64_string))
}

#[tauri::command]
async fn create_new_file(
    file_name: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
    identity_manager: State<'_, Arc<RwLock<IdentityManager>>>,
) -> Result<(), String> {
    println!("📝 create_new_file called with name: {}", file_name);
    eprintln!("📝 create_new_file called with name: {}", file_name);

    let window_id = extract_window_id(&window);
    println!("🪟 Window ID: {}", window_id);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let path = std::path::Path::new(&file_name);
                    let full_path = vault.path().join(path);
                    println!("📁 Vault path: {:?}", vault.path());
                    println!("📄 Creating file: {:?}", path);
                    println!("📄 Full path: {:?}", full_path);

                    // Generate UUID for the new file (but don't write to file yet as it doesn't exist)
                    let uuid = {
                        use identity::uuid::UuidGenerator;
                        let generator = UuidGenerator::new();
                        match generator.generate() {
                            Ok(id) => {
                                println!("🆔 Generated UUID for new file: {}", id);
                                id
                            }
                            Err(e) => {
                                println!(
                                    "⚠️ Failed to generate UUID: {}, continuing without it",
                                    e
                                );
                                String::new()
                            }
                        }
                    };

                    // Create default content with frontmatter if UUID was generated
                    let default_content = if !uuid.is_empty() {
                        use crate::identity::frontmatter::{FrontMatter, FrontMatterWriter};
                        let now = chrono::Utc::now();
                        let mut front_matter = FrontMatter::new();
                        front_matter.id = Some(uuid.clone());
                        front_matter.created_at = Some(now);
                        front_matter.updated_at = Some(now);

                        let title = format!(
                            "# {}",
                            path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("Untitled")
                        );

                        match FrontMatterWriter::write(&front_matter, &title) {
                            Ok(content) => content,
                            Err(e) => {
                                println!(
                                    "⚠️ Failed to generate frontmatter: {}, using fallback",
                                    e
                                );
                                format!(
                                    "---\nid: {}\ncreated_at: {}\nupdated_at: {}\n---\n# {}",
                                    front_matter.id.unwrap_or_default(),
                                    now.to_rfc3339(),
                                    now.to_rfc3339(),
                                    path.file_stem()
                                        .and_then(|s| s.to_str())
                                        .unwrap_or("Untitled")
                                )
                            }
                        }
                    } else {
                        format!(
                            "# {}",
                            path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("Untitled")
                        )
                    };

                    match vault.write_file(path, &default_content) {
                        Ok(()) => {
                            println!("✅ File created successfully with UUID: {:?}", path);

                            // Update the identity manager cache with the new UUID
                            if !uuid.is_empty() {
                                let mut manager = identity_manager.inner().write();
                                // The file now exists with frontmatter, so cache the UUID
                                let _ = manager.get_note_id(&full_path);
                            }

                            Ok(())
                        }
                        Err(e) => {
                            println!("❌ Failed to create file: {}", e);
                            eprintln!("❌ Failed to create file: {}", e);
                            Err(format!("Failed to create file: {}", e))
                        }
                    }
                }
                None => {
                    println!("❌ No vault opened");
                    Err("No vault opened".to_string())
                }
            }
        }
        None => {
            println!("❌ Window not found for ID: {}", window_id);
            Err("Window not found".to_string())
        }
    }
}

#[tauri::command]
async fn create_new_folder(
    folder_name: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    println!("📂 create_new_folder called with name: {}", folder_name);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let folder_path = vault.path().join(&folder_name);
                    println!("📁 Creating folder at: {:?}", folder_path);

                    std::fs::create_dir_all(&folder_path).map_err(|e| {
                        println!("❌ Failed to create folder: {}", e);
                        format!("Failed to create folder: {}", e)
                    })
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn delete_file(
    file_path: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    println!("🗑️ delete_file called with path: {}", file_path);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let path = vault.path().join(&file_path);
                    println!("📁 Deleting file at: {:?}", path);

                    if path.is_file() {
                        std::fs::remove_file(&path).map_err(|e| {
                            println!("❌ Failed to delete file: {}", e);
                            format!("Failed to delete file: {}", e)
                        })
                    } else {
                        Err("Path is not a file".to_string())
                    }
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn delete_folder(
    folder_path: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    println!("🗑️ delete_folder called with path: {}", folder_path);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let path = vault.path().join(&folder_path);
                    println!("📁 Deleting folder at: {:?}", path);

                    if path.is_dir() {
                        std::fs::remove_dir_all(&path).map_err(|e| {
                            println!("❌ Failed to delete folder: {}", e);
                            format!("Failed to delete folder: {}", e)
                        })
                    } else {
                        Err("Path is not a folder".to_string())
                    }
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn move_file(
    old_path: String,
    new_path: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    println!("📦 move_file called: {} -> {}", old_path, new_path);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let old_full_path = vault.path().join(&old_path);
                    let new_full_path = vault.path().join(&new_path);

                    println!("📁 Moving file: {:?} -> {:?}", old_full_path, new_full_path);

                    // Create parent directories if they don't exist
                    if let Some(parent) = new_full_path.parent() {
                        std::fs::create_dir_all(parent)
                            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                    }

                    std::fs::rename(&old_full_path, &new_full_path).map_err(|e| {
                        println!("❌ Failed to move file: {}", e);
                        format!("Failed to move file: {}", e)
                    })
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn rename_file(
    old_path: String,
    new_path: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    println!("✏️ rename_file called: {} -> {}", old_path, new_path);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let old_full_path = vault.path().join(&old_path);
                    let new_full_path = vault.path().join(&new_path);

                    println!(
                        "📁 Renaming file: {:?} -> {:?}",
                        old_full_path, new_full_path
                    );

                    // Create parent directories if they don't exist
                    if let Some(parent) = new_full_path.parent() {
                        std::fs::create_dir_all(parent)
                            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                    }

                    std::fs::rename(&old_full_path, &new_full_path).map_err(|e| {
                        println!("❌ Failed to rename file: {}", e);
                        format!("Failed to rename file: {}", e)
                    })
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn toggle_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    // In Tauri v2, open_devtools is on WebviewWindow
    window.open_devtools();
    Ok(())
}

#[tauri::command]
async fn reveal_in_finder(
    path: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    println!("🔍 reveal_in_finder called with path: {}", path);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let full_path = vault.path().join(&path);
                    println!("📁 Revealing file in Finder: {:?}", full_path);

                    // Use the shell to open the file location
                    #[cfg(target_os = "macos")]
                    {
                        std::process::Command::new("open")
                            .arg("-R")
                            .arg(&full_path)
                            .spawn()
                            .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
                    }

                    #[cfg(target_os = "windows")]
                    {
                        std::process::Command::new("explorer")
                            .arg("/select,")
                            .arg(&full_path)
                            .spawn()
                            .map_err(|e| format!("Failed to reveal in Explorer: {}", e))?;
                    }

                    #[cfg(target_os = "linux")]
                    {
                        // Try different file managers
                        let file_managers = vec![
                            (
                                "xdg-open",
                                vec![full_path.parent().unwrap().to_str().unwrap()],
                            ),
                            ("nautilus", vec!["--select", full_path.to_str().unwrap()]),
                            ("nemo", vec![full_path.to_str().unwrap()]),
                            ("thunar", vec![full_path.to_str().unwrap()]),
                        ];

                        let mut success = false;
                        for (cmd, args) in file_managers {
                            if std::process::Command::new(cmd).args(&args).spawn().is_ok() {
                                success = true;
                                break;
                            }
                        }

                        if !success {
                            return Err("Failed to open file manager".to_string());
                        }
                    }

                    Ok(())
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn get_last_vault(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let config_dir = match app.path().app_config_dir() {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get config directory: {}", e)),
    };

    let last_vault_file = config_dir.join(".vault").join("last_vault.txt");

    if last_vault_file.exists() {
        match std::fs::read_to_string(&last_vault_file) {
            Ok(path) => {
                // Check if the vault still exists
                if PathBuf::from(&path).exists() {
                    Ok(Some(path))
                } else {
                    // Vault no longer exists, remove the file
                    let _ = std::fs::remove_file(&last_vault_file);
                    Ok(None)
                }
            }
            Err(_) => Ok(None),
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn save_last_vault(app: tauri::AppHandle, vault_path: String) -> Result<(), String> {
    let config_dir = match app.path().app_config_dir() {
        Ok(dir) => dir,
        Err(e) => return Err(format!("Failed to get config directory: {}", e)),
    };

    let vault_dir = config_dir.join(".vault");

    // Create .vault directory if it doesn't exist
    if !vault_dir.exists() {
        std::fs::create_dir_all(&vault_dir)
            .map_err(|e| format!("Failed to create .vault directory: {}", e))?;
    }

    let last_vault_file = vault_dir.join("last_vault.txt");

    std::fs::write(&last_vault_file, vault_path)
        .map_err(|e| format!("Failed to save last vault: {}", e))
}

#[tauri::command]
async fn save_pasted_image(
    app: AppHandle,
    image_data: String, // Base64 encoded
    extension: String,  // png, jpg, or gif
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};
    use chrono::Local;

    println!("📸 save_pasted_image called with extension: {}", extension);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    let vault_path = vault.path();

                    // Get vault settings to determine image location
                    let image_location = match vault_settings::get_vault_settings(
                        app,
                        vault_path.to_string_lossy().to_string(),
                    )
                    .await
                    {
                        Ok(settings) => settings.files.image_location,
                        Err(_) => "files/".to_string(), // Default location
                    };

                    // Create image directory if it doesn't exist
                    let image_dir = vault_path.join(&image_location);
                    std::fs::create_dir_all(&image_dir)
                        .map_err(|e| format!("Failed to create image directory: {}", e))?;

                    // Generate filename with timestamp
                    let timestamp = Local::now().format("%Y%m%d%H%M%S").to_string();
                    let filename = format!("Pasted image {}.{}", timestamp, extension);
                    let file_path = image_dir.join(&filename);

                    println!("💾 Saving image to: {:?}", file_path);

                    // Decode base64 and save file
                    let image_bytes = general_purpose::STANDARD
                        .decode(&image_data)
                        .map_err(|e| format!("Failed to decode base64: {}", e))?;

                    std::fs::write(&file_path, image_bytes)
                        .map_err(|e| format!("Failed to write image file: {}", e))?;

                    // Return the relative path from vault root
                    let relative_path = format!("{}{}", image_location, filename);
                    println!("✅ Image saved successfully: {}", relative_path);
                    Ok(relative_path)
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn read_image_as_base64(
    file_path: String,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    println!("🖼️ read_image_as_base64 called with path: {}", file_path);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;
            match &*vault_lock {
                Some(vault) => {
                    // Handle the case where "files/" might be duplicated
                    let cleaned_path = if file_path.starts_with("files/files/") {
                        file_path
                            .strip_prefix("files/")
                            .unwrap_or(&file_path)
                            .to_string()
                    } else {
                        file_path.clone()
                    };

                    let full_path = vault.path().join(&cleaned_path);
                    println!("📁 Reading image from: {:?}", full_path);

                    // Read the file as bytes
                    let image_bytes = std::fs::read(&full_path)
                        .map_err(|e| format!("Failed to read image file: {}", e))?;

                    // Determine content type from extension
                    let extension = full_path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("png")
                        .to_lowercase();

                    let content_type = match extension.as_str() {
                        "jpg" | "jpeg" => "image/jpeg",
                        "png" => "image/png",
                        "gif" => "image/gif",
                        _ => "image/png",
                    };

                    // Encode to base64
                    let base64_string = general_purpose::STANDARD.encode(&image_bytes);

                    Ok(format!("data:{};base64,{}", content_type, base64_string))
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn create_directory(vault_path: String, dir_path: String) -> Result<(), String> {
    println!("📁 create_directory called with path: {}", dir_path);

    let vault_path_buf = PathBuf::from(&vault_path);
    let full_path = vault_path_buf.join(&dir_path);

    // Create directory and all parent directories if they don't exist
    std::fs::create_dir_all(&full_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    println!("✅ Directory created successfully: {:?}", full_path);
    Ok(())
}

#[tauri::command]
async fn export_to_pdf(
    markdown_content: String,
    output_path: String,
    options: Option<ExportOptions>,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    println!("📄 export_to_pdf called with output path: {}", output_path);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;

            match &*vault_lock {
                Some(vault) => {
                    let exporter = PdfExporter::new(vault.path().to_path_buf());
                    let export_options = options.unwrap_or_default();

                    exporter
                        .export_to_pdf(
                            &markdown_content,
                            &PathBuf::from(&output_path),
                            export_options,
                        )
                        .await
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn export_to_html(
    markdown_content: String,
    output_path: String,
    options: Option<ExportOptions>,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    println!("📄 export_to_html called with output path: {}", output_path);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;

            match &*vault_lock {
                Some(vault) => {
                    let export_options = options.unwrap_or_default();

                    pdf_export::export_to_html(
                        &markdown_content,
                        &PathBuf::from(&output_path),
                        vault.path(),
                        export_options,
                    )
                    .await
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn export_to_word(
    markdown_content: String,
    output_path: String,
    options: Option<ExportOptions>,
    window: tauri::Window,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    println!("📄 export_to_word called with output path: {}", output_path);

    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;

            match &*vault_lock {
                Some(vault) => {
                    let export_options = options.unwrap_or_default();

                    pdf_export::export_to_word(
                        &markdown_content,
                        &PathBuf::from(&output_path),
                        vault.path(),
                        export_options,
                    )
                    .await
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn export_chat_to_vault(
    refactored_state: State<'_, RefactoredAppState>,
    content: String,
    filename: Option<String>,
    window: tauri::Window,
) -> Result<String, String> {
    let window_id = extract_window_id(&window);

    match refactored_state.get_window_state(&window_id).await {
        Some(window_state) => {
            let vault_lock = window_state.vault.lock().await;

            match &*vault_lock {
                Some(vault) => {
                    let vault_path = vault.path();
                    let chat_history_dir = vault_path.join("Chat History");

                    // Create Chat History directory if it doesn't exist
                    if !chat_history_dir.exists() {
                        std::fs::create_dir(&chat_history_dir).map_err(|e| {
                            format!("Failed to create Chat History directory: {}", e)
                        })?;
                    }

                    // Generate filename with timestamp if not provided
                    let file_name = filename.unwrap_or_else(|| {
                        let now = chrono::Local::now();
                        format!("chat-{}.md", now.format("%Y-%m-%d_%H-%M-%S"))
                    });

                    let file_path = chat_history_dir.join(&file_name);

                    // Write the chat content to the file
                    std::fs::write(&file_path, content)
                        .map_err(|e| format!("Failed to write chat file: {}", e))?;

                    Ok(file_path.to_string_lossy().to_string())
                }
                None => Err("No vault opened".to_string()),
            }
        }
        None => Err("Window not found".to_string()),
    }
}

#[tauri::command]
async fn select_export_location(
    app: tauri::AppHandle,
    file_name: String,
    extension: String,
) -> Result<Option<String>, String> {
    use std::sync::mpsc;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    use tauri_plugin_dialog::DialogExt;

    println!("🔍 Starting file save dialog for export...");

    let (tx, rx) = mpsc::channel();
    let tx = Arc::new(Mutex::new(Some(tx)));

    app.dialog()
        .file()
        .set_title(&format!("Export as {}", extension.to_uppercase()))
        .set_file_name(&format!("{}.{}", file_name, extension))
        .save_file(move |result| {
            println!("📁 Export dialog callback received: {:?}", result);
            if let Some(sender) = tx.lock().unwrap().take() {
                let send_result = sender.send(result);
                println!("📤 Export send result: {:?}", send_result);
            }
        });

    println!("⏳ Waiting for export dialog response...");
    match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(Some(path)) => {
            let path_str = path.to_string();
            println!("✅ Export location selected: {}", path_str);
            Ok(Some(path_str))
        }
        Ok(None) => {
            println!("❌ User cancelled export dialog");
            Ok(None)
        }
        Err(e) => {
            println!("❌ Export dialog timeout or error: {:?}", e);
            Err("Dialog timed out or failed".to_string())
        }
    }
}

/// Migrate settings from old com.gaimplan.app location to new com.vault.app location
fn migrate_settings_if_needed() {
    use std::fs;
    use std::path::Path;

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let home_path = Path::new(&home);
            let old_dir = home_path.join("Library/Application Support/com.gaimplan.app");
            let new_dir = home_path.join("Library/Application Support/com.vault.app");

            // If old directory exists and new directory doesn't, migrate
            if old_dir.exists() && !new_dir.exists() {
                println!("Migrating settings from com.gaimplan.app to com.vault.app...");

                // Create parent directory if needed
                if let Some(parent) = new_dir.parent() {
                    let _ = fs::create_dir_all(parent);
                }

                // Try to rename (move) the directory
                match fs::rename(&old_dir, &new_dir) {
                    Ok(_) => println!("Settings migrated successfully"),
                    Err(e) => {
                        eprintln!(
                            "Failed to migrate settings: {}. Attempting copy instead...",
                            e
                        );
                        // If rename fails, try copying
                        if let Err(e) = copy_dir_recursive(&old_dir, &new_dir) {
                            eprintln!("Failed to copy settings: {}", e);
                        } else {
                            println!("Settings copied successfully");
                            // Optionally, you could delete the old directory here
                            // let _ = fs::remove_dir_all(&old_dir);
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let appdata_path = Path::new(&appdata);
            let old_dir = appdata_path.join("com.gaimplan.app");
            let new_dir = appdata_path.join("com.vault.app");

            if old_dir.exists() && !new_dir.exists() {
                println!("Migrating settings from com.gaimplan.app to com.vault.app...");

                match fs::rename(&old_dir, &new_dir) {
                    Ok(_) => println!("Settings migrated successfully"),
                    Err(e) => {
                        eprintln!("Failed to migrate settings: {}", e);
                        if let Err(e) = copy_dir_recursive(&old_dir, &new_dir) {
                            eprintln!("Failed to copy settings: {}", e);
                        } else {
                            println!("Settings copied successfully");
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let home_path = Path::new(&home);
            let old_dir = home_path.join(".config/com.gaimplan.app");
            let new_dir = home_path.join(".config/com.vault.app");

            if old_dir.exists() && !new_dir.exists() {
                println!("Migrating settings from com.gaimplan.app to com.vault.app...");

                if let Some(parent) = new_dir.parent() {
                    let _ = fs::create_dir_all(parent);
                }

                match fs::rename(&old_dir, &new_dir) {
                    Ok(_) => println!("Settings migrated successfully"),
                    Err(e) => {
                        eprintln!("Failed to migrate settings: {}", e);
                        if let Err(e) = copy_dir_recursive(&old_dir, &new_dir) {
                            eprintln!("Failed to copy settings: {}", e);
                        } else {
                            println!("Settings copied successfully");
                        }
                    }
                }
            }
        }
    }
}

/// Helper function to recursively copy a directory
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    use std::fs;

    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}

fn main() {
    // Load .env file if it exists (silently ignore errors to avoid leaking secrets)
    let _ = dotenvy::dotenv();

    // Migrate settings from old location if needed
    migrate_settings_if_needed();

    tauri::Builder::default()
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            open_vault,
            create_vault,
            get_vault_info,
            get_window_state,
            window_closing,
            start_file_watcher,
            select_folder_for_vault,
            select_folder_for_create,
            create_new_vault,
            get_file_tree,
            read_file_content,
            write_file_content,
            fetch_image_as_base64,
            create_new_file,
            create_new_folder,
            delete_file,
            delete_folder,
            move_file,
            rename_file,
            reveal_in_finder,
            toggle_devtools,
            get_last_vault,
            save_last_vault,
            save_pasted_image,
            read_image_as_base64,
            read_file_base64,
            editor::save_editor_preference,
            editor::get_editor_preferences,
            editor::list_theme_files,
            editor::open_note,
            editor::search_by_tag,
            editor::get_embedded_block,
            editor::create_theme_directory,
            editor::update_editor_state,
            editor::get_editor_state,
            export_to_pdf,
            export_to_html,
            export_to_word,
            export_chat_to_vault,
            select_export_location,
            // PDF intelligence commands
            extract_pdf_intelligence,
            extract_pdf_intelligence_v2,
            save_intelligence_result,
            save_intelligence_result_v2,
            load_intelligence_result,
            export_intelligence_markdown,
            save_ai_settings,
            get_ai_settings,
            test_ai_connection,
            save_ai_settings_for_provider,
            get_ai_settings_for_provider,
            get_active_ai_provider,
            set_active_ai_provider,
            migrate_ai_settings,
            send_ai_chat,
            send_ai_chat_with_functions,
            send_ai_chat_stream,
            send_ai_chat_with_functions_stream,
            search_notes_by_name,
            test_messages,
            debug_send_ai_chat,
            check_ollama_status,
            mcp::start_mcp_server,
            mcp::stop_mcp_server,
            mcp::send_mcp_message,
            mcp::get_mcp_server_statuses,
            mcp::get_mcp_server_info,
            mcp::test_stdio_echo,
            mcp::test_process_spawn,
            mcp::test_mcp_direct,
            mcp::test_transport_direct,
            mcp::test_debug_mcp_init,
            mcp::test_node_basic,
            mcp::test_mcp_spawn_direct,
            save_mcp_settings,
            get_mcp_settings,
            save_mcp_server_config,
            delete_mcp_server_config,
            get_mcp_server_config,
            list_mcp_server_configs,
            get_vault_settings,
            save_vault_settings,
            reset_vault_settings,
            validate_image_location,
            list_all_vault_settings,
            create_directory,
            get_widget_settings,
            save_widget_settings,
            commands::task_index_commands::query_tasks,
            commands::task_index_commands::query_tasks_by_status,
            commands::task_index_commands::query_tasks_today,
            commands::task_index_commands::query_tasks_overdue,
            commands::task_index_commands::query_tasks_by_date_range,
            commands::task_index_commands::get_task_source_by_id,
            commands::task_index_commands::sync_file_tasks_to_index,
            commands::task_commands::toggle_task_status,
            commands::task_commands::toggle_task_by_id,
            commands::task_commands::open_file_at_line,
            commands::sync::calculate_note_id,
            commands::sync::get_vault_id,
            commands::wikilink::get_vault_notes,
            commands::wikilink::resolve_wikilink,
            commands::wikilink::create_note_from_wikilink,
            // UUID identity commands
            commands::uuid_commands::get_note_uuid,
            commands::uuid_commands::ensure_note_uuid,
            commands::uuid_commands::convert_legacy_id_to_uuid,
            commands::uuid_commands::batch_convert_ids,
            commands::uuid_commands::is_legacy_id,
            commands::uuid_commands::is_uuid,
            commands::uuid_commands::add_uuids_to_vault,
            // Task commands
            commands::task_commands::ensure_task_uuid,
            commands::task_commands::get_tasks_for_note,
            commands::task_commands::toggle_task_status,
            commands::task_commands::update_task_properties,
            commands::task_commands::batch_ensure_task_uuids,
            commands::task_commands::get_task_by_id,
            commands::task_commands::find_duplicate_task_ids,
            commands::task_commands::add_task_uuids_to_vault,
            commands::task_commands::rollback_task_migration,
            // Ghostty terminal commands
            register_ghostty_commands,
            ghostty_spawn,
            ghostty_stop,
            ghostty_write,
            ghostty_status,
            ghostty_installation_status,
            generate_mcp_config,
            // License commands
            commands::license::get_license_status,
            commands::license::start_trial_cmd,
            commands::license::activate_license,
            commands::license::deactivate_license,
            write_mcp_config,
            validate_mcp_server,
            check_mcp_servers_status,
            setup_mcp_servers,
            check_command_exists,
            get_bundle_path,
            // PTY commands
            pty_spawn,
            pty_write,
            pty_resize,
            pty_close,
            // Window management commands
            open_vault_in_new_window_basic,
            get_recent_vaults_basic,
            manage_vaults_basic,
            // Plugin management commands (new real filesystem implementation)
            plugins::commands::plugin_list,
            plugins::commands::plugin_install,
            plugins::commands::plugin_enable,
            plugins::commands::plugin_disable,
            plugins::commands::plugin_uninstall,
            plugins::commands::plugin_get_settings,
            plugins::commands::plugin_update_settings,
            plugins::commands::plugin_get_resources,
            plugins::commands::plugin_request_permission,
            plugins::commands::plugin_get_logs,
            plugins::commands::plugin_clear_data,
            plugins::commands::plugin_refresh,
            plugins::commands::plugin_get,
            plugins::commands::plugin_get_all_resources,
            plugins::commands::plugin_list_all_permissions,
            plugins::commands::plugin_get_categories,
            plugins::commands::plugin_get_system_status,
            // Plugin IPC commands
            plugin_runtime::ipc_commands::plugin_ipc_call,
            plugin_runtime::ipc_commands::plugin_ipc_send,
            plugin_runtime::ipc_commands::plugin_ipc_register,
            plugin_runtime::ipc_commands::plugin_ipc_unregister,
            plugin_runtime::ipc_commands::plugin_vault_read,
            plugin_runtime::ipc_commands::plugin_vault_write,
            plugin_runtime::ipc_commands::plugin_vault_list,
            plugin_runtime::ipc_commands::plugin_workspace_notice,
            plugin_runtime::ipc_commands::plugin_settings_get,
            plugin_runtime::ipc_commands::plugin_settings_set,
            // Vault agent commands (secure path validation in Rust)
            vault_agent_commands::agent_read_note,
            vault_agent_commands::agent_write_note,
            vault_agent_commands::agent_update_note,
            vault_agent_commands::agent_append_to_note,
            vault_agent_commands::agent_list_tags,
            vault_agent_commands::agent_notes_by_tag,
            vault_agent_commands::agent_semantic_search,
            // CSV Editor Pro commands
            csv::list_csv_files,
            csv::read_csv_data,
            csv::save_csv_data,
            csv::get_csv_schema,
            csv::infer_csv_schema,
            csv::save_csv_schema,
            csv::get_csv_ai_context,
            csv::get_csv_statistics,
            csv::export_to_file,
        ])
        .setup(|app| {
            // Create MCP manager with app handle
            let mcp_manager = Arc::new(
                MCPManager::new(app.handle().clone()).expect("Failed to create MCP manager"),
            );

            // Create Ghostty manager
            let ghostty_manager = Arc::new(GhosttyManager::new());

            // Create PTY manager
            let pty_manager = Arc::new(PtyManager::new());

            // Create plugin runtime with app handle for WebView creation
            let plugin_runtime = Arc::new(Mutex::new(
                plugin_runtime::PluginRuntime::new_with_handle(app.handle().clone()),
            ));

            // Create IPC state for plugin API communication
            let vault_path = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir")
                .join("vault");
            let settings_path = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir")
                .join("settings");
            let ipc_state =
                plugin_runtime::ipc_commands::create_ipc_state(vault_path.clone(), settings_path);

            // Create app state
            // Initialize IdentityManager with the vault path
            let identity_manager = Arc::new(RwLock::new(IdentityManager::new(vault_path.clone())));
            // Create a Mutex version for commands that expect it
            let identity_manager_mutex =
                Arc::new(tokio::sync::Mutex::new(IdentityManager::new(vault_path)));
            let app_state = AppState {
                vault: Arc::new(Mutex::new(None)),
                identity_manager: identity_manager.clone(),
                editor: EditorManager::new(),
                watcher: Arc::new(Mutex::new(None)),
                mcp_manager: mcp_manager.clone(),
                plugin_runtime: plugin_runtime.clone(),
            };

            // Manage the state
            app.manage(app_state);

            // Also manage IdentityManager separately for UUID commands (RwLock version)
            app.manage(identity_manager);

            // Also manage IdentityManager for task commands (Mutex version)
            app.manage(identity_manager_mutex);

            // Also manage MCP manager separately for the MCP commands
            app.manage(mcp_manager);

            // Also manage Ghostty manager for Ghostty commands
            app.manage(ghostty_manager);

            // Also manage PTY manager for PTY commands
            app.manage(pty_manager);

            // Also manage Plugin runtime for plugin commands
            app.manage(plugin_runtime);

            // Also manage IPC state for plugin API calls
            app.manage(ipc_state);

            // Initialize the new plugin manager
            let plugin_manager_state =
                plugins::commands::PluginManagerState::new(app.handle().clone());
            app.manage(plugin_manager_state);

            // Create and manage RefactoredAppState for the new window system
            let refactored_app_state =
                crate::refactored_app_state::RefactoredAppState::new(app.handle().clone())
                    .expect("Failed to create RefactoredAppState");
            app.manage(refactored_app_state);

            // Run AI settings migration on startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match migrate_ai_settings(app_handle).await {
                    Ok(migrated) => {
                        if migrated {
                            println!("✅ AI settings migrated successfully");
                        }
                    }
                    Err(e) => {
                        println!("❌ AI settings migration error: {}", e);
                    }
                }
            });

            // Defer window state restoration to avoid WebKit displayID race condition
            // The window needs to be fully attached to a display before we can safely resize/reposition
            if let Some(main_window) = app.get_webview_window("main") {
                // Set up macOS traffic lights position
                #[cfg(target_os = "macos")]
                {
                    use tauri_plugin_decorum::WebviewWindowExt;
                    // Position traffic lights within the sidebar ribbon area
                    let _ = main_window.set_traffic_lights_inset(16.0, 12.0);
                }

                let window_clone = main_window.clone();

                // Spawn async task to restore window state AFTER setup completes
                // This gives macOS time to assign the window to a display
                tauri::async_runtime::spawn(async move {
                    // Wait for window to be fully initialized and attached to display
                    // This small delay prevents the "page has no displayID" WebKit error
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

                    if let Ok(saved_state) = crate::window_lifecycle::AppPersistenceState::load() {
                        if let Some(window_state) = saved_state.last_active_window {
                            // Get screen dimensions for validation
                            let (screen_width, screen_height) = window_clone
                                .primary_monitor()
                                .ok()
                                .flatten()
                                .map(|m| {
                                    let size = m.size();
                                    let scale = m.scale_factor();
                                    // Convert physical to logical pixels
                                    (
                                        (size.width as f64 / scale) as u32,
                                        (size.height as f64 / scale) as u32,
                                    )
                                })
                                .unwrap_or((1920, 1080)); // Fallback to common resolution

                            // Clamp window size to screen bounds (with min size from tauri.conf.json)
                            let min_width = 800u32;
                            let min_height = 600u32;
                            let width = window_state.bounds.width.clamp(min_width, screen_width);
                            let height =
                                window_state.bounds.height.clamp(min_height, screen_height);

                            // Clamp position to ensure window is visible on screen
                            // Allow window to be partially off-screen but at least 100px visible
                            let min_visible = 100i32;
                            let x = window_state.bounds.x.clamp(
                                -(width as i32) + min_visible,
                                (screen_width as i32) - min_visible,
                            );
                            let y = window_state.bounds.y.clamp(
                                0, // Don't allow window above screen (menu bar)
                                (screen_height as i32) - min_visible,
                            );

                            println!(
                                "🪟 Restoring window: {}x{} at ({}, {}) [screen: {}x{}]",
                                width, height, x, y, screen_width, screen_height
                            );

                            // Apply validated position and size
                            let _ = window_clone.set_size(tauri::Size::Logical(
                                tauri::LogicalSize::new(width as f64, height as f64),
                            ));
                            let _ = window_clone.set_position(tauri::Position::Logical(
                                tauri::LogicalPosition::new(x as f64, y as f64),
                            ));
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                    // Save window state whenever it's resized or moved
                    let window_clone = window.clone();

                    // Debounce saves by using a delayed task
                    tauri::async_runtime::spawn(async move {
                        // Small delay to debounce multiple resize events
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                        if let Err(e) =
                            crate::window_lifecycle::save_window_state(&window_clone).await
                        {
                            eprintln!("Failed to save window state: {}", e);
                        }
                    });
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
