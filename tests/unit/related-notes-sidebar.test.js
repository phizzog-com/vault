/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// Mock EntitlementManager
jest.unstable_mockModule('../../src/services/entitlement-manager.js', () => ({
  default: class MockEntitlementManager {
    constructor() {
      this.status = { type: 'Unlicensed' };
    }
    isPremiumEnabled() {
      return ['Trial', 'Licensed', 'GracePeriod'].includes(this.status.type);
    }
    getStatus() {
      return this.status;
    }
  }
}));

// Mock PACASDBClient
jest.unstable_mockModule('../../src/services/pacasdb-client.js', () => ({
  default: class MockPACASDBClient {
    async getRelatedDocuments() {
      return {
        doc_id: 'doc-123',
        related: [
          {
            id: 'doc-456',
            title: 'Similar Note',
            relationship_type: 'similar',
            strength: 0.85
          },
          {
            id: 'doc-789',
            title: 'Referenced Note',
            relationship_type: 'referenced',
            strength: 0.92
          }
        ],
        relationship_types: {
          similar: 1,
          referenced: 1,
          temporal: 0
        }
      };
    }
  }
}));

let RelatedNotesSidebar;
let mockEntitlementManager;
let mockPacasdbClient;
let EntitlementManager;
let PACASDBClient;

