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

// ============================================================================
// Feature Constants
// ============================================================================

/// CSV Editor Pro - Schema inference and persistence
pub const FEATURE_CSV_SCHEMA: &str = "csv:schema";

/// CSV Editor Pro - AI context generation for enhanced LLM understanding
pub const FEATURE_CSV_AI_CONTEXT: &str = "csv:ai_context";

/// CSV Editor Pro - Cross-file relationship mapping
pub const FEATURE_CSV_RELATIONSHIPS: &str = "csv:relationships";

/// CSV Editor Pro - Unlimited row access (beyond 10K free limit)
pub const FEATURE_CSV_UNLIMITED_ROWS: &str = "csv:unlimited_rows";

/// CSV Editor Pro - Blanket premium feature (grants all CSV premium features)
pub const FEATURE_CSV_PRO: &str = "csv:pro";

/// PacasDB Premium - Core database features
pub const FEATURE_PACASDB: &str = "pacasdb";

/// Features included in trial licenses
pub const TRIAL_FEATURES: &[&str] = &[
    FEATURE_PACASDB,
    FEATURE_CSV_SCHEMA,
    FEATURE_CSV_AI_CONTEXT,
    FEATURE_CSV_RELATIONSHIPS,
    FEATURE_CSV_UNLIMITED_ROWS,
    FEATURE_CSV_PRO,
];

// Re-export main functions and types for convenience
pub use fingerprint::get_machine_fingerprint;
pub use types::{LicenseStatus, LicenseInfo};
pub use storage::{store_license, load_license, delete_license};
pub use service::{start_trial, check_trial};
pub use validation::{activate_online, deactivate_online};
