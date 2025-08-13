# MCP Settings Configuration

This guide explains how to configure MCP (Model Context Protocol) servers for vault.

## Location

The MCP settings file should be created at:

**macOS**: `~/Library/Application Support/com.vault.app/mcp_settings.json`

**Windows**: `%APPDATA%/com.vault.app/mcp_settings.json`

**Linux**: `~/.config/com.vault.app/mcp_settings.json`

## Creating the Configuration File

1. Navigate to the appropriate directory for your operating system (create it if it doesn't exist):
   ```bash
   # macOS
   mkdir -p ~/Library/Application\ Support/com.vault.app/
   
   # Windows (in PowerShell)
   New-Item -ItemType Directory -Force -Path "$env:APPDATA\com.vault.app"
   
   # Linux
   mkdir -p ~/.config/com.vault.app/
   ```

2. Create the `mcp_settings.json` file in this directory.

## Example Configuration

Here's an example `mcp_settings.json` file with all bundled MCP servers:

```json
{
  "settings": {
    "enabled": true,
    "servers": {
      "vault-filesystem-rust": {
        "capabilities": {
          "prompts": false,
          "resources": true,
          "sampling": false,
          "tools": true
        },
        "enabled": true,
        "id": "vault-filesystem-rust",
        "name": "Filesystem Tools (Rust)",
        "permissions": {
          "delete": true,
          "external_access": false,
          "read": true,
          "write": true
        },
        "transport": {
          "args": [
            "--line-transport"
          ],
          "command": "mcp-filesystem-server",
          "env": {},
          "type": "stdio",
          "working_dir": ""
        }
      },
      "vault-git-rust": {
        "capabilities": {
          "prompts": false,
          "resources": false,
          "sampling": false,
          "tools": true
        },
        "enabled": false,
        "id": "vault-git-rust",
        "name": "Git Version Control (Rust)",
        "permissions": {
          "delete": false,
          "external_access": true,
          "read": true,
          "write": true
        },
        "transport": {
          "args": [
            "--line-transport"
          ],
          "command": "mcp-git-server",
          "env": {
            "VAULT_PATH": ""
          },
          "type": "stdio",
          "working_dir": null
        }
      },
      "vault-search-rust": {
        "capabilities": {
          "prompts": false,
          "resources": false,
          "sampling": false,
          "tools": true
        },
        "enabled": true,
        "id": "vault-search-rust",
        "name": "Search & Analysis (Rust)",
        "permissions": {
          "delete": false,
          "external_access": false,
          "read": true,
          "write": false
        },
        "transport": {
          "args": [
            "--line-transport"
          ],
          "command": "mcp-search-server",
          "env": {},
          "type": "stdio",
          "working_dir": ""
        }
      }
    }
  }
}
```

## Configuration Options

Each server entry supports the following options:

- `name`: Unique identifier for the server
- `command`: The executable to run (e.g., "node", "python", etc.)
- `args`: Array of command-line arguments
- `env`: Environment variables to pass to the server

## Environment Variables

The `VAULT_PATH` environment variable is automatically replaced with your current vault path when the server starts. This allows MCP servers to access files in your vault.

## Bundled MCP Servers

vault includes five bundled MCP servers:

1. **filesystem-server**: Provides file system operations
2. **search-server**: Enables searching within your vault
3. **git-server**: Offers Git integration capabilities


These servers are automatically installed in your application support directory when you first run vault.

## Custom MCP Servers

You can add your own MCP servers by adding entries to the `servers` array. For example:

```json
{
  "name": "my-custom-server",
  "command": "python",
  "args": ["/path/to/my/custom/server.py"],
  "env": {
    "API_KEY": "your-api-key"
  }
}
```

## Troubleshooting

1. **Server not connecting**: Ensure the command and args paths are correct
2. **Permission errors**: Make sure the server executable has proper permissions
3. **Environment variables not working**: Check that variable names match what the server expects

## Note

The MCP settings are stored separately from your vault data to maintain privacy and allow different configurations across vaults. Changes to the settings file require restarting the MCP servers in the application's MCP Settings panel.