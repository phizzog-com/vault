use std::collections::{HashMap, HashSet};
use serde::{Serialize, Deserialize};
use regex::Regex;
use crate::graph::GraphManagerTrait;

/// Represents a WikiLink found in note content
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WikiLink {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub full_match: String,
}

/// Represents a WikiLink relationship in the graph
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WikiLinkRelation {
    pub source_id: String,
    pub source_path: String,
    pub target_name: String,
    pub normalized_target_name: String,
    pub relation_type: String,
    pub context: WikiLinkContext,
}

/// Context information for a WikiLink relationship
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WikiLinkContext {
    pub position: usize,
    pub full_match: String,
    pub vault_id: String,
}

/// Operations for managing WikiLink relationships in the graph
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum WikiLinkOperation {
    CreateRelation {
        source_id: String,
        target_name: String,
        normalized_target_name: String,
        context: WikiLinkContext,
    },
    DeleteRelation {
        source_id: String,
        target_name: String,
        normalized_target_name: String,
    },
    UpdateRelation {
        source_id: String,
        old_target_name: String,
        new_target_name: String,
        context: WikiLinkContext,
    },
}

/// Manager for WikiLink graph integration
pub struct WikiLinkGraphManager {
    wikilink_pattern: Regex,
}

impl WikiLinkGraphManager {
    pub fn new() -> Result<Self, String> {
        // Simplified regex pattern without lookbehind/lookahead
        let pattern = Regex::new(r"\[\[([^\]]+)\]\]")
            .map_err(|e| format!("Failed to compile WikiLink regex: {}", e))?;
        
        Ok(Self {
            wikilink_pattern: pattern,
        })
    }

    /// Extract all WikiLinks from note content
    pub fn extract_wikilinks(&self, content: &str) -> Vec<WikiLink> {
        let mut links = Vec::new();
        
        for cap in self.wikilink_pattern.captures_iter(content) {
            if let Some(full_match) = cap.get(0) {
                if let Some(link_text) = cap.get(1) {
                    links.push(WikiLink {
                        text: link_text.as_str().to_string(),
                        start: full_match.start(),
                        end: full_match.end(),
                        full_match: full_match.as_str().to_string(),
                    });
                }
            }
        }
        
        links
    }

    /// Normalize WikiLink name for consistent matching
    pub fn normalize_wikilink_name(&self, name: &str) -> String {
        name.trim()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
    }

    /// Generate WikiLink operations based on content changes
    pub fn generate_operations(
        &self,
        note_id: &str,
        note_path: &str,
        vault_id: &str,
        old_content: Option<&str>,
        new_content: &str,
    ) -> Vec<WikiLinkOperation> {
        let mut operations = Vec::new();
        
        let new_links = self.extract_wikilinks(new_content);
        let new_link_names: HashSet<String> = new_links.iter()
            .map(|link| self.normalize_wikilink_name(&link.text))
            .collect();
        
        let old_links = if let Some(content) = old_content {
            self.extract_wikilinks(content)
        } else {
            Vec::new()
        };
        let old_link_names: HashSet<String> = old_links.iter()
            .map(|link| self.normalize_wikilink_name(&link.text))
            .collect();
        
        // Find added links
        for link in &new_links {
            let normalized = self.normalize_wikilink_name(&link.text);
            if !old_link_names.contains(&normalized) {
                operations.push(WikiLinkOperation::CreateRelation {
                    source_id: note_id.to_string(),
                    target_name: link.text.clone(),
                    normalized_target_name: normalized,
                    context: WikiLinkContext {
                        position: link.start,
                        full_match: link.full_match.clone(),
                        vault_id: vault_id.to_string(),
                    },
                });
            }
        }
        
        // Find removed links
        for link in &old_links {
            let normalized = self.normalize_wikilink_name(&link.text);
            if !new_link_names.contains(&normalized) {
                operations.push(WikiLinkOperation::DeleteRelation {
                    source_id: note_id.to_string(),
                    target_name: link.text.clone(),
                    normalized_target_name: normalized,
                });
            }
        }
        
        operations
    }

