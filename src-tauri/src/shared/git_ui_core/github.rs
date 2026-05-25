use std::collections::HashMap;
use std::path::Path;

use git2::Repository;
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::Mutex;

use crate::git_utils::{parse_github_repo, resolve_git_root};
use crate::shared::process_core::tokio_command;
use crate::types::{
    GitHubIssue, GitHubIssuesResponse, GitHubPullRequest, GitHubPullRequestComment,
    GitHubPullRequestDiff, GitHubPullRequestReviewComment, GitHubPullRequestReviewThread,
    GitHubPullRequestsResponse, WorkspaceEntry,
};
use crate::utils::normalize_git_path;

use super::context::workspace_entry_for_id;

fn github_repo_from_path(path: &Path) -> Result<String, String> {
    let repo = Repository::open(path).map_err(|e| e.to_string())?;
    let remotes = repo.remotes().map_err(|e| e.to_string())?;
    let name = if remotes.iter().any(|remote| remote == Some("origin")) {
        "origin".to_string()
    } else {
        remotes.iter().flatten().next().unwrap_or("").to_string()
    };
    if name.is_empty() {
        return Err("No git remote configured.".to_string());
    }
    let remote = repo.find_remote(&name).map_err(|e| e.to_string())?;
    let remote_url = remote.url().ok_or("Remote has no URL configured.")?;
    parse_github_repo(remote_url).ok_or("Remote is not a GitHub repository.".to_string())
}

fn parse_pr_diff(diff: &str) -> Vec<GitHubPullRequestDiff> {
    let mut entries = Vec::new();
    let mut current_lines: Vec<&str> = Vec::new();
    let mut current_old_path: Option<String> = None;
    let mut current_new_path: Option<String> = None;
    let mut current_status: Option<String> = None;

    let finalize = |lines: &Vec<&str>,
                    old_path: &Option<String>,
                    new_path: &Option<String>,
                    status: &Option<String>,
                    results: &mut Vec<GitHubPullRequestDiff>| {
        if lines.is_empty() {
            return;
        }
        let diff_text = lines.join("\n");
        if diff_text.trim().is_empty() {
            return;
        }
        let status_value = status.clone().unwrap_or_else(|| "M".to_string());
        let path = if status_value == "D" {
            old_path.clone().unwrap_or_default()
        } else {
            new_path
                .clone()
                .or_else(|| old_path.clone())
                .unwrap_or_default()
        };
        if path.is_empty() {
            return;
        }
        results.push(GitHubPullRequestDiff {
            path: normalize_git_path(&path),
            status: status_value,
            diff: diff_text,
        });
    };

    for line in diff.lines() {
        if line.starts_with("diff --git ") {
            finalize(
                &current_lines,
                &current_old_path,
                &current_new_path,
                &current_status,
                &mut entries,
            );
            current_lines = vec![line];
            current_old_path = None;
            current_new_path = None;
            current_status = None;

            let rest = line.trim_start_matches("diff --git ").trim();
            let mut parts = rest.split_whitespace();
            let old_part = parts.next().unwrap_or("").trim_start_matches("a/");
            let new_part = parts.next().unwrap_or("").trim_start_matches("b/");
            if !old_part.is_empty() {
                current_old_path = Some(old_part.to_string());
            }
            if !new_part.is_empty() {
                current_new_path = Some(new_part.to_string());
            }
            continue;
        }
        if line.starts_with("new file mode ") {
            current_status = Some("A".to_string());
        } else if line.starts_with("deleted file mode ") {
            current_status = Some("D".to_string());
        } else if line.starts_with("rename from ") {
            current_status = Some("R".to_string());
            let path = line.trim_start_matches("rename from ").trim();
            if !path.is_empty() {
                current_old_path = Some(path.to_string());
            }
        } else if line.starts_with("rename to ") {
            current_status = Some("R".to_string());
            let path = line.trim_start_matches("rename to ").trim();
            if !path.is_empty() {
                current_new_path = Some(path.to_string());
            }
        }
        current_lines.push(line);
    }

    finalize(
        &current_lines,
        &current_old_path,
        &current_new_path,
        &current_status,
        &mut entries,
    );

    entries
}

