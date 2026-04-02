use serde::Serialize;
use tauri::State;

use crate::errors::AppError;
use crate::mattermost::types::{Post, PostList};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct PostsResponse {
    pub order: Vec<String>,
    pub posts: std::collections::HashMap<String, Post>,
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
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
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

#[tauri::command]
pub async fn send_post(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    message: String,
    root_id: Option<String>,
) -> Result<Post, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client
        .create_post(&channel_id, &message, root_id.as_deref())
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
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client.update_post(&post_id, &message).await
}

#[tauri::command]
pub async fn delete_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<(), AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client.delete_post(&post_id).await
}
