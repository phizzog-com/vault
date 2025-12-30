import { invoke } from '@tauri-apps/api/core';

import pluginSettingsPanel from './PluginSettingsPanel.js';
import EntitlementManager from '../services/entitlement-manager.js';
import LicenseStatusBadge from '../components/LicenseStatusBadge.js';
import ActivationDialog from '../components/ActivationDialog.js';

/**
 * Font color presets from the design token system
 * These provide curated options that work well in both light and dark themes
 */
const FONT_COLOR_PRESETS = {
    light: [
        { name: 'Default', value: '#171717', description: 'Primary text (neutral-900)' },
        { name: 'Soft', value: '#404040', description: 'Secondary text (neutral-700)' },
        { name: 'Muted', value: '#525252', description: 'Tertiary text (neutral-600)' },
        { name: 'Warm', value: '#32302c', description: 'Warm neutral' },
        { name: 'Cool', value: '#1f2937', description: 'Cool gray' }
    ],
    dark: [
        { name: 'Default', value: '#fafafa', description: 'Primary text (neutral-50)' },
        { name: 'Soft', value: '#d4d4d4', description: 'Secondary text (neutral-300)' },
        { name: 'Muted', value: '#a3a3a3', description: 'Tertiary text (neutral-400)' },
        { name: 'Warm', value: '#e5e5e5', description: 'Warm neutral' },
        { name: 'Cool', value: '#e2e8f0', description: 'Cool gray' }
    ]
};

export class UserSettingsPanel {
    constructor() {
        this.state = {
            vaultPath: '',
            activeTab: 'editor', // 'editor', 'plugins', or 'pacasdb'
            editor: {
                fontSize: 16,
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
                fontColor: '#171717',
                theme: 'default',
                lineNumbers: true,
                lineWrapping: true,
                showStatusBar: true
            },
            files: {
                imageLocation: 'Files/',
                imageNamingPattern: 'Pasted image {timestamp}',
                dailyNotesFolder: 'Daily Notes'
            },
            pacasdb: {
                connected: false,
                docCount: 0,
                indexSize: 0,
                lastSync: null,
                isTesting: false,
                isSyncing: false
            },
            isDirty: false,
            isSaving: false,
            isLoading: true,
            isSyncing: false
        };

        this.container = null;
        this.callbacks = {
            onSave: null,
            onClose: null
        };
        this.previewTimeout = null;
        this.pluginSettingsPanel = null;

        // PACASDB-related instances
        this.entitlementManager = null;
        this.licenseStatusBadge = null;
        this.activationDialog = null;
        this.pacasdbClient = null;
        this.vaultSync = null;
    }
    
    async mount(container, callbacks = {}) {
        console.log('Mounting User Settings Panel');
        this.container = container;
        this.callbacks = { ...this.callbacks, ...callbacks };
        
        // Get current vault path
        this.state.vaultPath = await this.getCurrentVaultPath();
        if (!this.state.vaultPath) {
            this.showError('No vault is currently open');
            return;
        }
        
        await this.loadSettings();
        this.render();
    }
    
    async getCurrentVaultPath() {
        // Check window global first
        if (window.currentVaultPath) {
            return window.currentVaultPath;
        }
        
        // Fallback to backend
        try {
            const vaultInfo = await invoke('get_vault_info');
            if (vaultInfo && vaultInfo.path) {
                return vaultInfo.path;
            }
        } catch (error) {
            console.error('Failed to get vault info:', error);
        }
        
        return null;
    }
    