fn command_failure_detail(stdout: &[u8], stderr: &[u8], fallback: &str) -> String {
    let stderr = String::from_utf8_lossy(stderr);
    let stdout = String::from_utf8_lossy(stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        fallback.to_string()
    } else {
        detail.to_string()
    }
}

fn split_github_repo_name(repo_name: &str) -> Result<(&str, &str), String> {
    let (owner, name) = repo_name
        .split_once('/')
        .ok_or_else(|| "GitHub repository name must be in owner/repo form.".to_string())?;
    if owner.trim().is_empty() || name.trim().is_empty() {
        return Err("GitHub repository name must be in owner/repo form.".to_string());
    }
    Ok((owner, name))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: Deserialize<'de>"))]
struct GraphQlNodeList<T> {
    #[serde(default)]
    nodes: Vec<T>,
    #[serde(default, rename = "pageInfo")]
    page_info: Option<GraphQlPageInfo>,
}

#[derive(Debug, Deserialize)]
struct GraphQlAuthor {
    login: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlReviewComment {
    id: String,
    database_id: Option<u64>,
    #[serde(default)]
    body: String,
    created_at: String,
    #[serde(default)]
    url: String,
    author: Option<GraphQlAuthor>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlReviewThread {
    id: String,
    is_resolved: bool,
    #[serde(default)]
    path: String,
    line: Option<u64>,
    start_line: Option<u64>,
    diff_side: Option<String>,
    comments: GraphQlNodeList<GraphQlReviewComment>,
}

#[derive(Debug, Deserialize)]
struct ReviewThreadsPullRequest {
    #[serde(rename = "reviewThreads")]
    review_threads: GraphQlNodeList<GraphQlReviewThread>,
}

#[derive(Debug, Deserialize)]
struct ReviewThreadsRepository {
    #[serde(rename = "pullRequest")]
    pull_request: Option<ReviewThreadsPullRequest>,
}

#[derive(Debug, Deserialize)]
struct ReviewThreadsData {
    repository: Option<ReviewThreadsRepository>,
}

#[derive(Debug, Deserialize)]
struct ReviewThreadsResponse {
    data: Option<ReviewThreadsData>,
}

#[derive(Debug, Deserialize)]
struct ReviewThreadMutationResponse {
    data: Option<Value>,
}

fn map_graphql_author(
    author: Option<GraphQlAuthor>,
) -> Option<crate::types::GitHubPullRequestAuthor> {
    author.map(|author| crate::types::GitHubPullRequestAuthor {
        login: author.login,
    })
}

fn map_graphql_comment(comment: GraphQlReviewComment) -> GitHubPullRequestReviewComment {
    GitHubPullRequestReviewComment {
        id: comment.id,
        database_id: comment.database_id,
        body: comment.body,
        created_at: comment.created_at,
        url: comment.url,
        author: map_graphql_author(comment.author),
    }
}

fn thread_url_from_comments(comments: &[GitHubPullRequestReviewComment]) -> String {
    comments
        .iter()
        .find_map(|comment| {
            let trimmed = comment.url.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        })
        .unwrap_or_default()
}

fn map_graphql_thread(thread: GraphQlReviewThread) -> GitHubPullRequestReviewThread {
    let comments = thread
        .comments
        .nodes
        .into_iter()
        .map(map_graphql_comment)
        .collect::<Vec<_>>();
    let url = thread_url_from_comments(&comments);
    GitHubPullRequestReviewThread {
        id: thread.id,
        is_resolved: thread.is_resolved,
        path: normalize_git_path(&thread.path),
        line: thread.line,
        start_line: thread.start_line,
        diff_side: thread.diff_side,
        url,
        comments,
    }
}

async fn run_gh_graphql(
    repo_root: &Path,
    fields: Vec<(&str, String)>,
    raw_fields: Vec<(&str, String)>,
) -> Result<Value, String> {
    let mut args = vec!["api".to_string(), "graphql".to_string()];
    for (name, value) in fields {
        args.push("-f".to_string());
        args.push(format!("{name}={value}"));
    }
    for (name, value) in raw_fields {
        args.push("-F".to_string());
        args.push(format!("{name}={value}"));
    }
    let output = tokio_command("gh")
        .args(args)
        .current_dir(repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        return Err(command_failure_detail(
            &output.stdout,
            &output.stderr,
            "GitHub CLI command failed.",
        ));
    }
    serde_json::from_slice(&output.stdout).map_err(|err| err.to_string())
}

pub(super) async fn checkout_github_pull_request_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<(), String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let pr_number_text = pr_number.to_string();

    let output = tokio_command("gh")
        .args(["pr", "checkout", &pr_number_text])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        return Err(command_failure_detail(
            &output.stdout,
            &output.stderr,
            "GitHub CLI command failed.",
        ));
    }

    Ok(())
}

pub(super) async fn get_github_issues_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<GitHubIssuesResponse, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = tokio_command("gh")
        .args([
            "issue",
            "list",
            "--repo",
            &repo_name,
            "--limit",
            "50",
            "--json",
            "number,title,url,updatedAt",
        ])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        return Err(command_failure_detail(
            &output.stdout,
            &output.stderr,
            "GitHub CLI command failed.",
        ));
    }

    let issues: Vec<GitHubIssue> =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    let search_query = format!("repo:{repo_name} is:issue is:open").replace(' ', "+");
    let total = match tokio_command("gh")
        .args([
            "api",
            &format!("/search/issues?q={search_query}"),
            "--jq",
            ".total_count",
        ])
        .current_dir(&repo_root)
        .output()
        .await
    {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<usize>()
            .unwrap_or(issues.len()),
        _ => issues.len(),
    };

    Ok(GitHubIssuesResponse { total, issues })
}

