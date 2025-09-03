# UUID Management Command

This document describes how to use the bulk UUID addition command to add UUIDs to all files in your vault.

## Overview

The UUID system in this application provides unique identifiers for all notes, enabling better linking, graph relationships, and data integrity. The bulk UUID command allows you to add UUIDs to all files in your vault that don't already have them.

## Usage Methods

### Method 1: Developer Console (Recommended)

1. Open your vault in the application
2. Open the browser developer console (F12 or right-click → Inspect)
3. Use the global `addUUIDs()` function:

```javascript
// Add UUIDs to all files, skipping those that already have them
addUUIDs()

// Force add UUIDs to ALL files (will replace existing UUIDs)
addUUIDs(false)
```

The function will show progress and results directly in the console.

### Method 2: Programmatic Usage

If you're developing or need to integrate this into custom code:

```javascript
import { addUUIDsToVault } from './utils/uuid-utils.js'

// Basic usage
const result = await addUUIDsToVault({
    skipExisting: true, // Don't overwrite existing UUIDs
    onProgress: (progress) => {
        console.log(`${progress.stage}: ${progress.message}`)
    }
})

console.log('Results:', result)
```

### Method 3: UI Component (Future)

A UI component (`UUIDManager`) is available and can be integrated into settings or tools panels:

```javascript
import { UUIDManager } from './components/UUIDManager.js'

const manager = new UUIDManager()
const ui = manager.createUI()
document.body.appendChild(ui)
```

## Command Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `skipExisting` | boolean | `true` | Whether to skip files that already have UUIDs |
| `onProgress` | function | `null` | Callback function for progress updates |

## Output Format

The command returns a `BulkUuidResult` object:

```javascript
{
    total_files: 150,        // Total markdown files found
    processed: 150,          // Files that were processed
    added_uuids: 45,         // Files that had UUIDs added
    already_had_uuids: 100,  // Files that already had UUIDs
    errors: 5,               // Files that had errors
    error_files: [           // List of files with errors
        "Error message 1",
        "Error message 2"
    ]
}
```

## How It Works

1. **File Discovery**: Scans the vault directory for all markdown files (`.md` extension)
2. **UUID Check**: For each file, checks if it already has a UUID in the frontmatter
3. **UUID Generation**: Generates a new UUID for files that need one
4. **Frontmatter Update**: Adds the UUID to the file's YAML frontmatter along with timestamps

## Generated Frontmatter Format

Files without frontmatter will get this format:

```yaml
---
id: 01989c47-af1f-7261-beed-729764328b36
created_at: "2025-08-12T03:16:40.351357+00:00"
updated_at: "2025-08-12T03:16:40.351357+00:00"
---
# Your Content Here
```

Files with existing frontmatter will have the UUID added:

```yaml
---
title: My Note
tags: [important, work]
id: 01989c47-af1f-7261-beed-729764328b36  # Added
created_at: "2025-08-12T03:16:40.351357+00:00"  # Added
updated_at: "2025-08-12T03:16:40.351357+00:00"  # Added
---
```

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| "Window state not found" | Command called without active vault | Open a vault first |
| "No vault open for this window" | Vault not properly loaded | Restart and reopen vault |
| "Permission denied" | File system permissions | Check file/directory permissions |
| "Failed to parse frontmatter" | Malformed YAML | Fix YAML syntax in affected files |

## Performance Notes

- Large vaults (1000+ files) may take several minutes
- The process runs in parallel with a default limit of 4 concurrent operations
- Files are processed safely with backup/rollback capabilities
- Progress is logged to the console during execution

## Safety Features

- **Skip Existing**: By default, files with UUIDs are not modified
- **Backup-Safe**: Original file content is preserved
- **Error Isolation**: Errors in individual files don't stop the entire process
- **Detailed Logging**: Complete activity log for troubleshooting

## Backend Command

The frontend calls the Rust backend command:

```rust
add_uuids_to_vault(
    window_id: String,
    skip_existing: Option<bool>
) -> Result<BulkUuidResult, String>
```

This integrates with the existing identity management system and migration framework.

## Related Commands

- `get_note_uuid(path)` - Get UUID for a specific file
- `ensure_note_uuid(path)` - Ensure a specific file has a UUID
- `is_uuid(id)` - Check if a string is a valid UUID
- `is_legacy_id(id)` - Check if an ID is a legacy format

## Integration Notes

The UUID system integrates with:

- **Graph Database**: UUIDs are used as node identifiers
- **Link Resolution**: Wikilinks can reference UUIDs
- **Search System**: UUIDs provide unique document identifiers
- **Sync System**: UUIDs enable conflict resolution
- **Plugin System**: Plugins can use UUIDs for note references

This command provides the foundation for all UUID-based features in the application.