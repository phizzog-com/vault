/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// Mock Tauri invoke
global.window = global.window || {};
global.window.__TAURI_INTERNALS__ = { invoke: jest.fn() };

// Mock PACASDBClient
jest.unstable_mockModule('../../src/services/pacasdb-client.js', () => ({
  default: class MockPACASDBClient {
    async indexDocument() {
      return { doc_id: 'test-doc-id' };
    }
    async deleteDocument() {
      return { success: true };
    }
  }
}));

let VaultSync;
let mockPacasdbClient;
let PACASDBClient;

describe('VaultSync', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Import modules
    const clientModule = await import('../../src/services/pacasdb-client.js');
    PACASDBClient = clientModule.default;
    mockPacasdbClient = new PACASDBClient();

    const syncModule = await import('../../src/services/vault-sync.js');
    VaultSync = syncModule.default;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('file event filtering', () => {
    test('should only process .md files', () => {
      const sync = new VaultSync(mockPacasdbClient);
      const processFileSpy = jest.spyOn(sync, 'processFileEvent');

      sync.handleFileEvent('/vault/notes/note.md', 'create');
      jest.runAllTimers();
      expect(processFileSpy).toHaveBeenCalled();

      processFileSpy.mockClear();
      sync.handleFileEvent('/vault/image.png', 'create');
      jest.runAllTimers();
      expect(processFileSpy).not.toHaveBeenCalled();
    });

    test('should ignore hidden files', () => {
      const sync = new VaultSync(mockPacasdbClient);
      const processFileSpy = jest.spyOn(sync, 'processFileEvent');

      sync.handleFileEvent('/vault/.hidden.md', 'create');
      jest.runAllTimers();
      expect(processFileSpy).not.toHaveBeenCalled();

      processFileSpy.mockClear();
      sync.handleFileEvent('/vault/folder/.hidden.md', 'create');
      jest.runAllTimers();
      expect(processFileSpy).not.toHaveBeenCalled();
    });

    test('should debounce rapid events with 1000ms delay', () => {
      const sync = new VaultSync(mockPacasdbClient);
      const processFileSpy = jest.spyOn(sync, 'processFileEvent');

      // Trigger multiple events quickly
      sync.handleFileEvent('/vault/note.md', 'modify');
      sync.handleFileEvent('/vault/note.md', 'modify');
      sync.handleFileEvent('/vault/note.md', 'modify');

      // Should not process immediately
      expect(processFileSpy).not.toHaveBeenCalled();

      // Fast-forward 500ms - still not processed
      jest.advanceTimersByTime(500);
      expect(processFileSpy).not.toHaveBeenCalled();

      // Fast-forward to 1000ms total
      jest.advanceTimersByTime(500);
      expect(processFileSpy).toHaveBeenCalledTimes(1);
    });

    test('should coalesce multiple events for same file', () => {
      const sync = new VaultSync(mockPacasdbClient);
      const processFileSpy = jest.spyOn(sync, 'processFileEvent');

      // Trigger multiple events for same file
      sync.handleFileEvent('/vault/note.md', 'create');
      sync.handleFileEvent('/vault/note.md', 'modify');
      sync.handleFileEvent('/vault/note.md', 'modify');

      jest.runAllTimers();

      // Should only process once
      expect(processFileSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('event processing', () => {
    test('should call handleDelete for remove events', async () => {
      const sync = new VaultSync(mockPacasdbClient);
      const handleDeleteSpy = jest.spyOn(sync, 'handleDelete').mockResolvedValue();

      await sync.processFileEvent('/vault/note.md', 'remove');

      expect(handleDeleteSpy).toHaveBeenCalledWith('/vault/note.md');
    });

    test('should call handleCreateOrUpdate for create events', async () => {
      const sync = new VaultSync(mockPacasdbClient);
      const handleCreateSpy = jest.spyOn(sync, 'handleCreateOrUpdate').mockResolvedValue();

      await sync.processFileEvent('/vault/note.md', 'create');

      expect(handleCreateSpy).toHaveBeenCalledWith('/vault/note.md');
    });

    test('should call handleCreateOrUpdate for modify events', async () => {
      const sync = new VaultSync(mockPacasdbClient);
      const handleCreateSpy = jest.spyOn(sync, 'handleCreateOrUpdate').mockResolvedValue();

      await sync.processFileEvent('/vault/note.md', 'modify');

      expect(handleCreateSpy).toHaveBeenCalledWith('/vault/note.md');
    });
  });

  describe('markdown parsing', () => {
    test('should extract YAML frontmatter correctly', () => {
      const sync = new VaultSync(mockPacasdbClient);
      const content = `---
title: Test Note
tags: [test, sample]
created_at: 2025-01-01
---
# Test Note

Content here`;

      const parsed = sync.parseMarkdown(content);

      expect(parsed.frontmatter).toBeDefined();
      expect(parsed.frontmatter.title).toBe('Test Note');
      expect(parsed.frontmatter.tags).toEqual(['test', 'sample']);
      expect(parsed.frontmatter.created_at).toBe('2025-01-01');
    });

    test('should extract title from first H1', () => {
      const sync = new VaultSync(mockPacasdbClient);
      const content = `# My Test Note

This is the content.`;

      const parsed = sync.parseMarkdown(content);

      expect(parsed.title).toBe('My Test Note');
    });

    test('should fall back to first line when no H1', () => {
      const sync = new VaultSync(mockPacasdbClient);
      const content = `This is the first line

And this is more content.`;

      const parsed = sync.parseMarkdown(content);

      expect(parsed.title).toBe('This is the first line');
    });

    test('should handle documents without frontmatter', () => {
      const sync = new VaultSync(mockPacasdbClient);
      const content = `# Regular Note

Just content, no frontmatter.`;

      const parsed = sync.parseMarkdown(content);

      expect(parsed.frontmatter).toEqual({});
      expect(parsed.title).toBe('Regular Note');
      expect(parsed.body).toContain('Just content');
    });

    test('should parse tags array from frontmatter', () => {
      const sync = new VaultSync(mockPacasdbClient);
      const content = `---
tags:
  - javascript
  - nodejs
  - testing
---
Content`;

      const parsed = sync.parseMarkdown(content);

      expect(parsed.frontmatter.tags).toEqual(['javascript', 'nodejs', 'testing']);
    });

    test('should parse created_at from frontmatter', () => {
      const sync = new VaultSync(mockPacasdbClient);
      const content = `---
created_at: 2025-12-30T10:00:00Z
---
Content`;

      const parsed = sync.parseMarkdown(content);

      expect(parsed.frontmatter.created_at).toBe('2025-12-30T10:00:00Z');
    });
  });
});
