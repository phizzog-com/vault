// Plugin Management Module - Core functionality for plugin discovery and management
// This module handles real filesystem operations for managing plugins

pub mod types;
pub mod manager;
pub mod scanner;
pub mod commands;

pub use types::*;
pub use manager::PluginManager;
pub use scanner::PluginScanner;