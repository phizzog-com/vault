# Task UUID Migration Guide

This guide helps you migrate existing checkbox tasks in your vault to use the new UUID system.

## Why Migrate?

The Task UUID System adds unique, persistent identifiers to every task, enabling:
- ✅ Track tasks across note renames and moves
- ✅ Store task properties in front matter
- ✅ Use visual task management dashboards
- ✅ Query and filter tasks efficiently
- ✅ Maintain task history and completion dates

## Before You Start

### Backup Your Vault (Optional but Recommended)

While the migration system creates automatic backups, it's good practice to have your own:

```bash
# Example backup command
cp -r ~/Documents/MyVault ~/Documents/MyVault-Backup-$(date +%Y%m%d)
```

### Check Your Task Syntax

The migration system recognizes standard Markdown checkbox syntax:

✅ **Recognized formats:**
```markdown
- [ ] Unchecked task
- [x] Checked task
- [X] Also checked (capital X)
  - [ ] Indented task (any indentation level)
```

❌ **Not recognized:**
```markdown
* [ ] Task with asterisk (use dash instead)
+ [ ] Task with plus (use dash instead)
[ ] Task without list marker
- [] Task without space in brackets
```

## Migration Process

### Step 1: Preview with Dry Run

Always start with a dry run to see what will change:

1. **Open Command Palette** (method varies by OS)
2. **Run**: "Task Migration - Dry Run"
3. **Review the Report**:

```
=== Task Migration Report (DRY RUN) ===
Total files scanned: 156
Total tasks found: 423
  - Open tasks: 367
  - Completed tasks: 56

Tasks needing IDs: 380
Tasks with existing IDs: 43

Files that would be modified: 89
```

The dry run:
- ✅ Shows exact counts of tasks to be migrated
- ✅ Identifies files that will be changed
- ✅ Detects any potential issues
- ✅ Makes NO actual changes

### Step 2: Run the Migration

When you're ready to proceed:

1. **Run**: "Task Migration - Add UUIDs"
2. **Monitor Progress**: Watch the progress indicator
3. **Review Final Report**:

```
=== Task Migration Report ===
Total files scanned: 156
Total tasks found: 423
Tasks migrated: 380
Files modified: 89

Properties extracted:
  - due: 45
  - project: 67
  - tags: 189
  - priority: 34

Backup created at: .migration_backup/20250826_143022
Duration: 3421ms
```

### Step 3: Verify Results

After migration, your tasks will have UUID comments:

**Before:**
```markdown
- [ ] Review quarterly report
- [x] Send invoice to client
```

**After:**
```markdown
- [ ] Review quarterly report <!-- tid: 0198e692-9c32-76f0-9884-e8942fe4b49c -->
- [x] Send invoice to client <!-- tid: 0198e692-9c33-7322-9cfd-7f5016832552 -->
```

The UUID comments are:
- Invisible in preview mode
- Preserved during edits
- Unique across your vault
- Time-sortable (UUIDv7 format)

## Migration Options

### Configuration Settings

You can customize the migration behavior:

```javascript
{
  dry_run: false,        // Preview without changes
  show_progress: true,   // Display progress bar
  parallel_limit: 4,     // Number of parallel workers
  skip_existing: true,   // Skip tasks with existing IDs
  include_properties: true // Extract task properties
}
```

### Parallel Processing

For large vaults, adjust `parallel_limit`:
- **Default (4)**: Good for most systems
- **Higher (8-16)**: Faster on powerful machines
- **Lower (1-2)**: For systems with limited resources

### Property Extraction

When `include_properties` is enabled, the migration extracts:
- Due dates: `@due(2025-01-20)`
- Projects: `@project(ProjectName)`
- Tags: `#tag1 #tag2`
- Priorities: `!high`, `!medium`, `!low`

## Rollback Process

If you need to undo the migration:

### Automatic Rollback

If you used the migration with backup:

1. **Locate the backup path** from the migration report
2. **Run**: "Task Migration - Rollback"
3. **Select the backup** to restore from
4. **Confirm** the rollback

### Manual Rollback

If you have your own backup:

```bash
# Restore from your backup
rm -rf ~/Documents/MyVault
cp -r ~/Documents/MyVault-Backup ~/Documents/MyVault
```

## Special Cases

### Large Vaults (1000+ Files)

For very large vaults:

1. **Close other applications** to free up resources
2. **Increase parallel_limit** to 8 or 16
3. **Run during low-activity times**
4. **Expect 10-30 seconds** for completion

### Mixed Content Files

Files with both tasks and other content:
- ✅ Only task lines are modified
- ✅ Document structure preserved
- ✅ Formatting unchanged
- ✅ Non-task content untouched

### Tasks with Existing IDs

If some tasks already have UUIDs:
- They are automatically skipped
- No duplicate IDs created
- Report shows count of skipped tasks

## Post-Migration

### Using the Task Dashboard

After migration, access your tasks:

1. **Press `Cmd+Shift+T`** to open Task Dashboard
2. **Choose a view**:
   - List View: Traditional task list
   - Kanban View: Drag-and-drop boards
   - Calendar View: Tasks by due date

### Task Properties in Front Matter

The migration can store task properties in front matter:

```yaml
---
tasks:
  0198e692-9c32-76f0-9884-e8942fe4b49c:
    text: "Review quarterly report"
    status: todo
    due: 2025-01-20
    project: "Q1-Planning"
    priority: high
---
```

### Continuous UUID Management

After migration:
- New tasks automatically get UUIDs
- No need to run migration again
- System maintains consistency

## Troubleshooting

### Common Issues

**Q: Migration seems stuck**
- Check task manager for high CPU usage
- Large vaults may take time
- Cancel and retry with lower parallel_limit

**Q: Some tasks weren't migrated**
- Check task syntax (must be `- [ ]` or `- [x]`)
- Look for special characters that might interfere
- Review files listed in error report

**Q: Lost some formatting**
- Check backup for original formatting
- Migration preserves all text, but complex formats may need review
- Report specific issues for improvement

**Q: Can't find backup**
- Check `.migration_backup/` folder in vault root
- Backups named with timestamp
- Keep manual backups as extra safety

### Error Recovery

If migration fails midway:

1. **Check error report** for specific files
2. **Fix identified issues** (usually syntax problems)
3. **Run migration again** - it will skip completed tasks
4. **Use rollback** if needed to start fresh

## Best Practices

### Before Migration
- ✅ Run dry-run first
- ✅ Create manual backup
- ✅ Close unnecessary programs
- ✅ Check available disk space

### During Migration
- ✅ Don't edit files while migrating
- ✅ Watch progress indicator
- ✅ Let it complete fully

### After Migration
- ✅ Verify a few files manually
- ✅ Test task dashboard
- ✅ Keep backup for a few days
- ✅ Report any issues

## Advanced Topics

### Command Line Migration

For developers/power users:

```javascript
// Via browser console
await window.__TAURI__.invoke('add_task_uuids_to_vault', {
  config: {
    dry_run: true,
    show_progress: true,
    parallel_limit: 4,
    skip_existing: true,
    include_properties: true
  }
});
```

### Custom Scripts

Create custom migration scripts:

```javascript
// Migrate specific folder only
const report = await migrateFolder('/path/to/folder', {
  include_properties: true,
  parallel_limit: 8
});

console.log(`Migrated ${report.tasks_migrated} tasks`);
```

### Integration with Plugins

The UUID system integrates with:
- Graph visualization plugins
- Task analytics tools
- Sync services
- Export utilities

## Support

Need help with migration?

- Check [Task UUID System Documentation](TASK_UUID_SYSTEM.md)
- Review [Task Quick Start Guide](TASK_QUICKSTART.md)
- Report issues on GitHub
- Join community Discord

---

*Last Updated: 2025-08-26*
*Migration System Version: 1.0.0*