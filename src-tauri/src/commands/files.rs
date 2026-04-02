use serde::Serialize;
use tauri::State;

use crate::errors::AppError;
use crate::mattermost::types::FileInfo;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct FileUploadResult {
    pub file_infos: Vec<FileInfo>,
}

#[tauri::command]
pub async fn upload_file(
    state: State<'_, AppState>,
    server_id: String,
    channel_id: String,
    file_path: String,
    file_name: String,
) -> Result<FileUploadResult, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    let infos = client.upload_file(&channel_id, &file_path, &file_name).await?;
    Ok(FileUploadResult { file_infos: infos })
}

#[tauri::command]
pub async fn get_file_info(
    state: State<'_, AppState>,
    server_id: String,
    file_id: String,
) -> Result<FileInfo, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    client.get_file_info(&file_id).await
}

#[derive(Debug, Clone, Serialize)]
pub struct FileUrlResult {
    pub url: String,
    pub token: String,
}

#[tauri::command]
pub async fn get_file_url(
    state: State<'_, AppState>,
    server_id: String,
    file_id: String,
) -> Result<FileUrlResult, AppError> {
    let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
    let server = servers
        .get(&server_id)
        .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
    let url = server.client.file_url(&file_id);
    let token = server.client.token()
        .ok_or_else(|| AppError::Auth("Not logged in".into()))?
        .to_string();
    Ok(FileUrlResult { url, token })
}

#[derive(Debug, Clone, Serialize)]
pub struct ImageDataResult {
    pub data_url: String,
}

/// Fetches an image file and returns it as a base64 data URL so WebKit can
/// display it without being blocked by CSP/mixed-content restrictions.
#[tauri::command]
pub async fn get_image_data(
    state: State<'_, AppState>,
    server_id: String,
    file_id: String,
    mime_type: String,
) -> Result<ImageDataResult, AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    let bytes = client.download_file(&file_id).await?;
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime_type, encoded);
    Ok(ImageDataResult { data_url })
}

#[tauri::command]
pub async fn download_file(
    state: State<'_, AppState>,
    server_id: String,
    file_id: String,
    save_path: String,
) -> Result<(), AppError> {
    let client = {
        let servers = state.servers.lock().map_err(|e| AppError::Config(e.to_string()))?;
        let server = servers
            .get(&server_id)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server_id)))?;
        server.client.clone()
    };

    let bytes = client.download_file(&file_id).await?;
    tokio::fs::write(&save_path, &bytes).await.map_err(AppError::Io)?;
    Ok(())
}
