use tauri::State;

use crate::errors::AppError;
use crate::mattermost::types::{PostList, UserThreadList};
use crate::state::AppState;

#[tauri::command]
pub async fn get_post_thread(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<PostList, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client.get_post_thread(&post_id).await
}

#[tauri::command]
pub async fn get_user_threads(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    page: u32,
    per_page: u32,
) -> Result<UserThreadList, AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
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

    client.get_threads_for_user(&user_id, &team_id, page, per_page).await
}

#[tauri::command]
pub async fn follow_thread(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    thread_id: String,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
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

    client.follow_thread(&user_id, &team_id, &thread_id).await
}

#[tauri::command]
pub async fn unfollow_thread(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    thread_id: String,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
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

    client.unfollow_thread(&user_id, &team_id, &thread_id).await
}

#[tauri::command]
pub async fn mark_thread_as_read(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    thread_id: String,
    timestamp: i64,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
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

    client.mark_thread_as_read(&user_id, &team_id, &thread_id, timestamp).await
}
