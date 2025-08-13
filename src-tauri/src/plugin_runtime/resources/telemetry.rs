use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::{Serialize, Deserialize};

/// Telemetry event types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TelemetryEvent {
    // Resource events
    ResourceUsage {
        memory_bytes: u64,
        cpu_percent: f32,
        network_bytes: u64,
    },
    LimitExceeded {
        resource_type: String,
        limit: u64,
        actual: u64,
    },
    ProcessStarted {
        pid: u32,
        plugin_id: String,
    },
    ProcessTerminated {
        reason: String,
        plugin_id: String,
    },
    PerformanceWarning {
        metric: String,
        value: f64,
        threshold: f64,
    },
    NetworkThrottled {
        plugin_id: String,
        bandwidth_limit: u64,
        attempted_rate: u64,
    },
    // Lifecycle events
    PluginLoaded {
        plugin_id: String,
        name: String,
        version: String,
    },
    PluginActivated {
        plugin_id: String,
    },
    PluginDeactivated {
        plugin_id: String,
        reason: String,
    },
    PluginUnloaded {
        plugin_id: String,
    },
    // API events
    ApiCallMade {
        plugin_id: String,
        api_method: String,
        success: bool,
    },
    PermissionRequested {
        plugin_id: String,
        permission: String,
        granted: bool,
    },
}

/// Telemetry entry with timestamp
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEntry {
    pub timestamp: u64, // Unix timestamp in milliseconds
    pub plugin_id: String,
    pub event: TelemetryEvent,
}

/// Telemetry collector for resource monitoring
pub struct Telemetry {
    events: Arc<Mutex<Vec<TelemetryEntry>>>,
    max_events: usize,
    enabled: Arc<Mutex<bool>>,
}

impl Telemetry {
    /// Create a new telemetry collector
    pub fn new() -> Self {
        Self {
            events: Arc::new(Mutex::new(Vec::new())),
            max_events: 10000, // Keep last 10k events
            enabled: Arc::new(Mutex::new(true)),
        }
    }

    /// Record a telemetry event
    pub fn record(&mut self, plugin_id: &str, event: TelemetryEvent) {
        if !*self.enabled.lock().unwrap() {
            return;
        }

        let entry = TelemetryEntry {
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            plugin_id: plugin_id.to_string(),
            event,
        };

        let mut events = self.events.lock().unwrap();
        events.push(entry);

        // Trim old events if we exceed max
        if events.len() > self.max_events {
            let drain_count = events.len() - self.max_events;
            events.drain(0..drain_count);
        }
    }

    /// Get all events for a plugin
    pub fn get_events(&self, plugin_id: &str) -> Vec<TelemetryEntry> {
        let events = self.events.lock().unwrap();
        events
            .iter()
            .filter(|e| e.plugin_id == plugin_id)
            .cloned()
            .collect()
    }

    /// Get events within a time window
    pub fn get_events_since(&self, since_timestamp: u64) -> Vec<TelemetryEntry> {
        let events = self.events.lock().unwrap();
        events
            .iter()
            .filter(|e| e.timestamp >= since_timestamp)
            .cloned()
            .collect()
    }

    /// Clear all telemetry data
    pub fn clear(&mut self) {
        let mut events = self.events.lock().unwrap();
        events.clear();
    }

    /// Clear telemetry data for a specific plugin
    pub fn clear_plugin(&mut self, plugin_id: &str) {
        let mut events = self.events.lock().unwrap();
        events.retain(|e| e.plugin_id != plugin_id);
    }

    /// Enable or disable telemetry collection
    pub fn set_enabled(&self, enabled: bool) {
        let mut state = self.enabled.lock().unwrap();
        *state = enabled;
    }

    /// Check if telemetry is enabled
    pub fn is_enabled(&self) -> bool {
        *self.enabled.lock().unwrap()
    }

    /// Export telemetry data as JSON
    pub fn export_json(&self) -> Result<String, serde_json::Error> {
        let events = self.events.lock().unwrap();
        serde_json::to_string_pretty(&*events)
    }

    /// Import telemetry data from JSON
    pub fn import_json(&mut self, json: &str) -> Result<(), serde_json::Error> {
        let imported: Vec<TelemetryEntry> = serde_json::from_str(json)?;
        let mut events = self.events.lock().unwrap();
        events.extend(imported);
        Ok(())
    }

    /// Get summary statistics for a plugin
    pub fn get_summary(&self, plugin_id: &str) -> TelemetrySummary {
        let events = self.get_events(plugin_id);
        
        let mut summary = TelemetrySummary::default();
        summary.event_count = events.len();

        for event in events {
            match event.event {
                TelemetryEvent::ResourceUsage { memory_bytes, cpu_percent, .. } => {
                    summary.avg_memory += memory_bytes as f64;
                    summary.avg_cpu += cpu_percent as f64;
                    summary.resource_samples += 1;
                    
                    summary.max_memory = summary.max_memory.max(memory_bytes);
                    summary.max_cpu = summary.max_cpu.max(cpu_percent);
                }
                TelemetryEvent::LimitExceeded { .. } => {
                    summary.limit_violations += 1;
                }
                TelemetryEvent::ProcessTerminated { .. } => {
                    summary.terminations += 1;
                }
                TelemetryEvent::PerformanceWarning { .. } => {
                    summary.warnings += 1;
                }
                TelemetryEvent::NetworkThrottled { .. } => {
                    summary.throttle_events += 1;
                }
                // Lifecycle events - just count them
                TelemetryEvent::ProcessStarted { .. } |
                TelemetryEvent::PluginLoaded { .. } |
                TelemetryEvent::PluginActivated { .. } |
                TelemetryEvent::PluginDeactivated { .. } |
                TelemetryEvent::PluginUnloaded { .. } |
                TelemetryEvent::ApiCallMade { .. } |
                TelemetryEvent::PermissionRequested { .. } => {
                    // These events are informational and don't affect summary stats
                }
            }
        }

        // Calculate averages
        if summary.resource_samples > 0 {
            summary.avg_memory /= summary.resource_samples as f64;
            summary.avg_cpu /= summary.resource_samples as f64;
        }

        summary
    }
}

/// Summary statistics for telemetry data
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TelemetrySummary {
    pub event_count: usize,
    pub resource_samples: usize,
    pub avg_memory: f64,
    pub avg_cpu: f64,
    pub max_memory: u64,
    pub max_cpu: f32,
    pub limit_violations: usize,
    pub terminations: usize,
    pub warnings: usize,
    pub throttle_events: usize,
}