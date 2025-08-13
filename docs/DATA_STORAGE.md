# Data Storage Guide

This guide explains where Vault stores your data, how to back it up, and how to transfer settings between computers.

## Overview

Vault follows a local-first philosophy, meaning all your data stays on your computer. The app uses different storage mechanisms for different types of data to ensure both security and performance.

## Storage Locations

### 1. Your Notes (Vault Data)

Your notes are stored as plain Markdown files in the vault folder you choose when you first open Vault. This could be anywhere on your computer, such as:
- `~/Documents/My Notes`
- `~/Dropbox/Vault Notes`
- Any folder you select

**Important:** Vault never modifies files outside your chosen vault folder. You have complete control over these files and can edit them with any text editor.

### 2. Application Settings

Vault stores application settings and configurations in your system's app configuration directory:

#### macOS
```
~/Library/Application Support/com.vault.app/
├── .vault/
│   └── last_vault.txt        # Path to your last opened vault
├── ai_settings.json          # AI provider configurations and API keys
├── mcp_settings.json         # MCP server configurations
└── plugin_settings/          # Plugin-specific settings
    └── readwise.json         # Readwise plugin configuration
```

#### Windows
```
C:\Users\{username}\AppData\Roaming\com.vault.app\
├── .vault\
│   └── last_vault.txt        # Path to your last opened vault
├── ai_settings.json          # AI provider configurations and API keys
├── mcp_settings.json         # MCP server configurations
└── plugin_settings\          # Plugin-specific settings
    └── readwise.json         # Readwise plugin configuration
```

#### Linux
```
~/.config/com.vault.app/
├── .vault/
│   └── last_vault.txt        # Path to your last opened vault
├── ai_settings.json          # AI provider configurations and API keys
├── mcp_settings.json         # MCP server configurations
└── plugin_settings/          # Plugin-specific settings
    └── readwise.json         # Readwise plugin configuration
```

### 3. Browser Storage (UI State)

Vault also uses the browser's localStorage for temporary UI state:
- Chat panel visibility (`vault-chat-visible`)
- Sort preferences (`vault-sort-option`)
- Panel widths (`chatPanelWidth`)
- Chat history (`vault-chat-messages`)
- Current chat provider (`vault-chat-provider`)

**Note:** This data is stored in Tauri's WebView storage, not your system browser.

## Security

### API Keys
API keys for AI providers are stored using Tauri's secure storage mechanisms in `ai_settings.json`. While these are encrypted, we recommend:
- Using environment variables for sensitive data in development
- Rotating API keys regularly
- Never committing API keys to version control

### Vault Access
Vault only accesses files within your chosen vault folder. The app has no network access to external servers except for:
- AI provider APIs (when configured)
- MCP server connections (when configured)

## Backing Up Your Data

### Complete Backup
To create a complete backup of your Vault setup:

1. **Backup your vault folder** (contains all your notes)
2. **Backup the app configuration directory**:
   - macOS: `~/Library/Application Support/com.vault.app/`
   - Windows: `C:\Users\{username}\AppData\Roaming\com.vault.app\`
   - Linux: `~/.config/com.vault.app/`

### Minimal Backup
For a minimal backup (just your notes):
- Simply backup your vault folder

## Transferring Settings Between Computers

To transfer your Vault setup to another computer:

1. **Install Vault** on the new computer
2. **Copy your vault folder** to the new computer
3. **Copy the app configuration directory** from the old computer to the new one:
   - Find the configuration directory on the old computer (see paths above)
   - Copy the entire `com.vault.app` folder
   - Paste it in the corresponding location on the new computer
4. **Update vault path** if necessary:
   - If your vault is in a different location on the new computer, open Vault and select the vault folder

## Resetting Vault

To completely reset Vault to its initial state:

1. **Delete the app configuration directory**:
   - macOS: `rm -rf ~/Library/Application Support/com.vault.app/`
   - Windows: Delete `C:\Users\{username}\AppData\Roaming\com.vault.app\`
   - Linux: `rm -rf ~/.config/com.vault.app/`
2. **Restart Vault** - it will show the welcome screen as if freshly installed

**Note:** This will not delete your notes (they remain in your vault folder).

## File Formats

### Markdown Files (.md)
Your notes are stored as standard Markdown files with these conventions:
- UTF-8 encoding
- LF line endings (automatically normalized)
- Standard Markdown syntax plus Vault extensions (like `==highlight==`)

### Configuration Files (.json)
Settings are stored as JSON files:
- `ai_settings.json`: AI provider settings, API keys, model preferences
- `mcp_settings.json`: MCP server configurations, paths, and arguments
- `plugin_settings/readwise.json`: Readwise plugin settings including:
  - API token for Readwise account
  - Export folder path (defaults to `{vault}/Readwise/`)
  - Sync preferences and last sync timestamp
  - UUID auto-generation settings for imported files

### Image Files
Images pasted into notes are stored in:
- `{vault}/files/` directory
- Named with timestamp: `image-{timestamp}.png`
- Referenced in Markdown as `![[image-{timestamp}.png]]`

## Troubleshooting

### "Cannot find vault" on startup
If Vault can't find your last vault:
1. The vault folder may have been moved or deleted
2. Vault will automatically clear the invalid path and show the welcome screen
3. Simply select your vault folder again

### Settings not persisting
If settings aren't saving:
1. Check that Vault has write permissions to the configuration directory
2. Ensure you have enough disk space
3. Try resetting Vault (see above)

### Missing AI settings after update
If AI settings are lost after updating Vault:
1. Check if the configuration directory path has changed
2. Restore from your backup if available
3. Re-enter your API keys in the settings

## Plugin-Specific Storage

### Readwise Plugin
The Readwise plugin stores:
- **Configuration**: `~/Library/Application Support/com.vault.app/plugin_settings/readwise.json`
- **Imported content**: `{vault}/Readwise/` folder (customizable)
- **UUID tracking**: Automatically adds unique identifiers to all imported files for note identity tracking

When Readwise imports files:
1. Files are created in the configured export folder
2. Each file automatically receives a UUID in its frontmatter
3. The UUID enables tracking of notes across renames/moves
4. Sync history is maintained in the plugin settings

## Privacy Note

Vault is designed with privacy in mind:
- All data stays on your computer
- No telemetry or usage tracking
- No automatic cloud sync
- API keys are only used for configured AI services
- MCP servers run locally on your machine
- Plugin data (like Readwise tokens) is stored locally only

For questions or issues, please visit our [GitHub repository](https://github.com/phizzog-com/vault).