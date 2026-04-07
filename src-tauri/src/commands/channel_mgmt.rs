use tauri::State;

use crate::errors::AppError;
use crate::mattermost::types::Channel;
use crate::state::AppState;

#[tauri::command]
pub async fn create_channel(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    name: String,
    display_name: String,
    channel_type: String,
    purpose: Option<String>,
    header: Option<String>,
) -> Result<Channel, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    client
        .create_channel(
            &team_id,
            &name,
            &display_name,
            &channel_type,
            purpose.as_deref(),
            header.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn update_channel(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    display_name: Option<String>,
    header: Option<String>,
    purpose: Option<String>,
) -> Result<Channel, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    let mut patch = serde_json::Map::new();
    if let Some(v) = display_name {
        patch.insert("display_name".into(), serde_json::json!(v));
    }
    if let Some(v) = header {
        patch.insert("header".into(), serde_json::json!(v));
    }
    if let Some(v) = purpose {
        patch.insert("purpose".into(), serde_json::json!(v));
    }

    client
        .update_channel(&channel_id, serde_json::Value::Object(patch))
        .await
}

#[tauri::command]
pub async fn archive_channel(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
) -> Result<(), AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    client.delete_channel(&channel_id).await
}

#[tauri::command]
pub async fn leave_channel(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
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

    client.leave_channel(&channel_id, &user_id).await
}

/// Create (or get existing) DM channel with another user. Returns the channel.
#[tauri::command]
pub async fn create_direct_channel(
    state: State<'_, AppState>,
    server_id: String,
    other_user_id: String,
) -> Result<Channel, AppError> {
    let (client, my_user_id) = {
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

    client.create_direct_channel(&my_user_id, &other_user_id).await
}

/// Search public/private channels in team by term
#[tauri::command]
pub async fn search_channels(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    term: String,
) -> Result<Vec<Channel>, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    client.search_channels(&team_id, &term).await
}

/// Add a user to a channel
#[tauri::command]
pub async fn add_user_to_channel(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    user_id: String,
) -> Result<(), AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound("Server not found".into()))?;
        server.client.clone()
    };

    client.add_channel_member(&channel_id, &user_id).await
}