pub(super) async fn get_github_pull_requests_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<GitHubPullRequestsResponse, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = tokio_command("gh")
        .args([
            "pr",
            "list",
            "--repo",
            &repo_name,
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            "number,title,url,updatedAt,createdAt,body,headRefName,baseRefName,isDraft,author",
        ])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        return Err(command_failure_detail(
            &output.stdout,
            &output.stderr,
            "GitHub CLI command failed.",
        ));
    }

    let pull_requests: Vec<GitHubPullRequest> =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    let search_query = format!("repo:{repo_name} is:pr is:open").replace(' ', "+");
    let total = match tokio_command("gh")
        .args([
            "api",
            &format!("/search/issues?q={search_query}"),
            "--jq",
            ".total_count",
        ])
        .current_dir(&repo_root)
        .output()
        .await
    {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<usize>()
            .unwrap_or(pull_requests.len()),
        _ => pull_requests.len(),
    };

    Ok(GitHubPullRequestsResponse {
        total,
        pull_requests,
    })
}

pub(super) async fn get_github_pull_request_diff_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<Vec<GitHubPullRequestDiff>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = tokio_command("gh")
        .args([
            "pr",
            "diff",
            &pr_number.to_string(),
            "--repo",
            &repo_name,
            "--color",
            "never",
        ])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        return Err(command_failure_detail(
            &output.stdout,
            &output.stderr,
            "GitHub CLI command failed.",
        ));
    }

    let diff_text = String::from_utf8_lossy(&output.stdout);
    Ok(parse_pr_diff(&diff_text))
}

pub(super) async fn get_github_pull_request_comments_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<Vec<GitHubPullRequestComment>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let comments_endpoint = format!("/repos/{repo_name}/issues/{pr_number}/comments?per_page=30");
    let jq_filter = r#"[.[] | {id, body, createdAt: .created_at, url: .html_url, author: (if .user then {login: .user.login} else null end)}]"#;

    let output = tokio_command("gh")
        .args(["api", &comments_endpoint, "--jq", jq_filter])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        return Err(command_failure_detail(
            &output.stdout,
            &output.stderr,
            "GitHub CLI command failed.",
        ));
    }

    let comments: Vec<GitHubPullRequestComment> =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    Ok(comments)
}

