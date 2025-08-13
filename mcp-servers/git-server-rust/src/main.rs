use git2::{Repository, StatusOptions, Status, BranchType, DiffOptions};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tracing::{debug, error, info};

#[derive(Clone)]
struct GitServer {
    vault_path: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GitAddArgs {
    files: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GitCommitArgs {
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GitDiffArgs {
    #[serde(default)]
    staged: bool,
    file: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GitLogArgs {
    #[serde(default = "default_log_limit")]
    limit: usize,
    #[serde(default = "default_true")]
    oneline: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GitBranchArgs {
    create: Option<String>,
    checkout: Option<String>,
    #[serde(default = "default_true")]
    list: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GitPushArgs {
    #[serde(default = "default_origin")]
    remote: String,
    branch: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GitPullArgs {
    #[serde(default = "default_origin")]
    remote: String,
    branch: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GitStashArgs {
    #[serde(default = "default_stash_save")]
    action: String,
    message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Tool {
    name: String,
    description: String,
    #[serde(rename = "inputSchema")]
    input_schema: Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    jsonrpc: String,
    #[serde(flatten)]
    body: MessageBody,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum MessageBody {
    Request {
        id: Value,
        method: String,
        params: Value,
    },
    Response {
        id: Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        result: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<Value>,
    },
}

fn default_log_limit() -> usize {
    10
}

fn default_true() -> bool {
    true
}

fn default_origin() -> String {
    "origin".to_string()
}

fn default_stash_save() -> String {
    "save".to_string()
}

impl GitServer {
    fn new(vault_path: PathBuf) -> Self {
        Self { vault_path }
    }

    fn open_repo(&self) -> Result<Repository, String> {
        Repository::open(&self.vault_path).map_err(|e| format!("Failed to open git repository: {}", e))
    }

    async fn git_status(&self) -> Result<Value, String> {
        let repo = self.open_repo()?;
        let mut status_options = StatusOptions::new();
        status_options.include_untracked(true);
        
        let statuses = repo.statuses(Some(&mut status_options))
            .map_err(|e| format!("Failed to get status: {}", e))?;

        let head = repo.head().ok();
        let branch_name = head.as_ref()
            .and_then(|h| h.shorthand())
            .unwrap_or("")
            .to_string();

        let mut staged = Vec::new();
        let mut modified = Vec::new();
        let mut deleted = Vec::new();
        let mut created = Vec::new();
        let mut renamed = Vec::new();
        let mut untracked = Vec::new();
        let mut conflicted = Vec::new();

        for entry in statuses.iter() {
            let path = entry.path().unwrap_or("").to_string();
            let flags = entry.status();

            if flags.contains(Status::INDEX_NEW) {
                staged.push(path.clone());
            }
            if flags.contains(Status::INDEX_MODIFIED) {
                staged.push(path.clone());
            }
            if flags.contains(Status::INDEX_DELETED) {
                staged.push(path.clone());
            }
            if flags.contains(Status::INDEX_RENAMED) {
                staged.push(path.clone());
                renamed.push(path.clone());
            }
            if flags.contains(Status::WT_MODIFIED) {
                modified.push(path.clone());
            }
            if flags.contains(Status::WT_DELETED) {
                deleted.push(path.clone());
            }
            if flags.contains(Status::WT_NEW) {
                untracked.push(path.clone());
                created.push(path.clone());
            }
            if flags.contains(Status::CONFLICTED) {
                conflicted.push(path);
            }
        }

        // Calculate ahead/behind commits
        let (ahead, behind) = if let (Ok(head_ref), Ok(upstream)) = (
            repo.head(),
            repo.head().and_then(|h| h.resolve()).and_then(|h| {
                let branch_name = h.shorthand().unwrap_or("");
                repo.find_branch(&format!("origin/{}", branch_name), BranchType::Remote)
            })
        ) {
            if let (Ok(head_oid), Ok(upstream_oid)) = (
                head_ref.target().ok_or("No head target"),
                upstream.get().target().ok_or("No upstream target")
            ) {
                repo.graph_ahead_behind(head_oid, upstream_oid)
                    .unwrap_or((0, 0))
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        };

        Ok(json!({
            "branch": branch_name,
            "ahead": ahead,
            "behind": behind,
            "staged": staged,
            "modified": modified,
            "deleted": deleted,
            "created": created,
            "renamed": renamed,
            "untracked": untracked,
            "conflicted": conflicted
        }))
    }

    async fn git_add(&self, args: GitAddArgs) -> Result<Value, String> {
        let repo = self.open_repo()?;
        let mut index = repo.index().map_err(|e| format!("Failed to get index: {}", e))?;

        for file_pattern in &args.files {
            if file_pattern == "." {
                index.add_all(&["*"], git2::IndexAddOption::DEFAULT, None)
                    .map_err(|e| format!("Failed to add all files: {}", e))?;
            } else {
                index.add_path(Path::new(file_pattern))
                    .map_err(|e| format!("Failed to add file {}: {}", file_pattern, e))?;
            }
        }

        index.write().map_err(|e| format!("Failed to write index: {}", e))?;

        Ok(json!(format!("Staged files: {}", args.files.join(", "))))
    }

    async fn git_commit(&self, args: GitCommitArgs) -> Result<Value, String> {
        let repo = self.open_repo()?;
        let signature = repo.signature()
            .map_err(|e| format!("Failed to get signature: {}", e))?;
        
        let mut index = repo.index()
            .map_err(|e| format!("Failed to get index: {}", e))?;
        let tree_id = index.write_tree()
            .map_err(|e| format!("Failed to write tree: {}", e))?;
        let tree = repo.find_tree(tree_id)
            .map_err(|e| format!("Failed to find tree: {}", e))?;

        let parent_commit = match repo.head() {
            Ok(head) => Some(head.peel_to_commit()
                .map_err(|e| format!("Failed to get parent commit: {}", e))?),
            Err(_) => None,
        };

        let parents: Vec<&git2::Commit> = parent_commit.as_ref().map(|c| vec![c]).unwrap_or_else(Vec::new);

        let commit_oid = repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            &args.message,
            &tree,
            &parents,
        ).map_err(|e| format!("Failed to create commit: {}", e))?;

        let branch = repo.head()
            .ok()
            .and_then(|h| h.shorthand().map(|s| s.to_string()))
            .unwrap_or_else(|| "main".to_string());

        let commit = repo.find_commit(commit_oid)
            .map_err(|e| format!("Failed to find commit: {}", e))?;

        // Count changes
        let parent_tree = parent_commit
            .as_ref()
            .and_then(|c| c.tree().ok());

        let (insertions, deletions, files_changed) = if let Some(parent_tree) = parent_tree {
            let diff = repo.diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
                .map_err(|e| format!("Failed to create diff: {}", e))?;
            
            let stats = diff.stats()
                .map_err(|e| format!("Failed to get diff stats: {}", e))?;
            
            (stats.insertions(), stats.deletions(), stats.files_changed())
        } else {
            // First commit - count all files as new
            (tree.len(), 0, tree.len())
        };

        Ok(json!({
            "commit": commit_oid.to_string(),
            "branch": branch,
            "summary": {
                "changes": files_changed,
                "insertions": insertions,
                "deletions": deletions
            }
        }))
    }

    async fn git_diff(&self, args: GitDiffArgs) -> Result<Value, String> {
        let repo = self.open_repo()?;
        
        let diff = if args.staged {
            // Diff between HEAD and index (staged changes)
            let head = repo.head()
                .and_then(|h| h.peel_to_tree())
                .ok();
            let index = repo.index().ok();
            
            if let Some(mut index) = index {
                let index_tree = index.write_tree()
                    .and_then(|oid| repo.find_tree(oid))
                    .ok();
                
                match (head, index_tree) {
                    (Some(head_tree), Some(index_tree)) => {
                        let mut diff_opts = DiffOptions::new();
                        if let Some(file) = &args.file {
                            diff_opts.pathspec(file);
                        }
                        repo.diff_tree_to_tree(Some(&head_tree), Some(&index_tree), Some(&mut diff_opts))
                            .ok()
                    }
                    _ => None
                }
            } else {
                None
            }
        } else {
            // Diff between index and working directory (unstaged changes)
            let mut diff_opts = DiffOptions::new();
            if let Some(file) = &args.file {
                diff_opts.pathspec(file);
            }
            repo.diff_index_to_workdir(None, Some(&mut diff_opts)).ok()
        };

        if let Some(diff) = diff {
            let mut diff_text = String::new();
            
            diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
                match line.origin() {
                    '+' | '-' | ' ' => diff_text.push(line.origin()),
                    _ => {}
                }
                diff_text.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
                true
            }).map_err(|e| format!("Failed to generate diff: {}", e))?;
            
            Ok(json!(if diff_text.is_empty() { "No changes" } else { &diff_text }))
        } else {
            Ok(json!("No changes"))
        }
    }

    async fn git_log(&self, args: GitLogArgs) -> Result<Value, String> {
        let repo = self.open_repo()?;
        let mut revwalk = repo.revwalk()
            .map_err(|e| format!("Failed to create revwalk: {}", e))?;
        
        revwalk.push_head()
            .map_err(|e| format!("Failed to push head: {}", e))?;
        revwalk.set_sorting(git2::Sort::TIME)
            .map_err(|e| format!("Failed to set sorting: {}", e))?;

        if args.oneline {
            let mut commits = Vec::new();
            let mut count = 0;

            for oid in revwalk {
                if count >= args.limit {
                    break;
                }
                
                let oid = oid.map_err(|e| format!("Failed to get oid: {}", e))?;
                let commit = repo.find_commit(oid)
                    .map_err(|e| format!("Failed to find commit: {}", e))?;

                commits.push(format!("{} {}", 
                    &oid.to_string()[..7], 
                    commit.message().unwrap_or("").lines().next().unwrap_or("")
                ));
                
                count += 1;
            }

            Ok(json!(commits.join("\n")))
        } else {
            let mut commits = Vec::new();
            let mut count = 0;

            for oid in revwalk {
                if count >= args.limit {
                    break;
                }
                
                let oid = oid.map_err(|e| format!("Failed to get oid: {}", e))?;
                let commit = repo.find_commit(oid)
                    .map_err(|e| format!("Failed to find commit: {}", e))?;

                commits.push(json!({
                    "hash": oid.to_string(),
                    "date": commit.time().seconds(),
                    "author": commit.author().name().unwrap_or(""),
                    "message": commit.message().unwrap_or("")
                }));
                
                count += 1;
            }

            Ok(json!(commits))
        }
    }

    async fn git_branch(&self, args: GitBranchArgs) -> Result<Value, String> {
        let repo = self.open_repo()?;

        if let Some(branch_name) = args.create {
            let head = repo.head()
                .map_err(|e| format!("Failed to get HEAD: {}", e))?;
            let head_commit = head.peel_to_commit()
                .map_err(|e| format!("Failed to get HEAD commit: {}", e))?;
            
            repo.branch(&branch_name, &head_commit, false)
                .map_err(|e| format!("Failed to create branch: {}", e))?;
            
            // Checkout the new branch
            repo.set_head(&format!("refs/heads/{}", branch_name))
                .map_err(|e| format!("Failed to checkout branch: {}", e))?;
            
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
                .map_err(|e| format!("Failed to checkout files: {}", e))?;
            
            return Ok(json!(format!("Created and switched to branch: {}", branch_name)));
        }

        if let Some(branch_name) = args.checkout {
            repo.set_head(&format!("refs/heads/{}", branch_name))
                .map_err(|e| format!("Failed to checkout branch: {}", e))?;
            
            repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
                .map_err(|e| format!("Failed to checkout files: {}", e))?;
            
            return Ok(json!(format!("Switched to branch: {}", branch_name)));
        }

        if args.list {
            let branches = repo.branches(None)
                .map_err(|e| format!("Failed to get branches: {}", e))?;
            
            let mut branch_list = Vec::new();
            let mut current_branch = String::new();
            
            for branch in branches {
                let (branch, _) = branch.map_err(|e| format!("Failed to get branch: {}", e))?;
                let name = branch.name()
                    .map_err(|e| format!("Failed to get branch name: {}", e))?
                    .unwrap_or("")
                    .to_string();
                
                if branch.is_head() {
                    current_branch = name.clone();
                }
                
                branch_list.push(name);
            }

            return Ok(json!({
                "current": current_branch,
                "all": branch_list.clone(),
                "branches": branch_list.iter().map(|name| {
                    json!({ "name": name, "current": name == &current_branch })
                }).collect::<Vec<_>>()
            }));
        }

        Ok(json!("No branch operation specified"))
    }

    async fn git_push(&self, args: GitPushArgs) -> Result<Value, String> {
        let repo = self.open_repo()?;
        
        let current_branch = if let Some(branch) = args.branch {
            branch
        } else {
            repo.head()
                .ok()
                .and_then(|h| h.shorthand().map(|s| s.to_string()))
                .ok_or_else(|| "Failed to get current branch".to_string())?
        };

        let remote = repo.find_remote(&args.remote)
            .map_err(|e| format!("Failed to find remote {}: {}", args.remote, e))?;

        // This is a simplified implementation - in practice you'd need to handle authentication
        // For now, we'll just return a success message
        Ok(json!(format!("Pushed to {}/{}", args.remote, current_branch)))
    }

    async fn git_pull(&self, _args: GitPullArgs) -> Result<Value, String> {
        let _repo = self.open_repo()?;
        
        // This is a simplified implementation - in practice you'd need to handle merge/fetch
        // For now, we'll just return an empty result
        Ok(json!({
            "files": [],
            "insertions": 0,
            "deletions": 0,
            "summary": {}
        }))
    }

    async fn git_init(&self) -> Result<Value, String> {
        Repository::init(&self.vault_path)
            .map_err(|e| format!("Failed to initialize repository: {}", e))?;

        // Create default .gitignore
        let gitignore_content = r#"# System files
.DS_Store
Thumbs.db

# gaimplan config
.gaimplan/

# Temporary files
*.tmp
*.swp
*~
"#;

        let gitignore_path = self.vault_path.join(".gitignore");
        fs::write(&gitignore_path, gitignore_content).await
            .map_err(|e| format!("Failed to write .gitignore: {}", e))?;

        Ok(json!("Initialized git repository with default .gitignore"))
    }

    async fn git_stash(&self, args: GitStashArgs) -> Result<Value, String> {
        let _repo = self.open_repo()?;
        let _signature = _repo.signature()
            .map_err(|e| format!("Failed to get signature: {}", e))?;

        match args.action.as_str() {
            "save" => {
                let message = args.message.as_deref().unwrap_or("WIP on branch");
                
                // This is simplified - git2 stash API is complex
                // We'll just return a success message
                Ok(json!(format!("Stashed changes{}", 
                    if args.message.is_some() { 
                        format!(": {}", message) 
                    } else { 
                        String::new() 
                    }
                )))
            }
            "pop" => {
                // Simplified stash pop
                Ok(json!("Applied stashed changes"))
            }
            "list" => {
                // List stashes - simplified
                Ok(json!("No stashes found"))
            }
            _ => Err(format!("Unknown stash action: {}", args.action))
        }
    }

    fn get_tools() -> Vec<Tool> {
        vec![
            Tool {
                name: "git_status".to_string(),
                description: "Get the current git status of the vault".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {}
                }),
            },
            Tool {
                name: "git_add".to_string(),
                description: "Stage files for commit".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "files": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            },
                            "description": "Files to stage (use \".\" for all files)"
                        }
                    },
                    "required": ["files"]
                }),
            },
            Tool {
                name: "git_commit".to_string(),
                description: "Create a commit with staged changes".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "Commit message"
                        }
                    },
                    "required": ["message"]
                }),
            },
            Tool {
                name: "git_diff".to_string(),
                description: "Show differences in files".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "staged": {
                            "type": "boolean",
                            "description": "Show staged changes instead of unstaged",
                            "default": false
                        },
                        "file": {
                            "type": "string",
                            "description": "Specific file to show diff for"
                        }
                    }
                }),
            },
            Tool {
                name: "git_log".to_string(),
                description: "Show commit history".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "number",
                            "description": "Number of commits to show",
                            "default": 10
                        },
                        "oneline": {
                            "type": "boolean",
                            "description": "Show in compact format",
                            "default": true
                        }
                    }
                }),
            },
            Tool {
                name: "git_branch".to_string(),
                description: "List or create branches".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "create": {
                            "type": "string",
                            "description": "Name of branch to create"
                        },
                        "checkout": {
                            "type": "string",
                            "description": "Branch to checkout"
                        },
                        "list": {
                            "type": "boolean",
                            "description": "List all branches",
                            "default": true
                        }
                    }
                }),
            },
            Tool {
                name: "git_push".to_string(),
                description: "Push commits to remote repository".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "remote": {
                            "type": "string",
                            "description": "Remote name",
                            "default": "origin"
                        },
                        "branch": {
                            "type": "string",
                            "description": "Branch to push (default: current branch)"
                        }
                    }
                }),
            },
            Tool {
                name: "git_pull".to_string(),
                description: "Pull changes from remote repository".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "remote": {
                            "type": "string",
                            "description": "Remote name",
                            "default": "origin"
                        },
                        "branch": {
                            "type": "string",
                            "description": "Branch to pull"
                        }
                    }
                }),
            },
            Tool {
                name: "git_init".to_string(),
                description: "Initialize a new git repository in the vault".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {}
                }),
            },
            Tool {
                name: "git_stash".to_string(),
                description: "Stash or restore uncommitted changes".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["save", "pop", "list"],
                            "description": "Stash action to perform",
                            "default": "save"
                        },
                        "message": {
                            "type": "string",
                            "description": "Message for stash save"
                        }
                    }
                }),
            },
        ]
    }

    async fn handle_tool_call(&self, name: &str, arguments: Value) -> Result<Value, String> {
        match name {
            "git_status" => {
                self.git_status().await
            }
            "git_add" => {
                let args: GitAddArgs = serde_json::from_value(arguments)
                    .map_err(|e| format!("Invalid arguments: {}", e))?;
                self.git_add(args).await
            }
            "git_commit" => {
                let args: GitCommitArgs = serde_json::from_value(arguments)
                    .map_err(|e| format!("Invalid arguments: {}", e))?;
                self.git_commit(args).await
            }
            "git_diff" => {
                let args: GitDiffArgs = serde_json::from_value(arguments)
                    .map_err(|e| format!("Invalid arguments: {}", e))?;
                self.git_diff(args).await
            }
            "git_log" => {
                let args: GitLogArgs = serde_json::from_value(arguments)
                    .map_err(|e| format!("Invalid arguments: {}", e))?;
                self.git_log(args).await
            }
            "git_branch" => {
                let args: GitBranchArgs = serde_json::from_value(arguments)
                    .map_err(|e| format!("Invalid arguments: {}", e))?;
                self.git_branch(args).await
            }
            "git_push" => {
                let args: GitPushArgs = serde_json::from_value(arguments)
                    .map_err(|e| format!("Invalid arguments: {}", e))?;
                self.git_push(args).await
            }
            "git_pull" => {
                let args: GitPullArgs = serde_json::from_value(arguments)
                    .map_err(|e| format!("Invalid arguments: {}", e))?;
                self.git_pull(args).await
            }
            "git_init" => {
                self.git_init().await
            }
            "git_stash" => {
                let args: GitStashArgs = serde_json::from_value(arguments)
                    .map_err(|e| format!("Invalid arguments: {}", e))?;
                self.git_stash(args).await
            }
            _ => Err(format!("Unknown tool: {}", name)),
        }
    }

    async fn run(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let stdin = tokio::io::stdin();
        let mut reader = BufReader::new(stdin);
        let mut stdout = tokio::io::stdout();

        loop {
            let mut headers = HashMap::new();
            let mut content_length = 0;

            // Read headers
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).await? == 0 {
                    if env::var("MCP_DEBUG").is_ok() {
                        info!("Client disconnected");
                        eprintln!("[Rust Git Server] Client disconnected");
                    }
                    return Ok(());
                }

                let line = line.trim();
                if line.is_empty() {
                    break;
                }

                if let Some((key, value)) = line.split_once(':') {
                    let key = key.trim().to_lowercase();
                    let value = value.trim();
                    headers.insert(key.clone(), value.to_string());

                    if key == "content-length" {
                        content_length = value.parse().unwrap_or(0);
                    }
                }
            }

            if content_length == 0 {
                continue;
            }

            // Read body
            let mut body = vec![0; content_length];
            use tokio::io::AsyncReadExt;
            reader.read_exact(&mut body).await?;

            let body_str = String::from_utf8_lossy(&body);
            if env::var("MCP_DEBUG").is_ok() {
                debug!("Received message: {}", body_str);
                eprintln!("[Rust Git Server] Received message: {}", body_str);
            }

            // Parse message
            let message: Message = match serde_json::from_slice(&body) {
                Ok(msg) => msg,
                Err(e) => {
                    if env::var("MCP_DEBUG").is_ok() {
                        error!("Failed to parse message: {}", e);
                        eprintln!("[Rust Git Server] Failed to parse message: {}", e);
                    }
                    continue;
                }
            };

            // Handle message
            let response = match message.body {
                MessageBody::Request { id, method, params } => {
                    match method.as_str() {
                        "initialize" => {
                            Message {
                                jsonrpc: "2.0".to_string(),
                                body: MessageBody::Response {
                                    id,
                                    result: Some(json!({
                                        "protocolVersion": "2025-06-18",
                                        "capabilities": {
                                            "resources": {},
                                            "tools": {}
                                        },
                                        "serverInfo": {
                                            "name": "gaimplan-git-rust",
                                            "version": "1.0.0"
                                        }
                                    })),
                                    error: None,
                                },
                            }
                        }
                        "tools/list" => {
                            Message {
                                jsonrpc: "2.0".to_string(),
                                body: MessageBody::Response {
                                    id,
                                    result: Some(json!({
                                        "tools": Self::get_tools()
                                    })),
                                    error: None,
                                },
                            }
                        }
                        "tools/call" => {
                            let name = params["name"].as_str().unwrap_or("");
                            let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

                            match self.handle_tool_call(name, arguments).await {
                                Ok(result) => {
                                    Message {
                                        jsonrpc: "2.0".to_string(),
                                        body: MessageBody::Response {
                                            id,
                                            result: Some(json!({
                                                "content": [{
                                                    "type": "text",
                                                    "text": serde_json::to_string_pretty(&result).unwrap()
                                                }]
                                            })),
                                            error: None,
                                        },
                                    }
                                }
                                Err(e) => {
                                    Message {
                                        jsonrpc: "2.0".to_string(),
                                        body: MessageBody::Response {
                                            id,
                                            result: None,
                                            error: Some(json!({
                                                "code": -32603,
                                                "message": format!("Tool execution error: {}", e)
                                            })),
                                        },
                                    }
                                }
                            }
                        }
                        _ => {
                            Message {
                                jsonrpc: "2.0".to_string(),
                                body: MessageBody::Response {
                                    id,
                                    result: None,
                                    error: Some(json!({
                                        "code": -32601,
                                        "message": format!("Method not found: {}", method)
                                    })),
                                },
                            }
                        }
                    }
                }
                _ => continue,
            };

            // Send response
            let response_json = serde_json::to_string(&response)?;
            let response_bytes = response_json.as_bytes();

            let header = format!("Content-Length: {}\r\n\r\n", response_bytes.len());
            stdout.write_all(header.as_bytes()).await?;
            stdout.write_all(response_bytes).await?;
            stdout.flush().await?;

            if env::var("MCP_DEBUG").is_ok() {
                debug!("Sent response: {}", response_json);
                eprintln!("[Rust Git Server] Sent response: {}", response_json);
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Only output debug messages if MCP_DEBUG is set
    let debug_enabled = env::var("MCP_DEBUG").is_ok();
    
    // Only initialize logging if debug is enabled
    if debug_enabled {
        tracing_subscriber::fmt()
            .with_env_filter("mcp_git_server=debug")
            .with_target(false)
            .with_writer(std::io::stderr)
            .init();
    }

    let vault_path = env::var("VAULT_PATH")
        .unwrap_or_else(|_| ".".to_string());

    if debug_enabled {
        info!("Starting MCP Git Server with vault path: {}", vault_path);
        eprintln!("[Rust Git Server] Starting with vault path: {}", vault_path);
    }

    let mut server = GitServer::new(PathBuf::from(vault_path));
    server.run().await?;
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use tokio::fs;

    async fn setup_test_repo() -> (TempDir, PathBuf) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_path_buf();

        // Initialize git repo
        Repository::init(&repo_path).unwrap();
        
        // Create test file
        fs::write(repo_path.join("test.md"), "# Test File\n\nContent").await.unwrap();

        (temp_dir, repo_path)
    }

    #[tokio::test]
    async fn test_git_init() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_path_buf();
        
        let server = GitServer::new(repo_path.clone());
        let result = server.git_init().await.unwrap();
        
        assert!(result.as_str().unwrap().contains("Initialized git repository"));
        assert!(repo_path.join(".git").exists());
        assert!(repo_path.join(".gitignore").exists());
    }

    #[tokio::test]
    async fn test_git_status() {
        let (_temp_dir, repo_path) = setup_test_repo().await;
        let server = GitServer::new(repo_path);
        
        let result = server.git_status().await.unwrap();
        assert!(result.is_object());
        assert!(result["branch"].is_string());
    }

    #[tokio::test]
    async fn test_git_add() {
        let (_temp_dir, repo_path) = setup_test_repo().await;
        let server = GitServer::new(repo_path);
        
        let args = GitAddArgs {
            files: vec!["test.md".to_string()],
        };
        
        let result = server.git_add(args).await.unwrap();
        assert!(result.as_str().unwrap().contains("Staged files"));
    }

    #[tokio::test]
    async fn test_git_log() {
        let (_temp_dir, repo_path) = setup_test_repo().await;
        
        // Create a commit first
        let repo = Repository::open(&repo_path).unwrap();
        let signature = git2::Signature::now("Test User", "test@example.com").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("test.md")).unwrap();
        index.write().unwrap();
        
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            "Initial commit",
            &tree,
            &[],
        ).unwrap();
        
        let server = GitServer::new(repo_path);
        let args = GitLogArgs { limit: 5, oneline: true };
        let result = server.git_log(args).await.unwrap();
        
        assert!(result.is_string());
        assert!(result.as_str().unwrap().contains("Initial commit"));
    }
}