    async loadSettings() {
        try {
            this.state.isLoading = true;
            const settings = await invoke('get_vault_settings', {
                vaultPath: this.state.vaultPath
            });

            console.log('Loaded vault settings:', settings);
            
            // Update state with loaded settings, converting snake_case to camelCase
            this.state.editor = {
                ...this.state.editor,
                fontSize: settings.editor.font_size || this.state.editor.fontSize,
                fontFamily: settings.editor.font_family || this.state.editor.fontFamily,
                fontColor: settings.editor.font_color || this.state.editor.fontColor,
                theme: settings.editor.theme || this.state.editor.theme,
                lineNumbers: settings.editor.line_numbers !== undefined ? settings.editor.line_numbers : this.state.editor.lineNumbers,
                lineWrapping: settings.editor.line_wrapping !== undefined ? settings.editor.line_wrapping : this.state.editor.lineWrapping,
                showStatusBar: settings.editor.show_status_bar !== undefined ? settings.editor.show_status_bar : this.state.editor.showStatusBar
            };
            this.state.files = {
                ...this.state.files,
                imageLocation: settings.files.image_location || this.state.files.imageLocation,
                imageNamingPattern: settings.files.image_naming_pattern || this.state.files.imageNamingPattern,
                dailyNotesFolder: settings.files.daily_notes_folder || this.state.files.dailyNotesFolder
            };
            this.state.isDirty = false;
        } catch (error) {
            console.error('Failed to load vault settings:', error);
            // Use defaults on error
        } finally {
            this.state.isLoading = false;
        }
    }
    
