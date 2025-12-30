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
pub mod validation;

// Re-export main functions and types for convenience
pub use fingerprint::get_machine_fingerprint;
pub use types::{LicenseStatus, LicenseInfo};
pub use storage::{store_license, load_license, delete_license};
pub use service::{start_trial, check_trial};
pub use validation::{activate_online, validate_online, deactivate_online};
