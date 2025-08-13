/// MCP Protocol Compliance Tests using the test harness

use serde_json::json;

mod test_harness;
use test_harness::TestHarness;

#[tokio::test]
async fn test_server_initialization() {
    // The harness automatically initializes, so we test by creating a new one
    let harness = TestHarness::new().await;
    drop(harness); // Server should have been initialized successfully
}

#[tokio::test]
async fn test_tools_list() {
    let mut harness = TestHarness::new().await;
    
    let response = harness.send_request(json!({
        "method": "tools/list",
        "params": {}
    })).await;

    assert_eq!(response["jsonrpc"], "2.0");
    let tools = response["result"]["tools"].as_array().unwrap();
    
    // Verify all expected tools are present
    let tool_names: Vec<&str> = tools
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    
    assert!(tool_names.contains(&"list_files"));
    assert!(tool_names.contains(&"read_file"));
    assert!(tool_names.contains(&"write_file"));
    assert!(tool_names.contains(&"create_directory"));
    assert!(tool_names.contains(&"delete_file"));
    assert!(tool_names.contains(&"move_file"));
    assert!(tool_names.contains(&"search_files"));
}

#[tokio::test]
async fn test_tool_schemas() {
    let mut harness = TestHarness::new().await;
    
    let response = harness.send_request(json!({
        "method": "tools/list",
        "params": {}
    })).await;

    let tools = response["result"]["tools"].as_array().unwrap();
    
    // Verify each tool has proper schema
    for tool in tools {
        assert!(tool["name"].is_string());
        assert!(tool["description"].is_string());
        assert!(tool["inputSchema"]["type"].as_str() == Some("object"));
        assert!(tool["inputSchema"]["properties"].is_object());
    }
}

#[tokio::test]
async fn test_invalid_method_error() {
    let mut harness = TestHarness::new().await;
    
    let response = harness.send_request(json!({
        "method": "invalid/method",
        "params": {}
    })).await;

    assert!(response["error"].is_object());
    assert_eq!(response["error"]["code"], -32601); // Method not found
}

#[tokio::test]
async fn test_resources_list() {
    let mut harness = TestHarness::new().await;
    
    let response = harness.send_request(json!({
        "method": "resources/list",
        "params": {}
    })).await;

    assert_eq!(response["jsonrpc"], "2.0");
    let resources = response["result"]["resources"].as_array().unwrap();
    
    // Should have at least vault-info resource
    assert!(resources.len() >= 1);
    assert!(resources.iter().any(|r| r["uri"] == "file://vault-info"));
}

#[tokio::test]
async fn test_notification_handling() {
    let mut harness = TestHarness::new().await;
    
    // Send a notification
    harness.send_notification(json!({
        "method": "notifications/cancelled",
        "params": {
            "requestId": "test-123"
        }
    })).await;

    // Should not receive a response
    assert!(harness.expect_no_response(200).await);
}

#[tokio::test]
async fn test_tool_call_error_handling() {
    let mut harness = TestHarness::new().await;
    
    // Call a tool with missing required parameters
    let response = harness.send_request(json!({
        "method": "tools/call",
        "params": {
            "name": "read_file",
            "arguments": {} // Missing required "path" parameter
        }
    })).await;

    assert!(response["result"]["isError"].as_bool().unwrap_or(false));
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Error"));
}

#[tokio::test]
async fn test_resource_read() {
    let mut harness = TestHarness::new().await;
    
    let response = harness.send_request(json!({
        "method": "resources/read",
        "params": {
            "uri": "file://vault-info"
        }
    })).await;

    assert_eq!(response["jsonrpc"], "2.0");
    let contents = response["result"]["contents"].as_array().unwrap();
    assert_eq!(contents.len(), 1);
    assert_eq!(contents[0]["uri"], "file://vault-info");
    assert_eq!(contents[0]["mimeType"], "application/json");
    
    // Verify the content is valid JSON
    let vault_info: serde_json::Value = serde_json::from_str(
        contents[0]["text"].as_str().unwrap()
    ).unwrap();
    assert!(vault_info["path"].is_string());
    assert!(vault_info["isWritable"].is_boolean());
}