describe('RelatedNotesSidebar', () => {
  beforeEach(async () => {
    // Clear DOM
    document.body.innerHTML = '';

    // Import modules
    const entitlementModule = await import('../../src/services/entitlement-manager.js');
    EntitlementManager = entitlementModule.default;
    mockEntitlementManager = new EntitlementManager();

    const clientModule = await import('../../src/services/pacasdb-client.js');
    PACASDBClient = clientModule.default;
    mockPacasdbClient = new PACASDBClient();

    const sidebarModule = await import('../../src/components/RelatedNotesSidebar.js');
    RelatedNotesSidebar = sidebarModule.default;
  });

  describe('render() with PremiumGate integration', () => {
    test('should call PremiumGate.wrap() when not premium', () => {
      mockEntitlementManager.status = { type: 'Unlicensed' };

      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      // Should return PremiumGate element
      expect(element).toBeTruthy();
      expect(element.textContent).toContain('Related Notes');
      expect(element.textContent).toContain('requires premium');
    });

    test('should show sidebar when premium enabled', () => {
      mockEntitlementManager.status = { type: 'Licensed' };

      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      // Should NOT show premium gate
      expect(element.textContent).not.toContain('requires premium');

      // Should have sidebar structure
      expect(element.className).toContain('related-notes-sidebar');
    });
  });

  describe('note change handling', () => {
    beforeEach(() => {
      mockEntitlementManager.status = { type: 'Licensed' };
    });

    test('should fetch related documents when note changes', async () => {
      const fetchSpy = jest.spyOn(mockPacasdbClient, 'getRelatedDocuments');

      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      sidebar.render();

      await sidebar.onNoteChange('doc-123');

      expect(fetchSpy).toHaveBeenCalledWith('doc-123');
    });

    test('should not fetch if no client provided', async () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, null);
      sidebar.render();

      // Should not throw
      await expect(sidebar.onNoteChange('doc-123')).resolves.not.toThrow();
    });

    test('should update current doc ID', async () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      sidebar.render();

      await sidebar.onNoteChange('doc-999');

      expect(sidebar.currentDocId).toBe('doc-999');
    });
  });

  describe('relationship grouping', () => {
    beforeEach(() => {
      mockEntitlementManager.status = { type: 'Licensed' };

      mockPacasdbClient.getRelatedDocuments = jest.fn(async () => ({
        doc_id: 'doc-123',
        related: [
          {
            id: 'doc-similar-1',
            title: 'Similar Note 1',
            relationship_type: 'similar',
            strength: 0.85
          },
          {
            id: 'doc-similar-2',
            title: 'Similar Note 2',
            relationship_type: 'similar',
            strength: 0.78
          },
          {
            id: 'doc-ref-1',
            title: 'Referenced Note',
            relationship_type: 'referenced',
            strength: 0.92
          },
          {
            id: 'doc-temp-1',
            title: 'Temporal Note',
            relationship_type: 'temporal',
            strength: 0.65
          }
        ],
        relationship_types: {
          similar: 2,
          referenced: 1,
          temporal: 1
        }
      }));
    });

    test('should group results by relationship type', async () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      await sidebar.onNoteChange('doc-123');

      // Check for group headers
      const similarGroup = element.querySelector('.relationship-group.similar');
      const referencedGroup = element.querySelector('.relationship-group.referenced');
      const temporalGroup = element.querySelector('.relationship-group.temporal');

      expect(similarGroup).toBeTruthy();
      expect(referencedGroup).toBeTruthy();
      expect(temporalGroup).toBeTruthy();
    });

    test('should show similar relationship group', async () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      await sidebar.onNoteChange('doc-123');

      const similarGroup = element.querySelector('.relationship-group.similar');
      expect(similarGroup).toBeTruthy();

      // Should have 2 similar notes
      const similarItems = similarGroup.querySelectorAll('.related-note-item');
      expect(similarItems.length).toBe(2);
    });

    test('should show referenced relationship group', async () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      await sidebar.onNoteChange('doc-123');

      const referencedGroup = element.querySelector('.relationship-group.referenced');
      expect(referencedGroup).toBeTruthy();

      const referencedItems = referencedGroup.querySelectorAll('.related-note-item');
      expect(referencedItems.length).toBe(1);
    });

    test('should show temporal relationship group', async () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      await sidebar.onNoteChange('doc-123');

      const temporalGroup = element.querySelector('.relationship-group.temporal');
      expect(temporalGroup).toBeTruthy();

      const temporalItems = temporalGroup.querySelectorAll('.related-note-item');
      expect(temporalItems.length).toBe(1);
    });

    test('should display relationship strength', async () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      await sidebar.onNoteChange('doc-123');

      const firstItem = element.querySelector('.related-note-item');
      const strengthElement = firstItem.querySelector('.relationship-strength');

      expect(strengthElement).toBeTruthy();
      expect(strengthElement.textContent).toMatch(/0\.\d+/);
    });
  });

  describe('note navigation', () => {
    beforeEach(() => {
      mockEntitlementManager.status = { type: 'Licensed' };

      mockPacasdbClient.getRelatedDocuments = jest.fn(async () => ({
        doc_id: 'doc-123',
        related: [
          {
            id: 'doc-similar-1',
            title: 'Similar Note 1',
            relationship_type: 'similar',
            strength: 0.85
          }
        ],
        relationship_types: {
          similar: 1,
          referenced: 0,
          temporal: 0
        }
      }));
    });

    test('should emit event when clicking related note', async () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      const clickSpy = jest.fn();
      sidebar.onNoteClick = clickSpy;

      await sidebar.onNoteChange('doc-123');

      // Click first related note
      const firstItem = element.querySelector('.related-note-item');
      firstItem.click();

      expect(clickSpy).toHaveBeenCalled();
    });

    test('should pass correct doc ID when clicking note', async () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      const clickSpy = jest.fn();
      sidebar.onNoteClick = clickSpy;

      await sidebar.onNoteChange('doc-123');

      // Click first related note
      const firstItem = element.querySelector('.related-note-item');
      firstItem.click();

      expect(clickSpy).toHaveBeenCalledWith('doc-similar-1');
    });
  });

  describe('collapsible state', () => {
    beforeEach(() => {
      mockEntitlementManager.status = { type: 'Licensed' };
      // Clear localStorage
      localStorage.clear();
    });

    test('should be expanded by default', () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      expect(sidebar.isCollapsed).toBe(false);
      expect(element.classList.contains('collapsed')).toBe(false);
    });

    test('should collapse when toggle clicked', () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      const toggleBtn = element.querySelector('.toggle-sidebar-btn');
      toggleBtn.click();

      expect(sidebar.isCollapsed).toBe(true);
      expect(element.classList.contains('collapsed')).toBe(true);
    });

    test('should persist collapsed state to localStorage', () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      const toggleBtn = element.querySelector('.toggle-sidebar-btn');
      toggleBtn.click();

      expect(localStorage.getItem('relatedNotesSidebarCollapsed')).toBe('true');
    });

    test('should restore collapsed state from localStorage', () => {
      localStorage.setItem('relatedNotesSidebarCollapsed', 'true');

      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      expect(sidebar.isCollapsed).toBe(true);
      expect(element.classList.contains('collapsed')).toBe(true);
    });

    test('should expand when toggled again', () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      const toggleBtn = element.querySelector('.toggle-sidebar-btn');

      // Collapse
      toggleBtn.click();
      expect(sidebar.isCollapsed).toBe(true);

      // Expand
      toggleBtn.click();
      expect(sidebar.isCollapsed).toBe(false);
      expect(element.classList.contains('collapsed')).toBe(false);
    });
  });

  describe('empty state', () => {
    beforeEach(() => {
      mockEntitlementManager.status = { type: 'Licensed' };

      mockPacasdbClient.getRelatedDocuments = jest.fn(async () => ({
        doc_id: 'doc-123',
        related: [],
        relationship_types: {
          similar: 0,
          referenced: 0,
          temporal: 0
        }
      }));
    });

    test('should show empty state when no related notes', async () => {
      const sidebar = new RelatedNotesSidebar(mockEntitlementManager, mockPacasdbClient);
      const element = sidebar.render();

      await sidebar.onNoteChange('doc-123');

      const emptyState = element.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
      expect(emptyState.textContent).toContain('No related notes');
    });
  });
});
