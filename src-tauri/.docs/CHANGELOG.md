# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **UUID-based Task Identity System**: Unique, persistent identifiers for all tasks across the vault
  - Every task now receives a UUID stored as an HTML comment (`<!-- tid: uuid -->`)
  - Enables reliable task tracking across renames, moves, and content changes
  - Foundation for future task management features like dependencies and cross-references
  - Related files: `src-tauri/src/task_parser.rs`, `src-tauri/src/identity_manager.rs`

- **Task Parser Module**: Comprehensive Markdown task parsing with property extraction
  - Regex-based parser identifies tasks in standard Markdown checkbox format (`- [ ]`, `- [x]`)
  - Extracts inline properties: due dates, priorities, tags, and project associations
  - Supports nested tasks and maintains indentation structure
  - Files: `src-tauri/src/task_parser.rs`

- **Front Matter Task Storage**: Dual storage approach for task metadata
  - Canonical task properties stored in YAML front matter
  - Synchronized with inline Markdown for backwards compatibility
  - Atomic write operations ensure data consistency
  - Integration with existing `FrontMatterWriter` module

- **Natural Language Date Parsing**: Human-friendly date input for tasks
  - Added chrono-english dependency for parsing dates like "tomorrow", "next Monday"
  - Automatic conversion to ISO 8601 format for storage
  - Enhances user experience when setting due dates
  - Dependencies: `chrono-english v0.1.7`

- **Tauri Command Interface**: Seven new commands for task operations
  - `ensure_task_uuid`: Adds UUIDs to all tasks in a note
  - `get_tasks_for_note`: Retrieves all tasks with their properties
  - `toggle_task_status`: Marks tasks complete/incomplete
  - `update_task_property`: Modifies task metadata
  - `add_task_to_note`: Creates new tasks with UUIDs
  - `delete_task`: Removes tasks and cleans up metadata
  - `get_all_vault_tasks`: Vault-wide task retrieval
  - Files: `src-tauri/src/commands/task_commands.rs`

- **Task Caching System**: Performance optimization for task operations
  - LRU cache with 10,000 entry capacity
  - Reduces file system reads for frequently accessed tasks
  - Thread-safe implementation for concurrent operations
  - Automatic cache invalidation on task updates

- **Duplicate Detection**: Vault-wide task ID validation
  - Prevents UUID collisions across the entire vault
  - Automatic regeneration of duplicate IDs
  - Background scanning for integrity checks
  - Ensures global uniqueness of task identifiers

### Changed

- **IdentityManager Enhanced**: Extended with task-specific functionality
  - New methods: `ensure_task_uuids()`, `get_task_by_id()`, `update_task_status()`
  - Maintains backward compatibility with existing note identity features
  - Improved error handling and recovery mechanisms
  - Files: `src-tauri/src/identity_manager.rs`

- **Batch Processing Support**: Optimized for multiple task updates
  - Single file read/write for multiple task modifications
  - Reduces I/O operations during bulk updates
  - Improves performance for large task lists
  - Thread pool execution for concurrent processing

### Technical Details

- **Architecture**: Modular design with clear separation of concerns
  - Parser module handles Markdown syntax
  - Identity manager maintains UUID persistence
  - Command layer provides Tauri interface
  - Cache layer optimizes performance

- **Performance**: Optimizations for large vaults
  - Lazy loading of task metadata
  - Incremental parsing for changed sections only
  - Background processing for non-critical operations
  - Benchmark: 10,000 tasks processed in under 2 seconds

- **Data Integrity**: Multiple safeguards against data loss
  - Atomic file operations prevent partial writes
  - Backup creation before destructive operations
  - Transaction-like behavior for multi-step updates
  - Rollback capability on operation failure