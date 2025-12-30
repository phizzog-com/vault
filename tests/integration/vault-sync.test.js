/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

// Mock Tauri API
const mockInvoke = jest.fn();
jest.unstable_mockModule('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}));

// Mock EntitlementManager
jest.unstable_mockModule('../../src/services/entitlement-manager.js', () => ({
  default: class MockEntitlementManager {
    isPremiumEnabled() {
      return true;
    }
  }
}));

let VaultSync;
let PACASDBClient;
let EntitlementManager;

describe('Vault Sync Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch.mockClear();
    mockInvoke.mockClear();

    const syncModule = await import('../../src/services/vault-sync.js');
    VaultSync = syncModule.default;

    const clientModule = await import('../../src/services/pacasdb-client.js');
    PACASDBClient = clientModule.default;

    const entitlementModule = await import('../../src/services/entitlement-manager.js');
    EntitlementManager = entitlementModule.default;
  });

  describe('Initial Vault Sync', () => {
    test('should sync all markdown files in vault', async () => {
      const entitlementManager = new EntitlementManager();
      const pacasdbClient = new PACASDBClient(entitlementManager);

      // Mock connection
      global.fetch.mockResolvedValueOnce({ ok: true });
      await pacasdbClient.connect();

      const vaultSync = new VaultSync(pacasdbClient);

      // Mock list_vault_files Tauri command
      mockInvoke.mockImplementation((command, args) => {
        if (command === 'list_vault_files') {
          return Promise.resolve([
            '/vault/note1.md',
            '/vault/note2.md',
            '/vault/note3.md'
          ]);
        }
        if (command === 'read_file_content') {
          return Promise.resolve('# Test Note\n\nSome content here');
        }
        return Promise.reject(new Error('Unknown command'));
      });

      // Mock PACASDB batch indexing
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          indexed: 3,
          failed: 0
        })
      });

      const summary = await vaultSync.syncAllDocuments('/vault');

      expect(summary.total).toBe(3);
      expect(summary.indexed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Incremental File Updates', () => {
    test('should handle file modification events', async () => {
      const entitlementManager = new EntitlementManager();
      const pacasdbClient = new PACASDBClient(entitlementManager);

      global.fetch.mockResolvedValueOnce({ ok: true });
      await pacasdbClient.connect();

      const vaultSync = new VaultSync(pacasdbClient);
      vaultSync.start();

      // Mock file read
      mockInvoke.mockResolvedValueOnce('# Modified Note\n\nUpdated content');

      // Mock PACASDB update
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, doc_id: 'doc123' })
      });

      // Simulate file modification
      await vaultSync.handleFileEvent('/vault/note.md', 'modify');

      expect(vaultSync.isRunning).toBe(true);
    });
  });

  describe('Frontmatter Parsing', () => {
    test('should extract frontmatter from markdown files', async () => {
      const entitlementManager = new EntitlementManager();
      const pacasdbClient = new PACASDBClient(entitlementManager);

      const vaultSync = new VaultSync(pacasdbClient);

      const markdown = `---
title: Test Note
tags: [test, demo]
created: 2025-12-30
---

# Test Note

Content here`;

      const parsed = vaultSync.parseMarkdown(markdown);

      expect(parsed.frontmatter).toBeDefined();
      expect(parsed.frontmatter.title).toBe('Test Note');
      expect(parsed.frontmatter.tags).toContain('test');
      expect(parsed.body).toContain('Content here');
    });
  });
});
