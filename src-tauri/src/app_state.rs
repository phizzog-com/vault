use std::sync::Arc;
use tokio::sync::Mutex;
use crate::vault::Vault;
use crate::editor::EditorManager;
use crate::mcp::MCPManager;

pub struct AppState {
    pub vault: Arc<Mutex<Option<Vault>>>,
    pub editor: EditorManager,
    pub watcher: Arc<Mutex<Option<notify::RecommendedWatcher>>>,
    pub mcp_manager: Arc<MCPManager>,
}
