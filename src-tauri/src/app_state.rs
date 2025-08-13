use std::sync::Arc;
use tokio::sync::Mutex;
use crate::vault::Vault;
use crate::editor::EditorManager;
use crate::mcp::MCPManager;
use crate::docker::DockerManager;
use crate::graph::GraphManagerTrait;
use crate::graph::update_queue::UpdateQueue;

pub struct AppState {
    pub vault: Arc<Mutex<Option<Vault>>>,
    pub editor: EditorManager,
    pub watcher: Arc<Mutex<Option<notify::RecommendedWatcher>>>,
    pub mcp_manager: Arc<MCPManager>,
    pub docker_manager: Arc<DockerManager>,
    pub graph_manager: Arc<Mutex<Option<Arc<dyn GraphManagerTrait>>>>,
    pub update_queue: Arc<Mutex<Option<Arc<UpdateQueue>>>>,
}