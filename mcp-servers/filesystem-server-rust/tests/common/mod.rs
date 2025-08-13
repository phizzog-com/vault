/// Common test utilities for MCP filesystem server tests

use serde_json::{json, Value};
use std::path::PathBuf;
use std::process::Stdio;
use tempfile::TempDir;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};

pub struct TestServer {
    process: Child,
    stdin: tokio::process::ChildStdin,
    stdout: BufReader<tokio::process::ChildStdout>,
    initialized: bool,
}

impl TestServer {
    pub async fn new(vault_path: &PathBuf) -> Self {
        let mut process = Command::new("cargo")
            .args(&["run", "--"])
            .current_dir("/Users/ksnyder/code/aura-dev/mcp-servers/filesystem-server-rust")
            .env("VAULT_PATH", vault_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("Failed to start server");

        let stdin = process.stdin.take().unwrap();
        let stdout = BufReader::new(process.stdout.take().unwrap());
        
        // Give server time to start up
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let mut server = Self {
            process,
            stdin,
            stdout,
            initialized: false,
        };

        // Initialize the server
        server.initialize().await;
        server
    }

    async fn initialize(&mut self) {
        let response = self.send_request(json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "test-client",
                    "version": "1.0.0"
                }
            }
        })).await;

        assert!(response["result"].is_object());
        self.initialized = true;
    }

    pub async fn call_tool(&mut self, tool_name: &str, arguments: Value) -> Value {
        assert!(self.initialized, "Server must be initialized before calling tools");
        
        self.send_request(json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        })).await
    }

    pub async fn send_request(&mut self, request: Value) -> Value {
        // Send request
        let request_str = serde_json::to_string(&request).unwrap();
        let message = format!("Content-Length: {}\r\n\r\n{}", request_str.len(), request_str);
        self.stdin
            .write_all(message.as_bytes())
            .await
            .expect("Failed to write request");

        // Read response headers
        let mut headers = String::new();
        self.stdout
            .read_line(&mut headers)
            .await
            .expect("Failed to read headers");

        // Parse Content-Length
        let content_length: usize = headers
            .trim()
            .strip_prefix("Content-Length: ")
            .expect("Invalid Content-Length header")
            .parse()
            .expect("Failed to parse Content-Length");

        // Skip empty line
        let mut empty = String::new();
        self.stdout.read_line(&mut empty).await.unwrap();

        // Read response body
        let mut response_bytes = vec![0; content_length];
        self.stdout
            .read_exact(&mut response_bytes)
            .await
            .expect("Failed to read response body");

        serde_json::from_slice(&response_bytes).expect("Failed to parse response JSON")
    }
}

impl Drop for TestServer {
    fn drop(&mut self) {
        // Kill the server process when test ends
        let _ = self.process.start_kill();
    }
}

pub async fn setup_test_vault() -> (TempDir, PathBuf) {
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let vault_path = temp_dir.path().to_path_buf();
    (temp_dir, vault_path)
}