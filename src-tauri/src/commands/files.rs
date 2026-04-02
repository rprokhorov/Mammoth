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

/// Fetches the thumbnail (small preview) of an image file as base64 data URL.
#[tauri::command]
pub async fn get_image_thumbnail(
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

    let bytes = client.download_thumbnail(&file_id).await?;
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime_type, encoded);
    Ok(ImageDataResult { data_url })
}

/// Reads a local file and returns it as a base64 data URL.
/// Used for preview of locally-attached files before upload, and for clipboard images.
#[tauri::command]
pub async fn read_local_file_as_data_url(
    file_path: String,
    mime_type: String,
) -> Result<ImageDataResult, AppError> {
    let bytes = tokio::fs::read(&file_path).await.map_err(AppError::Io)?;
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime_type, encoded);
    Ok(ImageDataResult { data_url })
}

/// Saves raw bytes (base64-encoded) to a temp file and returns the path.
/// Used to persist clipboard image data so it can be uploaded via upload_file.
#[tauri::command]
pub async fn save_temp_file(
    app: tauri::AppHandle,
    file_name: String,
    data_base64: String,
) -> Result<String, AppError> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| AppError::Config(format!("Invalid base64: {}", e)))?;

    let _ = app; // AppHandle not needed — use std temp dir
    let tmp_dir = std::env::temp_dir();
    let tmp_path = tmp_dir.join(&file_name);
    tokio::fs::write(&tmp_path, &bytes).await.map_err(AppError::Io)?;
    Ok(tmp_path.to_string_lossy().to_string())
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