pub(super) async fn get_github_pull_request_review_threads_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    pr_number: u64,
) -> Result<Vec<GitHubPullRequestReviewThread>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;
    let (owner, name) = split_github_repo_name(&repo_name)?;

    let query = r#"
query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          path
          line
          startLine
          diffSide
          comments(first: 100) {
            nodes {
              id
              databaseId
              body
              createdAt
              url
              author { login }
            }
          }
        }
      }
    }
  }
}
"#;

    let mut after: Option<String> = None;
    let mut threads = Vec::new();
    loop {
        let mut fields = vec![
            ("query", query.to_string()),
            ("owner", owner.to_string()),
            ("name", name.to_string()),
        ];
        if let Some(cursor) = after.as_ref() {
            fields.push(("after", cursor.clone()));
        }
        let value =
            run_gh_graphql(&repo_root, fields, vec![("number", pr_number.to_string())]).await?;
        let response: ReviewThreadsResponse =
            serde_json::from_value(value).map_err(|err| err.to_string())?;
        let review_threads = response
            .data
            .and_then(|data| data.repository)
            .and_then(|repository| repository.pull_request)
            .ok_or_else(|| format!("Pull request #{pr_number} not found."))?
            .review_threads;

        threads.extend(review_threads.nodes.into_iter().map(map_graphql_thread));

        let Some(page_info) = review_threads.page_info else {
            break;
        };
        if !page_info.has_next_page {
            break;
        }
        let Some(cursor) = page_info.end_cursor else {
            break;
        };
        after = Some(cursor);
    }

    Ok(threads)
}

fn parse_mutation_thread(
    value: Value,
    mutation_name: &str,
) -> Result<GitHubPullRequestReviewThread, String> {
    let response: ReviewThreadMutationResponse =
        serde_json::from_value(value).map_err(|err| err.to_string())?;
    let thread_value = response
        .data
        .and_then(|data| data.get(mutation_name).cloned())
        .and_then(|payload| payload.get("thread").cloned())
        .ok_or_else(|| "GitHub response did not include the updated review thread.".to_string())?;
    let thread: GraphQlReviewThread =
        serde_json::from_value(thread_value).map_err(|err| err.to_string())?;
    Ok(map_graphql_thread(thread))
}

pub(super) async fn reply_github_pull_request_review_thread_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    thread_id: String,
    body: String,
) -> Result<GitHubPullRequestReviewThread, String> {
    let trimmed_body = body.trim();
    if trimmed_body.is_empty() {
        return Err("Reply body is required.".to_string());
    }
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let query = r#"
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    thread {
      id
      isResolved
      path
      line
      startLine
      diffSide
      comments(first: 100) {
        nodes {
          id
          databaseId
          body
          createdAt
          url
          author { login }
        }
      }
    }
  }
}
"#;
    let value = run_gh_graphql(
        &repo_root,
        vec![
            ("query", query.to_string()),
            ("threadId", thread_id),
            ("body", trimmed_body.to_string()),
        ],
        vec![],
    )
    .await?;
    parse_mutation_thread(value, "addPullRequestReviewThreadReply")
}

pub(super) async fn resolve_github_pull_request_review_thread_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    thread_id: String,
) -> Result<GitHubPullRequestReviewThread, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let query = r#"
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread {
      id
      isResolved
      path
      line
      startLine
      diffSide
      comments(first: 100) {
        nodes {
          id
          databaseId
          body
          createdAt
          url
          author { login }
        }
      }
    }
  }
}
"#;
    let value = run_gh_graphql(
        &repo_root,
        vec![("query", query.to_string()), ("threadId", thread_id)],
        vec![],
    )
    .await?;
    parse_mutation_thread(value, "resolveReviewThread")
}
