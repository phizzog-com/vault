use std::path::PathBuf;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPServerConfig {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub env: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPProjectConfig {
    #[serde(rename = "mcpServers")]
    pub mcp_servers: HashMap<String, MCPServerConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClaudeConfig {
    pub projects: HashMap<String, MCPProjectConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPSettings {
    pub neo4j_uri: String,
    pub neo4j_username: String,
    pub neo4j_password: String,
    pub qdrant_url: String,
    pub qdrant_api_key: Option<String>,
}

pub struct MCPConfigGenerator {
    app_resources: PathBuf,
    vault_path: String,
    window_id: String,
}

impl MCPConfigGenerator {
    pub fn new(app_handle: &AppHandle, vault_path: String, window_id: String) -> Self {
        let app_resources = app_handle.path().resource_dir()
            .expect("Failed to get resource directory");
        
        Self {
            app_resources,
            vault_path,
            window_id,
        }
    }
    
    pub async fn generate_config(&self) -> Result<ClaudeConfig, String> {
        // Read MCP settings from the vault
        let mcp_settings = self.read_mcp_settings()?;
        
        // Get the MCP server paths
        let mcp_servers_path = self.app_resources.join("mcp-servers");
        
        // Create server configurations
        let mut mcp_servers = HashMap::new();
        
        // Neo4j server
        mcp_servers.insert(
            "gaimplan-neo4j".to_string(),
            MCPServerConfig {
                command: "node".to_string(),
                args: vec![
                    mcp_servers_path.join("neo4j").join("index.js")
                        .to_string_lossy().to_string()
                ],
                cwd: mcp_servers_path.to_string_lossy().to_string(),
                env: {
                    let mut env = HashMap::new();
                    env.insert("VAULT_PATH".to_string(), self.vault_path.clone());
                    env.insert("NEO4J_URI".to_string(), mcp_settings.neo4j_uri.clone());
                    env.insert("NEO4J_USERNAME".to_string(), mcp_settings.neo4j_username.clone());
                    env.insert("NEO4J_PASSWORD".to_string(), mcp_settings.neo4j_password.clone());
                    env
                },
            }
        );
        
        // Qdrant server
        mcp_servers.insert(
            "gaimplan-qdrant".to_string(),
            MCPServerConfig {
                command: "node".to_string(),
                args: vec![
                    mcp_servers_path.join("qdrant-server").join("index.js")
                        .to_string_lossy().to_string()
                ],
                cwd: mcp_servers_path.to_string_lossy().to_string(),
                env: {
                    let mut env = HashMap::new();
                    env.insert("VAULT_PATH".to_string(), self.vault_path.clone());
                    env.insert("QDRANT_URL".to_string(), mcp_settings.qdrant_url.clone());
                    if let Some(api_key) = &mcp_settings.qdrant_api_key {
                        env.insert("QDRANT_API_KEY".to_string(), api_key.clone());
                    }
                    env
                },
            }
        );
        
        // Filesystem server
        mcp_servers.insert(
            "gaimplan-filesystem".to_string(),
            MCPServerConfig {
                command: "node".to_string(),
                args: vec![
                    mcp_servers_path.join("filesystem-server").join("index.js")
                        .to_string_lossy().to_string()
                ],
                cwd: mcp_servers_path.to_string_lossy().to_string(),
                env: {
                    let mut env = HashMap::new();
                    env.insert("ALLOWED_PATHS".to_string(), self.vault_path.clone());
                    env
                },
            }
        );
        
        // Create the project configuration
        let mut projects = HashMap::new();
        projects.insert(
            self.vault_path.clone(),
            MCPProjectConfig {
                mcp_servers,
            }
        );
        
        Ok(ClaudeConfig { projects })
    }
    
    fn read_mcp_settings(&self) -> Result<MCPSettings, String> {
        let settings_path = PathBuf::from(&self.vault_path)
            .join(".gaimplan")
            .join("mcp-settings.json");
        
        if !settings_path.exists() {
            // Return default settings if file doesn't exist
            return Ok(MCPSettings {
                neo4j_uri: "bolt://localhost:7687".to_string(),
                neo4j_username: "neo4j".to_string(),
                neo4j_password: "password".to_string(),
                qdrant_url: "http://localhost:6333".to_string(),
                qdrant_api_key: None,
            });
        }
        
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read MCP settings: {}", e))?;
        
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse MCP settings: {}", e))
    }
    
    pub async fn write_config_file(&self, config: &ClaudeConfig) -> Result<String, String> {
        // Validate vault path is not empty
        if self.vault_path.is_empty() {
            return Err("Vault path is empty, cannot create .claude directory".to_string());
        }
        
        // Create project-specific .claude directory
        let vault_path = PathBuf::from(&self.vault_path);
        
        // Make sure the vault path exists
        if !vault_path.exists() {
            return Err(format!("Vault path does not exist: {}", self.vault_path));
        }
        
        let project_claude_dir = vault_path.join(".claude");
        fs::create_dir_all(&project_claude_dir)
            .map_err(|e| format!("Failed to create project .claude directory: {}", e))?;
        
        // Write config file to project directory
        let config_path = project_claude_dir.join("settings.local.json");
        
        // Claude expects the config in a different format for project-local configs
        let claude_config = json!({
            "mcpServers": config.projects.get(&self.vault_path)
                .map(|p| &p.mcp_servers)
                .unwrap_or(&HashMap::new())
        });
        
        let json_content = serde_json::to_string_pretty(&claude_config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        
        fs::write(&config_path, json_content)
            .map_err(|e| format!("Failed to write config file: {}", e))?;
        
        println!("MCP config written to: {:?}", config_path);
        
        Ok(config_path.to_string_lossy().to_string())
    }
}

#[tauri::command]
pub async fn generate_mcp_config(
    app_handle: AppHandle,
    vault_path: String,
    window_id: String
) -> Result<String, String> {
    let generator = MCPConfigGenerator::new(&app_handle, vault_path, window_id);
    
    let config = generator.generate_config().await?;
    let config_path = generator.write_config_file(&config).await?;
    
    Ok(config_path)
}