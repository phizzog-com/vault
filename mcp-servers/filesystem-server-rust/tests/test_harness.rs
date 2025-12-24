/// Test harness for MCP server tests that maintains persistent connections

use serde_json::{json, Value};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};

pub struct TestHarness {
    server: Child,
    stdin: ChildStdin,
    reader: BufReader<tokio::process::ChildStdout>,
    request_id: i32,
}

impl TestHarness {
    pub async fn new() -> Self {
        let mut server = tokio::process::Command::new("cargo")
            .args(&["run", "--"])
            .current_dir("/Users/ksnyder/code/aura-dev/mcp-servers/filesystem-server-rust")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("RUST_LOG", "debug")
            .spawn()
            .expect("Failed to start server");

        let stdin = server.stdin.take().unwrap();
        let stdout = server.stdout.take().unwrap();
        let reader = BufReader::new(stdout);

        // Give server time to start
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let mut harness = Self {
            server,
            stdin,
            reader,
            request_id: 0,
        };

        // Initialize the server
        harness.initialize().await;
        harness
    }

    async fn initialize(&mut self) {
        let response = self.send_request(json!({
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
    }

    pub async fn send_request(&mut self, mut request: Value) -> Value {
        self.request_id += 1;
        request["jsonrpc"] = json!("2.0");
        request["id"] = json!(self.request_id);

        let request_str = serde_json::to_string(&request).unwrap();
        let message = format!("Content-Length: {}\r\n\r\n{}", request_str.len(), request_str);

        self.stdin.write_all(message.as_bytes()).await.unwrap();
        self.stdin.flush().await.unwrap();

        // Read response
        let mut headers = String::new();
        let bytes_read = self.reader.read_line(&mut headers).await.unwrap();
        
        if bytes_read == 0 {
            panic!("Server closed connection unexpectedly");
        }
        
        let content_length: usize = headers
            .trim()
            .strip_prefix("Content-Length: ")
            .unwrap_or_else(|| panic!("Invalid Content-Length header: '{}'", headers.trim()))
            .parse()
            .expect("Failed to parse Content-Length");

        // Skip empty line
        self.reader.read_line(&mut String::new()).await.unwrap();

        // Read response body
        let mut response_bytes = vec![0; content_length];
        self.reader.read_exact(&mut response_bytes).await.unwrap();

        serde_json::from_slice(&response_bytes).unwrap()
    }

    pub async fn send_notification(&mut self, mut notification: Value) {
        notification["jsonrpc"] = json!("2.0");
        // No id for notifications

        let request_str = serde_json::to_string(&notification).unwrap();
        let message = format!("Content-Length: {}\r\n\r\n{}", request_str.len(), request_str);

        self.stdin.write_all(message.as_bytes()).await.unwrap();
        self.stdin.flush().await.unwrap();
    }

    pub async fn expect_no_response(&mut self, timeout_ms: u64) -> bool {
        let result = tokio::time::timeout(
            tokio::time::Duration::from_millis(timeout_ms),
            async {
                let mut line = String::new();
                self.reader.read_line(&mut line).await
            }
        ).await;

        result.is_err() // Timeout means no response, which is expected
    }
}

impl Drop for TestHarness {
    fn drop(&mut self) {
        // Kill server when test ends
        let _ = self.server.start_kill();
    }
}