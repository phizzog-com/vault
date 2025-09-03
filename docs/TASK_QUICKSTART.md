# Task Management Quick Start Guide

Get started with Vault's powerful task management system in 5 minutes!

## 1. Creating Your First Tasks

Open any note and type:

```markdown
- [ ] My first task
- [ ] Call client @due(tomorrow) 
- [ ] Review proposal @project(Q1) #urgent !high
- [x] Completed task
```

That's it! Tasks are just markdown checkboxes with optional metadata.

## 2. Open the Task Dashboard

Press **`Cmd+Shift+T`** to see all your tasks in one place.

You'll see three view options:
- **List View** - Traditional task list
- **Kanban Board** - Drag and drop between columns  
- **Calendar** - Tasks on a monthly calendar

## 3. Add UUIDs to Existing Tasks (One-Time Setup)

If you already have tasks in your vault, add unique IDs to them:

### Step 1: Preview Changes (Dry Run)
First, see what will change without modifying anything:

1. Open the command palette
2. Run "Task Migration - Dry Run"
3. Review the report showing how many tasks will be updated

### Step 2: Run the Migration
When ready:

1. Run "Task Migration - Add UUIDs"  
2. Wait for completion (usually < 5 seconds for most vaults)
3. Your tasks now have unique IDs!

The migration:
- ✅ Creates automatic backup
- ✅ Preserves all your task text
- ✅ Adds invisible UUID comments
- ✅ Can be rolled back if needed

## 4. Using Task Properties

Make tasks more useful with properties:

### Due Dates
```markdown
- [ ] Task @due(2025-01-20)
- [ ] Task @due(tomorrow)
- [ ] Task @due(next Friday)
```

### Projects
```markdown
- [ ] Task @project(Website-Redesign)
- [ ] Task @project(Q1-Planning)
```

### Priority
```markdown
- [ ] Task !high
- [ ] Task !medium  
- [ ] Task !low
```

### Tags
```markdown
- [ ] Task #work #urgent
- [ ] Task #personal #health
```

### Combine Them All
```markdown
- [ ] Review design mockups @due(Monday) @project(Website) #design !high
```

## 5. Task Widget in Sidebar

Look for the **Tasks** widget in your sidebar. It shows:
- Open task count
- Completed today
- Overdue tasks
- Quick filters by project

Click any task to jump to its note!

## 6. Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Task Dashboard | `Cmd+Shift+T` |
| Create New Task | `Cmd+Alt+T` |
| Toggle Task (in dashboard) | `Space` |
| Edit Properties (in dashboard) | `E` |
| Delete Task (in dashboard) | `Delete` |

## 7. Common Workflows

### Daily Planning
1. Press `Cmd+Shift+T` to open dashboard
2. Switch to Calendar view
3. See what's due today and this week
4. Drag tasks to reschedule

### Project Management  
1. Create tasks with `@project(ProjectName)`
2. Open Task Widget in sidebar
3. Filter by project
4. Track progress at a glance

### Quick Capture
1. Press `Cmd+N` for new note
2. Brain dump tasks:
   ```markdown
   - [ ] Email John about contract
   - [ ] Book flights for conference
   - [ ] Review Q4 budget
   ```
3. Tasks automatically get UUIDs and appear in dashboard

## Tips & Tricks

### 💡 Natural Language Dates
Use natural language for due dates:
- `@due(tomorrow)`
- `@due(next Monday)`
- `@due(in 3 days)`
- `@due(end of month)`

### 💡 Task Templates
Create template notes with common task structures:
```markdown
## Project Kickoff Checklist
- [ ] Schedule kick-off meeting @due(this week)
- [ ] Create project channel @project({{project}}) 
- [ ] Share project brief !high
- [ ] Set up tracking dashboard
```

### 💡 Bulk Operations
In the Task Dashboard:
- Select multiple tasks with Shift+Click
- Change properties for all selected
- Move multiple tasks between projects

### 💡 Smart Filters
Combine filters in the widget:
- "Overdue + High Priority"  
- "This Week + Project X"
- "No Due Date + Urgent Tag"

## Troubleshooting

**Q: My tasks don't appear in the dashboard**
- Make sure they use the correct checkbox syntax: `- [ ]` or `- [x]`
- Run the UUID migration if they're missing IDs

**Q: Properties aren't being recognized**
- Check syntax: `@due()`, `@project()`, `#tag`, `!priority`
- Ensure parentheses for due and project

**Q: Migration seems stuck**
- Large vaults (>1000 files) may take 10-30 seconds
- Check the progress indicator
- You can cancel and retry if needed

## What's Next?

- Read the full [Task UUID System Documentation](TASK_UUID_SYSTEM.md)
- Learn about [Task Properties & Front Matter](TASK_UUID_SYSTEM.md#front-matter-storage)
- Explore [API Commands](TASK_UUID_SYSTEM.md#api-commands) for automation

---

**Need help?** Check the main [User Guide](USER_GUIDE.md) or report issues on GitHub.

*Last Updated: 2025-08-26*