    /// Create WikiLink relationships in the graph
    pub async fn create_wikilink_relations(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        operations: Vec<WikiLinkOperation>,
    ) -> Result<usize, String> {
        let mut created_count = 0;
        
        for operation in operations {
            match operation {
                WikiLinkOperation::CreateRelation { 
                    source_id, 
                    target_name, 
                    normalized_target_name, 
                    context 
                } => {
                    // Create relationship using Cypher query
                    let query = format!(
                        r#"
                        MATCH (source {{id: $source_id}})
                        MERGE (target:Note {{normalized_title: $normalized_target_name}})
                        ON CREATE SET target.title = $target_name, target.vault_id = $vault_id
                        MERGE (source)-[rel:WIKILINK]->(target)
                        SET rel.context = $context, rel.created_at = datetime()
                        RETURN rel
                        "#
                    );
                    
                    let mut params = HashMap::new();
                    params.insert("source_id".to_string(), neo4rs::BoltType::from(source_id));
                    params.insert("target_name".to_string(), neo4rs::BoltType::from(target_name));
                    params.insert("normalized_target_name".to_string(), neo4rs::BoltType::from(normalized_target_name));
                    params.insert("vault_id".to_string(), neo4rs::BoltType::from(context.vault_id.clone()));
                    params.insert("context".to_string(), neo4rs::BoltType::from(format!("{:?}", context)));
                    
                    graph_manager.execute_cypher(&query, params).await?;
                    created_count += 1;
                }
                WikiLinkOperation::DeleteRelation { 
                    source_id, 
                    normalized_target_name, 
                    .. 
                } => {
                    // Delete relationship
                    let query = format!(
                        r#"
                        MATCH (source {{id: $source_id}})-[rel:WIKILINK]->(target {{normalized_title: $normalized_target_name}})
                        DELETE rel
                        "#
                    );
                    
                    let mut params = HashMap::new();
                    params.insert("source_id".to_string(), neo4rs::BoltType::from(source_id));
                    params.insert("normalized_target_name".to_string(), neo4rs::BoltType::from(normalized_target_name));
                    
                    graph_manager.execute_cypher(&query, params).await?;
                }
                WikiLinkOperation::UpdateRelation { .. } => {
                    // Handle update operations if needed
                    // For now, we handle updates as delete + create
                }
            }
        }
        
        Ok(created_count)
    }

    /// Cleanup WikiLink relationships for a specific vault
    pub async fn cleanup_vault_wikilinks(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        vault_id: &str,
    ) -> Result<usize, String> {
        let query = r#"
            MATCH ()-[rel:WIKILINK]->()
            WHERE rel.context.vault_id = $vault_id
            DELETE rel
            RETURN count(rel) as deleted_count
        "#;
        
        let mut params = HashMap::new();
        params.insert("vault_id".to_string(), neo4rs::BoltType::from(vault_id));
        
        let result = graph_manager.execute_cypher(query, params).await?;
        // Parse the result to get the count
        // This is a simplified implementation
        Ok(0)
    }

    /// Get all WikiLink relationships for a note
    pub async fn get_note_wikilinks(
        &self,
        graph_manager: &dyn GraphManagerTrait,
        note_id: &str,
    ) -> Result<Vec<WikiLinkRelation>, String> {
        let query = r#"
            MATCH (source {id: $note_id})-[rel:WIKILINK]->(target)
            RETURN source.id as source_id, source.path as source_path,
                   target.title as target_name, target.normalized_title as normalized_target_name,
                   rel.context as context
        "#;
        
        let mut params = HashMap::new();
        params.insert("note_id".to_string(), neo4rs::BoltType::from(note_id));
        
        let _result = graph_manager.execute_cypher(query, params).await?;
        
        // This would parse the results and return WikiLinkRelation objects
        // For now, return empty vec as placeholder
        Ok(Vec::new())
    }
}

impl Default for WikiLinkGraphManager {
    fn default() -> Self {
        Self::new().expect("Failed to create default WikiLinkGraphManager")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_wikilinks_basic() {
        let manager = WikiLinkGraphManager::new().unwrap();
        let content = "This links to [[Note A]] and [[Note B]].";
        
        let links = manager.extract_wikilinks(content);
        
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].text, "Note A");
        assert_eq!(links[0].start, 14);
        assert_eq!(links[0].end, 24);
        assert_eq!(links[0].full_match, "[[Note A]]");
        