    async saveSettings() {
        if (!this.state.isDirty || this.state.isSaving) return;
        
        try {
            this.state.isSaving = true;
            this.render();
            
            const settings = {
                vault_path: this.state.vaultPath,
                editor: {
                    font_size: this.state.editor.fontSize,
                    font_family: this.state.editor.fontFamily,
                    font_color: this.state.editor.fontColor,
                    theme: this.state.editor.theme,
                    line_numbers: this.state.editor.lineNumbers,
                    line_wrapping: this.state.editor.lineWrapping,
                    show_status_bar: this.state.editor.showStatusBar
                },
                files: {
                    image_location: this.state.files.imageLocation,
                    image_naming_pattern: this.state.files.imageNamingPattern,
                    daily_notes_folder: this.state.files.dailyNotesFolder
                }
            };
            
            console.log('Saving vault settings...');
            await invoke('save_vault_settings', { settings });
            
            this.state.isDirty = false;
            this.showNotification('Settings saved successfully', 'success');
            
            // Call callback if provided with camelCase properties
            if (this.callbacks.onSave) {
                this.callbacks.onSave({
                    editor: this.state.editor,
                    files: this.state.files,
                    vault_path: this.state.vaultPath
                });
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('Failed to save settings: ' + error, 'error');
        } finally {
            this.state.isSaving = false;
            this.render();
        }
    }
    
    async resetSection(section) {
        const confirmReset = confirm(`Reset ${section} settings to defaults?`);
        if (!confirmReset) return;
        
        try {
            const settings = await invoke('reset_vault_settings', { 
                vaultPath: this.state.vaultPath 
            });
            
            // Update state with reset settings, converting snake_case to camelCase
            this.state.editor = {
                ...this.state.editor,
                fontSize: settings.editor.font_size || this.state.editor.fontSize,
                fontFamily: settings.editor.font_family || this.state.editor.fontFamily,
                fontColor: settings.editor.font_color || this.state.editor.fontColor,
                theme: settings.editor.theme || this.state.editor.theme,
                lineNumbers: settings.editor.line_numbers !== undefined ? settings.editor.line_numbers : this.state.editor.lineNumbers,
                lineWrapping: settings.editor.line_wrapping !== undefined ? settings.editor.line_wrapping : this.state.editor.lineWrapping,
                showStatusBar: settings.editor.show_status_bar !== undefined ? settings.editor.show_status_bar : this.state.editor.showStatusBar
            };
            this.state.files = {
                ...this.state.files,
                imageLocation: settings.files.image_location || this.state.files.imageLocation,
                imageNamingPattern: settings.files.image_naming_pattern || this.state.files.imageNamingPattern,
                dailyNotesFolder: settings.files.daily_notes_folder || this.state.files.dailyNotesFolder
            };
            this.state.isDirty = false;
            
            this.showNotification(`${section} settings reset to defaults`, 'success');
            this.render();
            
            // Trigger preview update
            this.previewChanges();
        } catch (error) {
            console.error('Failed to reset settings:', error);
            this.showNotification('Failed to reset settings: ' + error, 'error');
        }
    }
    
    updateEditorSetting(key, value) {
        this.state.editor[key] = value;

        // When theme changes, update font color to match the new theme's default
        if (key === 'theme') {
            const isDarkTheme = value === 'dark';
            const defaultColor = isDarkTheme
                ? FONT_COLOR_PRESETS.dark[0].value   // '#fafafa'
                : FONT_COLOR_PRESETS.light[0].value; // '#171717'
            this.state.editor.fontColor = defaultColor;
        }

        this.state.isDirty = true;
        this.render();
        this.previewChanges();
    }
    
    updateFileSetting(key, value) {
        this.state.files[key] = value;
        this.state.isDirty = true;
        this.render();
    }
    
    previewChanges() {
        // Clear existing timeout
        if (this.previewTimeout) {
            clearTimeout(this.previewTimeout);
        }
        
        // Debounce preview updates
        this.previewTimeout = setTimeout(() => {
            // Apply preview to editor
            if (window.themeManager) {
                // IMPORTANT: Apply theme FIRST, then font color
                // applyTheme sets --editor-text-color from theme defaults,
                // so setFontColor must come AFTER to override with user's selection
                window.themeManager.applyTheme(this.state.editor.theme);
                window.themeManager.setFontSize(this.state.editor.fontSize);
                window.themeManager.setFontFamily(this.state.editor.fontFamily);
                window.themeManager.setFontColor(this.state.editor.fontColor);
                
                // Apply line numbers setting to current editor
                const activeTabManager = window.paneManager?.getActiveTabManager();
                const activeTab = activeTabManager?.getActiveTab();
                if (activeTab && activeTab.editor && activeTab.editor.setLineNumbers) {
                    activeTab.editor.setLineNumbers(this.state.editor.lineNumbers);
                }
                
                // Apply line wrapping setting to current editor
                if (activeTab && activeTab.editor && activeTab.editor.setLineWrapping) {
                    activeTab.editor.setLineWrapping(this.state.editor.lineWrapping);
                }
                
                // Apply status bar visibility
                if (window.toggleStatusBar) {
                    const currentVisible = document.getElementById('status-bar')?.style.display !== 'none';
                    if (currentVisible !== this.state.editor.showStatusBar) {
                        window.toggleStatusBar();
                    }
                }
                
                // Force refresh theme on all editors to pick up font color change
                // Use a small delay to ensure CSS variables have propagated
                if (this.state.editor.fontColor) {
                    setTimeout(() => {
                        // Apply to all editors in all panes
                        if (window.paneManager && window.paneManager.panes) {
                            for (const pane of window.paneManager.panes.values()) {
                                const tabManager = pane.tabManager;
                                if (tabManager && tabManager.tabs) {
                                    for (const tab of tabManager.tabs.values()) {
                                        if (tab.editor && tab.type === 'markdown' && tab.editor.refreshTheme) {
                                            console.log('Refreshing theme for font color preview');
                                            tab.editor.refreshTheme();
                                        }
                                    }
                                }
                            }
                        }
                    }, 50); // Small delay to ensure CSS variable is set
                }
            }
        }, 300);
    }
    
    async validateImageLocation() {
        try {
            const isValid = await invoke('validate_image_location', {
                vaultPath: this.state.vaultPath,
                imageLocation: this.state.files.imageLocation
            });
            
            if (!isValid) {
                this.showNotification('Image location must be within the vault', 'error');
                return false;
            }
            return true;
        } catch (error) {
            console.error('Failed to validate image location:', error);
            return false;
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
    
    showError(message) {
        this.container.innerHTML = `
            <div class="user-settings-panel">
                <div class="settings-error">
                    <h3>Error</h3>
                    <p>${message}</p>
                    <button onclick="userSettingsPanel.close()" class="primary-button">Close</button>
                </div>
            </div>
        `;
    }
    
    close() {
        if (this.callbacks.onClose) {
            this.callbacks.onClose();
        }
    }

    /**
     * Get the current color presets based on the selected theme
     */
    getColorPresets() {
        const isDarkTheme = this.state.editor.theme === 'dark';
        return isDarkTheme ? FONT_COLOR_PRESETS.dark : FONT_COLOR_PRESETS.light;
    }

    /**
     * Render color preset buttons for the font color picker
     */
    renderColorPresets() {
        const presets = this.getColorPresets();
        return presets.map(preset => {
            const isActive = this.state.editor.fontColor.toLowerCase() === preset.value.toLowerCase();
            return `
                <button type="button"
                        class="color-preset ${isActive ? 'active' : ''}"
                        style="background-color: ${preset.value}"
                        onclick="userSettingsPanel.updateEditorSetting('fontColor', '${preset.value}')"
                        title="${preset.name}: ${preset.description}"
                        aria-label="${preset.name} color preset">
                </button>
            `;
        }).join('');
    }

    async initializePACASDB() {
        // Initialize entitlement manager if not already done
        if (!this.entitlementManager) {
            this.entitlementManager = new EntitlementManager();
            await this.entitlementManager.initialize();
        }

        // Get PACASDB client from window if available
        if (window.pacasdbClient) {
            this.pacasdbClient = window.pacasdbClient;
        }

        // Get VaultSync from window if available
        if (window.vaultSync) {
            this.vaultSync = window.vaultSync;
        }

        // Initialize activation dialog
        if (!this.activationDialog) {
            this.activationDialog = new ActivationDialog(this.entitlementManager);
        }

        // Check PACASDB connection status
        if (this.pacasdbClient) {
            this.state.pacasdb.connected = this.pacasdbClient.isConnected();
        }
    }

    async startTrial() {
        try {
            if (!this.entitlementManager) {
                await this.initializePACASDB();
            }

            await this.entitlementManager.startTrial();
            this.showNotification('Trial activated! You now have 30 days of premium access.', 'success');
            this.render();
        } catch (error) {
            console.error('Failed to start trial:', error);
            this.showNotification('Failed to start trial: ' + error.message, 'error');
        }
    }

    async showActivationDialog() {
        try {
            if (!this.activationDialog) {
                await this.initializePACASDB();
            }

            this.activationDialog.show();
        } catch (error) {
            console.error('Failed to show activation dialog:', error);
            this.showNotification('Failed to open activation dialog: ' + error.message, 'error');
        }
    }

    async deactivateLicense() {
        const confirmed = confirm('Are you sure you want to deactivate your license? This will remove premium features.');
        if (!confirmed) return;

        try {
            if (!this.entitlementManager) {
                await this.initializePACASDB();
            }

            await this.entitlementManager.deactivateLicense();
            this.showNotification('License deactivated successfully.', 'success');
            this.render();
        } catch (error) {
            console.error('Failed to deactivate license:', error);
            this.showNotification('Failed to deactivate license: ' + error.message, 'error');
        }
    }

    async testConnection() {
        try {
            this.state.pacasdb.isTesting = true;
            this.render();

            if (!this.pacasdbClient) {
                await this.initializePACASDB();
            }

            if (!this.pacasdbClient) {
                throw new Error('PACASDB client not available');
            }

            const connected = await this.pacasdbClient.connect();
            this.state.pacasdb.connected = connected;

            if (connected) {
                this.showNotification('Successfully connected to PACASDB server', 'success');
                // Fetch database stats if available
                await this.fetchDatabaseStats();
            } else {
                this.showNotification('Failed to connect to PACASDB server. Make sure it is running on localhost:8000.', 'error');
            }
        } catch (error) {
            console.error('Connection test failed:', error);
            this.showNotification('Connection test failed: ' + error.message, 'error');
            this.state.pacasdb.connected = false;
        } finally {
            this.state.pacasdb.isTesting = false;
            this.render();
        }
    }

    async fetchDatabaseStats() {
        try {
            if (!this.pacasdbClient || !this.pacasdbClient.isConnected()) {
                return;
            }

            // Try to fetch stats from PACASDB
            const stats = await this.pacasdbClient.getStats();
            if (stats) {
                this.state.pacasdb.docCount = stats.document_count || 0;
                this.state.pacasdb.indexSize = stats.index_size || 0;
            }
        } catch (error) {
            console.error('Failed to fetch database stats:', error);
        }
    }

    async syncVaultNow() {
        try {
            this.state.pacasdb.isSyncing = true;
            this.render();

            if (!this.vaultSync) {
                await this.initializePACASDB();
            }

            if (!this.vaultSync) {
                throw new Error('VaultSync not available');
            }

            const summary = await this.vaultSync.syncAllDocuments(this.state.vaultPath);

            this.state.pacasdb.lastSync = new Date().toLocaleString();
            this.state.pacasdb.docCount = summary.indexed;

            this.showNotification(
                `Sync complete! Indexed ${summary.indexed} documents (${summary.failed} failed)`,
                summary.failed > 0 ? 'warning' : 'success'
            );
        } catch (error) {
            console.error('Vault sync failed:', error);
            this.showNotification('Vault sync failed: ' + error.message, 'error');
        } finally {
            this.state.pacasdb.isSyncing = false;
            this.render();
        }
    }

    switchTab(tab) {
        console.log('Switching to tab:', tab);

        // Handle PACASDB tab
        if (tab === 'pacasdb') {
            this.state.activeTab = 'pacasdb';
            // Initialize PACASDB components on first visit
            this.initializePACASDB().then(() => {
                this.render();
            });
            return;
        }

        // If switching to plugins tab, open Plugin Hub instead
        if (tab === 'plugins') {
            console.log('Opening Plugin Hub...');

            // Close the settings window
            this.close();

            // Open the Plugin Hub (same as Cmd+Shift+P)
            if (window.pluginHub) {
                window.pluginHub.open().then(() => {
                    console.log('Plugin Hub opened successfully');
                }).catch(err => {
                    console.error('Failed to open Plugin Hub:', err);
                });
            } else {
                console.warn('Plugin Hub not initialized');
            }
            return;
        }
        
        // Normal tab switching for other tabs
        this.state.activeTab = tab;
        this.render();
    }
    
    renderPACASDBSection() {
        const licenseStatus = this.entitlementManager ? this.entitlementManager.getStatus() : { type: 'Unlicensed' };
        const isPremium = this.entitlementManager ? this.entitlementManager.isPremiumEnabled() : false;
        const isUnlicensed = licenseStatus.type === 'Unlicensed';
        const isLicensed = licenseStatus.type === 'Licensed';

        return `
            <div class="settings-section pacasdb-section">
                <div class="section-header">
                    <h3>PACASDB Premium</h3>
                    <div id="license-badge-container"></div>
                </div>

                <div class="settings-group">
                    <div class="pacasdb-info">
                        <p>PACASDB provides semantic search and cognitive memory capabilities for your vault.</p>
                        <p>Features include:</p>
                        <ul>
                            <li>Semantic search across all notes</li>
                            <li>Related notes discovery</li>
                            <li>Cognitive context tracking</li>
                            <li>Automatic vault indexing</li>
                        </ul>
                    </div>

                    <!-- License Management -->
                    <div class="form-group">
                        <label>License Status:</label>
                        <div class="license-controls">
                            ${isUnlicensed ? `
                                <button onclick="userSettingsPanel.startTrial()" class="primary-button">
                                    Start 30-Day Free Trial
                                </button>
                            ` : ''}
                            <button onclick="userSettingsPanel.showActivationDialog()" class="secondary-button">
                                ${isLicensed ? 'Update License' : 'Activate License'}
                            </button>
                            ${isPremium ? `
                                <button onclick="userSettingsPanel.deactivateLicense()" class="secondary-button">
                                    Deactivate License
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    ${isPremium ? `
                        <hr style="margin: 24px 0; border: none; border-top: 1px solid var(--border-color, #e0e0e0);">

                        <!-- Connection Status -->
                        <div class="form-group">
                            <label>Connection Status:</label>
                            <div class="connection-status">
                                <span class="status-indicator ${this.state.pacasdb.connected ? 'connected' : 'disconnected'}">
                                    ${this.state.pacasdb.connected ? 'Connected' : 'Disconnected'}
                                </span>
                                <button onclick="userSettingsPanel.testConnection()"
                                        class="secondary-button"
                                        ${this.state.pacasdb.isTesting ? 'disabled' : ''}>
                                    ${this.state.pacasdb.isTesting ? 'Testing...' : 'Test Connection'}
                                </button>
                            </div>
                            <p class="form-help">
                                PACASDB server should be running on <code>localhost:8000</code>
                            </p>
                        </div>

                        ${this.state.pacasdb.connected ? `
                            <!-- Database Statistics -->
                            <div class="form-group">
                                <label>Database Statistics:</label>
                                <div class="database-stats">
                                    <div class="stat-item">
                                        <span class="stat-label">Documents:</span>
                                        <span class="stat-value">${this.state.pacasdb.docCount}</span>
                                    </div>
                                    ${this.state.pacasdb.indexSize > 0 ? `
                                        <div class="stat-item">
                                            <span class="stat-label">Index Size:</span>
                                            <span class="stat-value">${this.formatBytes(this.state.pacasdb.indexSize)}</span>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>

                            <!-- Sync Controls -->
                            <div class="form-group">
                                <label>Vault Synchronization:</label>
                                <div class="sync-controls">
                                    <button onclick="userSettingsPanel.syncVaultNow()"
                                            class="primary-button"
                                            ${this.state.pacasdb.isSyncing ? 'disabled' : ''}>
                                        ${this.state.pacasdb.isSyncing ? 'Syncing...' : 'Sync Vault Now'}
                                    </button>
                                    ${this.state.pacasdb.lastSync ? `
                                        <span class="last-sync">
                                            Last synced: ${this.state.pacasdb.lastSync}
                                        </span>
                                    ` : ''}
                                </div>
                                <p class="form-help">
                                    Manually sync all markdown files in your vault to PACASDB
                                </p>
                            </div>
                        ` : `
                            <!-- Setup Instructions -->
                            <div class="form-group">
                                <label>Setup Instructions:</label>
                                <div class="setup-instructions">
                                    <p>To use PACASDB features, you need to run the PACASDB server:</p>
                                    <ol>
                                        <li>Install Docker if not already installed</li>
                                        <li>Run: <code>docker run -p 8000:8000 pacasdb</code></li>
                                        <li>Click "Test Connection" above to verify</li>
                                    </ol>
                                    <a href="#" onclick="return false;" class="help-link">
                                        View detailed setup guide →
                                    </a>
                                </div>
                            </div>
                        `}
                    ` : `
                        <hr style="margin: 24px 0; border: none; border-top: 1px solid var(--border-color, #e0e0e0);">

                        <!-- Premium Required Message -->
                        <div class="premium-required">
                            <p>
                                <strong>Premium features are not active.</strong>
                            </p>
                            <p>
                                Start a free 30-day trial or activate your license to access PACASDB features.
                            </p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    render() {
        if (!this.container) return;

        // Make this instance available globally for event handlers
        window.userSettingsPanel = this;
        
        if (this.state.isLoading) {
            this.container.innerHTML = `
                <div class="user-settings-panel">
                    <div class="settings-loading">Loading settings...</div>
                </div>
            `;
            return;
        }
        
        const fontSizes = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24];
        const themes = [
            { value: 'default', label: 'Light' },
            { value: 'dark', label: 'Dark' }
        ];
        
        this.container.innerHTML = `
            <div class="user-settings-panel">
                <div class="settings-header">
                    <h2>Settings</h2>
                    <button class="close-button" onclick="userSettingsPanel.close()">×</button>
                </div>
                
                <div class="settings-tabs">
                    <button class="settings-tab ${this.state.activeTab === 'editor' ? 'active' : ''}"
                            onclick="userSettingsPanel.switchTab('editor')">
                        Editor
                    </button>
                    <button class="settings-tab ${this.state.activeTab === 'pacasdb' ? 'active' : ''}"
                            onclick="userSettingsPanel.switchTab('pacasdb')">
                        PACASDB Premium
                    </button>
                    <button class="settings-tab ${this.state.activeTab === 'plugins' ? 'active' : ''}"
                            onclick="userSettingsPanel.switchTab('plugins')">
                        Plugins
                    </button>
                </div>
                
                <div class="settings-content">
                    ${this.state.activeTab === 'pacasdb' ? this.renderPACASDBSection() : ''}

                    <!-- Editor Settings Section -->
                    <div class="settings-section" style="display: ${this.state.activeTab === 'editor' ? 'block' : 'none'}">
                        <div class="section-header">
                            <h3>Editor Appearance</h3>
                            <button onclick="userSettingsPanel.resetSection('Editor')" 
                                    class="reset-button">Reset to Defaults</button>
                        </div>
                        
                        <div class="settings-group">
                            <div class="form-group">
                                <label>Font Size:</label>
                                <div class="font-size-control">
                                    <select value="${this.state.editor.fontSize}" 
                                            onchange="userSettingsPanel.updateEditorSetting('fontSize', parseInt(this.value))">
                                        ${fontSizes.map(size => `
                                            <option value="${size}" ${size === this.state.editor.fontSize ? 'selected' : ''}>
                                                ${size}px
                                            </option>
                                        `).join('')}
                                    </select>
                                    <div class="font-size-preview">${this.state.editor.fontSize}px</div>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>Font Color:</label>
                                <div class="color-picker-control">
                                    <input type="color"
                                           value="${this.state.editor.fontColor}"
                                           onchange="userSettingsPanel.updateEditorSetting('fontColor', this.value)"
                                           class="color-input">
                                    <input type="text"
                                           value="${this.state.editor.fontColor}"
                                           onchange="userSettingsPanel.updateEditorSetting('fontColor', this.value)"
                                           class="color-text-input"
                                           placeholder="#171717">
                                </div>
                                <div class="color-presets">
                                    ${this.renderColorPresets()}
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>Theme:</label>
                                <select value="${this.state.editor.theme}" 
                                        onchange="userSettingsPanel.updateEditorSetting('theme', this.value)">
                                    ${themes.map(theme => `
                                        <option value="${theme.value}" ${theme.value === this.state.editor.theme ? 'selected' : ''}>
                                            ${theme.label}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            
                            <div class="form-group checkbox-group">
                                <label>
                                    <input type="checkbox" 
                                           ${this.state.editor.lineNumbers ? 'checked' : ''}
                                           onchange="userSettingsPanel.updateEditorSetting('lineNumbers', this.checked)">
                                    Show Line Numbers
                                </label>
                            </div>
                            
                            <div class="form-group checkbox-group">
                                <label>
                                    <input type="checkbox" 
                                           ${this.state.editor.lineWrapping ? 'checked' : ''}
                                           onchange="userSettingsPanel.updateEditorSetting('lineWrapping', this.checked)">
                                    Enable Line Wrapping
                                </label>
                            </div>
                            
                            <div class="form-group checkbox-group">
                                <label>
                                    <input type="checkbox" 
                                           ${this.state.editor.showStatusBar ? 'checked' : ''}
                                           onchange="userSettingsPanel.updateEditorSetting('showStatusBar', this.checked)">
                                    Show Status Bar
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <!-- File Settings Section -->
                    <div class="settings-section" style="display: ${this.state.activeTab === 'editor' ? 'block' : 'none'}">
                        <div class="section-header">
                            <h3>File Management</h3>
                        </div>
                        
                        <div class="settings-group">
                            <div class="form-group">
                                <label>Image Save Location:</label>
                                <input type="text" 
                                       value="${this.state.files.imageLocation}"
                                       placeholder="Files/"
                                       onchange="userSettingsPanel.updateFileSetting('imageLocation', this.value)"
                                       class="settings-input">
                                <p class="form-help">Relative to vault root. Default: Files/</p>
                            </div>
                            
                            <div class="form-group">
                                <label>Daily Notes Folder:</label>
                                <input type="text" 
                                       value="${this.state.files.dailyNotesFolder}"
                                       placeholder="Daily Notes"
                                       onchange="userSettingsPanel.updateFileSetting('dailyNotesFolder', this.value)"
                                       class="settings-input">
                                <p class="form-help">Folder where daily notes are created. Default: Daily Notes</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="settings-footer">
                    <button onclick="userSettingsPanel.close()" class="secondary-button">Cancel</button>
                    <button onclick="userSettingsPanel.saveSettings()" 
                            class="primary-button ${this.state.isDirty ? '' : 'disabled'}"
                            ${this.state.isDirty && !this.state.isSaving ? '' : 'disabled'}>
                        ${this.state.isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
                
                ${this.state.isDirty ? '<div class="unsaved-indicator">Unsaved changes</div>' : ''}
            </div>
        `;

        // Mount LicenseStatusBadge if on PACASDB tab
        if (this.state.activeTab === 'pacasdb' && this.entitlementManager) {
            const badgeContainer = this.container.querySelector('#license-badge-container');
            if (badgeContainer) {
                // Destroy existing badge if any
                if (this.licenseStatusBadge) {
                    this.licenseStatusBadge.destroy();
                }

                // Create and mount new badge
                this.licenseStatusBadge = new LicenseStatusBadge(badgeContainer, this.entitlementManager);
                this.licenseStatusBadge.render();
            }
        }
    }
}

// Export a singleton instance
export const userSettingsPanel = new UserSettingsPanel();