use anyhow::Result;
use std::env;
use std::path::PathBuf;
use tracing::info;
use tracing_subscriber;

mod filesystem;
mod protocol;
mod server;
mod transport;
mod transport_line;

use server::McpServer;

#[tokio::main]
async fn main() -> Result<()> {
    // Only output debug messages if MCP_DEBUG is set
    let debug_enabled = env::var("MCP_DEBUG").is_ok();
    
    // Only initialize logging if debug is enabled
    if debug_enabled {
        tracing_subscriber::fmt()
            .with_target(false)
            .with_writer(std::io::stderr)
            .with_ansi(false)
            .init();
    }
    
    // Check if we should use line-based transport (for app compatibility)
    let use_line_transport = env::args().any(|arg| arg == "--line-transport");
    
    if debug_enabled {
        eprintln!("[Rust Filesystem Server] Starting up...");
        if use_line_transport {
            eprintln!("[Rust Filesystem Server] Using line-based transport");
        }
    }

    // ALWAYS use current working directory - this is the vault we're operating in
    let vault_path = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    
    if debug_enabled {
        eprintln!("[Rust Filesystem Server] Operating in directory: {:?}", vault_path);
        
        // Warn if VAULT_PATH is set but we're ignoring it
        if env::var("VAULT_PATH").is_ok() {
            eprintln!("[Rust Filesystem Server] WARNING: VAULT_PATH env var is set but being ignored - using CWD instead");
        }
    }

    if debug_enabled {
        info!("Starting MCP Filesystem Server with vault path: {:?}", vault_path);
        eprintln!("[Rust Filesystem Server] Initialized with vault path: {:?}", vault_path);
    }

    // Create and run server
    if use_line_transport {
        // Use line-based transport for app compatibility
        let mut server = server::LineServer::new(vault_path);
        server.run().await?;
    } else {
        // Use standard JSON-RPC transport
        let mut server = McpServer::new(vault_path);
        server.run().await?;
    }

    Ok(())
}