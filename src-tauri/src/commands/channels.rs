use serde::Serialize;
use tauri::State;

use crate::errors::AppError;
use crate::mattermost::types::{Channel, ChannelMember, User};
use crate::state::AppState;

#[tauri::command]
pub async fn search_users(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    term: String,
) -> Result<Vec<User>, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };
    client.search_users(&team_id, &term).await
}

#[tauri::command]
pub async fn autocomplete_users(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
    term: String,
) -> Result<Vec<User>, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };
    client.autocomplete_users(&team_id, &term).await
}

#[derive(Debug, Clone, Serialize)]
pub struct ChannelWithMeta {
    #[serde(flatten)]
    pub channel: Channel,
    pub msg_count: i64,
    pub mention_count: i64,
    pub last_viewed_at: i64,
}

#[tauri::command]
pub async fn get_channels_for_team(
    state: State<'_, AppState>,
    server_id: String,
    team_id: String,
) -> Result<Vec<ChannelWithMeta>, AppError> {
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

    let channels = client
        .get_channels_for_team_for_user(&user_id, &team_id)
        .await?;

    let members = client
        .get_channels_members_for_user(&user_id, &team_id)
        .await?;

    let member_map: std::collections::HashMap<String, ChannelMember> = members
        .into_iter()
        .map(|m| (m.channel_id.clone(), m))
        .collect();

    let result: Vec<ChannelWithMeta> = channels
        .into_iter()
        .map(|ch| {
            let member = member_map.get(&ch.id);
            ChannelWithMeta {
                msg_count: member.map_or(0, |m| m.msg_count),
                mention_count: member.map_or(0, |m| m.mention_count),
                last_viewed_at: member.map_or(0, |m| m.last_viewed_at),
                channel: ch,
            }
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn get_channel(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
) -> Result<Channel, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client.get_channel(&channel_id).await
}

#[tauri::command]
pub async fn view_channel(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
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

    client.view_channel(&user_id, &channel_id).await
}

#[tauri::command]
pub async fn get_users_by_ids(
    state: State<'_, AppState>,
    server_id: String,
    user_ids: Vec<String>,
) -> Result<Vec<User>, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client.get_users_by_ids(&user_ids).await
}

#[tauri::command]
pub async fn get_channel_members_list(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
) -> Result<serde_json::Value, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };
    let members = client.get_channel_members_list(&channel_id, 0, 200).await?;
    Ok(serde_json::to_value(members).unwrap_or_default())
}

#[tauri::command]
pub async fn get_channel_files(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
) -> Result<serde_json::Value, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };
    let files = client.get_channel_files(&channel_id, 0, 100).await?;
    Ok(serde_json::to_value(files).unwrap_or_default())
}
