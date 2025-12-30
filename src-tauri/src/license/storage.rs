/// Secure license storage using OS keychain
///
/// Stores license information securely in the system keychain:
/// - macOS: Keychain Access
/// - Windows: Credential Manager
/// - Linux: Secret Service

use keyring::Entry;
use super::types::LicenseInfo;
use serde_json;

const SERVICE_NAME: &str = "com.vault.pacasdb";

/// Store license information in the OS keychain
pub fn store_license(machine_id: &str, license_info: &LicenseInfo) -> Result<(), String> {
    // Create keyring entry for this machine
    let entry = Entry::new(SERVICE_NAME, machine_id)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    // Serialize license info to JSON
    let json = serde_json::to_string(license_info)
        .map_err(|e| format!("Failed to serialize license: {}", e))?;

    // Store in keychain
    entry.set_password(&json)
        .map_err(|e| format!("Failed to store license in keychain: {}", e))?;

    Ok(())
}

/// Load license information from the OS keychain
pub fn load_license(machine_id: &str) -> Result<Option<LicenseInfo>, String> {
    // Create keyring entry for this machine
    let entry = Entry::new(SERVICE_NAME, machine_id)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    // Try to get password from keychain
    match entry.get_password() {
        Ok(json) => {
            // Deserialize license info from JSON
            let license_info = serde_json::from_str(&json)
                .map_err(|e| format!("Failed to deserialize license: {}", e))?;
            Ok(Some(license_info))
        }
        Err(keyring::Error::NoEntry) => {
            // No license found - this is OK
            Ok(None)
        }
        Err(e) => {
            // Other errors
            Err(format!("Failed to load license from keychain: {}", e))
        }
    }
}

/// Delete license information from the OS keychain
pub fn delete_license(machine_id: &str) -> Result<(), String> {
    // Create keyring entry for this machine
    let entry = Entry::new(SERVICE_NAME, machine_id)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    // Delete from keychain (use delete_password method)
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => {
            // Already deleted - this is OK
            Ok(())
        }
        Err(e) => {
            Err(format!("Failed to delete license from keychain: {}", e))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    // Test machine ID for keychain tests (unique to avoid conflicts)
    fn test_machine_id() -> String {
        format!("test-machine-{}", std::process::id())
    }

    // Clean up any test data after each test
    fn cleanup_test_license(machine_id: &str) {
        let _ = delete_license(machine_id);
    }

    #[test]
    fn test_store_and_load_license() {
        let machine_id = test_machine_id();

        // Clean up before test
        cleanup_test_license(&machine_id);

        // Create test license info
        let license_info = LicenseInfo {
            key: "TEST-KEY-12345".to_string(),
            license_type: "lifetime".to_string(),
            features: vec!["pacasdb".to_string()],
            activated_at: Utc::now(),
            expires_at: None,
        };

        // Store the license
        let result = store_license(&machine_id, &license_info);
        assert!(result.is_ok(), "Failed to store license: {:?}", result.err());

        // Load the license back
        let loaded = load_license(&machine_id).expect("Failed to load license");
        assert!(loaded.is_some(), "License should exist after storing");

        let loaded_info = loaded.unwrap();
        assert_eq!(loaded_info.key, license_info.key);
        assert_eq!(loaded_info.license_type, license_info.license_type);
        assert_eq!(loaded_info.features, license_info.features);

        // Clean up after test
        cleanup_test_license(&machine_id);
    }

    #[test]
    fn test_load_nonexistent_license() {
        let machine_id = format!("nonexistent-{}", std::process::id());

        // Ensure no license exists
        cleanup_test_license(&machine_id);

        // Try to load license that doesn't exist
        let result = load_license(&machine_id);
        assert!(result.is_ok(), "Load should succeed even if license doesn't exist");

        let loaded = result.unwrap();
        assert!(loaded.is_none(), "Should return None for nonexistent license");
    }

    #[test]
    fn test_delete_license() {
        let machine_id = test_machine_id();

        // Clean up before test
        cleanup_test_license(&machine_id);

        // Store a test license
        let license_info = LicenseInfo {
            key: "DELETE-TEST-KEY".to_string(),
            license_type: "trial".to_string(),
            features: vec!["pacasdb".to_string()],
            activated_at: Utc::now(),
            expires_at: Some(Utc::now() + chrono::Duration::days(30)),
        };

        store_license(&machine_id, &license_info).expect("Failed to store license");

        // Verify it was stored
        let loaded = load_license(&machine_id).expect("Failed to load license");
        assert!(loaded.is_some(), "License should exist before deletion");

        // Delete the license
        let result = delete_license(&machine_id);
        assert!(result.is_ok(), "Failed to delete license: {:?}", result.err());

        // Verify it was deleted
        let loaded_after = load_license(&machine_id).expect("Failed to load license");
        assert!(loaded_after.is_none(), "License should not exist after deletion");
    }

    #[test]
    fn test_update_license() {
        let machine_id = test_machine_id();

        // Clean up before test
        cleanup_test_license(&machine_id);

        // Store initial license
        let license_info_v1 = LicenseInfo {
            key: "UPDATE-KEY-V1".to_string(),
            license_type: "trial".to_string(),
            features: vec!["pacasdb".to_string()],
            activated_at: Utc::now(),
            expires_at: Some(Utc::now() + chrono::Duration::days(30)),
        };

        store_license(&machine_id, &license_info_v1).expect("Failed to store v1");

        // Update with new license
        let license_info_v2 = LicenseInfo {
            key: "UPDATE-KEY-V2".to_string(),
            license_type: "lifetime".to_string(),
            features: vec!["pacasdb".to_string(), "advanced".to_string()],
            activated_at: Utc::now(),
            expires_at: None,
        };

        store_license(&machine_id, &license_info_v2).expect("Failed to store v2");

        // Load and verify it's the updated version
        let loaded = load_license(&machine_id).expect("Failed to load license");
        assert!(loaded.is_some(), "License should exist after update");

        let loaded_info = loaded.unwrap();
        assert_eq!(loaded_info.key, "UPDATE-KEY-V2", "Should have updated key");
        assert_eq!(loaded_info.license_type, "lifetime", "Should have updated type");
        assert_eq!(loaded_info.features.len(), 2, "Should have updated features");

        // Clean up after test
        cleanup_test_license(&machine_id);
    }
}
