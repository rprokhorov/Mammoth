use tauri::State;

use crate::errors::AppError;
use crate::mattermost::types::Reaction;
use crate::state::AppState;

#[tauri::command]
pub async fn add_reaction(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
    emoji_name: String,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), uid)
    };

    client.add_reaction(&user_id, &post_id, &emoji_name).await
}

#[tauri::command]
pub async fn remove_reaction(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
    emoji_name: String,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), uid)
    };

    client.remove_reaction(&user_id, &post_id, &emoji_name).await
}

#[tauri::command]
pub async fn get_reactions(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<Vec<Reaction>, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    client.get_reactions(&post_id).await
}

#[tauri::command]
pub async fn pin_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<(), AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    client.pin_post(&post_id).await
}

#[tauri::command]
pub async fn unpin_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<(), AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    client.unpin_post(&post_id).await
}

#[tauri::command]
pub async fn save_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), uid)
    };

    client.save_post(&user_id, &post_id).await
}

#[tauri::command]
pub async fn unsave_post(
    state: State<'_, AppState>,
    server_id: String,
    post_id: String,
) -> Result<(), AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), uid)
    };

    client.unsave_post(&user_id, &post_id).await
}

#[tauri::command]
pub async fn get_saved_posts(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    page: u32,
    per_page: u32,
) -> Result<serde_json::Value, AppError> {
    let (client, user_id) = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        let uid = server
            .current_user
            .as_ref()
            .map(|u| u.id.clone())
            .ok_or_else(|| AppError::Auth("Not logged in".into()))?;
        (server.client.clone(), uid)
    };

    let posts = client.get_flagged_posts(&user_id, &team_id, page, per_page).await?;
    Ok(serde_json::to_value(posts).unwrap_or_default())
}

#[tauri::command]
pub async fn get_pinned_posts(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
) -> Result<serde_json::Value, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    let posts = client.get_pinned_posts(&channel_id).await?;
    Ok(serde_json::to_value(posts).unwrap_or_default())
}
