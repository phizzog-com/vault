// Standalone test for task frontmatter integration
use std::collections::HashMap;
use chrono::{DateTime, Utc};

// Import the necessary modules
#[path = "src/identity/frontmatter/mod.rs"]
mod frontmatter;

use frontmatter::{FrontMatter, TaskFrontMatter, TaskProperties, TaskStatus, Priority};

fn main() {
    println!("Testing Task Front Matter Integration");
    println!("======================================");
    
    // Test 1: Add task to frontmatter
    println!("\nTest 1: Add task to frontmatter");
    let mut fm = FrontMatter::with_id("note-123".to_string());
    let task_id = "task-uuid-1";
    let props = TaskProperties::new("Complete documentation".to_string());
    
    TaskFrontMatter::upsert_task(&mut fm.extra_fields, task_id.to_string(), props.clone());
    
    // Verify task was added
    let tasks = TaskFrontMatter::extract_tasks(&fm.extra_fields).unwrap();
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks.get(task_id).unwrap().text, "Complete documentation");
    println!("✓ Task added successfully");
    
    // Test 2: Update existing task
    println!("\nTest 2: Update existing task");
    let mut props2 = props.clone();
    props2.text = "Updated documentation".to_string();
    props2.priority = Some(Priority::High);
    TaskFrontMatter::upsert_task(&mut fm.extra_fields, task_id.to_string(), props2);
    
    let tasks = TaskFrontMatter::extract_tasks(&fm.extra_fields).unwrap();
    assert_eq!(tasks.get(task_id).unwrap().text, "Updated documentation");
    assert_eq!(tasks.get(task_id).unwrap().priority, Some(Priority::High));
    println!("✓ Task updated successfully");
    
    // Test 3: Remove task
    println!("\nTest 3: Remove task");
    TaskFrontMatter::upsert_task(&mut fm.extra_fields, 
        "task-2".to_string(), 
        TaskProperties::new("Task 2".to_string()));
    
    let removed = TaskFrontMatter::remove_task(&mut fm.extra_fields, task_id);
    assert!(removed.is_some());
    
    let tasks = TaskFrontMatter::extract_tasks(&fm.extra_fields).unwrap();
    assert_eq!(tasks.len(), 1);
    assert!(!tasks.contains_key(task_id));
    assert!(tasks.contains_key("task-2"));
    println!("✓ Task removed successfully");
    
    // Test 4: Mark task as done
    println!("\nTest 4: Mark task as done");
    let mut props3 = TaskProperties::new("Test task".to_string());
    props3.mark_done();
    assert_eq!(props3.status, TaskStatus::Done);
    assert!(props3.completed_at.is_some());
    println!("✓ Task marked as done successfully");
    
    // Test 5: Priority normalization
    println!("\nTest 5: Priority normalization");
    use frontmatter::tasks::normalize_priority;
    
    assert_eq!(normalize_priority("!p1"), Priority::High);
    assert_eq!(normalize_priority("!p2"), Priority::Medium);
    assert_eq!(normalize_priority("low"), Priority::Low);
    assert_eq!(normalize_priority("1"), Priority::High);
    println!("✓ Priority normalization working");
    
    // Test 6: Task validation
    println!("\nTest 6: Task validation");
    use frontmatter::tasks::validate_task_properties;
    
    let valid = TaskProperties::new("Valid task".to_string());
    assert!(validate_task_properties(&valid).is_ok());
    
    let mut invalid = TaskProperties::new("".to_string());
    assert!(validate_task_properties(&invalid).is_err());
    println!("✓ Task validation working");
    
    println!("\nAll tests passed! ✅");
}
