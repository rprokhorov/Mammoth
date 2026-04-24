use tauri::State;
use serde::{Deserialize, Serialize};

use crate::errors::AppError;
use crate::mattermost::types::{Draft, UpsertDraftRequest};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftData {
    pub channel_id: String,
    pub root_id: String,
    pub message: String,
    pub update_at: i64,
}

/// Load all drafts for the current user from the server.
#[tauri::command]
pub async fn get_drafts(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<DraftData>, AppError> {
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

    let drafts: Vec<Draft> = client.get_user_drafts(&user_id).await?;

    Ok(drafts
        .into_iter()
        .map(|d| DraftData {
            channel_id: d.channel_id,
            root_id: d.root_id,
            message: d.message,
            update_at: d.update_at,
        })
        .collect())
}

/// Save or update a draft on the server.
#[tauri::command]
pub async fn upsert_draft(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    root_id: String,
    message: String,
) -> Result<(), AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client
        .upsert_draft(&UpsertDraftRequest {
            channel_id,
            root_id,
            message,
            file_ids: vec![],
        })
        .await
}

/// Delete a draft from the server.
#[tauri::command]
pub async fn delete_draft(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    root_id: String,
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

    client.delete_draft(&user_id, &channel_id, &root_id).await
}
