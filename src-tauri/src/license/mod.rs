/// License management module for PacasDB Premium
///
/// This module handles all licensing operations including:
/// - Machine fingerprinting for license binding
/// - License validation and storage
/// - Trial tracking and entitlement management

pub mod fingerprint;
pub mod types;
pub mod storage;
pub mod service;

// Re-export main functions and types for convenience
pub use fingerprint::get_machine_fingerprint;
pub use types::{LicenseStatus, LicenseInfo};
pub use storage::{store_license, load_license, delete_license};
pub use service::{start_trial, check_trial};
