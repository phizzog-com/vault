// Task indexing and migration module
#![allow(dead_code)]
#![allow(unused_imports)]
#![allow(unused_variables)]

mod index;
mod migration;

#[cfg(test)]
mod migration_test;

pub use index::{TaskIndex, TaskRecord, IndexStats, TaskQuery};
pub use migration::{TaskMigrationManager, TaskMigrationConfig, TaskMigrationReport};