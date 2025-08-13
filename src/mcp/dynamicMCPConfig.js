/**
 * Dynamic MCP Configuration
 * 
 * Instead of hardcoding VAULT_PATH, MCP servers should:
 * 1. Use the current vault from the app state
 * 2. Fall back to current working directory
 * 3. Never store static paths
 */

export function getDynamicMCPConfig() {
  // DON'T set VAULT_PATH - let the servers figure it out dynamically
  return {
    'gaimplan-filesystem-rust': {
      enabled: true,
      transport: {
        type: 'stdio',
        command: 'mcp-filesystem-server',
        args: ['--line-transport'],
        env: {
          // NO VAULT_PATH! Server will use CWD or detect it
        },
        working_dir: window.currentVaultPath || null
      },
      capabilities: {
        tools: true,
        resources: true,
        prompts: false,
        sampling: false
      },
      permissions: {
        read: true,
        write: true,
        delete: true,
        external_access: false
      }
    },
    'gaimplan-search-rust': {
      enabled: true,
      transport: {
        type: 'stdio',
        command: 'mcp-search-server',
        args: ['--line-transport'],
        env: {
          // NO VAULT_PATH! Server will use CWD or detect it
        },
        working_dir: window.currentVaultPath || null
      },
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
        sampling: false
      },
      permissions: {
        read: true,
        write: false,
        delete: false,
        external_access: false
      }
    }
  };
}

export function startMCPWithCurrentVault() {
  const config = getDynamicMCPConfig();
  
  // Set working directory to current vault
  const vaultPath = window.currentVaultPath;
  if (vaultPath) {
    Object.values(config).forEach(serverConfig => {
      if (serverConfig.transport) {
        serverConfig.transport.working_dir = vaultPath;
      }
    });
  }
  
  return config;
}