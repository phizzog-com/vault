# Task UUID System Documentation

## Overview

The Task UUID System provides unique, persistent identifiers for all checkbox tasks in your vault. This enables advanced task management features including cross-note tracking, property storage, and comprehensive task organization.

## Key Features

- **Automatic UUID Generation**: Every task gets a unique UUIDv7 identifier
- **Non-Intrusive Storage**: UUIDs stored as HTML comments (`<!-- tid: uuid -->`)
- **Property Extraction**: Automatic parsing of due dates, projects, tags, and priorities
- **Vault-Wide Migration**: Safely add UUIDs to all existing tasks
- **Visual Task Management**: Multiple UI views for organizing and tracking tasks

## How It Works

### Task Format

Tasks are standard Markdown checkboxes with optional UUID comments:

```markdown
- [ ] Basic task without UUID
- [x] Completed task <!-- tid: 0198e692-9c32-76f0-9884-e8942fe4b49c -->
- [ ] Task with properties @due(2025-01-20) @project(Work) #urgent !high
```

### Property Syntax

The system recognizes these task properties:

- **Due Dates**: `@due(2025-01-20)` or `@due(tomorrow)`
- **Projects**: `@project(ProjectName)`
- **Tags**: `#tagname` (multiple allowed)
- **Priority**: `!high`, `!medium`, `!low` or `!p1` through `!p5`

## Using the Task Management UI

### Task Widget (Sidebar)

The Task Widget appears in your sidebar and provides:

- **Overview**: Count of open and completed tasks
- **Filtering**: By status, project, or date range
- **Search**: Find tasks by content
- **Quick Actions**: Toggle completion, edit properties
- **Grouping**: By project, due date, or priority

### Task Dashboard

Access the full dashboard with `Cmd+Shift+T` or clicking "View All" in the widget:

#### List View
- Traditional task list with sorting and filtering
- Columns: Task, Status, Due Date, Project, Priority
- Click to navigate to source note

#### Kanban View
- Drag-and-drop between status columns (Todo, In Progress, Done)
- Visual project organization
- Priority indicators with colors

#### Calendar View
- Month view with tasks on due dates
- Navigate between months
- Click dates to see tasks
- Visual overdue indicators

## Migration Guide

### Adding UUIDs to Existing Tasks

To add UUIDs to all existing tasks in your vault:

1. **Dry Run Preview** (Recommended First)
   ```
   Run migration in dry-run mode to preview changes
   ```

2. **Actual Migration**
   ```
   Performs the migration with automatic backup
   ```

3. **Migration Options**:
   - **Dry Run**: Preview without making changes
   - **Include Properties**: Extract and store task properties
   - **Parallel Processing**: Speed up large vault migrations
   - **Skip Existing**: Don't modify tasks that already have UUIDs

### Migration Report

After migration, you'll see a detailed report:

```
=== Task Migration Report ===
Total files scanned: 127
Total tasks found: 342
  - Open tasks: 285
  - Completed tasks: 57

Tasks needing IDs: 298
Tasks with existing IDs: 44

Tasks migrated: 298
Files modified: 89

Properties extracted:
  - due: 45
  - project: 67
  - tags: 123
  - priority: 34

Duration: 2341ms
```

### Safety Features

- **Automatic Backup**: Creates timestamped backup before changes
- **Rollback Capability**: Restore original files if needed
- **Idempotent**: Safe to run multiple times
- **Error Isolation**: One file's error doesn't stop migration

## Front Matter Storage

Task properties can be stored in note front matter for persistence:

```yaml
---
id: note-uuid
tasks:
  task-uuid-1:
    text: "Complete project proposal"
    status: todo
    due: 2025-01-20
    project: "Q1 Planning"
    priority: high
    tags: ["work", "urgent"]
    created_at: 2025-01-15T10:00:00Z
---
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Task Dashboard | `Cmd+Shift+T` |
| Create New Task | `Cmd+Alt+T` |
| Toggle Task Status | `Space` (when focused) |
| Quick Edit Properties | `E` (when focused) |
| Delete Task | `Delete` (when focused) |

## API Commands

### Tauri Commands

For developers and plugin authors:

```javascript
// Ensure a task has a UUID
await window.__TAURI__.invoke('ensure_task_uuid', {
  file_path: 'path/to/note.md',
  line_number: 5
});

// Get all tasks for a note
const tasks = await window.__TAURI__.invoke('get_tasks_for_note', {
  file_path: 'path/to/note.md'
});

// Toggle task completion
await window.__TAURI__.invoke('toggle_task_status', {
  file_path: 'path/to/note.md',
  task_id: 'uuid-here'
});

// Update task properties
await window.__TAURI__.invoke('update_task_properties', {
  file_path: 'path/to/note.md',
  task_id: 'uuid-here',
  properties: {
    due: '2025-01-20',
    priority: 'high'
  }
});

// Migrate entire vault
const report = await window.__TAURI__.invoke('add_task_uuids_to_vault', {
  config: {
    dry_run: false,
    include_properties: true,
    parallel_limit: 4
  }
});
```

## Performance Considerations

- **Index Updates**: Task index updates incrementally on file changes
- **Query Speed**: Most queries complete in <10ms
- **Migration Speed**: ~100-200 files/second with parallel processing
- **Memory Usage**: Minimal overhead (~1KB per task in index)

## Troubleshooting

### Common Issues

**Q: Some tasks don't get UUIDs during migration**
A: Check if the tasks follow standard markdown checkbox syntax: `- [ ]` or `- [x]`

**Q: Task properties aren't being extracted**
A: Ensure proper syntax: `@due()`, `@project()`, `#tag`, `!priority`

**Q: Migration seems slow**
A: Increase parallel_limit (default 4) for faster processing on powerful machines

**Q: How do I rollback a migration?**
A: Use the rollback command with the migration report, or restore from the backup folder

### Debug Information

Enable debug logging for detailed task system information:

```javascript
// In browser console
localStorage.setItem('debug:tasks', 'true');
```

## Best Practices

1. **Run Dry-Run First**: Always preview migrations before applying
2. **Regular Backups**: Though the system creates backups, maintain your own
3. **Consistent Syntax**: Use consistent property syntax across your vault
4. **Incremental Updates**: Let the system manage UUIDs automatically for new tasks
5. **Use the UI**: The visual interfaces make task management more intuitive

## Technical Details

### UUID Format

Uses UUIDv7 for time-sortable identifiers:
- 128-bit identifier
- Timestamp-based for chronological ordering
- RFC 4122 compliant
- Example: `0198e692-9c32-76f0-9884-e8942fe4b49c`

### Storage Format

UUIDs stored as HTML comments to preserve markdown compatibility:
```markdown
- [ ] Task text <!-- tid: 0198e692-9c32-76f0-9884-e8942fe4b49c -->
```

### Architecture

- **Parser**: Regex-based task detection and property extraction
- **Identity Manager**: UUID generation and persistence
- **Task Index**: In-memory index with multiple lookup maps
- **UI Components**: Modular views with shared task data
- **Migration System**: Parallel processor with progress tracking

## Future Enhancements

Planned improvements for the Task UUID System:

- [ ] Task dependencies and subtasks
- [ ] Recurring task templates
- [ ] Advanced filtering with saved queries
- [ ] Task analytics and reporting
- [ ] Mobile app synchronization
- [ ] Collaborative task assignment
- [ ] Time tracking integration
- [ ] Gantt chart view

## Support

For issues or questions about the Task UUID System:
- Check the [Troubleshooting](#troubleshooting) section
- Review the [API Commands](#api-commands) for integration
- Report bugs in the GitHub repository
- Join the community Discord for help

---

*Last Updated: 2025-08-26*
*Version: 1.0.0*