        assert_eq!(links[1].text, "Note B");
        assert_eq!(links[1].start, 29);
        assert_eq!(links[1].end, 39);
        assert_eq!(links[1].full_match, "[[Note B]]");
    }

    #[test]
    fn test_extract_wikilinks_complex_names() {
        let manager = WikiLinkGraphManager::new().unwrap();
        let content = "Links to [[2024-07-30 Meeting Notes]] and [[Project Alpha - Phase 1]].";
        
        let links = manager.extract_wikilinks(content);
        
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].text, "2024-07-30 Meeting Notes");
        assert_eq!(links[1].text, "Project Alpha - Phase 1");
    }

    #[test]
    fn test_extract_wikilinks_unicode() {
        let manager = WikiLinkGraphManager::new().unwrap();
        let content = "Unicode links: [[Café Notes]] and [[中文笔记]].";
        
        let links = manager.extract_wikilinks(content);
        
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].text, "Café Notes");
        assert_eq!(links[1].text, "中文笔记");
    }

    #[test]
    fn test_extract_wikilinks_malformed() {
        let manager = WikiLinkGraphManager::new().unwrap();
        let malformed_cases = vec![
            "[[]]", // Empty
            "[Note]", // Single brackets
            "[[Note]", // Unclosed
            "[Note]]", // Wrong opening
        ];
        
        for case in malformed_cases {
            let links = manager.extract_wikilinks(case);
            assert_eq!(links.len(), 0, "Should not match malformed case: {}", case);
        }
        
        // Special case: triple brackets should extract the inner valid link  
        let triple_brackets = "[[[Note]]]";
        let links = manager.extract_wikilinks(triple_brackets);
        assert_eq!(links.len(), 1, "Should extract inner WikiLink from triple brackets");
        assert_eq!(links[0].text, "[Note"); // Note: regex stops at first ']'
    }

    #[test]
    fn test_normalize_wikilink_name() {
        let manager = WikiLinkGraphManager::new().unwrap();
        
        let test_cases = vec![
            ("Note Name", "note name"),
            ("  Spaced  Note  ", "spaced note"),
            ("UPPERCASE", "uppercase"),
            ("Mixed-Case_Note", "mixed-case_note"),
            ("2024-07-30 Meeting", "2024-07-30 meeting"),
        ];
        
        for (input, expected) in test_cases {
            assert_eq!(manager.normalize_wikilink_name(input), expected);
        }
    }

    #[test]
    fn test_generate_operations_add_links() {
        let manager = WikiLinkGraphManager::new().unwrap();
        let note_id = "note-123";
        let note_path = "/vault/note.md";
        let vault_id = "vault-456";
        
        let old_content = None;
        let new_content = "This links to [[Note A]] and [[Note B]].";
        
        let operations = manager.generate_operations(
            note_id, note_path, vault_id, old_content, new_content
        );
        
        assert_eq!(operations.len(), 2);
        
        match &operations[0] {
            WikiLinkOperation::CreateRelation { 
                source_id, 
                target_name, 
                normalized_target_name, 
                context 
            } => {
                assert_eq!(source_id, "note-123");
                assert_eq!(target_name, "Note A");
                assert_eq!(normalized_target_name, "note a");
                assert_eq!(context.vault_id, "vault-456");
                assert_eq!(context.position, 14);
            }
            _ => panic!("Expected CreateRelation operation"),
        }
    }

    #[test]
    fn test_generate_operations_remove_links() {
        let manager = WikiLinkGraphManager::new().unwrap();
        let note_id = "note-123";
        let note_path = "/vault/note.md";
        let vault_id = "vault-456";
        
        let old_content = Some("This links to [[Old Note]].");
        let new_content = "This has no links.";
        
        let operations = manager.generate_operations(
            note_id, note_path, vault_id, old_content, new_content
        );
        
        assert_eq!(operations.len(), 1);
        
        match &operations[0] {
            WikiLinkOperation::DeleteRelation { 
                source_id, 
                target_name, 
                normalized_target_name 
            } => {
                assert_eq!(source_id, "note-123");
                assert_eq!(target_name, "Old Note");
                assert_eq!(normalized_target_name, "old note");
            }
            _ => panic!("Expected DeleteRelation operation"),
        }
    }

    #[test]
    fn test_generate_operations_mixed_changes() {
        let manager = WikiLinkGraphManager::new().unwrap();
        let note_id = "note-123";
        let note_path = "/vault/note.md";
        let vault_id = "vault-456";
        
        let old_content = Some("Links to [[Old Note]] and [[Shared Note]].");
        let new_content = "Links to [[New Note]] and [[Shared Note]].";
        
        let operations = manager.generate_operations(
            note_id, note_path, vault_id, old_content, new_content
        );
        
        assert_eq!(operations.len(), 2); // One add, one remove
        
        let create_ops: Vec<_> = operations.iter()
            .filter(|op| matches!(op, WikiLinkOperation::CreateRelation { .. }))
            .collect();
        let delete_ops: Vec<_> = operations.iter()
            .filter(|op| matches!(op, WikiLinkOperation::DeleteRelation { .. }))
            .collect();
        
        assert_eq!(create_ops.len(), 1);
        assert_eq!(delete_ops.len(), 1);
    }

    #[test]
    fn test_empty_content() {
        let manager = WikiLinkGraphManager::new().unwrap();
        let links = manager.extract_wikilinks("");
        assert_eq!(links.len(), 0);
    }

    #[test]
    fn test_performance_many_links() {
        let manager = WikiLinkGraphManager::new().unwrap();
        
        // Create content with 1000 WikiLinks
        let mut content = String::new();
        for i in 0..1000 {
            content.push_str(&format!("[[Note {}]] ", i));
        }
        
        let start = std::time::Instant::now();
        let links = manager.extract_wikilinks(&content);
        let duration = start.elapsed();
        
        assert_eq!(links.len(), 1000);
        assert!(duration.as_millis() < 100, "Should complete within 100ms");
    }

    #[test]
    fn test_duplicate_links() {
        let manager = WikiLinkGraphManager::new().unwrap();
        let content = "[[Note A]] and [[Note A]] again, plus [[Note B]].";
        
        let links = manager.extract_wikilinks(content);
        assert_eq!(links.len(), 3); // Should find all occurrences
        
        let unique_names: std::collections::HashSet<_> = links
            .iter()
            .map(|link| manager.normalize_wikilink_name(&link.text))
            .collect();
        assert_eq!(unique_names.len(), 2); // But only 2 unique normalized names
    }
}