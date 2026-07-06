use serde::Serialize;
use tauri::{Manager, State};

use crate::errors::AppError;
use crate::mattermost::types::{Post, SlashCommand};
use crate::state::AppState;
use crate::storage::posts_cache::{self, ChannelPostsCache};

#[derive(Debug, Clone, Serialize)]
pub struct PostsResponse {
    pub order: Vec<String>,
    pub posts: std::collections::HashMap<String, Post>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UnreadPostsResponse {
    pub order: Vec<String>,
    pub posts: std::collections::HashMap<String, Post>,
    pub prev_post_id: String,
    pub next_post_id: String,
}

#[tauri::command]
pub async fn get_posts_around_last_unread(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    limit_before: u32,
    limit_after: u32,
) -> Result<UnreadPostsResponse, AppError> {
    let (client, user_id) = {
        let servers = state
            .servers
            .lock()
            .map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        let user_id = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), user_id)
    };

    let post_list = client
        .get_posts_around_last_unread(&user_id, &channel_id, limit_before, limit_after)
        .await?;

    Ok(UnreadPostsResponse {
        order: post_list.order,
        posts: post_list.posts,
        prev_post_id: post_list.prev_post_id,
        next_post_id: post_list.next_post_id,
    })
}

#[tauri::command]
pub async fn get_posts(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    page: u32,
    per_page: u32,
) -> Result<PostsResponse, AppError> {
    let client = {
        let servers = state
            .servers
            .lock()
            .map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    let post_list = client
        .get_posts_for_channel(&channel_id, page, per_page)
        .await?;

    Ok(PostsResponse {
        order: post_list.order,
        posts: post_list.posts,
    })
}

/// Load cached posts for a channel from disk (instant, no network).
/// Returns None if no cache exists.
#[tauri::command]
pub async fn load_posts_cache(
    app_handle: tauri::AppHandle,
    server_id: String,
    channel_id: String,
) -> Option<ChannelPostsCache> {
    let cache_dir = app_handle.path().app_cache_dir().ok()?;
    posts_cache::load(&cache_dir, &server_id, &channel_id)
}

/// Save posts to disk cache for a channel.
#[tauri::command]
pub async fn save_posts_cache(
    app_handle: tauri::AppHandle,
    server_id: String,
    channel_id: String,
    order: Vec<String>,
    posts: std::collections::HashMap<String, Post>,
) -> Result<(), String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    let saved_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let cache = ChannelPostsCache {
        saved_at,
        order,
        posts,
    };
    posts_cache::save(&cache_dir, &server_id, &channel_id, &cache).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_post(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    message: String,
    root_id: Option<String>,
    file_ids: Option<Vec<String>>,
) -> Result<Post, AppError> {
    let client = {
        let servers = state
            .servers
            .lock()
            .map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client
        .create_post(
            &channel_id,
            &message,
            root_id.as_deref(),
            file_ids.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn edit_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
    message: String,
) -> Result<Post, AppError> {
    let client = {
        let servers = state
            .servers
            .lock()
            .map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client.update_post(&post_id, &message).await
}

#[tauri::command]
pub async fn do_post_action(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
    action_id: String,
    selected_option: String,
    cookie: String,
) -> Result<serde_json::Value, AppError> {
    let client = {
        let servers = state
            .servers
            .lock()
            .map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client
        .do_post_action(
            &post_id,
            &action_id,
            if selected_option.is_empty() {
                None
            } else {
                Some(selected_option.as_str())
            },
            if cookie.is_empty() {
                None
            } else {
                Some(cookie.as_str())
            },
        )
        .await
}

#[tauri::command]
pub async fn delete_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<(), AppError> {
    let client = {
        let servers = state
            .servers
            .lock()
            .map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client.delete_post(&post_id).await
}

#[tauri::command]
pub async fn autocomplete_slash_commands(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    channel_id: String,
    command: String,
) -> Result<Vec<SlashCommand>, AppError> {
    let client = {
        let servers = state
            .servers
            .lock()
            .map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client
        .autocomplete_commands(&team_id, &channel_id, &command)
        .await
}

#[tauri::command]
pub async fn execute_slash_command(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    team_id: Option<String>,
    command: String,
) -> Result<serde_json::Value, AppError> {
    let client = {
        let servers = state
            .servers
            .lock()
            .map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client
        .execute_command(&channel_id, team_id.as_deref(), &command)
        .await
}
