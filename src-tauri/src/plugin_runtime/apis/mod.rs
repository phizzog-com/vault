// Plugin APIs Module - Public APIs for plugin development
// This module provides all the APIs that plugins can use to interact with Vault

pub mod vault;
pub mod workspace;
pub mod settings;
pub mod mcp;
pub mod network;

// Re-export main API types
pub use vault::{VaultApi, VaultPermission, VaultError, FileEntry, FileEvent, FileEventKind};
pub use workspace::{
    WorkspaceApi, WorkspacePermission, WorkspaceError,
    ViewConfig, ViewInfo, ViewType, ViewPosition,
    LayoutInfo, SplitDirection, SidebarPosition,
    ModalConfig, ModalButton, ModalAction,
    StatusBarItem, StatusBarPosition, RibbonItem,
    NoticeType, Command,
    WorkspaceEvent, WorkspaceEventType, WorkspaceEventData,
};
pub use settings::{
    SettingsApi, SettingsPermission, SettingsError,
    Migration,
};
pub use mcp::{
    McpApi, McpPermission, McpError,
    ServerConfig, ServerInfo, ServerCapabilities,
    ToolInfo, ResourceInfo, ResourceUpdate,
    PromptInfo, PromptArgument, PromptResult, PromptMessage,
};
pub use network::{
    NetworkApi, NetworkPermission, NetworkError,
    HttpMethod, FetchRequest, FetchResponse, StreamResponse,
    WebSocketMessage, AuditLogEntry,
};

/// Main API manager that coordinates all plugin APIs
pub struct ApiManager {
    pub vault: VaultApi,
    pub workspace: WorkspaceApi,
    pub settings: SettingsApi,
    pub mcp: McpApi,
    pub network: NetworkApi,
}

impl ApiManager {
    /// Create a new API manager with all available APIs
    pub fn new(
        vault_path: std::path::PathBuf,
        settings_path: std::path::PathBuf,
        permission_manager: std::sync::Arc<tokio::sync::RwLock<crate::plugin_runtime::permissions::PermissionManager>>,
    ) -> Self {
        Self {
            vault: VaultApi::new(vault_path, permission_manager.clone()),
            workspace: WorkspaceApi::new(permission_manager.clone()),
            settings: SettingsApi::new(settings_path, permission_manager.clone()),
            mcp: McpApi::new(permission_manager.clone()),
            network: NetworkApi::new(permission_manager),
        }
    }
    
    /// Set the resource monitor on the NetworkApi
    pub fn set_resource_monitor(&mut self, monitor: std::sync::Arc<crate::plugin_runtime::resources::ResourceMonitor>) {
        self.network.set_resource_monitor(monitor);
    }
}